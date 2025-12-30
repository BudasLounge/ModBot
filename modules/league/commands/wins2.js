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

async function loadQueueMap() {
  if (QUEUE_MAP) return QUEUE_MAP;

  const res = await axios.get(
    'https://static.developer.riotgames.com/docs/lol/queues.json'
  );

  QUEUE_MAP = res.data.reduce((acc, q) => {
    acc[q.queueId] = q.description?.replace(' games', '') ?? null;
    return acc;
  }, {});

  return QUEUE_MAP;
}

/**
 * Fully dynamic queue resolver.
 * No hard-coding of Riot modes.
 */
function resolveQueueName(info, queueMap) {
  const parts = [];

  if (queueMap[info.queueId]) {
    parts.push(queueMap[info.queueId]);
  } else if (info.gameMode) {
    parts.push(info.gameMode);
  }

  if (
    info.gameName &&
    !parts.some(p =>
      info.gameName.toLowerCase().includes(p.toLowerCase())
    )
  ) {
    parts.push(info.gameName.replace(/^teambuilder-match-\d+$/, '').trim());
  }

  return parts.join(': ').replace(/\s+/g, ' ').trim();
}

/* -------------------- PUUID -------------------- */

async function getPuuidFromDatabase(userId) {
  const res = await api.get('league_player', { user_id: userId });

  if (
    !res ||
    !Array.isArray(res.league_players) ||
    res.league_players.length === 0
  ) {
    return null;
  }

  const puuid = res.league_players[0].puuid;

  if (!puuid || puuid === 'none') {
    return null;
  }

  return puuid;
}


async function storePuuidInDatabase(userId, puuid) {
  await api.put('league_player', { user_id: userId, puuid });
}

async function resolvePuuid(username) {
  const idx = username.lastIndexOf('#');
  if (idx === -1) {
    throw new Error('Riot ID must be in Name#TAG format');
  }

  const gameName = username.slice(0, idx);
  const tag = username.slice(idx + 1);

  const res = await http.get(
    `${ACCOUNT_BASE}/${encodeURIComponent(gameName)}/${encodeURIComponent(tag)}`
  );

  return res.data.puuid;
}

/* -------------------- MATCH FETCHING -------------------- */

async function fetchMatchIds(puuid, maxGames) {
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

    if (ids.length % 500 === 0) {
      await sleep(10_000);
    }
  }

  return ids;
}

async function fetchMatch(matchId) {
  try {
    return (await http.get(`${MATCH_BASE}/${matchId}`)).data;
  } catch (err) {
    if (err.response?.status === 429) {
      const wait = Number(err.response.headers['retry-after'] ?? 1) * 1000;
      await sleep(wait);
      return fetchMatch(matchId);
    }
    return null;
  }
}

/* -------------------- CORE LOGIC -------------------- */

async function getLastMatches(username, gameCount, queueFilter, userId) {
  const queueMap = await loadQueueMap();

  let puuid = await getPuuidFromDatabase(userId);
  if (!puuid) {
    puuid = await resolvePuuid(username);
    await storePuuidInDatabase(userId, puuid);
  }

  const matchIds = await fetchMatchIds(puuid, gameCount * 2); // over-fetch for filtering
  const matches = await Promise.all(matchIds.map(fetchMatch));

  const results = [];

  for (const match of matches) {
    if (!match) continue;

    const participant = match.info.participants.find(p => p.puuid === puuid);
    if (!participant) continue;

    const queueName = resolveQueueName(match.info, queueMap);

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

/* -------------------- DISCORD COMMAND -------------------- */

module.exports = {
    name: 'wins2',
    description: 'Shows last games in your match history',
    syntax: 'wins [summoner name] [number of games up to 1000](optional)',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
  async execute(message, args) {
    args.shift();

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
      message.author.id
    );

    if (!matches.length) {
      return thread.send('No matches found.');
    }

    const stats = matches.reduce((acc, m) => {
      acc[m.queueType] ??= { games: 0, wins: 0, losses: 0 };
      acc[m.queueType].games++;
      acc[m.queueType][m.win ? 'wins' : 'losses']++;
      return acc;
    }, {});

    for (const [queue, s] of Object.entries(stats)) {
      const winrate = ((s.wins / s.games) * 100).toFixed(2);
      const embed = new EmbedBuilder()
        .setTitle(`${queue}`)
        .setDescription(
          `Games: ${s.games}\nWins: ${s.wins}\nLosses: ${s.losses}\nWinrate: ${winrate}%`
        )
        .setTimestamp();

      await thread.send({ embeds: [embed] });
    }
  }
};
