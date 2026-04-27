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
const TIMELINE_FETCH_CONCURRENCY = 4; // timelines are large; use lower concurrency
const MAX_GAMES_REQUESTED = 2000; // hard cap on counted games per user instruction
const MAX_IDS_SCANNED = 4000;     // safety cap to avoid pathological hunts

// Minute marks sampled for gold-curve display in deep mode.
const DEEP_MILESTONE_MINUTES = [5, 10, 15, 20, 25, 30, 35, 40];

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

// Returns the participantId of the opponent sharing the same teamPosition.
// Returns null when position is unavailable or no opponent found.
function findEnemyParticipantId(participants, myParticipant) {
    const myRole = myParticipant.teamPosition;
    if (!myRole || myRole === '' || myRole === 'Invalid') return null;
    const enemy = participants.find(
        (p) => p.teamPosition === myRole && p.teamId !== myParticipant.teamId
    );
    return enemy ? enemy.participantId : null;
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
    let stopReason = 'target_reached'; // 'target_reached' | 'exhausted' | 'scan_cap'

    logger.info('[champstats] Fetch plan', {
        targetCount,
        maxIds: MAX_IDS_SCANNED,
        concurrency: MATCH_FETCH_CONCURRENCY,
        allowedQueueIds: Array.from(ALLOWED_QUEUE_IDS),
    });

    while (collected.length < targetCount && idsScanned < MAX_IDS_SCANNED) {
        const pageIds = await fetchMatchIdsPage(puuid, start, IDS_PAGE_SIZE, logger);
        if (!pageIds.length) {
            stopReason = 'exhausted';
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
        for (let mi = 0; mi < pageMatches.length; mi++) {
            const match = pageMatches[mi];
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
                matchId: uniqueIds[mi], // string ID (e.g. NA1_XXXX) needed for timeline endpoint
                queueId,
                ts,
                participant,
                participantId: participant.participantId,
                enemyParticipantId: findEnemyParticipantId(match.info.participants, participant),
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

    if (idsScanned >= MAX_IDS_SCANNED && collected.length < targetCount) {
        stopReason = 'scan_cap';
        logger.info('[champstats] Hit MAX_IDS_SCANNED before target', {
            idsScanned, collected: collected.length, target: targetCount,
        });
    }

    logger.info('[champstats] Collection complete', {
        stopReason, idsScanned, collected: collected.length, target: targetCount,
    });

    return {
        collected,
        scannedMatches,
        idsScanned,
        stopReason,
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
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Returns compact "Mmm DD" (6 chars) to stay within codeblock column budget.
// Full date range is shown in the header.
function formatLastPlayed(ts) {
    if (!ts) return '—     ';
    const d = new Date(ts);
    const mon = MONTHS_SHORT[d.getUTCMonth()];
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${mon} ${day}`;
}

// Full YYYY-MM-DD used in the header range line only.
function formatDateFull(ts) {
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

const STOP_REASON_LABELS = {
    target_reached: null, // no extra note needed
    exhausted: '⚠️ Full match history scanned — Riot does not have older data for this account.',
    scan_cap: `⚠️ Scan cap reached (${MAX_IDS_SCANNED} match IDs) before target was met. Try a smaller count.`,
};

function buildHeaderDescription(summonerName, totalCounted, idsScanned, queueCounts, dateRange, targetCount, stopReason, roleFilter) {
    const parts = [];
    parts.push(`**Player:** ${summonerName}`);

    const countLine = stopReason === 'target_reached'
        ? `**Counted:** ${totalCounted} / ${targetCount} (scanned ${idsScanned} match IDs)`
        : `**Counted:** ${totalCounted} / ${targetCount} — this is all available data (scanned ${idsScanned} match IDs)`;
    parts.push(countLine);

    const note = STOP_REASON_LABELS[stopReason];
    if (note) parts.push(note);

    const breakdown = Object.entries(queueCounts)
        .map(([qid, n]) => `${QUEUE_LABELS[qid] || `Queue ${qid}`}: ${n}`)
        .join(' • ');
    if (breakdown) parts.push(`**Queues:** ${breakdown}`);
    if (roleFilter) parts.push(`**Role filter:** ${ROLE_LABELS[roleFilter] || roleFilter}`);
    if (dateRange.newestTs && dateRange.oldestTs) {
        parts.push(
            `**Range:** ${formatDateFull(dateRange.oldestTs)} → ` +
            `${formatDateFull(dateRange.newestTs)}`
        );
    }
    return parts.join('\n');
}

function buildCodeblockPage(rows, page, totalPages) {
    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Column widths tuned to fit ~50 chars (Discord embed codeblock boundary).
    const header =
        padRight('Champion', 12) + ' ' +
        padRight('Role', 7) + ' ' +
        padLeft('G', 3) + ' ' +
        padLeft('W-L', 7) + ' ' +
        padLeft('WR%', 5) + ' ' +
        padLeft('KDA', 5) + ' ' +
        'Last';
    const sep = '-'.repeat(header.length);

    const lines = slice.map((r) => {
        return (
            padRight(r.champion, 12) + ' ' +
            padRight(r.roleLabel, 7) + ' ' +
            padLeft(r.games, 3) + ' ' +
            padLeft(`${r.wins}-${r.losses}`, 7) + ' ' +
            padLeft(r.winRate.toFixed(1), 5) + ' ' +
            padLeft(r.kda.toFixed(2), 5) + ' ' +
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

// ── Timeline deep-dive ───────────────────────────────────────────────────────

async function fetchTimeline(matchId, logger) {
    try {
        await acquireRiotRequestSlot(logger, 'timeline');
        return (await http.get(`${MATCH_BASE}/${matchId}/timeline`)).data;
    } catch (err) {
        if (err.response?.status === 429) {
            const wait = Number(err.response.headers['retry-after'] ?? 1) * 1000;
            logger.info(`[champstats] Rate limited on timeline ${matchId}; retrying in ${wait}ms`);
            await sleep(wait);
            return fetchTimeline(matchId, logger);
        }
        logger.error(`[champstats] Failed to fetch timeline ${matchId}`, {
            status: err.response?.status, message: err.message,
        });
        return null;
    }
}

/**
 * Extract per-minute snapshots from a timeline for a given participant and
 * (optionally) their lane opponent. Also scans events for tower plates and
 * estimates the minute of first legendary-tier item (totalGold >= 3400).
 */
function extractTimelineStats(timeline, participantId, enemyParticipantId) {
    if (!timeline?.info?.frames?.length) return null;

    let platesCount = 0;
    let firstItemMin = null;
    const snapshots = [];

    for (const frame of timeline.info.frames) {
        const minute = Math.round(frame.timestamp / 60000);
        const pf = frame.participantFrames?.[String(participantId)];
        if (!pf) continue;

        // Count turret plates destroyed by this participant.
        for (const evt of (frame.events || [])) {
            if (evt.type === 'TURRET_PLATE_DESTROYED' && evt.killerId === participantId) {
                platesCount++;
            }
        }

        const cs = (pf.minionsKilled || 0) + (pf.jungleMinionsKilled || 0);
        const ef = enemyParticipantId
            ? frame.participantFrames?.[String(enemyParticipantId)]
            : null;
        const enemyCs = ef != null
            ? (ef.minionsKilled || 0) + (ef.jungleMinionsKilled || 0)
            : null;

        // First minute total earned gold crosses the legendary-item floor.
        if (firstItemMin === null && (pf.totalGold || 0) >= 3400) {
            firstItemMin = minute;
        }

        snapshots.push({
            minute,
            totalGold: pf.totalGold || 0,
            cs,
            xp: pf.xp || 0,
            level: pf.level || 1,
            enemyTotalGold: ef?.totalGold ?? null,
            goldDiff: ef != null ? (pf.totalGold || 0) - (ef.totalGold || 0) : null,
            enemyCs,
            csDiff: enemyCs != null ? cs - enemyCs : null,
        });
    }

    if (!snapshots.length) return null;

    const last = snapshots[snapshots.length - 1];
    const mins = Math.max(last.minute, 1);

    return {
        gameDurationMins: mins,
        goldPerMin: last.totalGold / mins,
        csPerMin: last.cs / mins,
        xpPerMin: last.xp / mins,
        platesCount,
        firstItemMin,
        snapshots,
    };
}

/**
 * Fetch timeline for every unique match in `collected` and attach
 * `.timelineStats` to each item that succeeds.
 */
async function enrichWithTimelines(collected, logger) {
    const uniqueMatchIds = [...new Set(collected.map((c) => c.matchId))];
    logger.info('[champstats] Fetching timelines for deep mode', {
        uniqueMatches: uniqueMatchIds.length,
    });

    const timelineResults = await mapWithConcurrency(
        uniqueMatchIds,
        TIMELINE_FETCH_CONCURRENCY,
        (matchId) => fetchTimeline(matchId, logger).then((tl) => ({ matchId, tl }))
    );

    const timelineMap = new Map();
    for (const { matchId, tl } of timelineResults) {
        if (tl) timelineMap.set(matchId, tl);
    }

    let enriched = 0;
    for (const item of collected) {
        const tl = timelineMap.get(item.matchId);
        if (!tl) continue;
        item.timelineStats = extractTimelineStats(tl, item.participantId, item.enemyParticipantId);
        if (item.timelineStats) enriched++;
    }

    logger.info('[champstats] Timeline enrichment complete', {
        timelinesFetched: timelineMap.size,
        itemsEnriched: enriched,
    });
}

/**
 * For each row in `rowOrder`, aggregate timeline stats across all matching
 * collected items. Returns Map<`champion|role`, deepStats|null>.
 */
function buildDeepStatsMap(collected, rowOrder) {
    // Group items by bucket key
    const buckets = new Map();
    for (const item of collected) {
        const role = resolveRole(item.participant);
        const key = `${item.participant.championName}|${role}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(item);
    }

    const result = new Map();
    for (const row of rowOrder) {
        const key = `${row.champion}|${row.role}`;
        const items = buckets.get(key) || [];
        const enriched = items.filter((i) => i.timelineStats);

        if (!enriched.length) { result.set(key, null); continue; }

        const n = enriched.length;
        const avg = (fn) => enriched.reduce((s, i) => s + fn(i.timelineStats), 0) / n;

        const avgGoldPerMin   = avg((ts) => ts.goldPerMin);
        const avgCsPerMin     = avg((ts) => ts.csPerMin);
        const avgXpPerMin     = avg((ts) => ts.xpPerMin);
        const avgPlates       = avg((ts) => ts.platesCount);
        const itemMinItems    = enriched.filter((i) => i.timelineStats.firstItemMin != null);
        const avgFirstItemMin = itemMinItems.length
            ? itemMinItems.reduce((s, i) => s + i.timelineStats.firstItemMin, 0) / itemMinItems.length
            : null;

        // Build per-minute gold and CS curves from frame snapshots.
        const goldByMin    = new Map();
        const goldDiffByMin = new Map();
        const csByMin      = new Map();
        const csDiffByMin  = new Map();
        for (const item of enriched) {
            for (const snap of item.timelineStats.snapshots) {
                if (!goldByMin.has(snap.minute)) goldByMin.set(snap.minute, []);
                goldByMin.get(snap.minute).push(snap.totalGold);
                if (snap.goldDiff !== null) {
                    if (!goldDiffByMin.has(snap.minute)) goldDiffByMin.set(snap.minute, []);
                    goldDiffByMin.get(snap.minute).push(snap.goldDiff);
                }
                if (!csByMin.has(snap.minute)) csByMin.set(snap.minute, []);
                csByMin.get(snap.minute).push(snap.cs);
                if (snap.csDiff !== null) {
                    if (!csDiffByMin.has(snap.minute)) csDiffByMin.set(snap.minute, []);
                    csDiffByMin.get(snap.minute).push(snap.csDiff);
                }
            }
        }

        const threshold = Math.ceil(n / 2); // require at least half of games to have reached this minute
        const buildCurve = (mainMap, diffMap) => DEEP_MILESTONE_MINUTES.map((target) => {
            const candidates = [...mainMap.keys()].filter((k) => Math.abs(k - target) <= 1);
            if (!candidates.length) return null;
            const best = candidates.reduce((a, b) =>
                Math.abs(a - target) <= Math.abs(b - target) ? a : b
            );
            const vals = mainMap.get(best);
            if (vals.length < threshold) return null;
            const avgVal = vals.reduce((s, v) => s + v, 0) / vals.length;
            const diffs = diffMap.get(best) || [];
            const avgDiff = diffs.length
                ? diffs.reduce((s, v) => s + v, 0) / diffs.length
                : null;
            return { minute: target, avgVal, avgDiff };
        }).filter(Boolean);

        result.set(key, {
            n,
            avgGoldPerMin,
            avgCsPerMin,
            avgXpPerMin,
            avgPlates,
            avgFirstItemMin,
            goldCurve: buildCurve(goldByMin, goldDiffByMin),
            csCurve:   buildCurve(csByMin, csDiffByMin),
        });
    }
    return result;
}

// ── Deep rendering ───────────────────────────────────────────────────────────

/**
 * Render one champion+role bucket as a plain codeblock string.
 * One bucket per page — wide layout intended for plain text messages.
 *
 * Gold and CS curves share one combined table to maximise horizontal space.
 * "~1st item" is the minute when the player's cumulative gold first crossed
 * 3400 (gold earned, not current) — a rough proxy for first legendary purchase.
 */
function buildDeepPage(rows, deepStatsMap, page, totalPages, headerDesc) {
    const row = rows[page];
    if (!row) return '```\nNo data.\n```';

    const key = `${row.champion}|${row.role}`;
    const ds = deepStatsMap.get(key);

    const title    = `${row.champion} / ${row.roleLabel}`;
    const subtitle = `${row.games}g  •  ${row.winRate.toFixed(1)}% WR  •  ${row.kda.toFixed(2)} KDA  (${row.wins}W-${row.losses}L)`;
    const sep60    = '─'.repeat(60);

    const lines = [];

    // Header only on first page.
    if (page === 0 && headerDesc) {
        lines.push(headerDesc);
        lines.push('');
    }

    lines.push(title);
    lines.push(subtitle);
    lines.push(sep60);

    if (!ds) {
        lines.push('(no timeline data available for this bucket)');
    } else {
        lines.push(`Timeline: ${ds.n} / ${row.games} games`);
        lines.push('');

        // ── Per-game averages ────────────────────────────────────────────
        lines.push(`Gold/min:       ${ds.avgGoldPerMin.toFixed(1)}`);
        lines.push(`CS/min:         ${ds.avgCsPerMin.toFixed(2)}`);
        lines.push(`XP/min:         ${ds.avgXpPerMin.toFixed(1)}`);
        lines.push(`Tower plates:   ${ds.avgPlates.toFixed(1)} avg`);
        if (ds.avgFirstItemMin != null) {
            lines.push(`~1st item:      min ${ds.avgFirstItemMin.toFixed(1)} (by gold earned ≥3400)`);
        }

        // ── Combined Gold + CS curve ─────────────────────────────────────
        const hasCurve = ds.goldCurve.length > 0 || ds.csCurve.length > 0;
        if (hasCurve) {
            lines.push('');

            // Merge gold and CS rows by minute key.
            const byMinute = new Map();
            for (const pt of ds.goldCurve) byMinute.set(pt.minute, { gold: pt, cs: null });
            for (const pt of ds.csCurve) {
                if (!byMinute.has(pt.minute)) byMinute.set(pt.minute, { gold: null, cs: pt });
                else byMinute.get(pt.minute).cs = pt;
            }
            const minutes = [...byMinute.keys()].sort((a, b) => a - b);

            const hasGoldEnemy = ds.goldCurve.some((pt) => pt.avgDiff !== null);
            const hasCsEnemy   = ds.csCurve.some((pt) => pt.avgDiff !== null);

            // Build header row dynamically.
            let hdr = padLeft('Min', 4) + '  ';
            hdr += padLeft('Gold', 7);
            if (hasGoldEnemy) hdr += '  ' + padLeft('EGold', 7) + '  ' + padLeft('GDiff', 7);
            hdr += '    ';
            hdr += padLeft('CS', 4);
            if (hasCsEnemy) hdr += '  ' + padLeft('ECS', 4) + '  ' + padLeft('CDiff', 5);

            lines.push('Gold & CS vs enemy laner (avg per game):');
            lines.push(hdr);
            lines.push('─'.repeat(hdr.length));

            for (const m of minutes) {
                const { gold, cs } = byMinute.get(m);
                let row_ = padLeft(m, 4) + '  ';

                if (gold) {
                    row_ += padLeft(Math.round(gold.avgVal), 7);
                    if (hasGoldEnemy) {
                        const eg = gold.avgDiff != null ? Math.round(gold.avgVal - gold.avgDiff) : null;
                        const gd = gold.avgDiff != null ? Math.round(gold.avgDiff) : null;
                        row_ += '  ' + (eg != null ? padLeft(eg, 7) : padLeft('?', 7));
                        row_ += '  ' + (gd != null
                            ? padLeft((gd >= 0 ? '+' : '') + gd, 7)
                            : padLeft('?', 7));
                    }
                } else {
                    row_ += padLeft('—', 7);
                    if (hasGoldEnemy) row_ += '  ' + padLeft('—', 7) + '  ' + padLeft('—', 7);
                }

                row_ += '    ';

                if (cs) {
                    row_ += padLeft(Math.round(cs.avgVal), 4);
                    if (hasCsEnemy) {
                        const ec = cs.avgDiff != null ? Math.round(cs.avgVal - cs.avgDiff) : null;
                        const cd = cs.avgDiff != null ? Math.round(cs.avgDiff) : null;
                        row_ += '  ' + (ec != null ? padLeft(ec, 4) : padLeft('?', 4));
                        row_ += '  ' + (cd != null
                            ? padLeft((cd >= 0 ? '+' : '') + cd, 5)
                            : padLeft('?', 5));
                    }
                } else {
                    row_ += padLeft('—', 4);
                    if (hasCsEnemy) row_ += '  ' + padLeft('—', 4) + '  ' + padLeft('—', 5);
                }

                lines.push(row_);
            }
        }
    }

    lines.push('');
    lines.push(`Page ${page + 1} / ${totalPages}`);

    return '```\n' + lines.join('\n') + '\n```';
}

async function sendDeepResults(channel, summonerName, rows, deepStatsMap, headerDesc, logger) {
    // One champion+role bucket per page, sent as plain text (no embed) for full channel width.
    const totalPages = rows.length;
    if (totalPages === 0) {
        await channel.send('No data to display.');
        return;
    }

    let page = 0;
    const pagerId = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

    const buildContent = (p) => buildDeepPage(rows, deepStatsMap, p, totalPages, headerDesc);

    const listMessage = await channel.send({
        content: buildContent(page),
        components: buildPageButtons(pagerId, page, totalPages),
    });

    if (totalPages <= 1) return;

    if (typeof listMessage?.createMessageComponentCollector !== 'function') {
        logger.info('[champstats] Deep results: message does not support collectors; skipping pagination');
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
                content: buildContent(page),
                embeds: [],
                components: buildPageButtons(pagerId, page, totalPages),
            });
        } catch (err) {
            logger.error(`[champstats] Deep pagination update failed: ${err.message || err}`);
        }
    });

    collector.on('end', async () => {
        logger.info('[champstats] Deep paginator collector ended; disabling buttons');
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
            logger.error(`[champstats] Failed to disable deep paginator buttons: ${err.message || err}`);
        }
    });
}

// ── Command ─────────────────────────────────────────────────────────────────
module.exports = {
    name: 'champstats',
    description: 'Per-champion stats (Draft/Solo/Flex only) — games, W-L, WR%, KDA, last played, split by role.',
    syntax: 'champstats [riot_id] [game_count] [role] [display: codeblock|embed|deep]',
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
            name: 'role',
            description: 'Filter results to a specific role (optional)',
            type: 'STRING',
            required: false,
            choices: [
                { name: 'Top',     value: 'TOP'     },
                { name: 'Jungle',  value: 'JUNGLE'  },
                { name: 'Mid',     value: 'MIDDLE'  },
                { name: 'Bot',     value: 'BOTTOM'  },
                { name: 'Support', value: 'UTILITY' },
            ],
        },
        {
            name: 'display',
            description: 'Display mode: codeblock (default), embed, or deep (timeline analysis)',
            type: 'STRING',
            required: false,
            choices: [
                { name: 'codeblock', value: 'codeblock' },
                { name: 'embed',     value: 'embed'     },
                { name: 'deep',      value: 'deep'      },
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

        // Recognise canonical role values and common aliases (case-insensitive).
        const ROLE_FILTER_MAP = {
            top: 'TOP',
            jg: 'JUNGLE', jungle: 'JUNGLE',
            mid: 'MIDDLE', middle: 'MIDDLE',
            bot: 'BOTTOM', bottom: 'BOTTOM', adc: 'BOTTOM',
            sup: 'UTILITY', support: 'UTILITY', utility: 'UTILITY',
        };
        // Also accept the canonical uppercase values the slash command sends.
        for (const v of Object.values(ROLE_FILTER_MAP)) ROLE_FILTER_MAP[v.toLowerCase()] = v;

        // Parse trailing optional display mode ("codeblock" | "embed" | "deep").
        let displayMode = 'codeblock';
        if (args.length > 0) {
            const tail = String(args[args.length - 1]).toLowerCase();
            if (tail === 'embed' || tail === 'codeblock' || tail === 'deep') {
                displayMode = tail;
                args.pop();
            }
        }

        // Parse trailing optional role filter.
        let roleFilter = null;
        if (args.length > 0) {
            const tail = String(args[args.length - 1]).toLowerCase();
            if (ROLE_FILTER_MAP[tail]) {
                roleFilter = ROLE_FILTER_MAP[tail];
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
            await message.channel.send('Usage: `/champstats <Name#TAG> [game_count] [role] [display]`');
            return;
        }

        this.logger.info('[champstats] Parsed inputs', {
            summonerName,
            gameCount,
            roleFilter,
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

        const { collected, idsScanned, stopReason, queueCounts, dateRange } = collection;

        if (!collected.length) {
            await target.send(
                `No Draft/Solo/Flex matches found in the scanned window ` +
                `(${idsScanned} match IDs scanned).`
            );
            return;
        }

        let rows = aggregateByChampionRole(collected);

        // Apply role filter if requested.
        if (roleFilter) {
            rows = rows.filter((r) => r.role === roleFilter);
            this.logger.info('[champstats] Role filter applied', {
                roleFilter, rowsAfterFilter: rows.length,
            });
        }

        this.logger.info('[champstats] Aggregation summary', {
            totalCounted: collected.length,
            uniqueChampionRolePairs: rows.length,
            roleFilter,
            queueCounts,
            idsScanned,
        });

        if (!rows.length) {
            await target.send(
                roleFilter
                    ? `No ${ROLE_LABELS[roleFilter] || roleFilter} games found in the collected data.`
                    : 'No data to display after aggregation.'
            );
            return;
        }

        const headerDesc = buildHeaderDescription(
            summonerName,
            collected.length,
            idsScanned,
            queueCounts,
            dateRange,
            gameCount,
            stopReason,
            roleFilter
        );

        // TODO(future): swap codeblock/embed/deep output for an HTML-rendered infographic
        // similar to modules/league/match-template-player-stats.html.
        if (displayMode === 'deep') {
            await target.send(
                `Fetching timeline data for **${collected.length}** match${collected.length !== 1 ? 'es' : ''}…` +
                ` Each match requires an additional API call — this may take extra time.`
            );
            try {
                await enrichWithTimelines(collected, this.logger);
            } catch (err) {
                this.logger.error('[champstats] Timeline enrichment failed', { message: err?.message });
                await target.send(
                    `Warning: timeline enrichment failed (${err?.message || 'unknown error'}). ` +
                    `Showing available data only.`
                );
            }

            const deepStatsMap = buildDeepStatsMap(collected, rows);
            this.logger.info('[champstats] Deep stats map built', {
                buckets: deepStatsMap.size,
                withData: [...deepStatsMap.values()].filter(Boolean).length,
            });

            try {
                await sendDeepResults(target, summonerName, rows, deepStatsMap, headerDesc, this.logger);
            } catch (err) {
                this.logger.error('[champstats] Failed to send deep results', { message: err?.message });
                await target.send(`Error rendering deep results: ${err?.message || 'unknown error'}`);
            }
        } else {
            try {
                await sendPaginatedResults(target, summonerName, rows, headerDesc, displayMode, this.logger);
            } catch (err) {
                this.logger.error('[champstats] Failed to send paginated results', { message: err?.message });
                await target.send(`Error rendering results: ${err?.message || 'unknown error'}`);
            }
        }
    },
};
