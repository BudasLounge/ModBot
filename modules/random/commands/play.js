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
const GAME_LIST_PAGE_SIZE = 15;
const SESSION_COLLECTOR_TIME_MS = 2 * 60 * 60 * 1000;
const PAGINATOR_COLLECTOR_TIME_MS = 15 * 60 * 1000;
const MODERATOR_ROLE_NAME = 'Moderator';
const MODERATOR_ROLE_ID = '1139853603050373181';

const STEAM_CACHE_DIR = path.join(__dirname, '..', 'steamCache');
const STEAM_CACHE_FILE = path.join(STEAM_CACHE_DIR, 'appdetails-cache.json');
const STEAM_USER_CACHE_FILE = path.join(STEAM_CACHE_DIR, 'user-profiles-cache.json');

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

function loadSteamUserCache(logger) {
    ensureCacheDir(logger);

    try {
        if (!fs.existsSync(STEAM_USER_CACHE_FILE)) {
            const initial = {
                version: 1,
                updatedAt: Date.now(),
                users: {}
            };
            fs.writeFileSync(STEAM_USER_CACHE_FILE, JSON.stringify(initial, null, 2), 'utf8');
            logger.info(`[play] Initialized new user cache file: ${STEAM_USER_CACHE_FILE}`);
            return initial;
        }

        const raw = fs.readFileSync(STEAM_USER_CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.users !== 'object' || parsed.users === null) {
            throw new Error('Invalid user cache shape');
        }
        return parsed;
    } catch (error) {
        logger.error(`[play] Failed reading user cache; rebuilding. Error: ${error.message || error}`);
        return {
            version: 1,
            updatedAt: Date.now(),
            users: {}
        };
    }
}

function saveSteamUserCache(cache, logger) {
    try {
        ensureCacheDir(logger);
        cache.updatedAt = Date.now();
        fs.writeFileSync(STEAM_USER_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        logger.error(`[play] Failed writing user cache: ${error.message || error}`);
    }
}

function getSavedSteamProfileForUser(discordUserId, logger) {
    const cache = loadSteamUserCache(logger);
    return cache.users[String(discordUserId)] || null;
}

function upsertSavedSteamProfileForUser(discordUserId, steamId, rawInput, logger) {
    const cache = loadSteamUserCache(logger);
    cache.users[String(discordUserId)] = {
        steamId: String(steamId),
        profileUrl: toSteamProfileLink(String(steamId)),
        lastInput: String(rawInput || '').trim(),
        updatedAt: Date.now()
    };
    saveSteamUserCache(cache, logger);
}

function removeSavedSteamProfileForUser(discordUserId, logger) {
    const cache = loadSteamUserCache(logger);
    const key = String(discordUserId);
    if (Object.prototype.hasOwnProperty.call(cache.users, key)) {
        delete cache.users[key];
        saveSteamUserCache(cache, logger);
    }
}

async function fetchSingleAppDetails(appId, logger, attempt = 1) {
    try {
        const response = await axios.get(STEAM_APP_DETAILS_URL, {
            params: {
                appids: String(appId),
                filters: 'categories,genres,name'
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

function normalizeTagString(value) {
    return String(value || '').trim().toLowerCase();
}

function buildTagPayloadFromAppData(appData) {
    const categories = Array.isArray(appData?.categories)
        ? appData.categories.map((entry) => String(entry?.description || '').trim()).filter(Boolean)
        : [];
    const genres = Array.isArray(appData?.genres)
        ? appData.genres.map((entry) => String(entry?.description || '').trim()).filter(Boolean)
        : [];

    const normalizedSet = new Set();
    for (const tag of [...categories, ...genres]) {
        const normalized = normalizeTagString(tag);
        if (normalized) {
            normalizedSet.add(normalized);
        }
    }

    const tags = [...normalizedSet];
    const coop = tags.some((tag) => tag.includes('co-op') || tag.includes('coop'));

    return {
        coop,
        categories,
        genres,
        tags
    };
}

function hasFullTagMetadata(entry) {
    return !!entry
        && Array.isArray(entry.categories)
        && Array.isArray(entry.genres)
        && Array.isArray(entry.tags);
}

function toRelativeTimestamp(unixSeconds) {
    return `<t:${Math.floor(unixSeconds)}:R>`;
}

function buildFieldValue(lines, emptyFallback = 'None', maxLength = 1024) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return emptyFallback;
    }

    const output = [];
    let length = 0;

    for (const line of lines) {
        const normalized = String(line || '');
        const addLength = normalized.length + (output.length > 0 ? 1 : 0);
        if (length + addLength > maxLength) {
            const remaining = lines.length - output.length;
            if (remaining > 0) {
                const suffix = `...and ${remaining} more`;
                if (length + suffix.length + 1 <= maxLength) {
                    output.push(suffix);
                }
            }
            break;
        }

        output.push(normalized);
        length += addLength;
    }

    return output.length > 0 ? output.join('\n') : emptyFallback;
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
            { name: `Participants (${state.participants.size})`, value: buildFieldValue(participantLines, 'No one has joined yet.') },
            { name: `Common Co-op Games (${state.commonCoopGames.length})`, value: buildFieldValue(gameLines, 'None yet.') }
        )
        .setFooter({
            text: `${state.lastRngPick ? `Last RNG pick: ${state.lastRngPick.name}` : 'No RNG pick yet'} • Session expires ${toRelativeTimestamp(state.sessionExpiresUnix)}`
        });

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

function buildGamePageEmbed(title, games, page, pageSize, expiresUnix) {
    const totalPages = Math.max(1, Math.ceil(games.length / pageSize));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * pageSize;
    const pageItems = games.slice(start, start + pageSize);
    const description = pageItems
        .map((game, index) => `${start + index + 1}. ${game.name}`)
        .join('\n') || 'No games found.';

    return new EmbedBuilder()
        .setColor('#c586b6')
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: `Page ${safePage + 1}/${totalPages} • ${games.length} game(s) • Expires ${toRelativeTimestamp(expiresUnix)}` });
}

function buildGamePageButtons(pagerId, page, totalPages) {
    const isFirst = page <= 0;
    const isLast = page >= totalPages - 1;

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`PLAY_PAGE_PREV_${pagerId}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isFirst),
            new ButtonBuilder()
                .setCustomId(`PLAY_PAGE_NEXT_${pagerId}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isLast)
        )
    ];
}

async function sendPaginatedGameList(channel, games, title, logger) {
    const totalPages = Math.max(1, Math.ceil(games.length / GAME_LIST_PAGE_SIZE));
    let currentPage = 0;
    const pagerId = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const expiresUnix = Math.floor((Date.now() + PAGINATOR_COLLECTOR_TIME_MS) / 1000);

    const listMessage = await channel.send({
        embeds: [buildGamePageEmbed(title, games, currentPage, GAME_LIST_PAGE_SIZE, expiresUnix)],
        components: buildGamePageButtons(pagerId, currentPage, totalPages)
    });

    if (totalPages <= 1) {
        return;
    }

    const collector = listMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PAGINATOR_COLLECTOR_TIME_MS
    });

    collector.on('collect', async (interaction) => {
        if (!interaction.customId.endsWith(pagerId)) {
            return;
        }

        if (interaction.customId.startsWith('PLAY_PAGE_PREV_')) {
            currentPage = Math.max(0, currentPage - 1);
        } else if (interaction.customId.startsWith('PLAY_PAGE_NEXT_')) {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
        }

        await interaction.update({
            embeds: [buildGamePageEmbed(title, games, currentPage, GAME_LIST_PAGE_SIZE, expiresUnix)],
            components: buildGamePageButtons(pagerId, currentPage, totalPages)
        });
    });

    collector.on('end', async () => {
        try {
            await listMessage.edit({
                components: buildGamePageButtons(pagerId, currentPage, totalPages).map((row) => {
                    const disabledRow = new ActionRowBuilder();
                    row.components.forEach((component) => {
                        disabledRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
                    });
                    return disabledRow;
                })
            });
        } catch (error) {
            logger.error(`[play] Failed to disable paginator buttons: ${error.message || error}`);
        }
    });
}

async function safeEditMessage(message, payload, logger, context = 'edit', attempts = 2) {
    let lastError = null;
    for (let i = 1; i <= attempts; i++) {
        try {
            await message.edit(payload);
            return true;
        } catch (error) {
            lastError = error;
            logger.error(`[play] Message ${context} failed (attempt ${i}/${attempts}): ${error.message || error}`);
            if (i < attempts) {
                await sleep(500 * i);
            }
        }
    }

    logger.error(`[play] Message ${context} failed after ${attempts} attempts: ${lastError?.message || lastError}`);
    return false;
}

async function collectCommonCoopGames(intersection, appNameMap, appDetailsCache, logger, onProgress) {
    const appIds = [...intersection].map((id) => Number(id)).filter(Number.isInteger);
    const cacheFile = loadSteamCache(logger);
    const cacheApps = cacheFile.apps || {};
    const uncachedAppIds = [];
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
        if (cached && typeof cached.coop === 'boolean' && hasFullTagMetadata(cached)) {
            appDetailsCache.set(key, cached.coop);
            stats.cachedHits += 1;
        } else {
            stats.uncached += 1;
            uncachedAppIds.push(appId);
        }
    }

    logger.info(`[play] Checking co-op categories for ${appIds.length} apps (${stats.cachedHits} cache hits, ${stats.uncached} uncached)`);

    let processed = stats.cachedHits;
    if (typeof onProgress === 'function') {
        await onProgress(processed, appIds.length);
    }

    if (uncachedAppIds.length === 0) {
        const commonCoopGames = [];
        for (const appId of appIds) {
            if (appDetailsCache.get(String(appId))) {
                commonCoopGames.push({ id: appId, name: appNameMap.get(appId) || `App ${appId}` });
            }
        }

        commonCoopGames.sort((a, b) => a.name.localeCompare(b.name));
        return { games: commonCoopGames, stats, fallbackUsed: false };
    }

    let blockedBy403 = false;
    let cacheDirty = false;
    for (const appId of uncachedAppIds) {
        const key = String(appId);

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

            await sleep(APP_DETAILS_REQUEST_DELAY_MS);
            continue;
        }

        const payload = lookup.data?.[key] || lookup.data?.[appId];
        if (payload && payload.success === true && payload.data) {
            const tagPayload = buildTagPayloadFromAppData(payload.data);
            appDetailsCache.set(key, tagPayload.coop);
            cacheApps[key] = {
                coop: tagPayload.coop,
                name: payload.data.name || appNameMap.get(appId) || `App ${appId}`,
                categories: tagPayload.categories,
                genres: tagPayload.genres,
                tags: tagPayload.tags,
                updatedAt: Date.now()
            };
            cacheDirty = true;
            stats.successfulLookups += 1;
        } else if (payload && payload.success === false) {
            appDetailsCache.set(key, false);
            cacheApps[key] = {
                coop: false,
                name: appNameMap.get(appId) || `App ${appId}`,
                categories: [],
                genres: [],
                tags: [],
                updatedAt: Date.now()
            };
            cacheDirty = true;
            stats.successfulLookups += 1;
        }

        processed += 1;
        if (typeof onProgress === 'function') {
            await onProgress(processed, appIds.length);
        }

        await sleep(APP_DETAILS_REQUEST_DELAY_MS);
    }

    if (cacheDirty) {
        cacheFile.apps = cacheApps;
        saveSteamCache(cacheFile, logger);
    }

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

async function addParticipantFromSteamId(state, userId, steamId, logger) {
    const games = await fetchOwnedGames(steamId, logger);
    if (!games) {
        return { ok: false, reason: 'private_or_unavailable' };
    }

    state.participants.set(userId, {
        userId,
        steamId,
        gameCount: games.length,
        ownedGames: new Set(games.map(game => Number(game.appid)).filter(Number.isInteger)),
        appNameMap: new Map(games.map(game => [Number(game.appid), game.name]))
    });

    state.commonCoopGames = [];
    state.lastRngPick = null;
    state.computeNote = null;
    state.computeProgress = null;
    return { ok: true, gameCount: games.length };
}

module.exports = {
    name: 'play',
    description: 'Create a Steam co-op lobby, find common co-op games, and RNG a pick',
    syntax: 'play | play cache [help|stats|clear|remove <appid>|set <appid> <true|false> [name...]|userstats|userclear|userremove <discordUserId>|userset <discordUserId> <steamUrlOrId>]',
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
                                '`play cache set <appid> <true|false> [name...]` - Manually set co-op value',
                                '`play cache userstats` - Show saved Discord->Steam profile mappings',
                                '`play cache userclear` - Remove all saved user profile mappings',
                                '`play cache userremove <discordUserId>` - Remove one saved user profile',
                                '`play cache userset <discordUserId> <steamUrlOrId>` - Set/update one saved user profile'
                            ].join('\n')
                        },
                        {
                            name: 'Examples',
                            value: [
                                '`play cache stats`',
                                '`play cache remove 440`',
                                '`play cache set 620 true Portal 2`',
                                '`play cache set 730 false Counter-Strike 2`',
                                '`play cache userstats`',
                                '`play cache userset 185223223892377611 https://steamcommunity.com/profiles/76561198119805734`'
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
                            value: 'The command checks local cache first. Only uncached apps are looked up from Steam Store, then written back to cache on successful lookups. Each cache entry stores `name`, `coop`, `categories`, `genres`, and normalized `tags` for future searching.'
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
                    categories: cache.apps[String(appId)]?.categories || [],
                    genres: cache.apps[String(appId)]?.genres || [],
                    tags: cache.apps[String(appId)]?.tags || [],
                    updatedAt: Date.now(),
                    source: 'manual'
                };
                saveSteamCache(cache, this.logger);
                this.logger.info(`[play] Cache app ${appId} set by ${message.author.id} to coop=${coopRaw}`);
                await message.channel.send(`Set cache for app ${appId} to co-op=${coopRaw}.`);
                return;
            }

            if (action === 'userstats') {
                const userCache = loadSteamUserCache(this.logger);
                const users = Object.entries(userCache.users || {});
                const updated = userCache.updatedAt ? new Date(userCache.updatedAt).toISOString() : 'unknown';
                this.logger.info(`[play] User cache stats requested by ${message.author.id}: users=${users.length}`);

                if (users.length === 0) {
                    await message.channel.send(`User profile cache is empty.\nLast updated: ${updated}`);
                    return;
                }

                const preview = users.slice(0, 10).map(([discordId, data]) => `• ${discordId} -> ${data?.steamId || 'unknown'}`).join('\n');
                const extra = users.length > 10 ? `\n...and ${users.length - 10} more` : '';
                await message.channel.send(`User profile cache stats:\n• Total users: ${users.length}\n• Last updated: ${updated}\n\n${preview}${extra}`);
                return;
            }

            if (action === 'userclear') {
                const userCache = loadSteamUserCache(this.logger);
                userCache.users = {};
                saveSteamUserCache(userCache, this.logger);
                this.logger.info(`[play] User cache cleared by ${message.author.id}`);
                await message.channel.send('User profile cache cleared.');
                return;
            }

            if (action === 'userremove') {
                const rawDiscordUserId = String(cmdArgs[3] || '').replace(/[<@!>]/g, '').trim();
                if (!/^\d{5,25}$/.test(rawDiscordUserId)) {
                    await message.channel.send('Usage: play cache userremove <discordUserId>');
                    return;
                }

                const userCache = loadSteamUserCache(this.logger);
                if (Object.prototype.hasOwnProperty.call(userCache.users || {}, rawDiscordUserId)) {
                    delete userCache.users[rawDiscordUserId];
                    saveSteamUserCache(userCache, this.logger);
                    this.logger.info(`[play] User cache entry removed for ${rawDiscordUserId} by ${message.author.id}`);
                    await message.channel.send(`Removed saved Steam profile for Discord user ${rawDiscordUserId}.`);
                } else {
                    await message.channel.send(`No saved Steam profile found for Discord user ${rawDiscordUserId}.`);
                }
                return;
            }

            if (action === 'userset') {
                const rawDiscordUserId = String(cmdArgs[3] || '').replace(/[<@!>]/g, '').trim();
                const profileInput = String(cmdArgs[4] || '').trim();

                if (!/^\d{5,25}$/.test(rawDiscordUserId) || !profileInput) {
                    await message.channel.send('Usage: play cache userset <discordUserId> <steamUrlOrId>');
                    return;
                }

                const steamId = await resolveSteamId(profileInput, this.logger);
                if (!steamId) {
                    await message.channel.send('Could not resolve that Steam profile input.');
                    return;
                }

                upsertSavedSteamProfileForUser(rawDiscordUserId, steamId, profileInput, this.logger);
                this.logger.info(`[play] User cache entry set for ${rawDiscordUserId} by ${message.author.id} -> ${steamId}`);
                await message.channel.send(`Saved Steam profile for Discord user ${rawDiscordUserId}: ${toSteamProfileLink(steamId)}`);
                return;
            }

            await message.channel.send('Usage: play cache [help|stats|clear|remove <appid>|set <appid> <true|false> [name...]|userstats|userclear|userremove <discordUserId>|userset <discordUserId> <steamUrlOrId>]');
            return;
        }

        this.logger.info(`[play] Starting Steam co-op session in guild ${message.guild?.id || 'DM'} by user ${message.author.id}`);

        const sessionUserCache = loadSteamUserCache(this.logger);
        const sessionUserMap = sessionUserCache.users || {};
        const getSessionSavedProfile = (discordUserId) => sessionUserMap[String(discordUserId)] || null;
        const saveSessionProfile = (discordUserId, steamId, rawInput) => {
            sessionUserMap[String(discordUserId)] = {
                steamId: String(steamId),
                profileUrl: toSteamProfileLink(String(steamId)),
                lastInput: String(rawInput || '').trim(),
                updatedAt: Date.now()
            };
            sessionUserCache.users = sessionUserMap;
            saveSteamUserCache(sessionUserCache, this.logger);
        };
        const removeSessionProfile = (discordUserId) => {
            const key = String(discordUserId);
            if (Object.prototype.hasOwnProperty.call(sessionUserMap, key)) {
                delete sessionUserMap[key];
                sessionUserCache.users = sessionUserMap;
                saveSteamUserCache(sessionUserCache, this.logger);
            }
        };

        const sessionId = `${message.id}_${Date.now()}`;
        const state = {
            participants: new Map(),
            commonCoopGames: [],
            lastRngPick: null,
            appDetailsCache: new Map(),
            isComputing: false,
            computeNote: null,
            computeProgress: null,
            sessionExpiresUnix: Math.floor((Date.now() + SESSION_COLLECTOR_TIME_MS) / 1000)
        };

        const botMessage = await message.channel.send({
            embeds: [buildSessionEmbed(state)],
            components: buildButtons(sessionId, false, state.isComputing)
        });

        const authorSavedProfile = getSessionSavedProfile(message.author.id);
        if (authorSavedProfile && authorSavedProfile.steamId) {
            this.logger.info(`[play] Attempting auto-join for author ${message.author.id} using saved profile ${authorSavedProfile.steamId}`);
            const autoJoin = await addParticipantFromSteamId(state, message.author.id, authorSavedProfile.steamId, this.logger);
            if (autoJoin.ok) {
                await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'auto-join update');
                await message.channel.send(`Auto-added <@${message.author.id}> using saved Steam profile.`);
                this.logger.info(`[play] Auto-join succeeded for ${message.author.id} (${autoJoin.gameCount} games)`);
            } else {
                removeSessionProfile(message.author.id);
                this.logger.warn(`[play] Auto-join failed for ${message.author.id}; saved profile removed.`);
            }
        }

        const collector = botMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: SESSION_COLLECTOR_TIME_MS
        });

        collector.on('collect', async (interaction) => {
            if (!interaction.customId.endsWith(sessionId)) {
                return;
            }

            if (interaction.customId.startsWith('PLAY_JOIN_')) {
                this.logger.info(`[play] Join button clicked by ${interaction.user.id}`);

                const savedProfile = getSessionSavedProfile(interaction.user.id);
                if (savedProfile && savedProfile.steamId) {
                    this.logger.info(`[play] Found saved Steam profile for ${interaction.user.id}: ${savedProfile.steamId}`);
                    const savedJoin = await addParticipantFromSteamId(state, interaction.user.id, savedProfile.steamId, this.logger);

                    if (savedJoin.ok) {
                        await interaction.reply({
                            content: `Using your saved Steam profile: ${savedProfile.profileUrl || toSteamProfileLink(savedProfile.steamId)}`,
                            ephemeral: true
                        });
                        await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'saved join update');
                        this.logger.info(`[play] Added participant ${interaction.user.id} with saved steamId ${savedProfile.steamId} (${savedJoin.gameCount} games)`);
                        return;
                    }

                    this.logger.warn(`[play] Saved profile for ${interaction.user.id} is no longer usable. Removing cache entry.`);
                    removeSessionProfile(interaction.user.id);
                }

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

                    const joined = await addParticipantFromSteamId(state, interaction.user.id, steamId, this.logger);
                    if (!joined.ok) {
                        state.participants.delete(interaction.user.id);
                        removeSessionProfile(interaction.user.id);

                        await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'modal join private profile update');
                        this.logger.info(`[play] Removed/blocked participant ${interaction.user.id}; profile private or inaccessible (steamId ${steamId})`);
                        await modalSubmit.editReply({ content: 'Your Steam games are not publicly visible to the API (private/friends-only). You were not added to the session.' });
                        return;
                    }

                    saveSessionProfile(interaction.user.id, steamId, rawProfile);

                    await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'modal join success update');
                    this.logger.info(`[play] Added participant ${interaction.user.id} with steamId ${steamId} (${joined.gameCount} games)`);
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
                await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'leave update');
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
                await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'compute start update');
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
                                await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'compute progress update');
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

                    await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'compute complete update');

                    if (state.commonCoopGames.length > 0) {
                        const listTitle = result.fallbackUsed
                            ? `Shared Games (Fallback) - ${state.commonCoopGames.length}`
                            : `Common Co-op Games - ${state.commonCoopGames.length}`;
                        await sendPaginatedGameList(message.channel, state.commonCoopGames, listTitle, this.logger);
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
                    await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'compute finally restore');
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
                await safeEditMessage(botMessage, { embeds: [buildSessionEmbed(state)], components: buildButtons(sessionId, false, state.isComputing) }, this.logger, 'rng update');
                this.logger.info(`[play] RNG pick selected: ${pick.name} (${pick.id})`);
                await message.channel.send(`🎲 RNG Pick: **${pick.name}**`);
            }
        });

        collector.on('end', async (_collected, reason) => {
            this.logger.info(`[play] Session collector ended (reason=${reason}), disabling buttons`);
            try {
                await botMessage.edit({ components: buildButtons(sessionId, true, false) });
            } catch (error) {
                this.logger.error(`[play] Failed to disable buttons on session end: ${error.message || error}`);
            }
        });
    }
};
