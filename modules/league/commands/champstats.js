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
const fs = require('fs');
const path = require('path');
const nodeHtmlToImage = require('node-html-to-image');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    AttachmentBuilder,
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

// CommunityDragon-hosted role icons (used by the role-mode infographic header).
const ROLE_ICON_URLS = {
    TOP:     'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-top.png',
    JUNGLE:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-jungle.png',
    MIDDLE:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-middle.png',
    BOTTOM:  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-bottom.png',
    UTILITY: 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-utility.png',
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

            const enemyParticipantObj = match.info.participants.find(
                (p) => p.participantId === findEnemyParticipantId(match.info.participants, participant)
            ) || null;
            const myTeam = (match.info.teams || []).find((t) => t.teamId === participant.teamId) || null;
            const enemyTeam = (match.info.teams || []).find((t) => t.teamId !== participant.teamId) || null;

            collected.push({
                matchId: uniqueIds[mi], // string ID (e.g. NA1_XXXX) needed for timeline endpoint
                queueId,
                ts,
                gameDurationSec: match.info.gameDuration ?? null,
                participant,
                participantId: participant.participantId,
                allParticipants: match.info.participants,
                enemyParticipantId: enemyParticipantObj?.participantId ?? null,
                enemyParticipant: enemyParticipantObj,
                myTeam,
                enemyTeam,
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
 * (optionally) their lane opponent. Splits laneCs vs jungleCs separately so
 * we can detect when a jungler farms lane minions or a laner roams jungle.
 * Also collects ITEM_PURCHASED events (real itemIds + minutes) and counts
 * tower plates taken from TURRET_PLATE_DESTROYED events.
 */
function extractTimelineStats(timeline, participantId, enemyParticipantId) {
    if (!timeline?.info?.frames?.length) return null;

    let platesCount = 0;
    const itemPurchases = []; // [{ minute, itemId }]
    const itemSells     = []; // [{ minute, itemId }]
    const itemUndos     = []; // [{ minute, beforeId, afterId }]
    const snapshots = [];

    for (const frame of timeline.info.frames) {
        const minute = frame.timestamp / 60000;
        const pf = frame.participantFrames?.[String(participantId)];
        if (!pf) continue;

        for (const evt of (frame.events || [])) {
            if (evt.participantId !== participantId) continue;
            switch (evt.type) {
                case 'TURRET_PLATE_DESTROYED':
                    if (evt.killerId === participantId) platesCount++;
                    break;
                case 'ITEM_PURCHASED':
                    itemPurchases.push({ minute: evt.timestamp / 60000, itemId: evt.itemId });
                    break;
                case 'ITEM_SOLD':
                    itemSells.push({ minute: evt.timestamp / 60000, itemId: evt.itemId });
                    break;
                case 'ITEM_UNDO':
                    itemUndos.push({
                        minute: evt.timestamp / 60000,
                        beforeId: evt.beforeId,
                        afterId: evt.afterId,
                    });
                    break;
                default: break;
            }
        }

        const laneCs   = pf.minionsKilled || 0;
        const jungleCs = pf.jungleMinionsKilled || 0;
        const ef = enemyParticipantId
            ? frame.participantFrames?.[String(enemyParticipantId)]
            : null;
        const enemyLaneCs   = ef ? (ef.minionsKilled || 0) : null;
        const enemyJungleCs = ef ? (ef.jungleMinionsKilled || 0) : null;

        snapshots.push({
            minute: Math.round(minute),
            totalGold: pf.totalGold || 0,
            laneCs,
            jungleCs,
            cs: laneCs + jungleCs,
            xp: pf.xp || 0,
            level: pf.level || 1,
            enemyTotalGold: ef?.totalGold ?? null,
            enemyXp: ef?.xp ?? null,
            enemyLaneCs,
            enemyJungleCs,
            enemyCs: ef ? (enemyLaneCs + enemyJungleCs) : null,
            goldDiff: ef ? (pf.totalGold || 0) - (ef.totalGold || 0) : null,
        });
    }

    if (!snapshots.length) return null;

    const last = snapshots[snapshots.length - 1];
    const mins = Math.max(last.minute, 1);

    return {
        gameDurationMins: mins,
        goldPerMin: last.totalGold / mins,
        csPerMin: last.cs / mins,
        laneCsPerMin: last.laneCs / mins,
        jungleCsPerMin: last.jungleCs / mins,
        xpPerMin: last.xp / mins,
        platesCount,
        itemPurchases,
        itemSells,
        itemUndos,
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

// ── Aggregation helpers ─────────────────────────────────────────────────────

function avgOf(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function rateOf(arr, predicate) {
    if (!arr.length) return 0;
    return arr.filter(predicate).length / arr.length;
}

/**
 * Build per-minute curve from items.snapshots, optionally with enemy series.
 * Returns { points: [{minute, my, enemy}], hasEnemy }
 */
function buildSeriesCurve(items, mySelector, enemySelector) {
    if (!items.length) return { points: [], hasEnemy: false };

    const myByMin = new Map();
    const enemyByMin = new Map();
    let hasEnemy = false;

    for (const item of items) {
        for (const snap of item.timelineStats.snapshots) {
            const my = mySelector(snap);
            if (my != null) {
                if (!myByMin.has(snap.minute)) myByMin.set(snap.minute, []);
                myByMin.get(snap.minute).push(my);
            }
            const en = enemySelector ? enemySelector(snap) : null;
            if (en != null) {
                hasEnemy = true;
                if (!enemyByMin.has(snap.minute)) enemyByMin.set(snap.minute, []);
                enemyByMin.get(snap.minute).push(en);
            }
        }
    }

    const threshold = Math.max(1, Math.ceil(items.length / 2));
    const minutes = [...myByMin.keys()].sort((a, b) => a - b);
    const points = [];
    for (const m of minutes) {
        const myVals = myByMin.get(m) || [];
        if (myVals.length < threshold) continue;
        const enVals = enemyByMin.get(m) || [];
        points.push({
            minute: m,
            my: avgOf(myVals),
            enemy: enVals.length ? avgOf(enVals) : null,
            n: myVals.length,
        });
    }
    return { points, hasEnemy };
}

/**
 * Aggregate stats for a single (champion, role, outcome) bucket of items.
 * Returns null when bucket is empty.
 */
function aggregateBucket(items) {
    if (!items.length) return null;

    const enriched = items.filter((i) => i.timelineStats);
    const n = items.length;
    const nTl = enriched.length;

    // Final-game scalars from match-v5 participant payload
    const goldEarned     = items.map((i) => i.participant.goldEarned || 0);
    const minions        = items.map((i) => i.participant.totalMinionsKilled || 0);
    const jungleMonsters = items.map((i) => i.participant.neutralMinionsKilled || 0);
    const visionScore    = items.map((i) => i.participant.visionScore || 0);
    const wardsPlaced    = items.map((i) => i.participant.wardsPlaced || 0);
    const wardsKilled    = items.map((i) => i.participant.wardsKilled || 0);
    const controlWards   = items.map((i) => i.participant.detectorWardsPlaced ?? i.participant.visionWardsBoughtInGame ?? 0);
    const turretTakedowns = items.map((i) => i.participant.turretTakedowns ?? i.participant.turretKills ?? 0);
    const turretDmg      = items.map((i) => i.participant.damageDealtToTurrets || 0);
    const dragonKills    = items.map((i) => i.myTeam?.objectives?.dragon?.kills || 0);
    const baronKills     = items.map((i) => i.myTeam?.objectives?.baron?.kills || 0);
    const heraldKills    = items.map((i) => i.myTeam?.objectives?.riftHerald?.kills || 0);
    const platesTimeline = enriched.map((i) => i.timelineStats.platesCount);
    const kp             = items.map((i) => i.participant.challenges?.killParticipation ?? null).filter((v) => v != null);
    const soloKills      = items.map((i) => i.participant.challenges?.soloKills ?? 0);
    const cc             = items.map((i) => i.participant.timeCCingOthers || 0);
    const dmgChamps      = items.map((i) => i.participant.totalDamageDealtToChampions || 0);
    const dmgTaken       = items.map((i) => i.participant.totalDamageTaken || 0);

    // Game-duration averages (from timeline if present, fall back to match-v5)
    const gpm = enriched.length ? avgOf(enriched.map((i) => i.timelineStats.goldPerMin))
        : avgOf(items.map((i) => (i.participant.goldEarned || 0) / Math.max(1, (i.gameDurationSec || 1) / 60)));
    const cspm = enriched.length ? avgOf(enriched.map((i) => i.timelineStats.csPerMin))
        : avgOf(items.map((i) => ((i.participant.totalMinionsKilled || 0) + (i.participant.neutralMinionsKilled || 0)) / Math.max(1, (i.gameDurationSec || 1) / 60)));
    const lcspm = enriched.length ? avgOf(enriched.map((i) => i.timelineStats.laneCsPerMin)) : null;
    const jcspm = enriched.length ? avgOf(enriched.map((i) => i.timelineStats.jungleCsPerMin)) : null;
    const xpm = enriched.length ? avgOf(enriched.map((i) => i.timelineStats.xpPerMin)) : null;

    // Curves (only built if timeline data present)
    const curves = nTl ? {
        gold:        buildSeriesCurve(enriched, (s) => s.totalGold, (s) => s.enemyTotalGold),
        laneCs:      buildSeriesCurve(enriched, (s) => s.laneCs,    (s) => s.enemyLaneCs),
        jungleCs:    buildSeriesCurve(enriched, (s) => s.jungleCs,  (s) => s.enemyJungleCs),
        xp:          buildSeriesCurve(enriched, (s) => s.xp,        (s) => s.enemyXp),
        goldDiff:    buildSeriesCurve(enriched, (s) => s.goldDiff,  null),
    } : null;

    // ── Item frequency ───────────────────────────────────────────────────
    // Final-game build (item0..6 from match-v5)
    const finalItemFreq = new Map();
    for (const item of items) {
        const p = item.participant;
        for (const slot of ['item0', 'item1', 'item2', 'item3', 'item4', 'item5']) {
            const id = p[slot];
            if (id && id > 0) {
                finalItemFreq.set(id, (finalItemFreq.get(id) || 0) + 1);
            }
        }
    }
    const topFinalItems = [...finalItemFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([itemId, count]) => ({ itemId, count, pct: count / n }));

    // Trinket frequency
    const trinketFreq = new Map();
    for (const item of items) {
        const id = item.participant.item6;
        if (id && id > 0) trinketFreq.set(id, (trinketFreq.get(id) || 0) + 1);
    }
    const topTrinket = [...trinketFreq.entries()].sort((a, b) => b[1] - a[1])[0];

    // Item purchase order — average minute of first purchase for each itemId across enriched games.
    const purchaseAggregator = new Map(); // itemId -> { minutes: [], gameCount }
    for (const item of enriched) {
        const seenThisGame = new Set();
        for (const purchase of item.timelineStats.itemPurchases) {
            // Only count first purchase of each item per game (avoid potions/wards spam dominating)
            if (seenThisGame.has(purchase.itemId)) continue;
            seenThisGame.add(purchase.itemId);
            if (!purchaseAggregator.has(purchase.itemId)) {
                purchaseAggregator.set(purchase.itemId, { minutes: [], gameCount: 0 });
            }
            const agg = purchaseAggregator.get(purchase.itemId);
            agg.minutes.push(purchase.minute);
            agg.gameCount += 1;
        }
    }
    // Filter: must appear in >= half of enriched games AND not be a consumable/ward.
    // Simple approach: keep itemIds that also appear in finalItemFreq (i.e. ended in someone's build).
    const buildItemIds = new Set(finalItemFreq.keys());
    const purchaseOrder = [...purchaseAggregator.entries()]
        .filter(([itemId, agg]) => buildItemIds.has(itemId) && agg.gameCount >= Math.max(1, Math.ceil(nTl / 3)))
        .map(([itemId, agg]) => ({
            itemId,
            avgMinute: avgOf(agg.minutes),
            gameCount: agg.gameCount,
        }))
        .sort((a, b) => a.avgMinute - b.avgMinute)
        .slice(0, 10);

    // ── Summoner spells / runes ──────────────────────────────────────────
    const summFreq = new Map();
    for (const item of items) {
        const key = `${item.participant.summoner1Id}_${item.participant.summoner2Id}`;
        summFreq.set(key, (summFreq.get(key) || 0) + 1);
    }
    const [topSumm] = [...summFreq.entries()].sort((a, b) => b[1] - a[1]);
    const topSummPair = topSumm ? topSumm[0].split('_').map(Number) : [null, null];

    const primaryRuneFreq = new Map();   // perks.styles[0].selections[0].perk
    const secondaryStyleFreq = new Map();
    for (const item of items) {
        const styles = item.participant.perks?.styles || [];
        const primary = styles[0];
        const secondary = styles[1];
        const keystone = primary?.selections?.[0]?.perk;
        if (keystone) primaryRuneFreq.set(keystone, (primaryRuneFreq.get(keystone) || 0) + 1);
        if (secondary?.style) secondaryStyleFreq.set(secondary.style, (secondaryStyleFreq.get(secondary.style) || 0) + 1);
    }
    const [topKeystone] = [...primaryRuneFreq.entries()].sort((a, b) => b[1] - a[1]);
    const [topSecondary] = [...secondaryStyleFreq.entries()].sort((a, b) => b[1] - a[1]);

    return {
        n,
        nTl,
        avgGoldPerMin: gpm,
        avgCsPerMin: cspm,
        avgLaneCsPerMin: lcspm,
        avgJungleCsPerMin: jcspm,
        avgXpPerMin: xpm,
        avgGoldEarned: avgOf(goldEarned),
        avgMinions: avgOf(minions),
        avgJungleMonsters: avgOf(jungleMonsters),
        avgVisionScore: avgOf(visionScore),
        avgWardsPlaced: avgOf(wardsPlaced),
        avgWardsKilled: avgOf(wardsKilled),
        avgControlWards: avgOf(controlWards),
        avgTurretTakedowns: avgOf(turretTakedowns),
        avgTurretDmg: avgOf(turretDmg),
        avgPlates: platesTimeline.length ? avgOf(platesTimeline) : null,
        avgDragons: avgOf(dragonKills),
        avgBarons: avgOf(baronKills),
        avgHeralds: avgOf(heraldKills),
        avgKp: kp.length ? avgOf(kp) : null,
        avgSoloKills: avgOf(soloKills),
        avgCcSec: avgOf(cc),
        avgDmgChamps: avgOf(dmgChamps),
        avgDmgTaken: avgOf(dmgTaken),
        firstBloodKillRate:    rateOf(items, (i) => !!i.participant.firstBloodKill),
        firstBloodAssistRate:  rateOf(items, (i) => !!i.participant.firstBloodAssist),
        firstTowerKillRate:    rateOf(items, (i) => !!i.participant.firstTowerKill),
        firstTowerAssistRate:  rateOf(items, (i) => !!i.participant.firstTowerAssist),
        curves,
        topFinalItems,
        topTrinketId: topTrinket ? topTrinket[0] : null,
        topTrinketCount: topTrinket ? topTrinket[1] : 0,
        purchaseOrder,
        topSumm1: topSummPair[0],
        topSumm2: topSummPair[1],
        topSummCount: topSumm ? topSumm[1] : 0,
        topKeystone: topKeystone ? topKeystone[0] : null,
        topKeystoneCount: topKeystone ? topKeystone[1] : 0,
        topSecondaryStyle: topSecondary ? topSecondary[0] : null,
    };
}

/**
 * For each row in `rowOrder`, aggregate timeline + match-v5 stats split by
 * win and loss. Returns Map<`champion|role`, { all, win, loss }>.
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
        if (!items.length) { result.set(key, null); continue; }

        const wins = items.filter((i) => i.participant.win);
        const losses = items.filter((i) => !i.participant.win);

        result.set(key, {
            all: aggregateBucket(items),
            win: aggregateBucket(wins),
            loss: aggregateBucket(losses),
        });
    }
    return result;
}

// ── Insights aggregation ─────────────────────────────────────────────────────

let _runeIconMap = null;
async function getRuneIconMap(ver, logger) {
    if (_runeIconMap) return _runeIconMap;
    try {
        const res = await axios.get(
            `https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/runesReforged.json`,
            { timeout: 5000 }
        );
        const map = new Map();
        for (const style of (res.data || [])) {
            map.set(style.id, {
                iconUrl: `https://ddragon.leagueoflegends.com/cdn/img/${style.icon}`,
                name: style.name,
            });
            for (const slot of (style.slots || [])) {
                for (const rune of (slot.runes || [])) {
                    map.set(rune.id, {
                        iconUrl: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`,
                        name: rune.name,
                    });
                }
            }
        }
        _runeIconMap = map;
        return map;
    } catch (err) {
        logger.error(`[champstats] Rune metadata fetch failed: ${err.message}`);
        return new Map();
    }
}

const GAME_LENGTH_BUCKETS = [
    { label: '< 20 min',  min: 0,  max: 20   },
    { label: '20–25 min', min: 20, max: 25   },
    { label: '25–30 min', min: 25, max: 30   },
    { label: '30–35 min', min: 30, max: 35   },
    { label: '35–40 min', min: 35, max: 40   },
    { label: '40–45 min', min: 40, max: 45   },
    { label: '45+ min',   min: 45, max: Infinity },
];

function buildInsightsData(collected, rowOrder) {
    // Pre-bucket collected items by champion+role key
    const buckets = new Map();
    for (const item of collected) {
        const role = resolveRole(item.participant);
        const key = `${item.participant.championName}|${role}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(item);
    }

    const sortByGames = (arr) => arr.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    const result = new Map();
    for (const row of rowOrder) {
        const key = `${row.champion}|${row.role}`;
        const items = buckets.get(key) || [];
        if (!items.length) { result.set(key, null); continue; }

        // ── Game length WR ────────────────────────────────────────────────
        const byLength = GAME_LENGTH_BUCKETS.map((b) => ({ label: b.label, wins: 0, losses: 0 }));
        for (const m of items) {
            const mins = (m.gameDurationSec || 0) / 60;
            const bi = GAME_LENGTH_BUCKETS.findIndex((b) => mins >= b.min && mins < b.max);
            if (bi >= 0) {
                if (m.participant.win) byLength[bi].wins++;
                else byLength[bi].losses++;
            }
        }

        // ── Rune WR ───────────────────────────────────────────────────────
        const primaryStyleMap = new Map();
        const keystoneMap     = new Map();
        const primaryPerkMap  = new Map();
        const secStyleMap     = new Map();
        const secPerkMap      = new Map();

        for (const m of items) {
            const perks = m.participant.perks;
            if (!perks?.styles) continue;
            const primary = perks.styles.find((s) => s.description === 'primaryStyle');
            const sub     = perks.styles.find((s) => s.description === 'subStyle');

            if (primary) {
                // Primary tree (style)
                const styleId = primary.style;
                if (!primaryStyleMap.has(styleId)) primaryStyleMap.set(styleId, { styleId, wins: 0, losses: 0 });
                const se = primaryStyleMap.get(styleId);
                if (m.participant.win) se.wins++; else se.losses++;

                // Keystone (slot 0)
                if (primary.selections?.[0]) {
                    const id = primary.selections[0].perk;
                    if (!keystoneMap.has(id)) keystoneMap.set(id, { perkId: id, wins: 0, losses: 0 });
                    const e = keystoneMap.get(id);
                    if (m.participant.win) e.wins++; else e.losses++;
                }

                // Non-keystone primary runes (slots 1-3)
                for (const sel of (primary.selections || []).slice(1)) {
                    const pid = sel.perk;
                    if (!primaryPerkMap.has(pid)) primaryPerkMap.set(pid, { perkId: pid, wins: 0, losses: 0 });
                    const pe = primaryPerkMap.get(pid);
                    if (m.participant.win) pe.wins++; else pe.losses++;
                }
            }

            if (sub) {
                const id = sub.style;
                if (!secStyleMap.has(id)) secStyleMap.set(id, { styleId: id, wins: 0, losses: 0 });
                const e = secStyleMap.get(id);
                if (m.participant.win) e.wins++; else e.losses++;

                for (const sel of (sub.selections || [])) {
                    const pid = sel.perk;
                    if (!secPerkMap.has(pid)) secPerkMap.set(pid, { perkId: pid, wins: 0, losses: 0 });
                    const pe = secPerkMap.get(pid);
                    if (m.participant.win) pe.wins++; else pe.losses++;
                }
            }
        }

        // ── Vs / with champion WR ─────────────────────────────────────────
        const vsMap   = new Map();
        const withMap = new Map();

        for (const m of items) {
            const all = m.allParticipants || [];
            const enemies = all.filter((p) => p.teamId !== m.participant.teamId);
            const allies  = all.filter((p) => p.teamId === m.participant.teamId && p.puuid !== m.participant.puuid);

            for (const p of enemies) {
                if (!p.championName) continue;
                if (!vsMap.has(p.championName)) vsMap.set(p.championName, { champion: p.championName, wins: 0, losses: 0 });
                const e = vsMap.get(p.championName);
                if (m.participant.win) e.wins++; else e.losses++;
            }
            for (const p of allies) {
                if (!p.championName) continue;
                if (!withMap.has(p.championName)) withMap.set(p.championName, { champion: p.championName, wins: 0, losses: 0 });
                const e = withMap.get(p.championName);
                if (m.participant.win) e.wins++; else e.losses++;
            }
        }

        result.set(key, {
            n:    items.length,
            wins: items.filter((m) => m.participant.win).length,
            byLength: byLength.filter((b) => b.wins + b.losses > 0),
            primaryStyles: sortByGames([...primaryStyleMap.values()]),
            keystones:     sortByGames([...keystoneMap.values()]),
            primaryPerks:  sortByGames([...primaryPerkMap.values()]),
            secStyles:     sortByGames([...secStyleMap.values()]),
            secPerks:      sortByGames([...secPerkMap.values()]),
            vsChampions:   sortByGames([...vsMap.values()]).slice(0, 15),
            withChampions: sortByGames([...withMap.values()]).slice(0, 15),
        });
    }
    return result;
}

// ── Deep rendering (image) ──────────────────────────────────────────────────

// Mirror of the helpers in events.js so we don't introduce a cross-module dep.
let _ddVersionCache = null;
let _ddVersionFetchedAt = 0;
async function getDeepDDVersion(logger) {
    const now = Date.now();
    if (_ddVersionCache && (now - _ddVersionFetchedAt) < 60 * 60 * 1000) return _ddVersionCache;
    try {
        const res = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json', { timeout: 5000 });
        if (res.data?.[0]) {
            _ddVersionCache = res.data[0];
            _ddVersionFetchedAt = now;
            return _ddVersionCache;
        }
    } catch (err) {
        logger.error(`[champstats] DDragon version fetch failed: ${err.message || err}`);
    }
    return _ddVersionCache || '14.1.1';
}

function fixChampNameForCdn(name) {
    if (!name) return 'Unknown';
    const normalized = String(name).replace(/[\u2018\u2019\u02BC]/g, "'");
    const map = {
        'Wukong': 'MonkeyKing', 'Renata Glasc': 'Renata',
        "Bel'Veth": 'Belveth', "Kog'Maw": 'KogMaw', "Rek'Sai": 'RekSai',
        "Dr. Mundo": 'DrMundo', 'Nunu & Willump': 'Nunu',
        'Fiddlesticks': 'Fiddlesticks', 'LeBlanc': 'Leblanc',
        "Cho'Gath": 'Chogath', "Kai'Sa": 'Kaisa', "Kha'Zix": 'Khazix',
        "Vel'Koz": 'Velkoz',
    };
    return map[normalized] || normalized.replace(/[' .&]/g, '');
}

// Riot summoner-spell ID → DDragon filename (no extension)
const SUMMONER_SPELL_KEYS = {
    1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash', 6: 'SummonerHaste',
    7: 'SummonerHeal', 11: 'SummonerSmite', 12: 'SummonerTeleport', 13: 'SummonerMana',
    14: 'SummonerDot', 21: 'SummonerBarrier', 32: 'SummonerSnowball',
    39: 'SummonerSnowURFSnowball_Mark', 54: 'Summoner_UltBookPlaceholder',
    55: 'Summoner_UltBookSmitePlaceholder',
};

// Common rune perk → image path mapping (subset; extend as needed).
// CommunityDragon serves all perk icons by perk id.
function runeIconUrl(perkId) {
    if (!perkId) return null;
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${perkId}.png`;
}
function runeStyleIconUrl(styleId) {
    if (!styleId) return null;
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${styleId}.png`;
}

// ── SVG chart helpers ───────────────────────────────────────────────────────

const CHART_COLORS = {
    win:       '#0acbe6',
    loss:      '#e84057',
    winEnemy:  '#5ad8ec',
    lossEnemy: '#f08a99',
    grid:      '#1e2328',
    axis:      '#5c5b57',
    text:      '#a09b8c',
    pos:       '#0acbe6',
    neg:       '#e84057',
};

/**
 * Build an inline SVG line chart with up to 4 series:
 *   winMy, winEnemy, lossMy, lossEnemy.
 * Each `series` is the points[] array from buildSeriesCurve, or null.
 */
function svgLineChart({
    width = 480,
    height = 280,
    title = '',
    yLabel = '',
    winMy = null,
    winEnemy = null,
    lossMy = null,
    lossEnemy = null,
}) {
    const padL = 44, padR = 12, padT = 30, padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const allSeries = [winMy, winEnemy, lossMy, lossEnemy].filter(Boolean);
    if (!allSeries.length || allSeries.every((s) => !s.length)) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#0f1216"/>
            <text x="${width / 2}" y="${height / 2}" fill="${CHART_COLORS.axis}" font-size="13" text-anchor="middle">No data — ${escapeXml(title)}</text>
        </svg>`;
    }

    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of allSeries) {
        for (const p of s) {
            if (p.minute < xMin) xMin = p.minute;
            if (p.minute > xMax) xMax = p.minute;
            const v = p.my != null ? p.my : (p.enemy != null ? p.enemy : 0);
            if (v < yMin) yMin = v;
            if (v > yMax) yMax = v;
            if (p.enemy != null) {
                if (p.enemy < yMin) yMin = p.enemy;
                if (p.enemy > yMax) yMax = p.enemy;
            }
        }
    }
    if (xMin === xMax) xMax = xMin + 1;
    if (yMin === yMax) yMax = yMin + 1;
    // Tighten lower bound for non-negative metrics (no point starting at min if all positive)
    if (yMin > 0) yMin = 0;

    const xScale = (m) => padL + ((m - xMin) / (xMax - xMin)) * plotW;
    const yScale = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const linePath = (points, accessor) => {
        const pts = points.filter((p) => accessor(p) != null);
        if (!pts.length) return '';
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.minute).toFixed(1)},${yScale(accessor(p)).toFixed(1)}`).join(' ');
    };

    const drawSeries = (series, accessor, color, dash = false, width_ = 2) => {
        if (!series || !series.length) return '';
        const d = linePath(series, accessor);
        if (!d) return '';
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width_}" ${dash ? 'stroke-dasharray="4,3"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    };

    // Y-axis ticks (3)
    const yTicks = [yMin, (yMin + yMax) / 2, yMax];
    const yTickLines = yTicks.map((v) => {
        const y = yScale(v);
        return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>
                <text x="${padL - 4}" y="${y + 4}" fill="${CHART_COLORS.axis}" font-size="11" text-anchor="end">${formatTickValue(v)}</text>`;
    }).join('');

    // X-axis ticks every 5 minutes within range
    const xTickMins = [];
    const startTick = Math.ceil(xMin / 5) * 5;
    for (let m = startTick; m <= xMax; m += 5) xTickMins.push(m);
    const xTickLines = xTickMins.map((m) => {
        const x = xScale(m);
        return `<line x1="${x}" y1="${padT + plotH}" x2="${x}" y2="${padT + plotH + 3}" stroke="${CHART_COLORS.axis}" stroke-width="1"/>
                <text x="${x}" y="${padT + plotH + 16}" fill="${CHART_COLORS.axis}" font-size="11" text-anchor="middle">${m}</text>`;
    }).join('');

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0f1216"/>
        <text x="${padL}" y="16" fill="${CHART_COLORS.text}" font-size="14" font-weight="700">${escapeXml(title)}</text>
        ${yLabel ? `<text x="${padL}" y="30" fill="${CHART_COLORS.axis}" font-size="11">${escapeXml(yLabel)}</text>` : ''}
        ${yTickLines}
        ${xTickLines}
        ${drawSeries(winEnemy,  (p) => p.my, CHART_COLORS.winEnemy,  true,  1.5)}
        ${drawSeries(lossEnemy, (p) => p.my, CHART_COLORS.lossEnemy, true,  1.5)}
        ${drawSeries(winMy,     (p) => p.my, CHART_COLORS.win,       false, 2.4)}
        ${drawSeries(lossMy,    (p) => p.my, CHART_COLORS.loss,      false, 2.4)}
    </svg>`;
}

/** Signed bar chart (e.g. gold diff), positive = blue, negative = red. */
function svgDiffBarChart({
    width = 480,
    height = 280,
    title = '',
    winSeries = null,
    lossSeries = null,
}) {
    const padL = 44, padR = 12, padT = 30, padB = 26;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const all = [];
    if (winSeries) all.push(...winSeries);
    if (lossSeries) all.push(...lossSeries);
    if (!all.length) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#0f1216"/>
            <text x="${width / 2}" y="${height / 2}" fill="${CHART_COLORS.axis}" font-size="13" text-anchor="middle">No data — ${escapeXml(title)}</text>
        </svg>`;
    }

    let xMin = Math.min(...all.map((p) => p.minute));
    let xMax = Math.max(...all.map((p) => p.minute));
    if (xMin === xMax) xMax = xMin + 1;
    const absMax = Math.max(1, ...all.map((p) => Math.abs(p.my || 0)));
    const yMin = -absMax;
    const yMax = absMax;

    const xScale = (m) => padL + ((m - xMin) / (xMax - xMin)) * plotW;
    const yScale = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const zeroY = yScale(0);

    // Bar width based on minute density
    const barW = Math.max(3, Math.min(14, plotW / Math.max(1, all.length / 2) - 4));

    const drawBars = (series, color, offsetX) => {
        if (!series || !series.length) return '';
        return series.map((p) => {
            const v = p.my || 0;
            const x = xScale(p.minute) - barW / 2 + offsetX;
            const y = v >= 0 ? yScale(v) : zeroY;
            const h = Math.abs(yScale(v) - zeroY);
            return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}" fill="${color}" opacity="0.85"/>`;
        }).join('');
    };

    // X-axis ticks every 5 minutes
    const xTickMins = [];
    const startTick = Math.ceil(xMin / 5) * 5;
    for (let m = startTick; m <= xMax; m += 5) xTickMins.push(m);
    const xTickLines = xTickMins.map((m) => {
        const x = xScale(m);
        return `<text x="${x}" y="${padT + plotH + 16}" fill="${CHART_COLORS.axis}" font-size="11" text-anchor="middle">${m}</text>`;
    }).join('');

    // Y-axis ticks
    const yTicks = [-absMax, 0, absMax];
    const yTickLines = yTicks.map((v) => {
        const y = yScale(v);
        return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${CHART_COLORS.grid}" stroke-width="1"/>
                <text x="${padL - 4}" y="${y + 4}" fill="${CHART_COLORS.axis}" font-size="11" text-anchor="end">${formatTickValue(v)}</text>`;
    }).join('');

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#0f1216"/>
        <text x="${padL}" y="16" fill="${CHART_COLORS.text}" font-size="14" font-weight="700">${escapeXml(title)}</text>
        ${yTickLines}
        ${xTickLines}
        ${drawBars(winSeries,  CHART_COLORS.win,  -barW / 2 - 1)}
        ${drawBars(lossSeries, CHART_COLORS.loss,  barW / 2 + 1)}
        <line x1="${padL}" y1="${zeroY}" x2="${width - padR}" y2="${zeroY}" stroke="${CHART_COLORS.axis}" stroke-width="1"/>
    </svg>`;
}

function formatTickValue(v) {
    const a = Math.abs(v);
    if (a >= 10000) return `${(v / 1000).toFixed(1)}k`;
    if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (a < 1 && a > 0) return v.toFixed(2);
    return Math.round(v).toString();
}

function escapeXml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ── Template data preparation ──────────────────────────────────────────────

/**
 * Build the handlebars context for one (champion, role) bucket.
 */
function buildDeepRenderContext(row, deep, summonerName, ver) {
    const CDN = `https://ddragon.leagueoflegends.com/cdn/${ver}/img`;
    const ITEM_CDN = `${CDN}/item`;
    const SPELL_CDN = `${CDN}/spell`;
    const isJungle = row.role === 'JUNGLE';

    const all = deep?.all;
    const win = deep?.win;
    const loss = deep?.loss;

    const fmtPct = (v) => v == null ? '—' : `${(v * 100).toFixed(0)}%`;
    const fmtNum = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d);
    const fmtInt = (v) => v == null ? '—' : Math.round(v).toLocaleString();

    // KPI tiles — winAvg / lossAvg pairs
    const tile = (label, winVal, lossVal, suffix = '') => ({
        label,
        winVal: winVal == null ? '—' : `${winVal}${suffix}`,
        lossVal: lossVal == null ? '—' : `${lossVal}${suffix}`,
    });

    const kpis = [
        tile('Gold/min',
            win ? fmtNum(win.avgGoldPerMin, 0) : null,
            loss ? fmtNum(loss.avgGoldPerMin, 0) : null),
        tile(isJungle ? 'Jungle CS/min' : 'CS/min',
            win ? fmtNum(isJungle ? win.avgJungleCsPerMin : win.avgCsPerMin, 2) : null,
            loss ? fmtNum(isJungle ? loss.avgJungleCsPerMin : loss.avgCsPerMin, 2) : null),
        tile('XP/min',
            win?.avgXpPerMin != null ? fmtNum(win.avgXpPerMin, 0) : null,
            loss?.avgXpPerMin != null ? fmtNum(loss.avgXpPerMin, 0) : null),
        tile('KP%',
            win?.avgKp != null ? fmtPct(win.avgKp) : null,
            loss?.avgKp != null ? fmtPct(loss.avgKp) : null),
        tile('Solo K',
            win ? fmtNum(win.avgSoloKills, 1) : null,
            loss ? fmtNum(loss.avgSoloKills, 1) : null),
        tile('Plates',
            win?.avgPlates != null ? fmtNum(win.avgPlates, 1) : null,
            loss?.avgPlates != null ? fmtNum(loss.avgPlates, 1) : null),
        tile('Vision',
            win ? fmtNum(win.avgVisionScore, 1) : null,
            loss ? fmtNum(loss.avgVisionScore, 1) : null),
        tile('Wards K/P',
            win ? `${fmtNum(win.avgWardsKilled, 1)}/${fmtNum(win.avgWardsPlaced, 1)}` : null,
            loss ? `${fmtNum(loss.avgWardsKilled, 1)}/${fmtNum(loss.avgWardsPlaced, 1)}` : null),
    ];

    // Charts — win avg + win-enemy avg vs loss avg + loss-enemy avg
    const charts = [];
    if (all?.curves) {
        // Build chart input: helper to pull series from a bucket
        const seriesFrom = (bucket, key) => bucket?.curves?.[key]?.points || null;
        const enemyFrom  = (bucket, key) => {
            const c = bucket?.curves?.[key];
            if (!c || !c.hasEnemy) return null;
            return c.points.map((p) => ({ minute: p.minute, my: p.enemy }));
        };

        charts.push({
            svg: svgLineChart({
                width: 700, height: 280,
                title: 'Gold over time vs enemy laner',
                winMy:     seriesFrom(win, 'gold'),
                winEnemy:  enemyFrom(win, 'gold'),
                lossMy:    seriesFrom(loss, 'gold'),
                lossEnemy: enemyFrom(loss, 'gold'),
            }),
        });
        charts.push({
            svg: svgLineChart({
                width: 700, height: 280,
                title: 'Lane CS (lane minions) vs enemy laner',
                winMy:     seriesFrom(win, 'laneCs'),
                winEnemy:  enemyFrom(win, 'laneCs'),
                lossMy:    seriesFrom(loss, 'laneCs'),
                lossEnemy: enemyFrom(loss, 'laneCs'),
            }),
        });
        charts.push({
            svg: svgLineChart({
                width: 700, height: 280,
                title: 'XP over time vs enemy laner',
                winMy:     seriesFrom(win, 'xp'),
                winEnemy:  enemyFrom(win, 'xp'),
                lossMy:    seriesFrom(loss, 'xp'),
                lossEnemy: enemyFrom(loss, 'xp'),
            }),
        });
        charts.push({
            svg: svgDiffBarChart({
                width: 700, height: 280,
                title: 'Gold diff vs enemy laner (signed)',
                winSeries:  seriesFrom(win, 'goldDiff'),
                lossSeries: seriesFrom(loss, 'goldDiff'),
            }),
        });
        if (isJungle) {
            charts.push({
                svg: svgLineChart({
                    width: 700, height: 280,
                    title: 'Jungle monsters vs enemy jungler',
                    winMy:     seriesFrom(win, 'jungleCs'),
                    winEnemy:  enemyFrom(win, 'jungleCs'),
                    lossMy:    seriesFrom(loss, 'jungleCs'),
                    lossEnemy: enemyFrom(loss, 'jungleCs'),
                }),
            });
        }
    }

    // Final-build items
    const finalBuild = (all?.topFinalItems || []).map((it) => ({
        url: `${ITEM_CDN}/${it.itemId}.png`,
        count: it.count,
        pct: `${Math.round(it.pct * 100)}%`,
    }));
    const trinketUrl = all?.topTrinketId ? `${ITEM_CDN}/${all.topTrinketId}.png` : null;

    // Purchase order items
    const purchaseOrder = (all?.purchaseOrder || []).map((pi) => ({
        url: `${ITEM_CDN}/${pi.itemId}.png`,
        minute: pi.avgMinute.toFixed(1),
        gameCount: pi.gameCount,
    }));

    // Summoner spells
    const summ1Key = SUMMONER_SPELL_KEYS[all?.topSumm1] || null;
    const summ2Key = SUMMONER_SPELL_KEYS[all?.topSumm2] || null;
    const summ1Url = summ1Key ? `${SPELL_CDN}/${summ1Key}.png` : null;
    const summ2Url = summ2Key ? `${SPELL_CDN}/${summ2Key}.png` : null;

    // Runes
    const keystoneUrl = runeIconUrl(all?.topKeystone);
    const secondaryStyleUrl = runeStyleIconUrl(all?.topSecondaryStyle);

    // Header
    const championIcon = `${CDN}/champion/${fixChampNameForCdn(row.champion)}.png`;

    return {
        // Header
        summonerName,
        championIcon,
        championName: row.champion,
        roleLabel: row.roleLabel,
        gamesText: `${row.games} games`,
        wlText: `${row.wins}W-${row.losses}L`,
        wrText: `${row.winRate.toFixed(1)}% WR`,
        kdaText: `${row.kda.toFixed(2)} KDA`,
        kdaSubText: `${(row.kills / Math.max(1, row.games)).toFixed(1)} / ${(row.deaths / Math.max(1, row.games)).toFixed(1)} / ${(row.assists / Math.max(1, row.games)).toFixed(1)} avg`,
        timelineCoverage: all ? `${all.nTl}/${all.n} games with timeline data` : '',

        // KPIs
        kpis,

        // Charts
        charts,

        // Build
        finalBuild,
        trinketUrl,
        finalBuildLabel: trinketUrl
            ? `Most-built items (final inventory across ${all?.n || 0} games)`
            : `Most-built items (final inventory)`,

        // Purchase order
        purchaseOrder,

        // Loadout
        summ1Url, summ2Url,
        summCountText: all?.topSummCount
            ? `${all.topSummCount}/${all.n} games`
            : '',
        keystoneUrl, secondaryStyleUrl,

        // Footer stats
        objectives: {
            dragons: fmtNum(all?.avgDragons, 1),
            barons:  fmtNum(all?.avgBarons,  1),
            heralds: fmtNum(all?.avgHeralds, 1),
            turrets: fmtNum(all?.avgTurretTakedowns, 1),
            turretDmg: fmtInt(all?.avgTurretDmg),
        },
        firstStats: {
            firstBlood: all
                ? `Kill ${fmtPct(all.firstBloodKillRate)} • Assist ${fmtPct(all.firstBloodAssistRate)}`
                : '—',
            firstTower: all
                ? `Kill ${fmtPct(all.firstTowerKillRate)} • Assist ${fmtPct(all.firstTowerAssistRate)}`
                : '—',
        },
        damage: {
            toChamps: fmtInt(all?.avgDmgChamps),
            taken:    fmtInt(all?.avgDmgTaken),
            ccSec:    fmtNum(all?.avgCcSec, 1),
        },
        controlWardsText: all ? `${fmtNum(all.avgControlWards, 1)} avg` : '—',

        // Legend (used by template)
        legend: {
            win: 'Win avg',
            loss: 'Loss avg',
            winEnemy: 'Enemy (in win games)',
            lossEnemy: 'Enemy (in loss games)',
        },

        // For text fallback
        bucketKey: `${row.champion} / ${row.roleLabel}`,
    };
}

let _deepTemplateCache = null;
function loadDeepTemplate() {
    if (_deepTemplateCache) return _deepTemplateCache;
    const templatePath = path.join(__dirname, '..', 'match-template-champstats.html');
    _deepTemplateCache = fs.readFileSync(templatePath, 'utf8');
    return _deepTemplateCache;
}

async function renderDeepImage(row, deep, summonerName, logger) {
    const ver = await getDeepDDVersion(logger);
    const ctx = buildDeepRenderContext(row, deep, summonerName, ver);
    const template = loadDeepTemplate();
    logger.info('[champstats] Rendering deep image', {
        bucket: ctx.bucketKey,
        charts: ctx.charts.length,
        finalBuildItems: ctx.finalBuild.length,
        purchaseOrderItems: ctx.purchaseOrder.length,
    });
    const buffer = await nodeHtmlToImage({
        html: template,
        content: ctx,
        puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        beforeScreenshot: async (page) => {
            await page.setViewport({ width: 1600, height: 800, deviceScaleFactor: 2 });
        },
    });
    return buffer;
}

async function sendDeepResults(channel, summonerName, rows, deepStatsMap, headerDesc, logger) {
    // One champion+role bucket per page, rendered as PNG via HTML→image.
    const totalPages = rows.length;
    if (totalPages === 0) {
        await channel.send('No data to display.');
        return;
    }

    let page = 0;
    const pagerId = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const imageCache = new Map(); // pageIndex -> Buffer

    const getImageForPage = async (p) => {
        if (imageCache.has(p)) return imageCache.get(p);
        const row = rows[p];
        const deep = deepStatsMap.get(`${row.champion}|${row.role}`);
        const buffer = await renderDeepImage(row, deep, summonerName, logger);
        imageCache.set(p, buffer);
        return buffer;
    };

    let initialBuffer;
    try {
        initialBuffer = await getImageForPage(page);
    } catch (err) {
        logger.error('[champstats] Initial deep render failed', { message: err?.message, stack: err?.stack });
        await channel.send(`Failed to render deep image: ${err?.message || 'unknown error'}`);
        return;
    }

    const attach = (buf, p) => new AttachmentBuilder(buf, { name: `champstats-${p + 1}.png` });
    const headerLine = (p) =>
        (p === 0 && headerDesc ? headerDesc + '\n\n' : '') +
        `Deep dive page ${p + 1} / ${totalPages} — ${rows[p].champion} / ${rows[p].roleLabel}`;

    const listMessage = await channel.send({
        content: headerLine(page),
        files: [attach(initialBuffer, page)],
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
        const prevPage = page;
        if (interaction.customId.startsWith('CHAMPSTATS_PREV_')) {
            page = Math.max(0, page - 1);
        } else if (interaction.customId.startsWith('CHAMPSTATS_NEXT_')) {
            page = Math.min(totalPages - 1, page + 1);
        }
        if (page === prevPage) {
            try { await interaction.deferUpdate(); } catch (_) { /* ignore */ }
            return;
        }

        try {
            await interaction.deferUpdate();
            const buf = await getImageForPage(page);
            await interaction.editReply({
                content: headerLine(page),
                files: [attach(buf, page)],
                attachments: [],
                components: buildPageButtons(pagerId, page, totalPages),
            });
        } catch (err) {
            logger.error(`[champstats] Deep pagination update failed: ${err.message || err}`);
            try {
                await interaction.followUp({
                    content: `Failed to render page ${page + 1}: ${err.message || 'unknown error'}`,
                    ephemeral: true,
                });
            } catch (_) { /* ignore */ }
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

// ── Insights rendering (image) ───────────────────────────────────────────────

function wrColor(wins, total) {
    if (total < 3) return '#5c5b57';
    const wr = wins / total;
    if (wr >= 0.6)  return '#0acbe6';
    if (wr >= 0.5)  return '#5ad8ec';
    if (wr >= 0.45) return '#f08a99';
    return '#e84057';
}

async function buildInsightsRenderContext(row, insights, summonerName, ver, logger) {
    const CDN     = `https://ddragon.leagueoflegends.com/cdn/${ver}/img`;
    const runeMap = await getRuneIconMap(ver, logger);

    const fmtWr = (wins, total) =>
        total === 0 ? '—' : `${((wins / total) * 100).toFixed(1)}%`;

    // ── Game length — WR% progress bar ───────────────────────────────────
    const byLength = (insights?.byLength || []).map((b) => {
        const total = b.wins + b.losses;
        const wr    = total > 0 ? b.wins / total : null;
        return {
            label:     b.label,
            wins:      b.wins,
            losses:    b.losses,
            total,
            wr:        fmtWr(b.wins, total),
            wrColor:   wrColor(b.wins, total),
            wrBarPct:  wr != null ? (wr * 100).toFixed(1) : '0',
        };
    });

    // ── Runes — lookup name + icon from data map ──────────────────────────
    const runeRow = (r) => {
        const total = r.wins + r.losses;
        const data  = runeMap.get(r.perkId ?? r.styleId);
        return {
            iconUrl: data?.iconUrl || null,
            name:    data?.name   || '—',
            wins:    r.wins,
            losses:  r.losses,
            wr:      fmtWr(r.wins, total),
            wrColor: wrColor(r.wins, total),
        };
    };

    const primaryStyles = (insights?.primaryStyles || []).map(runeRow);
    const keystones     = (insights?.keystones     || []).map(runeRow);
    const primaryPerks  = (insights?.primaryPerks  || []).map(runeRow);
    const secStyles     = (insights?.secStyles     || []).map(runeRow);
    const allSecPerks   = (insights?.secPerks      || []).map(runeRow);
    // Split secondary runes into two columns if more than 7
    const secPerks1 = allSecPerks.slice(0, 7);
    const secPerks2 = allSecPerks.length > 7 ? allSecPerks.slice(7) : null;

    // ── vs / with champion ────────────────────────────────────────────────
    const champRow = (c) => {
        const total = c.wins + c.losses;
        return {
            iconUrl:  `${CDN}/champion/${fixChampNameForCdn(c.champion)}.png`,
            champion: c.champion,
            wins:     c.wins,
            losses:   c.losses,
            wr:       fmtWr(c.wins, total),
            wrColor:  wrColor(c.wins, total),
        };
    };

    const vsChampions   = (insights?.vsChampions   || []).map(champRow);
    const withChampions = (insights?.withChampions || []).map(champRow);

    const championIcon = `${CDN}/champion/${fixChampNameForCdn(row.champion)}.png`;

    return {
        summonerName,
        championIcon,
        championName: row.champion,
        roleLabel:    row.roleLabel,
        gamesText:    `${row.games} games`,
        wlText:       `${row.wins}W-${row.losses}L`,
        wrText:       `${row.winRate.toFixed(1)}% WR`,
        kdaText:      `${row.kda.toFixed(2)} KDA`,
        kdaSubText:   `${(row.kills   / Math.max(1, row.games)).toFixed(1)} / ${(row.deaths  / Math.max(1, row.games)).toFixed(1)} / ${(row.assists / Math.max(1, row.games)).toFixed(1)} avg`,
        byLength,
        primaryStyles,
        keystones,
        primaryPerks,
        secStyles,
        secPerks1,
        secPerks2,
        hasSecPerks2: secPerks2 !== null,
        vsChampions,
        withChampions,
        bucketKey: `${row.champion} / ${row.roleLabel}`,
    };
}

let _insightsTemplateCache = null;
function loadInsightsTemplate() {
    if (_insightsTemplateCache) return _insightsTemplateCache;
    const p = path.join(__dirname, '..', 'match-template-champstats-insights.html');
    _insightsTemplateCache = fs.readFileSync(p, 'utf8');
    return _insightsTemplateCache;
}

async function renderInsightsImage(row, insights, summonerName, logger) {
    const ver = await getDeepDDVersion(logger);
    const ctx = await buildInsightsRenderContext(row, insights, summonerName, ver, logger);
    const template = loadInsightsTemplate();
    logger.info('[champstats] Rendering insights image', {
        bucket: ctx.bucketKey,
        byLengthBuckets: ctx.byLength.length,
        keystones: ctx.keystones.length,
        vsChampions: ctx.vsChampions.length,
        withChampions: ctx.withChampions.length,
    });
    return nodeHtmlToImage({
        html: template,
        content: ctx,
        puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        beforeScreenshot: async (page) => {
            await page.setViewport({ width: 1600, height: 800, deviceScaleFactor: 2 });
        },
    });
}

async function sendInsightsResults(channel, summonerName, rows, insightsMap, headerDesc, logger) {
    const totalPages = rows.length;
    if (totalPages === 0) {
        await channel.send('No data to display.');
        return;
    }

    let page = 0;
    const pagerId = `INS_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const imageCache = new Map();

    const getImage = async (p) => {
        if (imageCache.has(p)) return imageCache.get(p);
        const r = rows[p];
        const buf = await renderInsightsImage(r, insightsMap.get(`${r.champion}|${r.role}`), summonerName, logger);
        imageCache.set(p, buf);
        return buf;
    };

    let initialBuf;
    try {
        initialBuf = await getImage(page);
    } catch (err) {
        logger.error('[champstats] Initial insights render failed', { message: err?.message, stack: err?.stack });
        await channel.send(`Failed to render insights image: ${err?.message || 'unknown error'}`);
        return;
    }

    const attach  = (buf, p) => new AttachmentBuilder(buf, { name: `champstats-insights-${p + 1}.png` });
    const headerLine = (p) =>
        (p === 0 && headerDesc ? headerDesc + '\n\n' : '') +
        `Insights page ${p + 1} / ${totalPages} — ${rows[p].champion} / ${rows[p].roleLabel}`;

    const msg = await channel.send({
        content: headerLine(page),
        files: [attach(initialBuf, page)],
        components: buildPageButtons(pagerId, page, totalPages),
    });

    if (totalPages <= 1) return;
    if (typeof msg?.createMessageComponentCollector !== 'function') return;

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PAGINATOR_COLLECTOR_TIME_MS,
    });

    collector.on('collect', async (interaction) => {
        if (!interaction.customId.endsWith(pagerId)) return;
        const prev = page;
        if (interaction.customId.startsWith('CHAMPSTATS_PREV_')) page = Math.max(0, page - 1);
        else if (interaction.customId.startsWith('CHAMPSTATS_NEXT_')) page = Math.min(totalPages - 1, page + 1);
        if (page === prev) { try { await interaction.deferUpdate(); } catch (_) {} return; }

        try {
            await interaction.deferUpdate();
            const buf = await getImage(page);
            await interaction.editReply({
                content: headerLine(page),
                files: [attach(buf, page)],
                attachments: [],
                components: buildPageButtons(pagerId, page, totalPages),
            });
        } catch (err) {
            logger.error(`[champstats] Insights pagination failed: ${err.message || err}`);
        }
    });

    collector.on('end', async () => {
        try {
            await msg.edit({
                components: buildPageButtons(pagerId, page, totalPages).map((row) => {
                    const disabled = new ActionRowBuilder();
                    row.components.forEach((c) => disabled.addComponents(ButtonBuilder.from(c).setDisabled(true)));
                    return disabled;
                }),
            });
        } catch (_) {}
    });
}

// ── Role mode (per-role deep dive without rune data) ────────────────────────

/**
 * Aggregate stats grouped strictly by role (one row per role).
 */
function aggregateByRoleOnly(collected) {
    const buckets = new Map();

    for (const item of collected) {
        const p = item.participant;
        const role = resolveRole(p);
        let b = buckets.get(role);
        if (!b) {
            b = {
                role,
                roleLabel: ROLE_LABELS[role] || 'Unknown',
                champion: null,
                games: 0,
                wins: 0,
                losses: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                lastPlayedTs: 0,
            };
            buckets.set(role, b);
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

    rows.sort((a, b) => b.games - a.games);
    return rows;
}

/**
 * For each row in `rowOrder` (one per role), build a combined stats payload
 * that merges deep timeline aggregations with insight-style breakdowns
 * (game length, vs/with champion, played champions).
 */
function buildRoleStatsMap(collected, rowOrder) {
    const buckets = new Map();
    for (const item of collected) {
        const role = resolveRole(item.participant);
        if (!buckets.has(role)) buckets.set(role, []);
        buckets.get(role).push(item);
    }

    const sortByGames = (arr) => arr.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    const result = new Map();
    for (const row of rowOrder) {
        const items = buckets.get(row.role) || [];
        if (!items.length) { result.set(row.role, null); continue; }

        const wins   = items.filter((i) => i.participant.win);
        const losses = items.filter((i) => !i.participant.win);

        // Game length WR
        const byLength = GAME_LENGTH_BUCKETS.map((b) => ({ label: b.label, wins: 0, losses: 0 }));
        for (const m of items) {
            const mins = (m.gameDurationSec || 0) / 60;
            const bi = GAME_LENGTH_BUCKETS.findIndex((b) => mins >= b.min && mins < b.max);
            if (bi >= 0) {
                if (m.participant.win) byLength[bi].wins++;
                else byLength[bi].losses++;
            }
        }

        // Champions played by user in this role
        const playedMap = new Map();
        for (const m of items) {
            const c = m.participant.championName;
            if (!c) continue;
            if (!playedMap.has(c)) playedMap.set(c, { champion: c, wins: 0, losses: 0 });
            const e = playedMap.get(c);
            if (m.participant.win) e.wins++; else e.losses++;
        }

        // vs / with champion
        const vsMap   = new Map();
        const withMap = new Map();
        for (const m of items) {
            const all = m.allParticipants || [];
            const enemies = all.filter((p) => p.teamId !== m.participant.teamId);
            const allies  = all.filter((p) => p.teamId === m.participant.teamId && p.puuid !== m.participant.puuid);

            for (const p of enemies) {
                if (!p.championName) continue;
                if (!vsMap.has(p.championName)) vsMap.set(p.championName, { champion: p.championName, wins: 0, losses: 0 });
                const e = vsMap.get(p.championName);
                if (m.participant.win) e.wins++; else e.losses++;
            }
            for (const p of allies) {
                if (!p.championName) continue;
                if (!withMap.has(p.championName)) withMap.set(p.championName, { champion: p.championName, wins: 0, losses: 0 });
                const e = withMap.get(p.championName);
                if (m.participant.win) e.wins++; else e.losses++;
            }
        }

        result.set(row.role, {
            all:  aggregateBucket(items),
            win:  aggregateBucket(wins),
            loss: aggregateBucket(losses),
            byLength: byLength.filter((b) => b.wins + b.losses > 0),
            playedChampions: sortByGames([...playedMap.values()]).slice(0, 15),
            vsChampions:     sortByGames([...vsMap.values()]).slice(0, 15),
            withChampions:   sortByGames([...withMap.values()]).slice(0, 15),
        });
    }
    return result;
}

function buildRoleRenderContext(row, roleData, summonerName, ver) {
    const CDN = `https://ddragon.leagueoflegends.com/cdn/${ver}/img`;
    const isJungle = row.role === 'JUNGLE';

    const all  = roleData?.all;
    const win  = roleData?.win;
    const loss = roleData?.loss;

    const fmtPct = (v) => v == null ? '—' : `${(v * 100).toFixed(0)}%`;
    const fmtNum = (v, d = 1) => v == null ? '—' : Number(v).toFixed(d);
    const fmtInt = (v) => v == null ? '—' : Math.round(v).toLocaleString();
    const fmtWr  = (w, t) => t === 0 ? '—' : `${((w / t) * 100).toFixed(1)}%`;

    // KPI tiles (Win / Loss pairs)
    const tile = (label, winVal, lossVal, suffix = '') => ({
        label,
        winVal: winVal == null ? '—' : `${winVal}${suffix}`,
        lossVal: lossVal == null ? '—' : `${lossVal}${suffix}`,
    });
    const kpis = [
        tile('Gold/min',
            win ? fmtNum(win.avgGoldPerMin, 0) : null,
            loss ? fmtNum(loss.avgGoldPerMin, 0) : null),
        tile(isJungle ? 'Jungle CS/min' : 'CS/min',
            win ? fmtNum(isJungle ? win.avgJungleCsPerMin : win.avgCsPerMin, 2) : null,
            loss ? fmtNum(isJungle ? loss.avgJungleCsPerMin : loss.avgCsPerMin, 2) : null),
        tile('XP/min',
            win?.avgXpPerMin != null ? fmtNum(win.avgXpPerMin, 0) : null,
            loss?.avgXpPerMin != null ? fmtNum(loss.avgXpPerMin, 0) : null),
        tile('KP%',
            win?.avgKp != null ? fmtPct(win.avgKp) : null,
            loss?.avgKp != null ? fmtPct(loss.avgKp) : null),
        tile('Vision',
            win ? fmtNum(win.avgVisionScore, 1) : null,
            loss ? fmtNum(loss.avgVisionScore, 1) : null),
        tile('Dmg Taken',
            win ? fmtInt(win.avgDmgTaken) : null,
            loss ? fmtInt(loss.avgDmgTaken) : null),
        tile('Dmg Champs',
            win ? fmtInt(win.avgDmgChamps) : null,
            loss ? fmtInt(loss.avgDmgChamps) : null),
        tile('Solo Kills',
            win ? fmtNum(win.avgSoloKills, 1) : null,
            loss ? fmtNum(loss.avgSoloKills, 1) : null),
    ];

    // Charts
    const charts = [];
    if (all?.curves) {
        const seriesFrom = (bucket, key) => bucket?.curves?.[key]?.points || null;
        const enemyFrom  = (bucket, key) => {
            const c = bucket?.curves?.[key];
            if (!c || !c.hasEnemy) return null;
            return c.points.map((p) => ({ minute: p.minute, my: p.enemy }));
        };

        charts.push({ svg: svgLineChart({
            width: 700, height: 280, title: 'Gold over time vs role opponent',
            winMy:     seriesFrom(win,  'gold'),
            winEnemy:  enemyFrom(win,   'gold'),
            lossMy:    seriesFrom(loss, 'gold'),
            lossEnemy: enemyFrom(loss,  'gold'),
        }) });
        charts.push({ svg: svgLineChart({
            width: 700, height: 280,
            title: isJungle ? 'Jungle monsters vs enemy jungler' : 'Lane CS vs role opponent',
            winMy:     seriesFrom(win,  isJungle ? 'jungleCs' : 'laneCs'),
            winEnemy:  enemyFrom(win,   isJungle ? 'jungleCs' : 'laneCs'),
            lossMy:    seriesFrom(loss, isJungle ? 'jungleCs' : 'laneCs'),
            lossEnemy: enemyFrom(loss,  isJungle ? 'jungleCs' : 'laneCs'),
        }) });
        charts.push({ svg: svgLineChart({
            width: 700, height: 280, title: 'XP over time vs role opponent',
            winMy:     seriesFrom(win,  'xp'),
            winEnemy:  enemyFrom(win,   'xp'),
            lossMy:    seriesFrom(loss, 'xp'),
            lossEnemy: enemyFrom(loss,  'xp'),
        }) });
        charts.push({ svg: svgDiffBarChart({
            width: 700, height: 280, title: 'Gold diff vs role opponent (signed)',
            winSeries:  seriesFrom(win,  'goldDiff'),
            lossSeries: seriesFrom(loss, 'goldDiff'),
        }) });
    }

    // Game length WR bars
    const byLength = (roleData?.byLength || []).map((b) => {
        const total = b.wins + b.losses;
        const wr    = total > 0 ? b.wins / total : null;
        return {
            label:    b.label,
            wins:     b.wins,
            losses:   b.losses,
            wr:       fmtWr(b.wins, total),
            wrColor:  wrColor(b.wins, total),
            wrBarPct: wr != null ? (wr * 100).toFixed(1) : '0',
        };
    });

    // Champion tables
    const champRow = (c) => {
        const total = c.wins + c.losses;
        return {
            iconUrl:  `${CDN}/champion/${fixChampNameForCdn(c.champion)}.png`,
            champion: c.champion,
            wins:     c.wins,
            losses:   c.losses,
            wr:       fmtWr(c.wins, total),
            wrColor:  wrColor(c.wins, total),
        };
    };
    const playedChampions = (roleData?.playedChampions || []).map(champRow);
    const vsChampions     = (roleData?.vsChampions     || []).map(champRow);
    const withChampions   = (roleData?.withChampions   || []).map(champRow);

    return {
        summonerName,
        roleLabel: row.roleLabel,
        roleIconUrl: ROLE_ICON_URLS[row.role] || null,
        gamesText: `${row.games} games`,
        wlText:    `${row.wins}W-${row.losses}L`,
        wrText:    `${row.winRate.toFixed(1)}% WR`,
        kdaText:   `${row.kda.toFixed(2)} KDA`,
        kdaSubText: `${(row.kills / Math.max(1, row.games)).toFixed(1)} / ${(row.deaths / Math.max(1, row.games)).toFixed(1)} / ${(row.assists / Math.max(1, row.games)).toFixed(1)} avg`,
        timelineCoverage: all ? `${all.nTl}/${all.n} games with timeline data` : '',
        kpis,
        charts,
        byLength,
        playedChampions,
        vsChampions,
        withChampions,
        objectives: {
            dragons:   fmtNum(all?.avgDragons, 1),
            barons:    fmtNum(all?.avgBarons,  1),
            heralds:   fmtNum(all?.avgHeralds, 1),
            turrets:   fmtNum(all?.avgTurretTakedowns, 1),
            turretDmg: fmtInt(all?.avgTurretDmg),
        },
        firstStats: {
            firstBlood: all
                ? `Kill ${fmtPct(all.firstBloodKillRate)} • Assist ${fmtPct(all.firstBloodAssistRate)}`
                : '—',
            firstTower: all
                ? `Kill ${fmtPct(all.firstTowerKillRate)} • Assist ${fmtPct(all.firstTowerAssistRate)}`
                : '—',
        },
        damage: {
            toChamps: fmtInt(all?.avgDmgChamps),
            taken:    fmtInt(all?.avgDmgTaken),
            ccSec:    fmtNum(all?.avgCcSec, 1),
        },
        vision: {
            score:        all ? fmtNum(all.avgVisionScore, 1) : '—',
            wardsPlaced:  all ? fmtNum(all.avgWardsPlaced,  1) : '—',
            wardsKilled:  all ? fmtNum(all.avgWardsKilled,  1) : '—',
            controlWards: all ? fmtNum(all.avgControlWards, 1) : '—',
        },
        controlWardsText: all ? `${fmtNum(all.avgControlWards, 1)} avg` : '—',
        chartLegend: [
            { color: '#0acbe6', label: 'You (win games)',  dashed: false },
            { color: '#5ad8ec', label: 'Opponent (win games)',  dashed: true  },
            { color: '#e84057', label: 'You (loss games)', dashed: false },
            { color: '#f08a99', label: 'Opponent (loss games)', dashed: true  },
        ],
        legend: {
            win: 'Win avg',
            loss: 'Loss avg',
            winEnemy: 'Enemy (in win games)',
            lossEnemy: 'Enemy (in loss games)',
        },
        bucketKey: row.roleLabel,
    };
}

let _roleTemplateCache = null;
function loadRoleTemplate() {
    if (_roleTemplateCache) return _roleTemplateCache;
    const templatePath = path.join(__dirname, '..', 'match-template-champstats-role.html');
    _roleTemplateCache = fs.readFileSync(templatePath, 'utf8');
    return _roleTemplateCache;
}

async function renderRoleImage(row, roleData, summonerName, logger) {
    const ver = await getDeepDDVersion(logger);
    const ctx = buildRoleRenderContext(row, roleData, summonerName, ver);
    const template = loadRoleTemplate();
    logger.info('[champstats] Rendering role image', {
        bucket: ctx.bucketKey,
        charts: ctx.charts.length,
        playedChampions: ctx.playedChampions.length,
    });
    const buffer = await nodeHtmlToImage({
        html: template,
        content: ctx,
        puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        beforeScreenshot: async (page) => {
            // 3x DPR + smaller logical viewport => Discord receives a much
            // sharper image while in-template font sizes are bumped for legibility.
            await page.setViewport({ width: 1400, height: 800, deviceScaleFactor: 3 });
        },
    });
    return buffer;
}

async function sendRoleResults(channel, summonerName, rows, roleStatsMap, headerDesc, logger) {
    const totalPages = rows.length;
    if (totalPages === 0) {
        await channel.send('No data to display.');
        return;
    }

    let page = 0;
    const pagerId = `ROLE_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const imageCache = new Map();

    const getImage = async (p) => {
        if (imageCache.has(p)) return imageCache.get(p);
        const r = rows[p];
        const buf = await renderRoleImage(r, roleStatsMap.get(r.role), summonerName, logger);
        imageCache.set(p, buf);
        return buf;
    };

    let initialBuf;
    try {
        initialBuf = await getImage(page);
    } catch (err) {
        logger.error('[champstats] Initial role render failed', { message: err?.message, stack: err?.stack });
        await channel.send(`Failed to render role image: ${err?.message || 'unknown error'}`);
        return;
    }

    const attach = (buf, p) => new AttachmentBuilder(buf, { name: `champstats-role-${p + 1}.png` });
    const headerLine = (p) =>
        (p === 0 && headerDesc ? headerDesc + '\n\n' : '') +
        `Role page ${p + 1} / ${totalPages} — ${rows[p].roleLabel}`;

    const msg = await channel.send({
        content: headerLine(page),
        files: [attach(initialBuf, page)],
        components: buildPageButtons(pagerId, page, totalPages),
    });

    if (totalPages <= 1) return;
    if (typeof msg?.createMessageComponentCollector !== 'function') return;

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PAGINATOR_COLLECTOR_TIME_MS,
    });

    collector.on('collect', async (interaction) => {
        if (!interaction.customId.endsWith(pagerId)) return;
        const prev = page;
        if (interaction.customId.startsWith('CHAMPSTATS_PREV_')) page = Math.max(0, page - 1);
        else if (interaction.customId.startsWith('CHAMPSTATS_NEXT_')) page = Math.min(totalPages - 1, page + 1);
        if (page === prev) { try { await interaction.deferUpdate(); } catch (_) {} return; }

        try {
            await interaction.deferUpdate();
            const buf = await getImage(page);
            await interaction.editReply({
                content: headerLine(page),
                files: [attach(buf, page)],
                attachments: [],
                components: buildPageButtons(pagerId, page, totalPages),
            });
        } catch (err) {
            logger.error(`[champstats] Role pagination failed: ${err.message || err}`);
        }
    });

    collector.on('end', async () => {
        try {
            await msg.edit({
                components: buildPageButtons(pagerId, page, totalPages).map((row) => {
                    const disabled = new ActionRowBuilder();
                    row.components.forEach((c) => disabled.addComponents(ButtonBuilder.from(c).setDisabled(true)));
                    return disabled;
                }),
            });
        } catch (_) {}
    });
}

// ── Command ─────────────────────────────────────────────────────────────────
module.exports = {
    name: 'champstats',
    description: 'Per-champion stats (Draft/Solo/Flex only) — games, W-L, WR%, KDA, last played, split by role.',
    syntax: 'champstats [riot_id] [game_count] [role] [display: codeblock|embed|deep|insights|role]',
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
            description: 'Display mode: codeblock (default), embed, deep (timeline analysis), insights (WR breakdowns), or role (per-role deep dive)',
            type: 'STRING',
            required: false,
            choices: [
                { name: 'codeblock', value: 'codeblock' },
                { name: 'embed',    value: 'embed'    },
                { name: 'deep',     value: 'deep'     },
                { name: 'insights', value: 'insights' },
                { name: 'role',     value: 'role'     },
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

        // Parse trailing optional display mode ("codeblock" | "embed" | "deep" | "insights").
        let displayMode = 'codeblock';
        if (args.length > 0) {
            const tail = String(args[args.length - 1]).toLowerCase();
            if (tail === 'embed' || tail === 'codeblock' || tail === 'deep' || tail === 'insights' || tail === 'role') {
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
        if (displayMode === 'insights') {
            rows.sort((a, b) => b.games - a.games);
            const insightsMap = buildInsightsData(collected, rows);
            this.logger.info('[champstats] Insights map built', {
                buckets: insightsMap.size,
                withData: [...insightsMap.values()].filter(Boolean).length,
            });

            try {
                await sendInsightsResults(target, summonerName, rows, insightsMap, headerDesc, this.logger);
            } catch (err) {
                this.logger.error('[champstats] Failed to send insights results', { message: err?.message });
                await target.send(`Error rendering insights: ${err?.message || 'unknown error'}`);
            }
        } else if (displayMode === 'role') {
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

            // Re-aggregate per role only (rows variable from per-champion is replaced).
            let roleRows = aggregateByRoleOnly(collected);
            if (roleFilter) {
                roleRows = roleRows.filter((r) => r.role === roleFilter);
            }
            if (!roleRows.length) {
                await target.send('No data to display for role view.');
                return;
            }
            const roleStatsMap = buildRoleStatsMap(collected, roleRows);
            this.logger.info('[champstats] Role stats map built', {
                roles: roleStatsMap.size,
                withData: [...roleStatsMap.values()].filter(Boolean).length,
            });

            try {
                await sendRoleResults(target, summonerName, roleRows, roleStatsMap, headerDesc, this.logger);
            } catch (err) {
                this.logger.error('[champstats] Failed to send role results', { message: err?.message });
                await target.send(`Error rendering role results: ${err?.message || 'unknown error'}`);
            }
        } else if (displayMode === 'deep') {
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

            rows.sort((a, b) => b.games - a.games);
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
