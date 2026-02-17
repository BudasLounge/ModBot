const axios = require('axios');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonStyle,
    EmbedBuilder,
    ComponentType
} = require('discord.js');

const STEAM_API_KEY = process.env.STEAM_API_KEY;

const STEAM_RESOLVE_URL = 'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/';
const STEAM_OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';
const STEAM_APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const APP_DETAILS_BATCH_SIZE = 25;
const APP_DETAILS_MAX_RETRIES = 4;
const APP_DETAILS_BASE_DELAY_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toSteamProfileLink(steamId) {
    return `https://steamcommunity.com/profiles/${steamId}`;
}

function extractSteamInput(rawInput) {
    const value = String(rawInput || '').trim().replace(/\/$/, '');

    if (/^\d{17}$/.test(value)) {
        return { steamId: value };
    }

    const profileMatch = value.match(/\/profiles\/(\d{17})/i);
    if (profileMatch) {
        return { steamId: profileMatch[1] };
    }

    const vanityMatch = value.match(/\/id\/([^/?#]+)/i);
    if (vanityMatch) {
        return { vanity: vanityMatch[1] };
    }

    if (/^[a-zA-Z0-9_-]{2,64}$/.test(value)) {
        return { vanity: value };
    }

    return {};
}

async function resolveSteamId(input, logger) {
    const parsed = extractSteamInput(input);

    if (parsed.steamId) {
        return parsed.steamId;
    }

    if (!parsed.vanity) {
        return null;
    }

    try {
        const response = await axios.get(STEAM_RESOLVE_URL, {
            params: {
                key: STEAM_API_KEY,
                vanityurl: parsed.vanity
            },
            timeout: 15000
        });

        if (response?.data?.response?.success === 1) {
            return response.data.response.steamid;
        }
    } catch (error) {
        logger.error(`[play] Failed vanity resolve for '${parsed.vanity}': ${error.message || error}`);
    }

    return null;
}

async function fetchOwnedGames(steamId, logger) {
    try {
        const response = await axios.get(STEAM_OWNED_GAMES_URL, {
            params: {
                key: STEAM_API_KEY,
                steamid: steamId,
                include_appinfo: 1,
                format: 'json'
            },
            timeout: 20000
        });

        const games = response?.data?.response?.games;
        if (!Array.isArray(games)) {
            return null;
        }

        return games;
    } catch (error) {
        logger.error(`[play] Failed owned games fetch for ${steamId}: ${error.message || error}`);
        return null;
    }
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function fetchAppDetailsBatch(appIds, logger, attempt = 1) {
    try {
        const response = await axios.get(STEAM_APP_DETAILS_URL, {
            params: {
                appids: appIds.join(','),
                filters: 'categories,name'
            },
            headers: {
                'User-Agent': 'ModBot/1.0 (Discord Bot; Steam Co-op Finder)'
            },
            timeout: 30000
        });

        return {
            ok: true,
            status: response?.status || 200,
            data: response?.data || {}
        };
    } catch (error) {
        const status = error?.response?.status;
        const retryable = status === 429 || status === 403 || (status >= 500 && status < 600);

        if (retryable && attempt < APP_DETAILS_MAX_RETRIES) {
            const backoff = APP_DETAILS_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            logger.info(`[play] Appdetails batch retry ${attempt}/${APP_DETAILS_MAX_RETRIES - 1} for ${appIds.length} apps after ${backoff}ms (status ${status})`);
            await sleep(backoff);
            return fetchAppDetailsBatch(appIds, logger, attempt + 1);
        }

        logger.error(`[play] Appdetails batch failed for ${appIds.length} apps (status ${status || 'n/a'}): ${error.message || error}`);
        return {
            ok: false,
            status: status || 0,
            data: {}
        };
    }
}

function buildSessionEmbed(state) {
    const participantLines = state.participants.size === 0
        ? ['No one has joined yet.']
        : Array.from(state.participants.values()).map((participant, idx) => {
            return `${idx + 1}. <@${participant.userId}> · [Profile](${toSteamProfileLink(participant.steamId)}) · ${participant.gameCount} games`;
        });

    const gameLines = state.commonCoopGames.length === 0
        ? ['None yet. Click **Find Common Co-op Games** after users join.']
        : state.commonCoopGames.slice(0, 20).map((game, idx) => `${idx + 1}. ${game.name}`);

    if (state.commonCoopGames.length > 20) {
        gameLines.push(`...and ${state.commonCoopGames.length - 20} more`);
    }

    const embed = new EmbedBuilder()
        .setColor('#c586b6')
        .setTitle('Steam Co-op Party Finder')
        .setDescription(
            `Use **Join with Steam Profile** to add yourself. Private/friends-only profiles are removed automatically.${state.isComputing ? '\n\n⏳ Computing common co-op games...' : ''}${state.computeNote ? `\n\n⚠️ ${state.computeNote}` : ''}`
        )
        .addFields(
            { name: `Participants (${state.participants.size})`, value: participantLines.join('\n') },
            { name: `Common Co-op Games (${state.commonCoopGames.length})`, value: gameLines.join('\n') }
        )
        .setFooter({ text: state.lastRngPick ? `Last RNG pick: ${state.lastRngPick.name}` : 'No RNG pick yet' });

    return embed;
}

function buildButtons(sessionId, disableAll, isComputing = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`PLAY_JOIN_${sessionId}`)
                .setLabel('Join with Steam Profile')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll || isComputing),
            new ButtonBuilder()
                .setCustomId(`PLAY_LEAVE_${sessionId}`)
                .setLabel('Leave Session')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disableAll || isComputing),
            new ButtonBuilder()
                .setCustomId(`PLAY_COMPUTE_${sessionId}`)
                .setLabel('Find Common Co-op Games')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableAll || isComputing),
            new ButtonBuilder()
                .setCustomId(`PLAY_RNG_${sessionId}`)
                .setLabel('RNG a Game')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disableAll || isComputing)
        )
    ];
}

async function collectCommonCoopGames(intersection, appNameMap, appDetailsCache, logger) {
    const appIds = [...intersection].map((id) => Number(id)).filter(Number.isInteger);
    const unknownAppIds = appIds.filter((appId) => !appDetailsCache.has(String(appId)));
    const batches = chunkArray(unknownAppIds, APP_DETAILS_BATCH_SIZE);
    const stats = {
        total: appIds.length,
        uncached: unknownAppIds.length,
        batches: batches.length,
        failedBatches: 0,
        status403: 0,
        status429: 0,
        successfulLookups: 0
    };

    logger.info(`[play] Checking co-op categories for ${appIds.length} apps (${unknownAppIds.length} uncached across ${batches.length} batches)`);

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchResp = await fetchAppDetailsBatch(batch, logger);
        const batchData = batchResp.data;

        if (!batchResp.ok) {
            stats.failedBatches += 1;
            if (batchResp.status === 403) stats.status403 += 1;
            if (batchResp.status === 429) stats.status429 += 1;
            continue;
        }

        for (const appId of batch) {
            const payload = batchData?.[String(appId)] || batchData?.[appId];

            if (!payload) {
                continue;
            }

            if (payload.success === true && payload.data) {
                const categories = payload.data.categories || [];
                const coop = categories.some((category) => /co\s*-?\s*op/i.test(String(category?.description || '')));
                appDetailsCache.set(String(appId), coop);
                stats.successfulLookups += 1;
            } else if (payload.success === false) {
                appDetailsCache.set(String(appId), false);
                stats.successfulLookups += 1;
            }
        }

        if (i < batches.length - 1) {
            await sleep(250);
        }
    }

    const commonCoopGames = [];
    for (const appId of appIds) {
        if (appDetailsCache.get(String(appId))) {
            commonCoopGames.push({ id: appId, name: appNameMap.get(appId) || `App ${appId}` });
        }
    }

    const hardBlocked = stats.status403 > 0 && stats.failedBatches >= Math.ceil(stats.batches * 0.6);
    let fallbackUsed = false;
    if (commonCoopGames.length === 0 && hardBlocked && appIds.length > 0) {
        fallbackUsed = true;
        logger.warn('[play] Steam Store appdetails appears blocked (403-heavy). Falling back to shared games list for this run.');
        for (const appId of appIds) {
            commonCoopGames.push({ id: appId, name: appNameMap.get(appId) || `App ${appId}` });
        }
    }

    commonCoopGames.sort((a, b) => a.name.localeCompare(b.name));
    return { games: commonCoopGames, stats, fallbackUsed };
}

module.exports = {
    name: 'play',
    description: 'Create a Steam co-op lobby, find common co-op games, and RNG a pick',
    syntax: 'play',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message) {
        if (!STEAM_API_KEY) {
            this.logger.error('[play] Missing STEAM_API_KEY in environment');
            await message.channel.send('Missing STEAM API key. Set `STEAM_API_KEY` in your `.env`.');
            return;
        }

        this.logger.info(`[play] Starting Steam co-op session in guild ${message.guild?.id || 'DM'} by user ${message.author.id}`);

        const sessionId = `${message.id}_${Date.now()}`;
        const state = {
            participants: new Map(),
            commonCoopGames: [],
            lastRngPick: null,
            appDetailsCache: new Map(),
            isComputing: false,
            computeNote: null
        };

        const botMessage = await message.channel.send({
            embeds: [buildSessionEmbed(state)],
            components: buildButtons(sessionId, false, state.isComputing)
        });

        const collector = botMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30 * 60 * 1000
        });

        collector.on('collect', async (interaction) => {
            if (!interaction.customId.endsWith(sessionId)) {
                return;
            }

            if (interaction.customId.startsWith('PLAY_JOIN_')) {
                this.logger.info(`[play] Join button clicked by ${interaction.user.id}`);

                const modal = new ModalBuilder()
                    .setCustomId(`PLAY_MODAL_${sessionId}_${interaction.user.id}`)
                    .setTitle('Join Steam Co-op Session');

                const input = new TextInputBuilder()
                    .setCustomId('steam_profile')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('https://steamcommunity.com/id/yourname');

                modal.addLabelComponents((label) => label
                    .setLabel('Steam profile URL, vanity, or SteamID64')
                    .setTextInputComponent(input)
                );
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({
                        filter: (submitted) => submitted.customId === `PLAY_MODAL_${sessionId}_${interaction.user.id}` && submitted.user.id === interaction.user.id,
                        time: 2 * 60 * 1000
                    });

                    await modalSubmit.deferReply({ ephemeral: true });

                    const rawProfile = modalSubmit.fields.getTextInputValue('steam_profile');
                    const steamId = await resolveSteamId(rawProfile, this.logger);

                    if (!steamId) {
                        this.logger.info(`[play] Invalid Steam input by ${interaction.user.id}: ${rawProfile}`);
                        await modalSubmit.editReply({ content: 'Could not resolve that Steam profile. Please use a valid profile URL, vanity, or SteamID64.' });
                        return;
                    }

                    const games = await fetchOwnedGames(steamId, this.logger);
                    if (!games) {
                        state.participants.delete(interaction.user.id);
                        state.commonCoopGames = [];
                        state.lastRngPick = null;

                        await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                        this.logger.info(`[play] Removed/blocked participant ${interaction.user.id}; profile private or inaccessible (steamId ${steamId})`);
                        await modalSubmit.editReply({ content: 'Your Steam games are not publicly visible to the API (private/friends-only). You were not added to the session.' });
                        return;
                    }

                    state.participants.set(interaction.user.id, {
                        userId: interaction.user.id,
                        steamId,
                        gameCount: games.length,
                        ownedGames: new Set(games.map(game => Number(game.appid)).filter(Number.isInteger)),
                        appNameMap: new Map(games.map(game => [Number(game.appid), game.name]))
                    });

                    state.commonCoopGames = [];
                    state.lastRngPick = null;
                    state.computeNote = null;

                    await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                    this.logger.info(`[play] Added participant ${interaction.user.id} with steamId ${steamId} (${games.length} games)`);
                    await modalSubmit.editReply({ content: `Added! Linked Steam profile: ${toSteamProfileLink(steamId)}` });
                } catch (error) {
                    if (error?.name === 'Error' && (error?.message || '').toLowerCase().includes('time')) {
                        this.logger.info(`[play] Modal timed out for ${interaction.user.id}`);
                        return;
                    }

                    this.logger.error(`[play] Error handling join modal for ${interaction.user.id}: ${error.message || error}`);
                }

                return;
            }

            if (interaction.customId.startsWith('PLAY_LEAVE_')) {
                const hadParticipant = state.participants.delete(interaction.user.id);

                if (!hadParticipant) {
                    await interaction.reply({ content: 'You are not currently in this session.', ephemeral: true });
                    return;
                }

                state.commonCoopGames = [];
                state.lastRngPick = null;
                state.computeNote = null;

                await interaction.deferUpdate();
                await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                this.logger.info(`[play] Participant ${interaction.user.id} left session`);
                await message.channel.send(`↩️ <@${interaction.user.id}> left the Steam co-op session.`);
                return;
            }

            if (interaction.customId.startsWith('PLAY_COMPUTE_')) {
                if (state.isComputing) {
                    await interaction.reply({ content: 'Already computing common co-op games. Please wait.', ephemeral: true });
                    return;
                }

                if (state.participants.size < 1) {
                    await interaction.reply({ content: 'No participants yet. Join the session first.', ephemeral: true });
                    return;
                }

                state.isComputing = true;
                await interaction.deferUpdate();
                await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                this.logger.info(`[play] Computing common co-op games for ${state.participants.size} participants`);

                try {
                    const startedAt = Date.now();
                    const participantEntries = Array.from(state.participants.values());
                    const appNameMap = new Map();

                    let intersection = [...participantEntries[0].ownedGames];
                    for (let i = 1; i < participantEntries.length; i++) {
                        intersection = intersection.filter(appId => participantEntries[i].ownedGames.has(appId));
                    }

                    for (const participant of participantEntries) {
                        for (const [appid, name] of participant.appNameMap.entries()) {
                            if (!appNameMap.has(appid)) {
                                appNameMap.set(appid, name || `App ${appid}`);
                            }
                        }
                    }

                    const result = await collectCommonCoopGames(intersection, appNameMap, state.appDetailsCache, this.logger);
                    state.commonCoopGames = result.games;
                    state.lastRngPick = null;
                    state.computeNote = result.fallbackUsed
                        ? 'Steam blocked category lookups; showing shared games (unfiltered) for this run.'
                        : null;
                    state.isComputing = false;

                    await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });

                    if (state.commonCoopGames.length > 0) {
                        const fullList = state.commonCoopGames.map((game, idx) => `${idx + 1}. ${game.name}`).join('\n');
                        const chunks = fullList.match(/[\s\S]{1,1800}/g) || [];
                        for (let i = 0; i < chunks.length; i++) {
                            const title = result.fallbackUsed ? 'Shared Games (Fallback)' : 'Common Co-op Games';
                            const header = i === 0
                                ? `**${title} (${state.commonCoopGames.length}):**\n`
                                : `**${title} (cont. ${i + 1}/${chunks.length}):**\n`;
                            await message.channel.send(`${header}${chunks[i]}`);
                        }
                    } else {
                        await message.channel.send('No common co-op games found for all joined participants.');
                    }

                    const elapsed = Date.now() - startedAt;
                    this.logger.info(`[play] Compute finished. Shared games=${intersection.length}, co-op common=${state.commonCoopGames.length}, successfulLookups=${result.stats.successfulLookups}, failedBatches=${result.stats.failedBatches}, status403=${result.stats.status403}, status429=${result.stats.status429}, fallbackUsed=${result.fallbackUsed}, elapsedMs=${elapsed}`);
                } catch (error) {
                    this.logger.error(`[play] Error while computing games: ${error.message || error}`);
                    await interaction.followUp({ content: 'Failed to compute common co-op games. Check logs and try again.', ephemeral: true });
                } finally {
                    state.isComputing = false;
                    await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                }

                return;
            }

            if (interaction.customId.startsWith('PLAY_RNG_')) {
                if (state.commonCoopGames.length === 0) {
                    await interaction.reply({ content: 'No common co-op games yet. Click **Find Common Co-op Games** first.', ephemeral: true });
                    return;
                }

                const pick = state.commonCoopGames[Math.floor(Math.random() * state.commonCoopGames.length)];
                state.lastRngPick = pick;

                await interaction.deferUpdate();
                await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                this.logger.info(`[play] RNG pick selected: ${pick.name} (${pick.id})`);
                await message.channel.send(`🎲 RNG Pick: **${pick.name}**`);
            }
        });

        collector.on('end', async () => {
            this.logger.info('[play] Session collector ended, disabling buttons');
            try {
                await botMessage.edit({ components: buildButtons(sessionId, true, false) });
            } catch (error) {
                this.logger.error(`[play] Failed to disable buttons on session end: ${error.message || error}`);
            }
        });
    }
};
