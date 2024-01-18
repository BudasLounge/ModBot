const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { MessageEmbed } = require('discord.js');
require('dotenv').config();
var ApiClient = require("../../../core/js/APIClient.js");
var api = new ApiClient();
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_ACCOUNT_BASE_URL = 'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol/match/v5/matches/';

// Function to sleep for a given number of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create a rate-limited instance of axios
const http = axios.create();

let longTermRequests = 0;
const LONG_TERM_LIMIT = 30000;
const LONG_TERM_DURATION = 600 * 1000; // 10 minutes

// Reset long-term request count every LONG_TERM_DURATION
setInterval(() => {
  longTermRequests = 0;
}, LONG_TERM_DURATION);

let queueTypeMapping = {};

async function fetchQueueMapping() {
  try {
    const response = await axios.get('https://static.developer.riotgames.com/docs/lol/queues.json');
    queueTypeMapping = response.data.reduce((acc, queue) => {
      // Check if description exists and is a string before replacing
      if (queue.description && typeof queue.description === 'string') {
        acc[queue.queueId] = queue.description.replace(' games', ''); // Clean up the description
      } else {
        // If no description, use a placeholder or the queueId itself
        acc[queue.queueId] = `Queue ${queue.queueId}`;
      }
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching queue types:', error);
    // Fallback to a default mapping or handle the error as needed
  }
}

async function saveMatchDataToFile(fullMatchData, puuid) {
  const dirPath = path.join("/home/bots/ModBot/matchJSONs/", 'match_data', puuid); // Directory path for the puuid
  const filePath = path.join(dirPath, `${fullMatchData.metadata.matchId}.json`); // File path for the match data

  try {
    // Ensure the directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Check if the file already exists
    try {
      await fs.stat(filePath);
      console.log(`File ${filePath} already exists. Skipping write.`);
      return; // If the file exists, skip writing to avoid overwriting
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // If the error is not a 'file not found' error, rethrow it
        throw error;
      }
      // If the file does not exist, proceed to write it
    }

    // Write the full match data JSON to a file
    await fs.writeFile(filePath, JSON.stringify(fullMatchData, null, 2), 'utf-8');
    console.log(`Match data saved to ${filePath}`);
  } catch (error) {
    console.error('Error writing match data to file:', error);
  }
}

async function getPuuidFromDatabase(userId) {
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
    console.error('Error fetching puuid from database:', error);
    throw error;
  }
}

async function storePuuidInDatabase(userId, puuid) {
  try {
    await api.put('league_player', { user_id: userId, puuid: puuid });
    console.log(`Stored puuid for user ${userId}`);
  } catch (error) {
    console.error('Error storing puuid in database:', error);
    throw error;
  }
}

async function fetchMatchDetails(matchId, puuid, logger) {
  const dirPath = path.join("/home/bots/ModBot/matchJSONs/", 'match_data', puuid);
  const filePath = path.join(dirPath, `${matchId}.json`);
  try {
    const fileData = await fs.readFile(filePath, 'utf-8');
    logger.info(`Match data for match ${matchId} found locally.`);
    return JSON.parse(fileData);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info(`Fetching match details for match ${matchId} from Riot API.`);
      try {
        const response = await http.get(`${RIOT_API_BASE_URL}${matchId}`, {
          headers: { "X-Riot-Token": RIOT_API_KEY }
        });
        await saveMatchDataToFile(response.data, puuid);
        return response.data;
      } catch (apiError) {
        if (apiError.response && apiError.response.status === 429) {
          logger.info(`Rate limit exceeded. Waiting for ${apiError.response.headers['retry-after']} seconds.`);
          const retryAfter = parseInt(apiError.response.headers['retry-after'], 10) * 1000;
          await sleep(retryAfter);
          return fetchMatchDetails(matchId, puuid, logger); // Retry
        } else {
          logger.error(`Error fetching match data for match ${matchId}:`, apiError);
          return null;
        }
      }
    } else {
      logger.error(`Error reading match data from local file for match ${matchId}:`, error);
      return null;
    }
  }
}

async function getLastMatches(username, numberOfGames, logger, userId) {
    if (Object.keys(queueTypeMapping).length === 0) {
      await fetchQueueMapping();
    }
    logger.info(`Fetching last ${numberOfGames} matches for ${username}`);
    let puuid = await getPuuidFromDatabase(userId);
  
    if (!puuid) {
      const summonerResponse = await axios.get(`${RIOT_ACCOUNT_BASE_URL}${encodeURIComponent(username)}`, {
        headers: { "X-Riot-Token": RIOT_API_KEY }
      });
      puuid = summonerResponse.data.puuid;
      await storePuuidInDatabase(userId, puuid);
    }
  
    let queueStats = {
      // Placeholder for Arena stats initialization, adjust as needed
      'Arena': {
        team1Wins: 0, team1Losses: 0, team1Count: 0,
        team2Wins: 0, team2Losses: 0, team2Count: 0,
        team3Wins: 0, team3Losses: 0, team3Count: 0,
        team4Wins: 0, team4Losses: 0, team4Count: 0
      }
    };
    let startIndex = 0;
    const MAX_MATCHES_PER_REQUEST = 100;
  
    while (numberOfGames > 0) {
      const count = Math.min(numberOfGames, MAX_MATCHES_PER_REQUEST);
      const matchIdsResponse = await axios.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=${startIndex}&count=${count}`, {
        headers: { "X-Riot-Token": RIOT_API_KEY }
      });
      const matchIds = matchIdsResponse.data;
      startIndex += count;
      numberOfGames -= count;
  
      for (const matchId of matchIds) {
        const matchDetails = await fetchMatchDetails(matchId, puuid, logger);
        if (matchDetails) {
          const participant = matchDetails.info.participants.find(p => p.puuid === puuid);
          const queueId = matchDetails.info.queueId;
          logger.info(`Match ${matchId} is a ${queueTypeMapping[queueId]} match with ID of ${queueId}.`);
  
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
  
          if (queueId === '1700') { // Replace with actual Arena queue ID
            // Determine the team and update stats; replace with actual team logic
            logger.info(`ARENAARENA Match ${matchId} is an Arena match.`);
            let teamKey = `team${participant.teamId}`;
            queueStats[queueId][`${teamKey}Count`]++;
            if (participant.win) {
              queueStats[queueId][`${teamKey}Wins`]++;
            } else {
              queueStats[queueId][`${teamKey}Losses`]++;
            }
          } else {
            // Handle non-Arena queues
            if (participant.teamId === 100) {
              queueStats[queueId].blueSideCount++;
              if (participant.win) {
                queueStats[queueId].blueSideWins++;
              } else {
                queueStats[queueId].blueSideLosses++;
              }
            } else if (participant.teamId === 200) {
              queueStats[queueId].redSideCount++;
              if (participant.win) {
                queueStats[queueId].redSideWins++;
              } else {
                queueStats[queueId].redSideLosses++;
              }
            }
          }
        }
      }
    }
  
    return queueStats;
  }

module.exports = {
    name: 'sides',
    description: 'Shows how many times you played on Red or Blue side',
    syntax: 'sides [summoner name] [number of games up to 1000](optional)',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args) {
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

        var summonerName = args.join(' ');
        message.channel.send(`Analyzing matches for ${summonerName}, please wait...`);

        try {
            const queueStats = await getLastMatches(summonerName, gameCount, this.logger, message.author.id);
            let embed = new MessageEmbed()
                .setTitle(`Side Counts and Winrates for ${summonerName}`)
                .setColor('#0099ff');
        
            for (const [queueId, stats] of Object.entries(queueStats)) {
              if (queueId !== '1700') { // Replace with actual Arena queue ID
                const queueName = queueTypeMapping[queueId] || `Queue ${queueId}`;
                const blueSideWinrate = ((stats.blueSideWins / (stats.blueSideWins + stats.blueSideLosses)) * 100).toFixed(2);
                const redSideWinrate = ((stats.redSideWins / (stats.redSideWins + stats.redSideLosses)) * 100).toFixed(2);
        
                let queueFieldText = `Blue Side: ${stats.blueSideCount} (${blueSideWinrate}%) | Red Side: ${stats.redSideCount} (${redSideWinrate}%)`;
                embed.addField(queueName, queueFieldText, false);
              } else {
                // Special handling for the Arena queue
                for (let i = 1; i <= 4; i++) {
                  const teamStats = stats[`team${i}`] || { wins: 0, losses: 0, count: 0 };
                  const winCount = teamStats.wins;
                  const lossCount = teamStats.losses;
                  const totalCount = teamStats.count;
                  const winrate = totalCount > 0 ? ((winCount / totalCount) * 100).toFixed(2) : "N/A";
        
                  embed.addField(`Arena - Team ${i}`, `Played: ${totalCount} | Winrate: ${winrate}%`, false);
                }
              }
            }
        
            embed.setTimestamp();
            await message.channel.send({ embeds: [embed] });
          } catch (error) {
            this.logger.error('Error fetching data:', error);
            message.channel.send('An error occurred while retrieving match history. Please try again later.');
          }
    }
};
