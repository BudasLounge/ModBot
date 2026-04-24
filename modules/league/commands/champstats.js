/**
 * /champstats <summoner_name> [game_count] [display]
 *
 * Summarizes a player's performance per (champion, role) across ranked/draft
 * 5v5 queues only. Scans recent Riot match history until it has collected the
 * requested number of allowed-queue matches (hard-capped at 2000) or history
 * is exhausted, then groups results by champion+role.
 *
 * Queue allow-list (everything else — ARAM, ARAM Mayhem, Swiftplay, Quickplay,
 * Arena, URF, Coop vs AI, rotating modes, tutorials — is skipped):
 *   400 — Normal Draft 5v5
 *   420 — Ranked Solo/Duo 5v5
 *   440 — Ranked Flex 5v5
 *
 * Role source: prefer `teamPosition`, fall back to `individualPosition`, then
 * `UNKNOWN`. Same champion played in two roles produces two separate rows.
 *
 * TODO: swap `codeblock` / `embed` display for an HTML-rendered infographic
 * similar to modules/league/match-template-player-stats.html.
 */

const axios = require('axios');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require('discord.js');
require('dotenv').config();
const ApiClient = require('../../../core/js/APIClient.js');

const api = new ApiClient();
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const MATCH_BASE = 'https://americas.api.riotgames.com/lol/match/v5/matches';
const ACCOUNT_BASE = 'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id';

// ── Rate limit tuning ───────────────────────────────────────────────────────
const RIOT_SHORT_LIMIT = 500;
const RIOT_SHORT_WINDOW_MS = 10 * 1000;
const RIOT_LONG_LIMIT = 30000;
const RIOT_LONG_WINDOW_MS = 10 * 60 * 1000;

// ── Fetch tuning ────────────────────────────────────────────────────────────
const IDS_PAGE_SIZE = 100;
const MATCH_FETCH_CONCURRENCY = 16;
const MAX_GAMES_REQUESTED = 2000; // hard cap on counted games per user instruction
const MAX_IDS_SCANNED = 4000;     // safety cap to avoid pathological hunts

// ── Queue allow-list ────────────────────────────────────────────────────────
const ALLOWED_QUEUE_IDS = new Set([400, 420, 440]);
const QUEUE_LABELS = {
    400: 'Normal Draft 5v5',
    420: 'Ranked Solo/Duo',
    440: 'Ranked Flex 5v5',
};

// ── Pagination ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 8;
const PAGINATOR_COLLECTOR_TIME_MS = 15 * 60 * 1000;

if (!RIOT_API_KEY) {
    throw new Error('RIOT_API_KEY is missing from environment');
}

const http = axios.create({
    headers: { 'X-Riot-Token': RIOT_API_KEY },
    timeout: 25_000,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Rate limiter (duplicated from wins2 to keep this change surgical) ───────
const riotShortWindowRequests = [];
const riotLongWindowRequests = [];

function pruneRequestWindow(requestWindow, windowMs, now) {
    while (requestWindow.length > 0 && now - requestWindow[0] >= windowMs) {
        requestWindow.shift();
    }
}

async function acquireRiotRequestSlot(logger, context) {
    while (true) {
        const now = Date.now();
        pruneRequestWindow(riotShortWindowRequests, RIOT_SHORT_WINDOW_MS, now);
        pruneRequestWindow(riotLongWindowRequests, RIOT_LONG_WINDOW_MS, now);

        const shortExceeded = riotShortWindowRequests.length >= RIOT_SHORT_LIMIT;
        const longExceeded = riotLongWindowRequests.length >= RIOT_LONG_LIMIT;

        if (!shortExceeded && !longExceeded) {
            riotShortWindowRequests.push(now);
            riotLongWindowRequests.push(now);
            return;
        }

        const shortWaitMs = shortExceeded
            ? Math.max(1, RIOT_SHORT_WINDOW_MS - (now - riotShortWindowRequests[0]))
            : 0;
        const longWaitMs = longExceeded
            ? Math.max(1, RIOT_LONG_WINDOW_MS - (now - riotLongWindowRequests[0]))
            : 0;
        const waitMs = Math.max(shortWaitMs, longWaitMs);

        logger.info('[champstats] Proactive Riot rate-limit pause', {
            context,
            waitMs,
            shortWindowCount: riotShortWindowRequests.length,
            longWindowCount: riotLongWindowRequests.length,
        });
        await sleep(waitMs);
    }
}

// ── PUUID helpers ───────────────────────────────────────────────────────────
async function getPuuidFromDatabase(userId, logger) {
    const res = await api.get('league_player', { user_id: userId });
    if (!res || !Array.isArray(res.league_players) || res.league_players.length === 0) {
        logger.info(`[champstats] No PUUID in DB for user ${userId}`);
        return null;
    }
    const puuid = res.league_players[0].puuid;
    if (!puuid || puuid === 'none') {
        logger.info(`[champstats] Invalid PUUID stored for user ${userId}`);
        return null;
    }
    logger.info(`[champstats] Found PUUID in DB for user ${userId}`);
    return puuid;
}

async function resolvePuuidFromRiotId(username, logger) {
    const idx = username.lastIndexOf('#');
    if (idx === -1) {
        throw new Error('Riot ID must be in Name#TAG format');
    }
    const gameName = username.slice(0, idx);
    const tag = username.slice(idx + 1);

    logger.info(`[champstats] Resolving PUUID via Account-V1 for ${gameName}#${tag}`);
    await acquireRiotRequestSlot(logger, 'account-by-riot-id');
    const res = await http.get(
        `${ACCOUNT_BASE}/${encodeURIComponent(gameName)}/${encodeURIComponent(tag)}`
    );
    return res.data.puuid;
}

// ── Match fetching ──────────────────────────────────────────────────────────
async function fetchMatchIdsPage(puuid, start, count, logger) {
    try {
        await acquireRiotRequestSlot(logger, 'match-id-page');
        const res = await http.get(
            `${MATCH_BASE}/by-puuid/${puuid}/ids`,
            { params: { start, count } }
        );
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        if (err.response?.status === 429) {
            const wait = Number(err.response.headers['retry-after'] ?? 1) * 1000;
            logger.info(`[champstats] Rate limited on /ids; retrying in ${wait}ms`);
            await sleep(wait);
            return fetchMatchIdsPage(puuid, start, count, logger);
        }
        logger.error('[champstats] Failed to fetch match IDs page', {
            start, count, status: err.response?.status, message: err.message,
        });
        return [];
    }
}

async function fetchMatch(matchId, logger) {
    try {
        await acquireRiotRequestSlot(logger, 'match-details');
        return (await http.get(`${MATCH_BASE}/${matchId}`)).data;
    } catch (err) {
        if (err.response?.status === 429) {
            const wait = Number(err.response.headers['retry-after'] ?? 1) * 1000;
            logger.info(`[champstats] Rate limited; retrying match ${matchId} in ${wait}ms`);
            await sleep(wait);
            return fetchMatch(matchId, logger);
        }
        logger.error(`[champstats] Failed to fetch match ${matchId}`, {
            status: err.response?.status, message: err.message,
        });
        return null;
    }
}

async function mapWithConcurrency(items, concurrency, fn) {
    const results = new Array(items.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const i = idx++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}

// ── Core aggregation ────────────────────────────────────────────────────────
const ROLE_LABELS = {
    TOP: 'Top',
    JUNGLE: 'Jungle',
    MIDDLE: 'Mid',
    BOTTOM: 'Bot',
    UTILITY: 'Support',
    UNKNOWN: 'Unknown',
};

function resolveRole(participant) {
    const raw = participant.teamPosition || participant.individualPosition || '';
    const upper = String(raw).toUpperCase();
    if (upper && ROLE_LABELS[upper]) return upper;
    return 'UNKNOWN';
}

/**
 * Scan match history and collect allowed-queue matches for `puuid` until we
 * reach `targetCount` or exhaust IDs / hit the safety cap.
 *
 * Returns { collected, scanned, idsScanned, queueCounts, dateRange }.
 */
async function collectAllowedMatches(puuid, targetCount, logger) {
    const collected = [];
    const queueCounts = Object.create(null);
    const seenMatchIds = new Set();

    let start = 0;
    let idsScanned = 0;
    let scannedMatches = 0;
    let newestTs = null;
    let oldestTs = null;

    logger.info('[champstats] Fetch plan', {
        targetCount,
        maxIds: MAX_IDS_SCANNED,
        concurrency: MATCH_FETCH_CONCURRENCY,
        allowedQueueIds: Array.from(ALLOWED_QUEUE_IDS),
    });

    while (collected.length < targetCount && idsScanned < MAX_IDS_SCANNED) {
        const pageIds = await fetchMatchIdsPage(puuid, start, IDS_PAGE_SIZE, logger);
        if (!pageIds.length) {
            logger.info('[champstats] Match ID page empty; history exhausted', {
                start, idsScanned, collected: collected.length,
            });
            break;
        }

        const uniqueIds = pageIds.filter((id) => {
            if (seenMatchIds.has(id)) return false;
            seenMatchIds.add(id);
            return true;
        });

        start += pageIds.length;
        idsScanned += pageIds.length;

        const pageMatches = await mapWithConcurrency(
            uniqueIds,
            MATCH_FETCH_CONCURRENCY,
            (id) => fetchMatch(id, logger)
        );

        let kept = 0;
        let skipped = 0;
        for (const match of pageMatches) {
            if (!match?.info?.participants?.length) { skipped++; continue; }
            scannedMatches++;

            const queueId = match.info.queueId;
            if (!ALLOWED_QUEUE_IDS.has(queueId)) { skipped++; continue; }

            const participant = match.info.participants.find((p) => p.puuid === puuid);
            if (!participant) { skipped++; continue; }

            const ts = match.info.gameEndTimestamp ?? match.info.gameCreation;
            if (typeof ts === 'number') {
                if (newestTs === null || ts > newestTs) newestTs = ts;
                if (oldestTs === null || ts < oldestTs) oldestTs = ts;
            }

            queueCounts[queueId] = (queueCounts[queueId] || 0) + 1;
            collected.push({
                matchId: match.info.gameId,
                queueId,
                ts,
                participant,
            });
            kept++;

            if (collected.length >= targetCount) break;
        }

        logger.info('[champstats] Page processed', {
            idsScanned,
            pageReturned: pageIds.length,
            pageUnique: uniqueIds.length,
            pageKept: kept,
            pageSkipped: skipped,
            totalCollected: collected.length,
            target: targetCount,
        });

        if (collected.length >= targetCount) break;

        // Small breather every 500 IDs to avoid bursting prod limits.
        if (idsScanned > 0 && idsScanned % 500 === 0) {
            logger.info('[champstats] Rate safety pause (2s)');
            await sleep(2_000);
        }
    }

    const reachedCap = idsScanned >= MAX_IDS_SCANNED && collected.length < targetCount;
    if (reachedCap) {
        logger.info('[champstats] Hit MAX_IDS_SCANNED before target', {
            idsScanned, collected: collected.length, target: targetCount,
        });
    }

    return {
        collected,
        scannedMatches,
        idsScanned,
        queueCounts,
        dateRange: {
            newestTs,
            oldestTs,
        },
    };
}

function aggregateByChampionRole(collected) {
    const buckets = new Map();

    for (const item of collected) {
        const p = item.participant;
        const role = resolveRole(p);
        const key = `${p.championName}|${role}`;

        let b = buckets.get(key);
        if (!b) {
            b = {
                champion: p.championName,
                role,
                roleLabel: ROLE_LABELS[role] || 'Unknown',
                games: 0,
                wins: 0,
                losses: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                lastPlayedTs: 0,
            };
            buckets.set(key, b);
        }

        b.games += 1;
        if (p.win) b.wins += 1; else b.losses += 1;
        b.kills += p.kills || 0;
        b.deaths += p.deaths || 0;
        b.assists += p.assists || 0;
        if (typeof item.ts === 'number' && item.ts > b.lastPlayedTs) {
            b.lastPlayedTs = item.ts;
        }
    }

    const rows = Array.from(buckets.values()).map((b) => {
        const winRate = b.games > 0 ? (b.wins / b.games) * 100 : 0;
        const kda = b.deaths === 0
            ? (b.kills + b.assists)
            : (b.kills + b.assists) / b.deaths;
        return { ...b, winRate, kda };
    });

    rows.sort((a, b) => {
        if (b.games !== a.games) return b.games - a.games;
        return b.winRate - a.winRate;
    });

    return rows;
}

// ── Rendering ───────────────────────────────────────────────────────────────
function formatLastPlayed(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function padRight(str, len) {
    const s = String(str);
    if (s.length >= len) return s.slice(0, len);
    return s + ' '.repeat(len - s.length);
}

function padLeft(str, len) {
    const s = String(str);
    if (s.length >= len) return s.slice(0, len);
    return ' '.repeat(len - s.length) + s;
}

function buildHeaderDescription(summonerName, totalCounted, idsScanned, queueCounts, dateRange, targetCount) {
    const parts = [];
    parts.push(`**Player:** ${summonerName}`);
    parts.push(
        `**Counted:** ${totalCounted} / ${targetCount} ` +
        `(scanned ${idsScanned} match IDs)`
    );
    const breakdown = Object.entries(queueCounts)
        .map(([qid, n]) => `${QUEUE_LABELS[qid] || `Queue ${qid}`}: ${n}`)
        .join(' • ');
    if (breakdown) parts.push(`**Queues:** ${breakdown}`);
    if (dateRange.newestTs && dateRange.oldestTs) {
        parts.push(
            `**Range:** ${formatLastPlayed(dateRange.oldestTs)} → ` +
            `${formatLastPlayed(dateRange.newestTs)}`
        );
    }
    return parts.join('\n');
}

function buildCodeblockPage(rows, page, totalPages) {
    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const header =
        padRight('Champion', 14) + ' ' +
        padRight('Role', 7) + ' ' +
        padLeft('G', 4) + ' ' +
        padLeft('W-L', 9) + ' ' +
        padLeft('WR%', 6) + ' ' +
        padLeft('KDA', 6) + ' ' +
        'Last';
    const sep = '-'.repeat(header.length);

    const lines = slice.map((r) => {
        return (
            padRight(r.champion, 14) + ' ' +
            padRight(r.roleLabel, 7) + ' ' +
            padLeft(r.games, 4) + ' ' +
            padLeft(`${r.wins}-${r.losses}`, 9) + ' ' +
            padLeft(r.winRate.toFixed(1), 6) + ' ' +
            padLeft(r.kda.toFixed(2), 6) + ' ' +
            formatLastPlayed(r.lastPlayedTs)
        );
    });

    return '```\n' + [header, sep, ...lines].join('\n') + '\n```' +
        `\nPage ${page + 1}/${totalPages}`;
}

function buildCodeblockEmbed(summonerName, rows, page, totalPages, headerDesc) {
    const embed = new EmbedBuilder()
        .setTitle(`Champion Stats: ${summonerName}`)
        .setColor('#0099ff')
        .setTimestamp();
    const body = buildCodeblockPage(rows, page, totalPages);
    if (page === 0) {
        embed.setDescription(`${headerDesc}\n\n${body}`);
    } else {
        embed.setDescription(body);
    }
    return embed;
}

function buildFieldEmbed(summonerName, rows, page, totalPages, headerDesc) {
    const embed = new EmbedBuilder()
        .setTitle(`Champion Stats: ${summonerName}`)
        .setColor('#0099ff')
        .setTimestamp();

    if (page === 0) {
        embed.setDescription(headerDesc);
    }

    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    for (const r of slice) {
        const name = `${r.champion} — ${r.roleLabel}`;
        const last = r.lastPlayedTs
            ? `<t:${Math.floor(r.lastPlayedTs / 1000)}:R>`
            : '—';
        const value =
            `Games: **${r.games}** (${r.wins}W-${r.losses}L, ${r.winRate.toFixed(1)}%)\n` +
            `KDA: **${r.kda.toFixed(2)}** (${r.kills}/${r.deaths}/${r.assists})\n` +
            `Last: ${last}`;
        embed.addFields({ name, value, inline: true });
    }

    embed.setFooter({ text: `Page ${page + 1}/${totalPages}` });
    return embed;
}

function buildPageButtons(pagerId, page, totalPages) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`CHAMPSTATS_PREV_${pagerId}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 0),
            new ButtonBuilder()
                .setCustomId(`CHAMPSTATS_NEXT_${pagerId}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        ),
    ];
}

async function sendPaginatedResults(channel, summonerName, rows, headerDesc, displayMode, logger) {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    let page = 0;
    const pagerId = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

    const buildEmbed = displayMode === 'embed' ? buildFieldEmbed : buildCodeblockEmbed;

    const listMessage = await channel.send({
        embeds: [buildEmbed(summonerName, rows, page, totalPages, headerDesc)],
        components: buildPageButtons(pagerId, page, totalPages),
    });

    if (totalPages <= 1) {
        logger.info('[champstats] Single-page result; skipping collector', {
            rows: rows.length,
        });
        return;
    }

    if (typeof listMessage?.createMessageComponentCollector !== 'function') {
        logger.info('[champstats] Sent message does not support collectors; skipping pagination', {
            rows: rows.length,
        });
        return;
    }

    const collector = listMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PAGINATOR_COLLECTOR_TIME_MS,
    });

    collector.on('collect', async (interaction) => {
        if (!interaction.customId.endsWith(pagerId)) return;
        if (interaction.customId.startsWith('CHAMPSTATS_PREV_')) {
            page = Math.max(0, page - 1);
        } else if (interaction.customId.startsWith('CHAMPSTATS_NEXT_')) {
            page = Math.min(totalPages - 1, page + 1);
        }
        try {
            await interaction.update({
                embeds: [buildEmbed(summonerName, rows, page, totalPages, headerDesc)],
                components: buildPageButtons(pagerId, page, totalPages),
            });
        } catch (err) {
            logger.error(`[champstats] Pagination update failed: ${err.message || err}`);
        }
    });

    collector.on('end', async () => {
        logger.info('[champstats] Paginator collector ended; disabling buttons');
        try {
            await listMessage.edit({
                components: buildPageButtons(pagerId, page, totalPages).map((row) => {
                    const disabled = new ActionRowBuilder();
                    row.components.forEach((c) => {
                        disabled.addComponents(ButtonBuilder.from(c).setDisabled(true));
                    });
                    return disabled;
                }),
            });
        } catch (err) {
            logger.error(`[champstats] Failed to disable paginator buttons: ${err.message || err}`);
        }
    });
}

// ── Command ─────────────────────────────────────────────────────────────────
module.exports = {
    name: 'champstats',
    description: 'Per-champion stats (Draft/Solo/Flex only) — games, W-L, WR%, KDA, last played, split by role.',
    syntax: 'champstats [riot_id] [game_count] [display: codeblock|embed]',
    num_args: 1,
    args_to_lower: false, // preserve Riot ID casing (tag is case-sensitive-ish)
    needs_api: true,
    has_state: false,
    options: [
        {
            name: 'summoner_name',
            description: 'Riot ID (Name#TAG). Omit to use your linked account.',
            type: 'STRING',
            required: true,
        },
        {
            name: 'game_count',
            description: `Number of Draft/Solo/Flex games to include (1-${MAX_GAMES_REQUESTED}, default 25)`,
            type: 'INTEGER',
            required: false,
        },
        {
            name: 'display',
            description: 'Display mode: codeblock (default) or embed',
            type: 'STRING',
            required: false,
            choices: [
                { name: 'codeblock', value: 'codeblock' },
                { name: 'embed', value: 'embed' },
            ],
        },
    ],

    async execute(message, args, extra) {
        this.logger.info('[champstats] Execute called', {
            userId: message.author?.id,
            argsLength: args.length,
        });

        // Drop command name.
        args.shift();

        // Drop null/empty positional slots that slash command options produce
        // when the user omits an optional option. Also split any space-containing
        // positional into its whitespace-delimited pieces so that a user who
        // accidentally pasted "Name#TAG 500" into the summoner_name slash field
        // still gets sensible parsing (Riot tags can't contain spaces anyway).
        const flatArgs = [];
        for (const a of args) {
            if (a === null || a === undefined) continue;
            const s = String(a).trim();
            if (!s) continue;
            for (const piece of s.split(/\s+/)) {
                if (piece) flatArgs.push(piece);
            }
        }
        args = flatArgs;

        // Parse trailing optional display mode ("codeblock" | "embed").
        let displayMode = 'codeblock';
        if (args.length > 0) {
            const tail = String(args[args.length - 1]).toLowerCase();
            if (tail === 'embed' || tail === 'codeblock') {
                displayMode = tail;
                args.pop();
            }
        }

        // Parse trailing optional integer game_count.
        let gameCount = 25;
        if (args.length > 0) {
            const tail = args[args.length - 1];
            const parsed = Number(tail);
            if (!Number.isNaN(parsed) && Number.isFinite(parsed) && String(tail).trim() !== '') {
                gameCount = Math.floor(parsed);
                args.pop();
            }
        }
        if (gameCount < 1) gameCount = 1;
        if (gameCount > MAX_GAMES_REQUESTED) gameCount = MAX_GAMES_REQUESTED;

        const summonerName = args.join(' ').trim();
        if (!summonerName) {
            await message.channel.send('Usage: `/champstats <Name#TAG> [game_count] [display]`');
            return;
        }

        this.logger.info('[champstats] Parsed inputs', {
            summonerName,
            gameCount,
            displayMode,
        });

        // Resolve PUUID.
        let puuid = null;
        try {
            if (summonerName.includes('#')) {
                puuid = await resolvePuuidFromRiotId(summonerName, this.logger);
            } else {
                puuid = await getPuuidFromDatabase(message.author.id, this.logger);
                if (!puuid) {
                    await message.channel.send(
                        'No Riot ID provided and no linked account on file. ' +
                        'Use `Name#TAG` or link your League account first.'
                    );
                    return;
                }
            }
        } catch (err) {
            this.logger.error('[champstats] PUUID resolution failed', {
                message: err?.message, status: err?.response?.status,
            });
            await message.channel.send(
                `Failed to resolve Riot ID: ${err?.message || 'unknown error'}`
            );
            return;
        }

        // Try to open a thread for progress + results; fall back to the channel
        // if threads aren't supported (e.g. slash interaction responses).
        let target = message.channel;
        try {
            if (typeof message.startThread === 'function') {
                const thread = await message.startThread({
                    name: `Champ Stats: ${summonerName.slice(0, 80)}`,
                    autoArchiveDuration: 60,
                });
                await thread.send(`<@${message.author.id}>`);
                target = thread;
            }
        } catch (err) {
            this.logger.info('[champstats] Could not start thread; using channel', {
                message: err?.message,
            });
        }

        await target.send(
            `Fetching up to ${gameCount} Draft/Solo/Flex games for **${summonerName}**…\n` +
            `This may take a while for large counts — non-allowed queues (ARAM, Mayhem, ` +
            `Swiftplay, Coop vs AI, rotating modes) are skipped.`
        );

        // Scan + collect.
        let collection;
        try {
            collection = await collectAllowedMatches(puuid, gameCount, this.logger);
        } catch (err) {
            this.logger.error('[champstats] Match collection failed', {
                message: err?.message,
            });
            await target.send(`Error while fetching matches: ${err?.message || 'unknown error'}`);
            return;
        }

        const { collected, idsScanned, queueCounts, dateRange } = collection;

        if (!collected.length) {
            await target.send(
                `No Draft/Solo/Flex matches found in the scanned window ` +
                `(${idsScanned} match IDs scanned).`
            );
            return;
        }

        const rows = aggregateByChampionRole(collected);

        this.logger.info('[champstats] Aggregation summary', {
            totalCounted: collected.length,
            uniqueChampionRolePairs: rows.length,
            queueCounts,
            idsScanned,
        });

        const headerDesc = buildHeaderDescription(
            summonerName,
            collected.length,
            idsScanned,
            queueCounts,
            dateRange,
            gameCount
        );

        // TODO(future): swap this paginator for an HTML-rendered infographic
        // similar to modules/league/match-template-player-stats.html.
        try {
            await sendPaginatedResults(target, summonerName, rows, headerDesc, displayMode, this.logger);
        } catch (err) {
            this.logger.error('[champstats] Failed to send paginated results', {
                message: err?.message,
            });
            await target.send(`Error rendering results: ${err?.message || 'unknown error'}`);
        }
    },
};
