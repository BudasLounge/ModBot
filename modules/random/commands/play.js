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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function isCoopGame(appId, appDetailsCache, logger) {
    if (appDetailsCache.has(appId)) {
        return appDetailsCache.get(appId);
    }

    try {
        const response = await axios.get(STEAM_APP_DETAILS_URL, {
            params: { appids: appId },
            timeout: 20000
        });

        const payload = response?.data?.[appId];
        const categories = payload?.data?.categories || [];
        const coop = categories.some(category => /co\s*-?\s*op/i.test(String(category?.description || '')));

        appDetailsCache.set(appId, coop);
        return coop;
    } catch (error) {
        logger.error(`[play] Failed appdetails lookup for ${appId}: ${error.message || error}`);
        appDetailsCache.set(appId, false);
        return false;
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
        .setDescription('Use **Join with Steam Profile** to add yourself. Private/friends-only profiles are removed automatically.')
        .addFields(
            { name: `Participants (${state.participants.size})`, value: participantLines.join('\n') },
            { name: `Common Co-op Games (${state.commonCoopGames.length})`, value: gameLines.join('\n') }
        )
        .setFooter({ text: state.lastRngPick ? `Last RNG pick: ${state.lastRngPick.name}` : 'No RNG pick yet' });

    return embed;
}

function buildButtons(sessionId, disableAll) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`PLAY_JOIN_${sessionId}`)
                .setLabel('Join with Steam Profile')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll),
            new ButtonBuilder()
                .setCustomId(`PLAY_COMPUTE_${sessionId}`)
                .setLabel('Find Common Co-op Games')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableAll),
            new ButtonBuilder()
                .setCustomId(`PLAY_RNG_${sessionId}`)
                .setLabel('RNG a Game')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disableAll)
        )
    ];
}

module.exports = {
    name: 'play',
    description: 'Create a Steam co-op lobby, find common co-op games, and RNG a pick',
    syntax: 'play',
    num_args: 1,
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
            isComputing: false
        };

        const botMessage = await message.channel.send({
            embeds: [buildSessionEmbed(state)],
            components: buildButtons(sessionId, false)
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

                        await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false) });
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

                    await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false) });
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

            if (interaction.customId.startsWith('PLAY_COMPUTE_')) {
                if (state.isComputing) {
                    await interaction.reply({ content: 'Already computing common co-op games. Please wait.', ephemeral: true });
                    return;
                }

                if (state.participants.size < 2) {
                    await interaction.reply({ content: 'Need at least 2 valid participants before computing common games.', ephemeral: true });
                    return;
                }

                state.isComputing = true;
                await interaction.deferUpdate();
                this.logger.info(`[play] Computing common co-op games for ${state.participants.size} participants`);

                try {
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

                    const commonCoopGames = [];
                    for (const appId of intersection) {
                        const coop = await isCoopGame(String(appId), state.appDetailsCache, this.logger);
                        if (coop) {
                            commonCoopGames.push({ id: appId, name: appNameMap.get(appId) || `App ${appId}` });
                        }
                        await delay(120);
                    }

                    commonCoopGames.sort((a, b) => a.name.localeCompare(b.name));
                    state.commonCoopGames = commonCoopGames;
                    state.lastRngPick = null;

                    await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false) });

                    if (state.commonCoopGames.length > 0) {
                        const fullList = state.commonCoopGames.map((game, idx) => `${idx + 1}. ${game.name}`).join('\n');
                        const chunks = fullList.match(/[\s\S]{1,1800}/g) || [];
                        for (let i = 0; i < chunks.length; i++) {
                            const header = i === 0
                                ? `**Common Co-op Games (${state.commonCoopGames.length}):**\n`
                                : `**Common Co-op Games (cont. ${i + 1}/${chunks.length}):**\n`;
                            await message.channel.send(`${header}${chunks[i]}`);
                        }
                    } else {
                        await message.channel.send('No common co-op games found for all joined participants.');
                    }

                    this.logger.info(`[play] Compute finished. Shared games=${intersection.length}, co-op common=${state.commonCoopGames.length}`);
                } catch (error) {
                    this.logger.error(`[play] Error while computing games: ${error.message || error}`);
                    await interaction.followUp({ content: 'Failed to compute common co-op games. Check logs and try again.', ephemeral: true });
                } finally {
                    state.isComputing = false;
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
                await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false) });
                this.logger.info(`[play] RNG pick selected: ${pick.name} (${pick.id})`);
                await message.channel.send(`🎲 RNG Pick: **${pick.name}**`);
            }
        });

        collector.on('end', async () => {
            this.logger.info('[play] Session collector ended, disabling buttons');
            try {
                await botMessage.edit({ components: buildButtons(sessionId, true) });
            } catch (error) {
                this.logger.error(`[play] Failed to disable buttons on session end: ${error.message || error}`);
            }
        });
    }
};
