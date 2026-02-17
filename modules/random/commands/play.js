const axios = require('axios');
const fs = require('fs');
const path = require('path');
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
const APP_DETAILS_MAX_RETRIES = 3;
const APP_DETAILS_REQUEST_DELAY_MS = 1600;
const APP_DETAILS_RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
const MODERATOR_ROLE_NAME = 'Moderator';
const MODERATOR_ROLE_ID = '1139853603050373181';

const STEAM_CACHE_DIR = path.join(__dirname, '..', 'steamCache');
const STEAM_CACHE_FILE = path.join(STEAM_CACHE_DIR, 'appdetails-cache.json');

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

function ensureCacheDir(logger) {
    try {
        if (!fs.existsSync(STEAM_CACHE_DIR)) {
            fs.mkdirSync(STEAM_CACHE_DIR, { recursive: true });
            logger.info(`[play] Created cache directory: ${STEAM_CACHE_DIR}`);
        }
    } catch (error) {
        logger.error(`[play] Failed to ensure cache directory: ${error.message || error}`);
    }
}

function hasModeratorAccess(message) {
    const member = message.member;
    if (!member || !member.roles || !member.roles.cache) {
        return false;
    }

    return member.roles.cache.some((role) => role.id === MODERATOR_ROLE_ID || role.name === MODERATOR_ROLE_NAME);
}

function loadSteamCache(logger) {
    ensureCacheDir(logger);

    try {
        if (!fs.existsSync(STEAM_CACHE_FILE)) {
            const initial = {
                version: 1,
                updatedAt: Date.now(),
                apps: {}
            };
            fs.writeFileSync(STEAM_CACHE_FILE, JSON.stringify(initial, null, 2), 'utf8');
            logger.info(`[play] Initialized new Steam cache file: ${STEAM_CACHE_FILE}`);
            return initial;
        }

        const raw = fs.readFileSync(STEAM_CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.apps !== 'object' || parsed.apps === null) {
            throw new Error('Invalid cache shape');
        }
        return parsed;
    } catch (error) {
        logger.error(`[play] Failed reading Steam cache; rebuilding. Error: ${error.message || error}`);
        return {
            version: 1,
            updatedAt: Date.now(),
            apps: {}
        };
    }
}

function saveSteamCache(cache, logger) {
    try {
        ensureCacheDir(logger);
        cache.updatedAt = Date.now();
        fs.writeFileSync(STEAM_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        logger.error(`[play] Failed writing Steam cache: ${error.message || error}`);
    }
}

async function fetchSingleAppDetails(appId, logger, attempt = 1) {
    try {
        const response = await axios.get(STEAM_APP_DETAILS_URL, {
            params: {
                appids: String(appId),
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
            data: response?.data || {},
            rateLimited: false,
            blocked: false
        };
    } catch (error) {
        const status = error?.response?.status;
        const retryable = status === 429 || (status >= 500 && status < 600);

        if (status === 403) {
            logger.error(`[play] Appdetails forbidden (403) for app ${appId}. Steam likely blocked further store access from this IP.`);
            return {
                ok: false,
                status,
                data: {},
                rateLimited: false,
                blocked: true
            };
        }

        if (retryable && attempt < APP_DETAILS_MAX_RETRIES) {
            const backoff = status === 429
                ? APP_DETAILS_RATE_LIMIT_BACKOFF_MS
                : (APP_DETAILS_REQUEST_DELAY_MS * Math.pow(2, attempt));
            logger.info(`[play] Appdetails retry ${attempt}/${APP_DETAILS_MAX_RETRIES - 1} for app ${appId} after ${backoff}ms (status ${status})`);
            await sleep(backoff);
            return fetchSingleAppDetails(appId, logger, attempt + 1);
        }

        logger.error(`[play] Appdetails failed for app ${appId} (status ${status || 'n/a'}): ${error.message || error}`);
        return {
            ok: false,
            status: status || 0,
            data: {},
            rateLimited: status === 429,
            blocked: false
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
            `Use **Join with Steam Profile** to add yourself. Private/friends-only profiles are removed automatically.${state.isComputing ? '\n\n⏳ Computing common co-op games...' : ''}${state.computeProgress ? `\nProgress: ${state.computeProgress.processed}/${state.computeProgress.total}` : ''}${state.computeNote ? `\n\n⚠️ ${state.computeNote}` : ''}`
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

async function collectCommonCoopGames(intersection, appNameMap, appDetailsCache, logger, onProgress) {
    const appIds = [...intersection].map((id) => Number(id)).filter(Number.isInteger);
    const cacheFile = loadSteamCache(logger);
    const cacheApps = cacheFile.apps || {};
    const stats = {
        total: appIds.length,
        cachedHits: 0,
        uncached: 0,
        failedLookups: 0,
        status403: 0,
        status429: 0,
        successfulLookups: 0
    };

    for (const appId of appIds) {
        const key = String(appId);
        const cached = cacheApps[key];
        if (cached && typeof cached.coop === 'boolean') {
            appDetailsCache.set(key, cached.coop);
            stats.cachedHits += 1;
        } else {
            stats.uncached += 1;
        }
    }

    logger.info(`[play] Checking co-op categories for ${appIds.length} apps (${stats.cachedHits} cache hits, ${stats.uncached} uncached)`);

    let processed = stats.cachedHits;
    if (typeof onProgress === 'function') {
        await onProgress(processed, appIds.length);
    }

    let blockedBy403 = false;
    for (const appId of appIds) {
        const key = String(appId);
        if (appDetailsCache.has(key)) {
            continue;
        }

        const lookup = await fetchSingleAppDetails(appId, logger);

        if (!lookup.ok) {
            stats.failedLookups += 1;
            if (lookup.status === 403) {
                stats.status403 += 1;
                blockedBy403 = true;
                processed += 1;
                if (typeof onProgress === 'function') {
                    await onProgress(processed, appIds.length);
                }
                break;
            }
            if (lookup.status === 429) {
                stats.status429 += 1;
            }

            processed += 1;
            if (typeof onProgress === 'function') {
                await onProgress(processed, appIds.length);
            }
            continue;
        }

        const payload = lookup.data?.[key] || lookup.data?.[appId];
        if (payload && payload.success === true && payload.data) {
            const categories = payload.data.categories || [];
            const coop = categories.some((category) => /co\s*-?\s*op/i.test(String(category?.description || '')));
            appDetailsCache.set(key, coop);
            cacheApps[key] = {
                coop,
                name: payload.data.name || appNameMap.get(appId) || `App ${appId}`,
                updatedAt: Date.now()
            };
            stats.successfulLookups += 1;
        } else if (payload && payload.success === false) {
            appDetailsCache.set(key, false);
            cacheApps[key] = {
                coop: false,
                name: appNameMap.get(appId) || `App ${appId}`,
                updatedAt: Date.now()
            };
            stats.successfulLookups += 1;
        }

        processed += 1;
        if (typeof onProgress === 'function') {
            await onProgress(processed, appIds.length);
        }

        await sleep(APP_DETAILS_REQUEST_DELAY_MS);
    }

    cacheFile.apps = cacheApps;
    saveSteamCache(cacheFile, logger);

    const commonCoopGames = [];
    for (const appId of appIds) {
        if (appDetailsCache.get(String(appId))) {
            commonCoopGames.push({ id: appId, name: appNameMap.get(appId) || `App ${appId}` });
        }
    }

    const hardBlocked = blockedBy403 || (stats.status403 > 0 && stats.successfulLookups === 0);
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
    syntax: 'play | play cache [help|stats|clear|remove <appid>|set <appid> <true|false> [name...]]',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args) {
        if (!STEAM_API_KEY) {
            this.logger.error('[play] Missing STEAM_API_KEY in environment');
            await message.channel.send('Missing STEAM API key. Set `STEAM_API_KEY` in your `.env`.');
            return;
        }

        const cmdArgs = Array.isArray(args) ? args : [];
        if (cmdArgs.length > 1 && String(cmdArgs[1]).toLowerCase() === 'cache') {
            if (!hasModeratorAccess(message)) {
                this.logger.warn(`[play] Cache command denied for user ${message.author.id} (missing Moderator role)`);
                await message.channel.send('Only users with the Moderator role can manage the Steam cache.');
                return;
            }

            const action = String(cmdArgs[2] || 'stats').toLowerCase();
            const cache = loadSteamCache(this.logger);
            const appEntries = Object.entries(cache.apps || {});

            if (action === 'help') {
                const helpEmbed = new EmbedBuilder()
                    .setColor('#c586b6')
                    .setTitle('Steam Cache Tools - Help')
                    .setDescription('Moderator-only cache controls for the `play` command. These tools let you inspect and manipulate cached Steam co-op tag results.')
                    .addFields(
                        {
                            name: 'Access',
                            value: `Requires role **${MODERATOR_ROLE_NAME}** (ID: ${MODERATOR_ROLE_ID})`
                        },
                        {
                            name: 'Commands',
                            value: [
                                '`play cache help` - Show this help embed',
                                '`play cache stats` - Show cache totals and last update time',
                                '`play cache clear` - Remove all cached app entries',
                                '`play cache remove <appid>` - Remove one app from cache',
                                '`play cache set <appid> <true|false> [name...]` - Manually set co-op value'
                            ].join('\n')
                        },
                        {
                            name: 'Examples',
                            value: [
                                '`play cache stats`',
                                '`play cache remove 440`',
                                '`play cache set 620 true Portal 2`',
                                '`play cache set 730 false Counter-Strike 2`'
                            ].join('\n')
                        },
                        {
                            name: 'Status Output Meaning',
                            value: [
                                '**Total apps**: Number of cached AppIDs',
                                '**Co-op true**: Cached as co-op',
                                '**Co-op false**: Cached as not co-op',
                                '**Last updated**: Last time cache file changed',
                                '**Compute fallback warning**: Steam Store lookup blocked; showing shared games for current run'
                            ].join('\n')
                        },
                        {
                            name: 'How Compute Uses Cache',
                            value: 'The command checks local cache first. Only uncached apps are looked up from Steam Store, then written back to cache on successful lookups.'
                        }
                    )
                    .setFooter({ text: 'Tip: Use cache set/remove to correct bad or missing tag data quickly.' });

                this.logger.info(`[play] Cache help requested by ${message.author.id}`);
                await message.channel.send({ embeds: [helpEmbed] });
                return;
            }

            if (action === 'stats') {
                const total = appEntries.length;
                const coopCount = appEntries.filter(([, value]) => value && value.coop === true).length;
                const nonCoopCount = appEntries.filter(([, value]) => value && value.coop === false).length;
                const updated = cache.updatedAt ? new Date(cache.updatedAt).toISOString() : 'unknown';
                this.logger.info(`[play] Cache stats requested by ${message.author.id}: total=${total}, coop=${coopCount}, nonCoop=${nonCoopCount}`);
                await message.channel.send(`Steam cache stats:\n• Total apps: ${total}\n• Co-op true: ${coopCount}\n• Co-op false: ${nonCoopCount}\n• Last updated: ${updated}`);
                return;
            }

            if (action === 'clear') {
                cache.apps = {};
                saveSteamCache(cache, this.logger);
                this.logger.info(`[play] Cache cleared by ${message.author.id}`);
                await message.channel.send('Steam cache cleared.');
                return;
            }

            if (action === 'remove') {
                const appIdRaw = String(cmdArgs[3] || '');
                const appId = Number(appIdRaw);
                if (!Number.isInteger(appId) || appId <= 0) {
                    await message.channel.send('Usage: play cache remove <appid>');
                    return;
                }

                const key = String(appId);
                const existed = Object.prototype.hasOwnProperty.call(cache.apps || {}, key);
                if (existed) {
                    delete cache.apps[key];
                    saveSteamCache(cache, this.logger);
                    this.logger.info(`[play] Cache app ${appId} removed by ${message.author.id}`);
                    await message.channel.send(`Removed app ${appId} from Steam cache.`);
                } else {
                    await message.channel.send(`App ${appId} was not present in cache.`);
                }
                return;
            }

            if (action === 'set') {
                const appIdRaw = String(cmdArgs[3] || '');
                const coopRaw = String(cmdArgs[4] || '').toLowerCase();
                const appId = Number(appIdRaw);

                if (!Number.isInteger(appId) || appId <= 0 || (coopRaw !== 'true' && coopRaw !== 'false')) {
                    await message.channel.send('Usage: play cache set <appid> <true|false> [name...]');
                    return;
                }

                const manualName = cmdArgs.length > 5 ? cmdArgs.slice(5).join(' ').trim() : '';
                cache.apps[String(appId)] = {
                    coop: coopRaw === 'true',
                    name: manualName || cache.apps[String(appId)]?.name || `App ${appId}`,
                    updatedAt: Date.now(),
                    source: 'manual'
                };
                saveSteamCache(cache, this.logger);
                this.logger.info(`[play] Cache app ${appId} set by ${message.author.id} to coop=${coopRaw}`);
                await message.channel.send(`Set cache for app ${appId} to co-op=${coopRaw}.`);
                return;
            }

            await message.channel.send('Usage: play cache [stats|clear|remove <appid>|set <appid> <true|false> [name...]]');
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
            computeNote: null,
            computeProgress: null
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
                    state.computeProgress = null;

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
                state.computeProgress = null;

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
                state.computeProgress = { processed: 0, total: 0 };
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

                    let lastProgressEditAt = Date.now();
                    let lastLoggedCount = -1;
                    const result = await collectCommonCoopGames(
                        intersection,
                        appNameMap,
                        state.appDetailsCache,
                        this.logger,
                        async (processed, total) => {
                            state.computeProgress = { processed, total };

                            if (processed - lastLoggedCount >= 25 || processed === total) {
                                this.logger.info(`[play] Compute progress ${processed}/${total}`);
                                lastLoggedCount = processed;
                            }

                            const now = Date.now();
                            const shouldUpdateMessage = processed === total || (now - lastProgressEditAt >= 12000);
                            if (shouldUpdateMessage) {
                                lastProgressEditAt = now;
                                await botMessage.edit({ embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) });
                            }
                        }
                    );
                    state.commonCoopGames = result.games;
                    state.lastRngPick = null;
                    state.computeNote = result.fallbackUsed
                        ? 'Steam blocked category lookups; showing shared games (unfiltered) for this run.'
                        : null;
                    state.computeProgress = null;
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
                    this.logger.info(`[play] Compute finished. Shared games=${intersection.length}, co-op common=${state.commonCoopGames.length}, cacheHits=${result.stats.cachedHits}, uncached=${result.stats.uncached}, successfulLookups=${result.stats.successfulLookups}, failedLookups=${result.stats.failedLookups}, status403=${result.stats.status403}, status429=${result.stats.status429}, fallbackUsed=${result.fallbackUsed}, elapsedMs=${elapsed}`);
                } catch (error) {
                    this.logger.error(`[play] Error while computing games: ${error.message || error}`);
                    await interaction.followUp({ content: 'Failed to compute common co-op games. Check logs and try again.', ephemeral: true });
                } finally {
                    state.isComputing = false;
                    state.computeProgress = null;
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
