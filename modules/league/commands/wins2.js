const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();
const ApiClient = require("../../../core/js/APIClient.js");

const api = new ApiClient();
const RIOT_API_KEY = process.env.RIOT_API_KEY;

const MATCH_BASE = 'https://americas.api.riotgames.com/lol/match/v5/matches';
const ACCOUNT_BASE = 'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id';

const http = axios.create({
  headers: { "X-Riot-Token": RIOT_API_KEY }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------------------- QUEUE METADATA -------------------- */

let QUEUE_MAP = null;

async function loadQueueMap(logger) {
  if (QUEUE_MAP) return QUEUE_MAP;

  logger.info('[wins2] Loading queue mapping from Riot');
  const res = await axios.get(
    'https://static.developer.riotgames.com/docs/lol/queues.json'
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

  if (
    !res ||
    !Array.isArray(res.league_players) ||
    res.league_players.length === 0
  ) {
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

  const res = await http.get(
    `${ACCOUNT_BASE}/${encodeURIComponent(gameName)}/${encodeURIComponent(tag)}`
  );

  return res.data.puuid;
}

/* -------------------- MATCH FETCHING -------------------- */

async function fetchMatchIds(puuid, maxGames, logger) {
  let start = 0;
  const ids = [];

  while (ids.length < maxGames) {
    const count = Math.min(100, maxGames - ids.length);

    const res = await http.get(
      `${MATCH_BASE}/by-puuid/${puuid}/ids`,
      { params: { start, count } }
    );

    if (!res.data.length) break;

    ids.push(...res.data);
    start += res.data.length;

    logger.info(`[wins2] Fetched ${ids.length}/${maxGames} match IDs`);

    if (ids.length % 500 === 0) {
      logger.info('[wins2] Rate safety pause (10s)');
      await sleep(10_000);
    }
  }

  return ids;
}

async function fetchMatch(matchId, logger) {
  try {
    return (await http.get(`${MATCH_BASE}/${matchId}`)).data;
  } catch (err) {
    if (err.response?.status === 429) {
      const wait = Number(err.response.headers['retry-after'] ?? 1) * 1000;
      logger.warn(`[wins2] Rate limited. Retrying match ${matchId} in ${wait}ms`);
      await sleep(wait);
      return fetchMatch(matchId, logger);
    }
    logger.error(`[wins2] Failed to fetch match ${matchId}`, err);
    return null;
  }
}

/* -------------------- CORE LOGIC -------------------- */

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

  const matchIds = await fetchMatchIds(puuid, gameCount * 2, logger);
  const matches = await Promise.all(matchIds.map(id => fetchMatch(id, logger)));

  const validMatches = matches.filter(Boolean);

  if (validMatches.length) {
    logger.info('[wins2] Match date range', {
      newest: new Date(validMatches[0].info.gameEndTimestamp).toISOString(),
      oldest: new Date(validMatches.at(-1).info.gameEndTimestamp).toISOString(),
      totalFetched: validMatches.length
    });
  }

  const results = [];

  for (const match of validMatches) {
    const participant = match.info.participants.find(p => p.puuid === puuid);
    if (!participant) continue;

    const queueName = resolveQueueName(match.info, queueMap, logger);

    if (
      queueFilter &&
      !queueName.toLowerCase().includes(queueFilter.toLowerCase())
    ) {
      continue;
    }

    results.push({
      champion: participant.championName,
      win: participant.win,
      queueType: queueName
    });

    if (results.length >= gameCount) break;
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

    const matches = await getLastMatches(
      summonerName,
      gameCount,
      queueFilter,
      this.logger,
      message.author.id
    );

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
