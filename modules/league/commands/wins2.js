const axios = require('axios');
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

async function getLast20Matches(username, numberOfGames) {
  const summonerResponse = await http.get(`${RIOT_ACCOUNT_BASE_URL}${encodeURIComponent(username)}`, {
    headers: { "X-Riot-Token": RIOT_API_KEY }
  });
  const { puuid } = summonerResponse.data;

  const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=0&count=${numberOfGames}`, {
    headers: { "X-Riot-Token": RIOT_API_KEY }
  });
  const matchIds = matchIdsResponse.data;

  const matchDetails = [];
  for (const matchId of matchIds) {
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
      matchDetails.push({
        matchId: data.metadata.matchId,
        champion: participant.championName,
        win: participant.win
      });
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
  }

  return matchDetails;
}

module.exports = {
  // ... (other module exports remain unchanged)

  async execute(message, args) {
    try {
      message.channel.send(`Getting stats for ${args[1]}, this may take a moment...`);
      const results = await getLast20Matches(args[1], args[2]);
      const embed = new MessageEmbed()
        .setTitle(`Last ${args[2]} matches for ${args[1]}`)
        .setColor('#0099ff')
        .setTimestamp();

      // ... (rest of the execute function remains unchanged)
    } catch (error) {
      console.error('Error fetching data from Riot API:', error);
      message.channel.send('An error occurred while retrieving match history.');
    }
  }
};