const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_ACCOUNT_BASE_URL = 'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol/match/v5/matches/';
const RIOT_SHORT_LIMIT = 500;
const RIOT_SHORT_WINDOW_MS = 10 * 1000;
const RIOT_LONG_LIMIT = 30000;
const RIOT_LONG_WINDOW_MS = 10 * 60 * 1000;

// Function to sleep for a given number of milliseconds
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

    logger.info('[sides] Proactive Riot rate-limit pause', {
      context,
      waitMs,
      shortWindowCount: riotShortWindowRequests.length,
      longWindowCount: riotLongWindowRequests.length
    });
    await sleep(waitMs);
  }
}

// Queue IDs that are missing from Riot's static queues.json (names sourced from
// CommunityDragon's live game data). Used as a fallback so these don't render as
// "Queue <id>". Riot's static data still takes precedence when a key is present.
const QUEUE_TYPE_FALLBACK = {
  710: 'Ranked 5s',
  1740: 'Bravery Arena',
  1750: 'Arena 3x6',
  3100: 'SR Blind Pick Custom',
};

async function fetchQueueMapping(logger) {
  try {
    const response = await axios.get('https://static.developer.riotgames.com/docs/lol/queues.json');
    const fromApi = response.data.reduce((acc, queue) => {
      // Check if description exists and is a string before replacing
      if (queue.description && typeof queue.description === 'string') {
        acc[queue.queueId] = queue.description.replace(' games', ''); // Clean up the description
      } else {
        // If no description, use a placeholder or the queueId itself
        acc[queue.queueId] = `Queue ${queue.queueId}`;
      }
      return acc;
    }, {});
    queueTypeMapping = Object.assign({}, QUEUE_TYPE_FALLBACK, fromApi);
  } catch (error) {
    logger.error('[sides] Error fetching queue types', { error: error?.message || error });
    queueTypeMapping = { ...QUEUE_TYPE_FALLBACK };
  }
}

async function getPuuidFromDatabase(userId, api, logger) {
  try {
    const response = await api.get('league_player', { user_id: userId });
    if (response && response.league_players && response.league_players.length > 0) {
      if(response.league_players[0].puuid == 'none') {
        return null;
      }
      return response.league_players[0].puuid;
    }
    return null;
  } catch (error) {
    logger.error('[sides] Error fetching puuid from database', { error: error?.response || error?.message || error });
    throw error;
  }
}

async function storePuuidInDatabase(userId, puuid, api, logger) {
  try {
    await api.put('league_player', { user_id: userId, puuid: puuid });
    logger.info('[sides] Stored puuid in database', { userId });
  } catch (error) {
    logger.error('[sides] Error storing puuid in database', { error: error?.response || error?.message || error });
    throw error;
  }
}

async function fetchMatchDetails(matchId, puuid, logger) {
  try {
    await acquireRiotRequestSlot(logger, 'match-details');
    logger.info('[sides] Fetching match details from Riot API', { matchId });
    const response = await http.get(`${RIOT_API_BASE_URL}${matchId}`, {
      headers: { "X-Riot-Token": RIOT_API_KEY }
    });
    return response.data;
  } catch (apiError) {
    if (apiError.response && apiError.response.status === 429) {
      logger.info('[sides] Rate limit exceeded while fetching match details', {
        matchId,
        retryAfterSeconds: apiError.response.headers['retry-after']
      });
      const retryAfter = parseInt(apiError.response.headers['retry-after'] || '1', 10) * 1000;
      await sleep(retryAfter);
      return fetchMatchDetails(matchId, puuid, logger);
    }

    logger.error('[sides] Error fetching match data', { matchId, error: apiError?.response || apiError?.message || apiError });
    return null;
  }
}

async function getLastMatches(username, numberOfGames, api, logger, userId) {
    if (Object.keys(queueTypeMapping).length === 0) {
      await fetchQueueMapping(logger);
    }
    logger.info('[sides] Fetching match history window', { username, numberOfGames });
    let puuid = await getPuuidFromDatabase(userId, api, logger);
  
    if (!puuid) {
      logger.info('[sides] No PUUID found in database, resolving via Riot API', { username, userId });
        await acquireRiotRequestSlot(logger, 'summoner-by-name');
      const summonerResponse = await axios.get(`${RIOT_ACCOUNT_BASE_URL}${encodeURIComponent(username)}`, {
        headers: { "X-Riot-Token": RIOT_API_KEY }
      });
      puuid = summonerResponse.data.puuid;
      await storePuuidInDatabase(userId, puuid, api, logger);
      logger.info('[sides] Resolved and stored PUUID', { username, userId });
    } else {
      logger.info('[sides] Found PUUID in database', { username, userId });
    }
  
    let queueStats = {};
    let startIndex = 0;
    const MAX_MATCHES_PER_REQUEST = 100;
  
    while (numberOfGames > 0) {
      const count = Math.min(numberOfGames, MAX_MATCHES_PER_REQUEST);
      await acquireRiotRequestSlot(logger, 'match-id-page');
      const matchIdsResponse = await axios.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=${startIndex}&count=${count}`, {
        headers: { "X-Riot-Token": RIOT_API_KEY }
      });
      const matchIds = matchIdsResponse.data;
      startIndex += count;
      numberOfGames -= count;
  
      for (const matchId of matchIds) {
        const matchDetails = await fetchMatchDetails(matchId, puuid, logger);
        if (matchDetails && matchDetails.info && Array.isArray(matchDetails.info.participants)) {
          const participant = matchDetails.info.participants.find(p => p.puuid === puuid);
          if (!participant) {
            continue;
          }
          const queueId = matchDetails.info.queueId;
          
          // Skip processing if the match is an Arena match
          if (queueTypeMapping[queueId] === 'Arena') { 
            logger.info('[sides] Skipping arena match', { matchId, queueId });
            continue;
          }

          // Initialize the queueStats object for each queueId
          if (!queueStats[queueId]) {
            queueStats[queueId] = {
              blueSideWins: 0,
              blueSideLosses: 0,
              blueSideCount: 0,
              redSideWins: 0,
              redSideLosses: 0,
              redSideCount: 0
            };
          }

          // Update stats based on the teamId
          const side = participant.teamId === 100 ? 'blueSide' : 'redSide';
          queueStats[queueId][`${side}Count`]++;
          if (participant.win) {
            queueStats[queueId][`${side}Wins`]++;
          } else {
            queueStats[queueId][`${side}Losses`]++;
          }
        }
      }
    }

    logger.info('[sides] Completed queue stats aggregation', { queueCount: Object.keys(queueStats).length });
  
    return queueStats;
}
module.exports = {
    name: 'sides',
    description: 'Shows how many times you played on Red or Blue side',
    syntax: 'sides [summoner name] [number of games up to 1000](optional) [queue](optional)',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    options: [
        { name: 'summoner_name', description: 'Summoner name',                             type: 'STRING',  required: true  },
        { name: 'game_count',   description: 'Number of games to look back (up to 1000)', type: 'INTEGER', required: false },
        { name: 'queue',        description: 'Filter to a specific queue',                type: 'STRING',  required: false, autocomplete: true },
    ],
    async autocomplete(interaction) {
        try {
            if (Object.keys(queueTypeMapping).length === 0) {
                await fetchQueueMapping(this.logger);
            }
            const focused = interaction.options.getFocused().toLowerCase();
            const choices = Object.entries(queueTypeMapping)
                .map(([id, name]) => ({ name: String(name), value: String(id) }))
                .filter(c => c.name.toLowerCase().includes(focused))
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, 25);
            await interaction.respond(choices);
        } catch (err) {
            if (this.logger) this.logger.error('[sides] Autocomplete error', { error: err?.message || err });
            try { await interaction.respond([]); } catch (_) {}
        }
    },
    async execute(message, args, extra) {
      const api = extra.api;
      this.logger.info('[sides] Execute called', { userId: message.author?.id, argsLength: args.length });
        args.shift();

        if (Object.keys(queueTypeMapping).length === 0) {
            await fetchQueueMapping(this.logger);
        }

        // Drop null/empty positional slots that slash command options produce when
        // the user omits an optional option, and split space-containing positions
        // so a user who pasted "Name#TAG 100" into the summoner_name slash field
        // still gets sensible parsing.
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

        // Optional queue filter. The autocomplete value is the queueId string, so
        // detect a trailing known queueId (or a case-insensitive queue name) first.
        var queueFilter = null;
        if (args.length > 0) {
            const tail = args[args.length - 1];
            if (queueTypeMapping[tail]) {
                queueFilter = String(tail);
                args.pop();
            } else {
                const lowerTail = String(tail).toLowerCase();
                const match = Object.entries(queueTypeMapping).find(([, name]) =>
                    String(name).toLowerCase() === lowerTail
                );
                if (match) {
                    queueFilter = String(match[0]);
                    args.pop();
                }
            }
        }

        var gameCount = 25;
        if (args.length > 0) {
            const tail = args[args.length - 1];
            const parsed = Number(tail);
            if (!Number.isNaN(parsed) && Number.isFinite(parsed) && String(tail).trim() !== '') {
                gameCount = Math.floor(parsed);
                args.pop();
            }
        }
        if (gameCount > 1000) {
            message.channel.send('You can only request up to 1000 games at a time.');
            return;
        }
        if (gameCount < 1) {
            message.channel.send('You must request at least 1 game.');
            return;
        }

        var summonerName = args.join(' ').trim();
        message.channel.send(`Analyzing matches for ${summonerName}, please wait...`);
        try {
          const queueStats = await getLastMatches(summonerName, gameCount, api, this.logger, message.author.id);
            const filteredEntries = Object.entries(queueStats).filter(([queueId]) =>
                queueFilter === null || String(queueId) === queueFilter
            );

            if (filteredEntries.length === 0) {
                const queueName = queueFilter !== null ? queueTypeMapping[queueFilter] : 'that queue';
                message.channel.send(`No games found for ${queueName}.`);
                return;
            }

            const filterLabel = queueFilter !== null ? ` - ${queueTypeMapping[queueFilter] || `Queue ${queueFilter}`}` : '';
            let embed = new EmbedBuilder()
                .setTitle(`Side Counts and Winrates for ${summonerName}${filterLabel}`)
                .setColor('#0099ff');
        
            for (const [queueId, stats] of filteredEntries) {
              if (queueId === 'ARENA_QUEUE_ID') { // Replace with actual Arena queue ID
                // Skip processing for Arena
                continue;
              }
        
              const queueName = queueTypeMapping[queueId] || `Queue ${queueId}`;
              const blueGames = stats.blueSideWins + stats.blueSideLosses;
              const redGames = stats.redSideWins + stats.redSideLosses;
              const blueSideWinrate = blueGames > 0 ? ((stats.blueSideWins / blueGames) * 100).toFixed(2) : '0.00';
              const redSideWinrate = redGames > 0 ? ((stats.redSideWins / redGames) * 100).toFixed(2) : '0.00';
              let queueFieldText = `Blue Side: ${stats.blueSideCount} (${blueSideWinrate}%) | Red Side: ${stats.redSideCount} (${redSideWinrate}%)`;
              embed.addFields({ name: queueName, value: queueFieldText, inline: false });
            }
        
            embed.setTimestamp();
            await message.channel.send({ embeds: [embed] });
          } catch (error) {
            this.logger.error('[sides] Error fetching data', { error: error?.response || error?.message || error, summonerName, gameCount });
            message.channel.send('An error occurred while retrieving match history. Please try again later.');
          }
    }
};
