const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');
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
    }
  }
  return null; // Return null in case of any failure
}

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
      // Assuming the puuid is stored in the response object
      return response.league_players[0].puuid;
    }
    return null;
  } catch (error) {
    console.error('Error fetching puuid from database:', error);
    throw error;
  }
}

// Function to store the puuid in your database
async function storePuuidInDatabase(userId, puuid) {
  try {
    await api.put('league_player', { user_id: userId, puuid: puuid });
    console.log(`Stored puuid for user ${userId}`);
  } catch (error) {
    console.error('Error storing puuid in database:', error);
    throw error;
  }
}

async function getLastMatches(username, numberOfGames, logger, userId) {
  if (Object.keys(queueTypeMapping).length === 0) {
    await fetchQueueMapping();
  }
  logger.info(`Fetching last ${numberOfGames} matches for ${username}`);
  let puuid = await getPuuidFromDatabase(userId);

  if (!puuid) {
    // Fetch puuid from Riot API if not found in the database
    const summonerResponse = await http.get(`${RIOT_ACCOUNT_BASE_URL}${encodeURIComponent(username)}`, {
      headers: { "X-Riot-Token": RIOT_API_KEY }
    });
    puuid = summonerResponse.data.puuid;
    await storePuuidInDatabase(userId, puuid);
    logger.info(`Found summoner ${username} with puuid ${puuid}`);
  } else {
    logger.info(`Found puuid in database for summoner ${username}`);
  }

  let matchDetails = [];
  let startIndex = 0;
  const MAX_MATCHES_PER_REQUEST = 100;
  let requestCount = 0;

  while (numberOfGames > 0) {
    const count = Math.min(numberOfGames, MAX_MATCHES_PER_REQUEST);
    const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=${startIndex}&count=${count}`, {
      headers: { "X-Riot-Token": RIOT_API_KEY }
    });
    const matchIds = matchIdsResponse.data;
    startIndex += count;
    numberOfGames -= count;
    requestCount += count;
    if (requestCount >= 500) {
      logger.info(`Request count reached 500. Waiting for 10 seconds.`);
      await sleep(10000); // Wait for 10 seconds after every 500 requests
      requestCount = 0;
    }
    // Create an array of promises for each matchId
    const promises = matchIds.map(matchId => fetchMatchDetails(matchId, puuid, logger));

    // Use Promise.all to wait for all promises to resolve
    const results = await Promise.all(promises);

    // Filter out null results and extract the required details
    results.forEach(fullMatchDetails => {
      if (fullMatchDetails) {
        const participant = fullMatchDetails.info.participants.find(p => p.puuid === puuid);
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

    // If there are no more games to fetch, break out of the loop
    if (numberOfGames <= 0) {
      break;
    }
  }

  return matchDetails;
}

async function sendEmbeds(message, queueType, data) {
  let embed = new EmbedBuilder()
    .setTitle(`${data.games} games in ${queueType}`)
    .setColor('#0099ff')
    .setTimestamp();

  let fieldCount = 0;

  for (const [champion, { wins, losses }] of Object.entries(data.champions)) {    if (fieldCount === 25) {
      // Send the current embed and create a new one
      await message.channel.send({ embeds: [embed] });
      embed = new EmbedBuilder()
        .setTitle(`Continued: ${queueType}`)
        .setColor('#0099ff')
        .setTimestamp();      fieldCount = 0;
    }

    embed.addFields({ name: champion, value: `Wins: ${wins} | Losses: ${losses}`, inline: true });
    fieldCount++;
  }

  // Send the last or only embed for the current queue type
  await message.channel.send({ embeds: [embed] });
}

module.exports = {
    name: 'wins',
    description: 'Shows last games in your match history',
    syntax: 'wins [summoner name] [number of games up to 1000](optional)',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
async execute(message, args) {
    args.shift();

    // The last argument is the number of games, if provided
    var gameCount = parseInt(args[args.length - 1]);
    if (!isNaN(gameCount)) {
      // Remove the game count from the args array
      args.pop();
    } else {
      // If the last argument is not a number, default to 20 games
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
    try {
      const longTermDelays = Math.floor(gameCount / 30000) * (600 * 1000); // 10 minutes for every 30,000 requests
      const shortTermDelays = Math.floor((gameCount % 30000) / 500) * 10000; // 10 seconds for every 500 requests in the last batch
      const estimatedTimeMs = longTermDelays + shortTermDelays;
      const estimatedTimeMinutes = Math.floor(estimatedTimeMs / 60000);
      const estimatedTimeSeconds = ((estimatedTimeMs % 60000) / 1000).toFixed(0);
      var summonerName = args.join(' ');
      // Send the estimated time to the user
      message.channel.send(`Getting stats for ${summonerName}, please wait. Estimated time: ${estimatedTimeMinutes} minutes and ${parseInt(estimatedTimeSeconds)+parseInt(10)} seconds.\nIf multiple requests are made in a short period of time, the bot will take longer to respond.`);
      if(gameCount > 50) {
        message.channel.send(`Please only request up to 50 games at one time unless pulling mass data for website viewing.`);
      }
      const results = await getLastMatches(summonerName, gameCount, this.logger, message.author.id);
      if (results.length === 0) {
        message.channel.send(`No puuid on file. Please log in to the website and set your league name on the league homepage and then run the command on yourself once before running it on others.`);
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
        const championCount = Object.keys(champions).length;        let embed = new EmbedBuilder()
          .setTitle(`${totalGames} games in ${queueType} (${championCount} champions)`)
          .setColor('#0099ff')
          .addFields({ name: 'Total', value: `Wins: ${totalWins} | Losses: ${totalLosses} (${winPercentage}%)\n---------------------`, inline: false })
          .setTimestamp();
  
        let fieldCount = 0;
  
        /*for (const [champion, { wins, losses }] of Object.entries(champions)) {
          if (fieldCount === 25) {
            // Send the current embed and create a new one
            await message.channel.send({ embeds: [embed] });
            embed = new MessageEmbed()
              .setTitle(`Continued: ${queueType}`)
              .setColor('#0099ff')
              .setTimestamp();
            fieldCount = 0;
          }
  
          embed.addFields({ name: champion, value: `Wins: ${wins} | Losses: ${losses}`, inline: true });
          fieldCount++;
        }*/
  
        // Send the last or only embed for the current queue type
        await message.channel.send({ embeds: [embed] });
        await sendEmbeds(message, queueType, data);
      }
    } catch (error) {
      this.logger.error('Error fetching data from Riot API:', error);
      message.channel.send('An error occurred while retrieving match history.\nPlease try again in 10 minutes.');
    }
  }
};