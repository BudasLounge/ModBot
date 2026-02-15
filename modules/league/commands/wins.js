const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol/match/v5/matches/';
const RIOT_SHORT_LIMIT = 500;
const RIOT_SHORT_WINDOW_MS = 10 * 1000;
const RIOT_LONG_LIMIT = 30000;
const RIOT_LONG_WINDOW_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const http = axios.create();

let queueTypeMapping = {};
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

    logger.info('[wins] Proactive Riot rate-limit pause', {
      context,
      waitMs,
      shortWindowCount: riotShortWindowRequests.length,
      longWindowCount: riotLongWindowRequests.length
    });
    await sleep(waitMs);
  }
}

async function fetchQueueMapping(logger) {
  try {
    const response = await axios.get('https://static.developer.riotgames.com/docs/lol/queues.json');
    queueTypeMapping = response.data.reduce((acc, queue) => {
      if (queue.description && typeof queue.description === 'string') {
        acc[queue.queueId] = queue.description.replace(' games', '');
      } else {
        acc[queue.queueId] = `Queue ${queue.queueId}`;
      }
      return acc;
    }, {});
  } catch (error) {
    logger.error('[wins] Error fetching queue types', { error: error?.message || error });
  }
}

async function getPuuidFromDatabase(userId, api, logger) {
  try {
    const response = await api.get('league_player', { user_id: userId });
    if (response && response.league_players && response.league_players.length > 0) {
      if (response.league_players[0].puuid === 'none') {
        return null;
      }
      return response.league_players[0].puuid;
    }
    return null;
  } catch (error) {
    logger.error('[wins] Error fetching puuid from database', { error: error?.response || error?.message || error });
    throw error;
  }
}

async function storePuuidInDatabase(userId, puuid, api, logger) {
  try {
    await api.put('league_player', { user_id: userId, puuid: puuid });
    logger.info('[wins] Stored puuid in database', { userId });
  } catch (error) {
    logger.error('[wins] Error storing puuid in database', { error: error?.response || error?.message || error });
    throw error;
  }
}

async function fetchMatchDetails(matchId, logger) {
  try {
    await acquireRiotRequestSlot(logger, 'match-details');
    logger.info('[wins] Fetching match details from Riot API', { matchId });
    const response = await http.get(`${RIOT_API_BASE_URL}${matchId}`, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });
    return response.data;
  } catch (apiError) {
    if (apiError.response && apiError.response.status === 429) {
      logger.info('[wins] Rate limit exceeded while fetching match details', {
        matchId,
        retryAfterSeconds: apiError.response.headers['retry-after']
      });
      const retryAfter = parseInt(apiError.response.headers['retry-after'] || '1', 10) * 1000;
      await sleep(retryAfter);
      return fetchMatchDetails(matchId, logger);
    }

    logger.error('[wins] Error fetching match data', { matchId, error: apiError?.response || apiError?.message || apiError });
    return null;
  }
}

async function getLastMatches(username, numberOfGames, api, logger, userId) {
  if (Object.keys(queueTypeMapping).length === 0) {
    await fetchQueueMapping(logger);
  }
  logger.info('[wins] Fetching match history window', { username, numberOfGames });
  let puuid = await getPuuidFromDatabase(userId, api, logger);

  if (!puuid) {
    logger.info('[wins] No PUUID in DB, resolving via Riot API', { username, userId });

    let resolvedPuuid = null;

    if (username.includes('#')) {
      const idx = username.lastIndexOf('#');
      const gameName = username.slice(0, idx).trim();
      const tagLine = username.slice(idx + 1).trim();

      logger.info('[wins] Resolving PUUID via Account-V1', { gameName, tagLine });

      await acquireRiotRequestSlot(logger, 'account-by-riot-id');
      const accountRes = await http.get(
        `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY } }
      );

      resolvedPuuid = accountRes.data?.puuid;
    } else {
      logger.info('[wins] Resolving PUUID via Summoner-V4 by-name', { username });

      await acquireRiotRequestSlot(logger, 'summoner-by-name');
      const summonerRes = await http.get(
        `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(username)}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY } }
      );

      resolvedPuuid = summonerRes.data?.puuid;
    }

    if (!resolvedPuuid) {
      throw new Error(`Unable to resolve PUUID for ${username}`);
    }

    puuid = resolvedPuuid;
    await storePuuidInDatabase(userId, puuid, api, logger);

    logger.info('[wins] Resolved and stored PUUID', { username, userId, puuid });
  } else {
    logger.info('[wins] Found PUUID in database', { username, userId });
  }

  let matchDetails = [];
  let startIndex = 0;
  const MAX_MATCHES_PER_REQUEST = 100;
  let requestCount = 0;

  while (numberOfGames > 0) {
    const count = Math.min(numberOfGames, MAX_MATCHES_PER_REQUEST);
    await acquireRiotRequestSlot(logger, 'match-id-page');
    const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=${startIndex}&count=${count}`, {
      headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    const matchIds = matchIdsResponse.data;
    startIndex += count;
    numberOfGames -= count;
    requestCount += count;

    if (requestCount >= 500) {
      logger.info('[wins] Request count reached 500; applying backoff', { backoffMs: 10000 });
      await sleep(10000);
      requestCount = 0;
    }

    const promises = matchIds.map(matchId => fetchMatchDetails(matchId, logger));
    const results = await Promise.all(promises);

    results.forEach(fullMatchDetails => {
      if (fullMatchDetails && fullMatchDetails.info && Array.isArray(fullMatchDetails.info.participants)) {
        const participant = fullMatchDetails.info.participants.find(p => p.puuid === puuid);
        if (!participant) {
          return;
        }

        const queueId = fullMatchDetails.info.queueId;
        const queueName = queueTypeMapping[queueId] || `Unknown Queue (${queueId})`;
        const matchDetail = {
          matchId: fullMatchDetails.metadata.matchId,
          champion: participant.championName,
          win: participant.win,
          queueType: queueName
        };
        matchDetails.push(matchDetail);
      }
    });

    if (numberOfGames <= 0) {
      break;
    }
  }

  logger.info('[wins] Completed match aggregation', { matchCount: matchDetails.length });

  return matchDetails;
}

async function sendEmbeds(channel, queueType, data) {
  let embed = new EmbedBuilder()
    .setTitle(`${data.games} games in ${queueType}`)
    .setColor('#0099ff')
    .setTimestamp();

  let fieldCount = 0;

  for (const [champion, { wins, losses }] of Object.entries(data.champions)) {
    if (fieldCount === 25) {
      await channel.send({ embeds: [embed] });
      embed = new EmbedBuilder()
        .setTitle(`Continued: ${queueType}`)
        .setColor('#0099ff')
        .setTimestamp();
      fieldCount = 0;
    }

    embed.addFields({ name: champion, value: `Wins: ${wins} | Losses: ${losses}`, inline: true });
    fieldCount++;
  }

  await channel.send({ embeds: [embed] });
}

module.exports = {
  name: 'wins',
  description: 'Shows last games in your match history',
  syntax: 'wins [summoner name] [number of games up to 1000](optional)',
  num_args: 1,
  args_to_lower: true,
  needs_api: true,
  has_state: false,
  async execute(message, args, extra) {
    const api = extra.api;
    this.logger.info('[wins] Execute called', { userId: message.author?.id, argsLength: args.length });

    args.shift();

    var gameCount = parseInt(args[args.length - 1]);
    if (!isNaN(gameCount)) {
      args.pop();
    } else {
      gameCount = 25;
    }

    if (gameCount > 1000) {
      message.channel.send('You can only request up to 1000 games at a time.');
      return;
    }
    if (gameCount < 1) {
      message.channel.send('You must request at least 1 game.');
      return;
    }

    let thread;
    try {
      const longTermDelays = Math.floor(gameCount / 30000) * (600 * 1000);
      const shortTermDelays = Math.floor((gameCount % 30000) / 500) * 10000;
      const estimatedTimeMs = longTermDelays + shortTermDelays;
      const estimatedTimeMinutes = Math.floor(estimatedTimeMs / 60000);
      const estimatedTimeSeconds = ((estimatedTimeMs % 60000) / 1000).toFixed(0);
      var summonerName = args.join(' ');

      thread = await message.startThread({
        name: `Wins: ${summonerName}`,
        autoArchiveDuration: 60,
      });
      await thread.send(`<@${message.author.id}>`);

      thread.send(`Getting stats for ${summonerName}, please wait. Estimated time: ${estimatedTimeMinutes} minutes and ${parseInt(estimatedTimeSeconds) + parseInt(10)} seconds.\nIf multiple requests are made in a short period of time, the bot will take longer to respond.`);
      const results = await getLastMatches(summonerName, gameCount, api, this.logger, message.author.id);
      if (results.length === 0) {
        thread.send('No puuid on file. Please log in to the website and set your league name on the league homepage and then run the command on yourself once before running it on others.');
        return;
      }

      const queueStats = results.reduce((stats, { champion, win, queueType }) => {
        if (!stats[queueType]) {
          stats[queueType] = { games: 0, champions: {} };
        }
        stats[queueType].games++;
        if (!stats[queueType].champions[champion]) {
          stats[queueType].champions[champion] = { wins: 0, losses: 0 };
        }
        stats[queueType].champions[champion][win ? 'wins' : 'losses']++;
        return stats;
      }, {});

      for (const [queueType, data] of Object.entries(queueStats)) {
        const totalGames = data.games;
        const champions = data.champions;
        const totalWins = Object.values(champions).reduce((acc, { wins }) => acc + wins, 0);
        const totalLosses = Object.values(champions).reduce((acc, { losses }) => acc + losses, 0);
        const winPercentage = (totalWins / totalGames * 100).toFixed(2);
        const championCount = Object.keys(champions).length;
        let embed = new EmbedBuilder()
          .setTitle(`${totalGames} games in ${queueType} (${championCount} champions)`)
          .setColor('#0099ff')
          .addFields({ name: 'Total', value: `Wins: ${totalWins} | Losses: ${totalLosses} (${winPercentage}%)\n---------------------`, inline: false })
          .setTimestamp();

        await thread.send({ embeds: [embed] });
        await sendEmbeds(thread, queueType, data);
      }
    } catch (error) {
      this.logger.error('[wins] Error fetching data from Riot API', { error: error?.response || error?.message || error });
      if (thread) {
        thread.send('An error occurred while retrieving match history.\nPlease try again in 10 minutes.');
      } else {
        message.channel.send('An error occurred while retrieving match history.\nPlease try again in 10 minutes.');
      }
    }
  }
};
