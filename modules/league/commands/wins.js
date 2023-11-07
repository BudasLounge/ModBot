const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { MessageEmbed } = require('discord.js');
require('dotenv').config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_ACCOUNT_BASE_URL = 'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol/match/v5/matches/';

// Function to sleep for a given number of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create a rate-limited instance of axios
const http = axios.create();

let longTermRequests = 0;
const LONG_TERM_LIMIT = 100;
const LONG_TERM_DURATION = 120 * 1000; // 2 minutes

// Reset long-term request count every LONG_TERM_DURATION
setInterval(() => {
  longTermRequests = 0;
}, LONG_TERM_DURATION);
async function saveMatchDataToFile(matchDetails, puuid) {
    const dirPath = path.join("/home/bots/ModBot/matchJSONs/", 'match_data', puuid); // Directory path for the puuid
    const filePath = path.join(dirPath, `${matchDetails.matchId}.json`); // File path for the match data
  
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
  
      // Convert match details to a JSON string
      const dataString = JSON.stringify(matchDetails, null, 2);
  
      // Write the JSON string to a file
      await fs.writeFile(filePath, dataString, 'utf-8');
      console.log(`Match data saved to ${filePath}`);
    } catch (error) {
      console.error('Error writing match data to file:', error);
    }
  }
  async function getLastMatches(username, numberOfGames, logger) {
    const summonerResponse = await http.get(`${RIOT_ACCOUNT_BASE_URL}${encodeURIComponent(username)}`, {
      headers: { "X-Riot-Token": RIOT_API_KEY }
    });
    const { puuid } = summonerResponse.data;
    logger.info(`Found summoner ${username} with puuid ${puuid}`);
  
    let matchDetails = [];
    let startIndex = 0;
    const MAX_MATCHES_PER_REQUEST = 100;
  
    while (numberOfGames > 0) {
      const count = Math.min(numberOfGames, MAX_MATCHES_PER_REQUEST);
      const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=${startIndex}&count=${count}`, {
        headers: { "X-Riot-Token": RIOT_API_KEY }
      });
      const matchIds = matchIdsResponse.data;
      startIndex += count;
      numberOfGames -= count;
  
      for (const matchId of matchIds) {
        const dirPath = path.join(__dirname, 'match_data', puuid);
        const filePath = path.join(dirPath, `${matchId}.json`);
  
        try {
          // Check if the match data file exists locally
          const fileData = await fs.readFile(filePath, 'utf-8');
          logger.info(`Match data for match ${matchId} found locally.`);
          matchDetails.push(JSON.parse(fileData));
        } catch (error) {
          if (error.code === 'ENOENT') {
            // If the file does not exist, fetch the data from the Riot API
            logger.info(`Fetching match details for match ${matchId} from Riot API.`);
            if (longTermRequests >= LONG_TERM_LIMIT) {
              // Wait until the 2-minute window resets
              await sleep(LONG_TERM_DURATION);
              longTermRequests = 0;
            }
  
            try {
              const response = await http.get(`${RIOT_API_BASE_URL}${matchId}`, {
                headers: { "X-Riot-Token": RIOT_API_KEY }
              });
              const data = response.data;
              const participant = data.info.participants.find(p => p.puuid === puuid);
              const matchDetail = {
                matchId: data.metadata.matchId,
                champion: participant.championName,
                win: participant.win
              };
              matchDetails.push(matchDetail);
              await saveMatchDataToFile(matchDetail, puuid);
            } catch (error) {
              if (error.response && error.response.status === 429) {
                // If rate limit is exceeded, use the Retry-After header to wait
                const retryAfter = parseInt(error.response.headers['retry-after'] || '1', 10) * 1000;
                await sleep(retryAfter);
              } else {
                throw error;
              }
            }
  
            longTermRequests++;
            // Respect the short-term rate limit of 20 requests per second
            await sleep(50); // 1000 ms / 20 requests = 50 ms per request
          } else {
            // If the error is not due to the file not existing, log it
            logger.error(`Error reading match data from local file for match ${matchId}:`, error);
          }
        }
      }
      // If there are no more games to fetch, break out of the loop
      if (numberOfGames <= 0) {
        break;
      }
    }
  
    return matchDetails;
  }
module.exports = {
    name: 'wins',
    description: 'Shows last games in your match history',
    syntax: 'wins [summoner name] [number of games up to 95](optional)',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
async execute(message, args) {
  var gameCount = parseInt(args[2]) || 20;
    if (gameCount > 1000) {
        message.channel.send('You can only request up to 1000 games at a time.');
        return;
    }
    if (gameCount < 1) {
        message.channel.send('You must request at least 1 game.');
        return;
    }
    try {
      message.channel.send(`Getting stats for ${args[1]}, this may take a moment...`);
      const longTermDelays = Math.floor(gameCount / 100) * (120 * 1000); // 2 minutes for every 100 requests
      const shortTermDelays = Math.floor((gameCount % 100) / 20) * 2000; // 2 seconds for every 20 requests in the last batch
      const estimatedTimeMs = longTermDelays + shortTermDelays;
      const estimatedTimeMinutes = Math.floor(estimatedTimeMs / 60000);
      const estimatedTimeSeconds = ((estimatedTimeMs % 60000) / 1000).toFixed(0);

      // Send the estimated time to the user
      message.channel.send(`Getting stats for ${args[1]}, please wait. Estimated time: ${estimatedTimeMinutes} minutes and ${estimatedTimeSeconds} seconds.`);

      const results = await getLastMatches(args[1], gameCount, this.logger);
      const embed = new MessageEmbed()
        .setTitle(`Last ${results.length} matches for ${args[1]}`)
        .setColor('#0099ff')
        .setTimestamp();

      const championStats = results.reduce((stats, { champion, win }) => {
        if (!stats[champion]) {
          stats[champion] = { wins: 0, losses: 0 };
        }
        stats[champion][win ? 'wins' : 'losses']++;
        return stats;
      }, {});
      embed.addField('total', `Wins: ${results.filter(r => r.win).length} | Losses: ${results.filter(r => !r.win).length}`, true)
      Object.entries(championStats).forEach(([champion, { wins, losses }]) => {
        embed.addField(champion, `Wins: ${wins} | Losses: ${losses}`, true);
      });

      message.channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.error('Error fetching data from Riot API:', error);
      message.channel.send('An error occurred while retrieving match history.');
    }
  }
};