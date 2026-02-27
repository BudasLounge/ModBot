const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();
const ApiClient = require("../../../core/js/APIClient.js");

const api = new ApiClient();
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const MATCH_BASE = 'https://americas.api.riotgames.com/lol/match/v5/matches';
const ACCOUNT_BASE = 'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id';
const RIOT_SHORT_LIMIT = 500;
const RIOT_SHORT_WINDOW_MS = 10 * 1000;
const RIOT_LONG_LIMIT = 30000;
const RIOT_LONG_WINDOW_MS = 10 * 60 * 1000;

if (!RIOT_API_KEY) {
  // Fail early in prod rather than silently returning empty data.
  // This mirrors typical “production hardening” behavior.
  throw new Error('RIOT_API_KEY is missing from environment');
}

const http = axios.create({
  headers: { "X-Riot-Token": RIOT_API_KEY },
  timeout: 25_000
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
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

    logger.info('[wins2] Proactive Riot rate-limit pause', {
      context,
      waitMs,
      shortWindowCount: riotShortWindowRequests.length,
      longWindowCount: riotLongWindowRequests.length
    });

    await sleep(waitMs);
  }
}

/* -------------------- TUNABLES (PROD KEY FRIENDLY) -------------------- */

/**
 * Riot Match-V5 IDs endpoint pages in chunks up to 100.
 * Keep this at 100 for fewer round-trips.
 */
const IDS_PAGE_SIZE = 100;

/**
 * Concurrency for fetching match details. Production keys can handle more,
 * but keep this moderate to avoid burst 429s across shared infrastructure.
 */
const MATCH_FETCH_CONCURRENCY = 16;

/**
 * Hard cap on total IDs scanned in a single command to prevent pathological runs.
 * gameCount is capped at 1000; scanning a few thousand IDs is acceptable with prod keys.
 */
const MAX_IDS_SCANNED = 4000;

/**
 * Minimum IDs to scan even for small requests. Helps with event queues that are “late” in the ID stream.
 */
const MIN_IDS_SCANNED = 200;

/**
 * Adaptive time window: we fetch until we are confident we have scanned beyond this lookback
 * from the newest observed gameEndTimestamp.
 *
 * Without a queue filter, keep it smaller; with a queue filter, enlarge it because users are
 * explicitly targeting a specific subset that might be sparse.
 */
const LOOKBACK_DAYS_DEFAULT = 10;
const LOOKBACK_DAYS_WITH_FILTER = 30;

/* -------------------- QUEUE METADATA -------------------- */

let QUEUE_MAP = null;

async function loadQueueMap(logger) {
  if (QUEUE_MAP) return QUEUE_MAP;

  logger.info('[wins2] Loading queue mapping from Riot');
  const res = await axios.get(
    'https://static.developer.riotgames.com/docs/lol/queues.json',
    { timeout: 25_000 }
  );

  QUEUE_MAP = res.data.reduce((acc, q) => {
    acc[q.queueId] = q.description?.replace(' games', '') ?? null;
    return acc;
  }, {});

  logger.info(`[wins2] Loaded ${Object.keys(QUEUE_MAP).length} queue mappings`);
  return QUEUE_MAP;
}

/**
 * Dynamic queue resolver with logging.
 * Does NOT hard-code modes.
 */
function resolveQueueName(info, queueMap, logger) {
  const parts = [];

  if (queueMap[info.queueId]) {
    parts.push(queueMap[info.queueId]);
  } else if (info.gameMode) {
    parts.push(info.gameMode);
  }

  // Preserve raw gameName for diagnostics (ARAM Mayhem often only appears here)
  if (info.gameName) {
    const cleaned = info.gameName.trim();
    if (!parts.some(p => cleaned.toLowerCase().includes(p.toLowerCase()))) {
      parts.push(cleaned);
    }
  }

  const resolved = parts.join(': ').replace(/\s+/g, ' ').trim();

  logger.info('[wins2] Queue resolution', {
    matchId: info.gameId,
    queueId: info.queueId,
    gameMode: info.gameMode,
    gameType: info.gameType,
    gameName: info.gameName,
    resolvedQueue: resolved
  });

  return resolved;
}

/* -------------------- PUUID -------------------- */

async function getPuuidFromDatabase(userId, logger) {
  const res = await api.get('league_player', { user_id: userId });

  if (!res || !Array.isArray(res.league_players) || res.league_players.length === 0) {
    logger.info(`[wins2] No PUUID in DB for user ${userId}`);
    return null;
  }

  const puuid = res.league_players[0].puuid;
  if (!puuid || puuid === 'none') {
    logger.info(`[wins2] Invalid PUUID stored for user ${userId}`);
    return null;
  }

  logger.info(`[wins2] Found PUUID in DB for user ${userId}`);
  return puuid;
}

async function storePuuidInDatabase(userId, puuid, logger) {
  await api.put('league_player', { user_id: userId, puuid });
  logger.info(`[wins2] Stored PUUID for user ${userId}`);
}

async function resolvePuuid(username, logger) {
  const idx = username.lastIndexOf('#');
  if (idx === -1) {
    throw new Error('Riot ID must be in Name#TAG format');
  }

  const gameName = username.slice(0, idx);
  const tag = username.slice(idx + 1);

  logger.info(`[wins2] Resolving PUUID via Account-V1 for ${gameName}#${tag}`);

  await acquireRiotRequestSlot(logger, 'account-by-riot-id');
  const res = await http.get(
    `${ACCOUNT_BASE}/${encodeURIComponent(gameName)}/${encodeURIComponent(tag)}`
  );

  return res.data.puuid;
}

/* -------------------- MATCH FETCHING -------------------- */

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
      logger.warn(`[wins2] Rate limited on /ids. Retrying in ${wait}ms`);
      await sleep(wait);
      return fetchMatchIdsPage(puuid, start, count, logger);
    }
    logger.error('[wins2] Failed to fetch match IDs page', {
      start, count, status: err.response?.status, message: err.message
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
      logger.warn(`[wins2] Rate limited. Retrying match ${matchId} in ${wait}ms`);
      await sleep(wait);
      return fetchMatch(matchId, logger);
    }
    logger.error(`[wins2] Failed to fetch match ${matchId}`, {
      status: err.response?.status,
      message: err.message
    });
    return null;
  }
}

/**
 * Concurrency-limited mapper.
 */
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

/* -------------------- CORE LOGIC -------------------- */

/**
 * Strategy:
 * 1) Stream match IDs in pages.
 * 2) Fetch match details with bounded concurrency.
 * 3) Track newest timestamp seen; stop once:
 *    - we have scanned a minimum floor of IDs (MIN_IDS_SCANNED),
 *    - AND either we have enough matches to satisfy the request after filtering,
 *      OR we've scanned beyond the configured lookback window (time certainty),
 *    - OR we hit MAX_IDS_SCANNED / exhaustion.
 * 4) Sort by gameEndTimestamp desc, then filter + take gameCount.
 *
 * This avoids “massive” unbounded hunts while being correct under Riot’s event-queue quirks.
 */
async function getLastMatches(username, gameCount, queueFilter, logger, userId) {
  const queueMap = await loadQueueMap(logger);

  let puuid = null;
  const isRiotIdQuery = username.includes('#');

  if (isRiotIdQuery) {
    // RULE 1: Full Riot ID → never touch DB
    logger.info(`[wins2] Riot ID provided (${username}); resolving PUUID via API only`);
    puuid = await resolvePuuid(username, logger);
  } else {
    // RULE 2: No Riot ID → use invoking user's stored PUUID
    logger.info(`[wins2] No Riot ID provided; resolving PUUID from DB for user ${userId}`);
    puuid = await getPuuidFromDatabase(userId, logger);

    if (!puuid) {
      throw new Error(
        'No Riot ID provided and no PUUID found for your account. ' +
        'Please link your League account or use Name#TAG.'
      );
    }
  }

  const lookbackDays = queueFilter ? LOOKBACK_DAYS_WITH_FILTER : LOOKBACK_DAYS_DEFAULT;
  const lookbackMs = lookbackDays * 24 * 60 * 60 * 1000;

  const targetIdsToScan = Math.min(
    MAX_IDS_SCANNED,
    Math.max(MIN_IDS_SCANNED, gameCount * 10) // adaptive without being unbounded
  );

  logger.info('[wins2] Fetch plan', {
    requestedGames: gameCount,
    queueFilter: queueFilter ?? null,
    lookbackDays,
    minIds: MIN_IDS_SCANNED,
    targetIdsToScan,
    maxIds: MAX_IDS_SCANNED,
    concurrency: MATCH_FETCH_CONCURRENCY
  });

  const collected = []; // store enriched matches for later sort + filter
  const seenMatchIds = new Set();

  let start = 0;
  let idsScanned = 0;
  let newestTs = null;
  let oldestTs = null;

  // Helper: do we have “enough” already if we apply filter later?
  // Since queue resolution is somewhat expensive (logging), we only do “cheap” filter checks here.
  // We still sort + finalize after the loop.
  function enoughCollectedForRequest() {
    if (!queueFilter) return collected.length >= gameCount;
    // With filter: require a bit of headroom because queue strings may vary;
    // still bounded by time window / ID caps.
    return collected.length >= Math.min(gameCount * 2, gameCount + 25);
  }

  while (idsScanned < targetIdsToScan) {
    const remaining = targetIdsToScan - idsScanned;
    const pageCount = Math.min(IDS_PAGE_SIZE, remaining);

    const pageIds = await fetchMatchIdsPage(puuid, start, pageCount, logger);
    if (!pageIds.length) break;

    // Dedup defensively in case Riot returns repeats (rare but has happened around outages).
    const uniquePageIds = pageIds.filter(id => {
      if (seenMatchIds.has(id)) return false;
      seenMatchIds.add(id);
      return true;
    });

    start += pageIds.length;
    idsScanned += pageIds.length;

    logger.info('[wins2] Scanned match IDs', {
      scanned: idsScanned,
      target: targetIdsToScan,
      pageReturned: pageIds.length,
      pageUnique: uniquePageIds.length
    });

    // Fetch match details for this page with bounded concurrency.
    const pageMatches = await mapWithConcurrency(
      uniquePageIds,
      MATCH_FETCH_CONCURRENCY,
      async (id) => fetchMatch(id, logger)
    );

    const validPageMatches = pageMatches.filter(Boolean);

    for (const match of validPageMatches) {
      const info = match?.info;
      if (!info?.participants?.length) continue;

      const participant = info.participants.find(p => p.puuid === puuid);
      if (!participant) continue;

      const ts = info.gameEndTimestamp ?? info.gameCreation;
      if (typeof ts !== 'number') continue;

      if (newestTs === null || ts > newestTs) newestTs = ts;
      if (oldestTs === null || ts < oldestTs) oldestTs = ts;

      collected.push({
        matchId: info.gameId,
        ts,
        info,
        participant
      });
    }

    // Stop conditions:
    // 1) If we have a newest timestamp and we've covered the lookback window (time certainty),
    //    AND we’ve scanned at least MIN_IDS_SCANNED, we can stop early.
    const timeCertain =
      newestTs !== null &&
      oldestTs !== null &&
      (newestTs - oldestTs) >= lookbackMs;

    const minSatisfied = idsScanned >= MIN_IDS_SCANNED;

    if (minSatisfied && (timeCertain || enoughCollectedForRequest())) {
      logger.info('[wins2] Stop condition met', {
        minSatisfied,
        timeCertain,
        enoughCollected: enoughCollectedForRequest(),
        idsScanned,
        collected: collected.length,
        newest: newestTs ? new Date(newestTs).toISOString() : null,
        oldest: oldestTs ? new Date(oldestTs).toISOString() : null
      });
      break;
    }

    // Optional: small breather every 500 ID scans to reduce burstiness.
    if (idsScanned > 0 && idsScanned % 500 === 0) {
      logger.info('[wins2] Rate safety pause (2s)');
      await sleep(2_000);
    }
  }

  if (collected.length) {
    // Log overall observed range (this is *observed* in fetched matches, not “truth”).
    const sortedByTs = [...collected].sort((a, b) => b.ts - a.ts);
    logger.info('[wins2] Observed match date range', {
      newest: new Date(sortedByTs[0].ts).toISOString(),
      oldest: new Date(sortedByTs.at(-1).ts).toISOString(),
      totalFetchedMatches: collected.length,
      idsScanned
    });
  } else {
    logger.info('[wins2] No matches collected after scanning IDs', { idsScanned });
    return [];
  }

  // Finalize: sort by timestamp desc, compute queue names (with logging), apply queueFilter, take gameCount.
  collected.sort((a, b) => b.ts - a.ts);

  const results = [];
  for (const item of collected) {
    const queueName = resolveQueueName(item.info, queueMap, logger);

    if (
      queueFilter &&
      !queueName.toLowerCase().includes(queueFilter.toLowerCase())
    ) {
      continue;
    }

    results.push({
      champion: item.participant.championName,
      win: item.participant.win,
      queueType: queueName
    });

    if (results.length >= gameCount) break;
  }

  // If filtered results are still empty but we clearly scanned a reasonable window,
  // emit an info log to help diagnose “filter too strict” vs “Riot not surfacing queue yet”.
  if (!results.length && queueFilter) {
    logger.info('[wins2] No matches matched queueFilter after scan', {
      queueFilter,
      idsScanned,
      collected: collected.length,
      lookbackDays
    });
  }

  return results;
}

/* -------------------- EMBEDS -------------------- */

async function sendChampionEmbeds(channel, queueType, data) {
  let embed = new EmbedBuilder()
    .setTitle(`${data.games} games in ${queueType}`)
    .setColor('#0099ff')
    .setTimestamp();

  let fieldCount = 0;

  for (const [champ, record] of Object.entries(data.champions)) {
    if (fieldCount === 25) {
      await channel.send({ embeds: [embed] });
      embed = new EmbedBuilder()
        .setTitle(`Continued: ${queueType}`)
        .setColor('#0099ff')
        .setTimestamp();
      fieldCount = 0;
    }

    embed.addFields({
      name: champ,
      value: `Wins: ${record.wins} | Losses: ${record.losses}`,
      inline: true
    });

    fieldCount++;
  }

  await channel.send({ embeds: [embed] });
}

/* -------------------- COMMAND -------------------- */

module.exports = {
  name: 'wins2',
  description: 'Shows last games in your match history',
  syntax: 'wins2 [summoner name] [number of games up to 1000](optional)',
  num_args: 1,
  args_to_lower: true,
  needs_api: true,
  has_state: false,
  options: [
    { name: 'summoner_name', description: 'Summoner name',                             type: 'STRING',  required: true  },
    { name: 'game_count',   description: 'Number of games to look back (up to 1000)', type: 'INTEGER', required: false },
  ],
  async execute(message, args) {
    args.shift();

    // Help subcommand
    if (args[0]?.toLowerCase() === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('wins2 Command Help')
        .setDescription(
`**Usage**
\`wins2 <riotId> [queue] [count]\`

**Examples**
\`wins2 bigbuda#buda\`
\`wins2 bigbuda#buda 50\`
\`wins2 bigbuda#buda aram 25\`
\`wins2 bigbuda#buda mayhem\`

**Notes**
• Queue filters are partial and case-insensitive  
• Always pulls most recent matches  
• Supports all Riot modes dynamically`
        )
        .setColor('#0099ff');

      return message.channel.send({ embeds: [embed] });
    }

    let gameCount = 25;
    if (!isNaN(args.at(-1))) {
      gameCount = Math.min(1000, Number(args.pop()));
    }

    const queueFilter = args.length > 1 ? args.pop() : null;
    const summonerName = args.join(' ');

    const thread = await message.startThread({
      name: `Wins: ${summonerName}`,
      autoArchiveDuration: 60
    });

    await thread.send(`Fetching recent matches for ${summonerName}…`);

    let matches;
    try {
      matches = await getLastMatches(
        summonerName,
        gameCount,
        queueFilter,
        this.logger,
        message.author.id
      );
    } catch (err) {
      this.logger.error('[wins2] Command failed', { message: err?.message });
      return thread.send(`Error: ${err?.message ?? 'Unknown error'}`);
    }

    if (!matches.length) {
      return thread.send(
        queueFilter
          ? `No recent matches found for queue filter "${queueFilter}".`
          : 'No recent matches found.'
      );
    }

    const queueStats = matches.reduce((acc, m) => {
      acc[m.queueType] ??= {
        games: 0,
        wins: 0,
        losses: 0,
        champions: {}
      };

      acc[m.queueType].games++;
      acc[m.queueType][m.win ? 'wins' : 'losses']++;

      acc[m.queueType].champions[m.champion] ??= { wins: 0, losses: 0 };
      acc[m.queueType].champions[m.champion][m.win ? 'wins' : 'losses']++;

      return acc;
    }, {});

    for (const [queue, data] of Object.entries(queueStats)) {
      const winrate = ((data.wins / data.games) * 100).toFixed(2);

      const summary = new EmbedBuilder()
        .setTitle(queue)
        .setDescription(
`Games: ${data.games}
Wins: ${data.wins}
Losses: ${data.losses}
Winrate: ${winrate}%`
        )
        .setColor('#0099ff')
        .setTimestamp();

      await thread.send({ embeds: [summary] });
      await sendChampionEmbeds(thread, queue, data);
    }
  }
};
