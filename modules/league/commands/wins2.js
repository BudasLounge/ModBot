const axios = require('axios');
const rateLimit = require('axios-rate-limit');
const { MessageEmbed } = require('discord.js');
require('dotenv').config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_ACCOUNT_BASE_URL = 'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol/match/v5/matches/';
const LONG_TERM_LIMIT = 100;
const LONG_TERM_DURATION = 120 * 1000;

const http = rateLimit(axios.create(), {
  maxRequests: 20,
  perMilliseconds: 1000,
});

let longTermRequests = 0;
let hasSentLongTermLimitMessage = false;

setInterval(() => {
  longTermRequests = 0;
}, LONG_TERM_DURATION);

http.interceptors.request.use(config => {
  if (longTermRequests >= LONG_TERM_LIMIT && !hasSentLongTermLimitMessage) {
    hasSentLongTermLimitMessage = true;
    throw new Error(`Rate limit exceeded. Please wait ${LONG_TERM_DURATION / 1000 / 60} minutes.`);
  }
  longTermRequests++;
  return config;
});

http.interceptors.response.use(null, async (error) => {
  if (error.response && error.response.status === 429) {
    const retryAfter = parseInt(error.response.headers['retry-after'] || '1', 10);
    if (retryAfter > 10) {
      throw new Error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    }
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return http.request(error.config);
  }
  throw error;
});

async function getLast20Matches(username, numberOfGames) {
  const summonerResponse = await http.get(`${RIOT_ACCOUNT_BASE_URL}${encodeURIComponent(username)}`, {
    headers: { "X-Riot-Token": RIOT_API_KEY }
  });
  const { puuid } = summonerResponse.data;

  const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}by-puuid/${puuid}/ids?start=0&count=${numberOfGames}`, {
    headers: { "X-Riot-Token": RIOT_API_KEY }
  });
  const matchIds = matchIdsResponse.data;

  const matchDetails = await Promise.all(matchIds.map(matchId => http.get(`${RIOT_API_BASE_URL}${matchId}`, {
    headers: { "X-Riot-Token": RIOT_API_KEY }
  })));

  return matchDetails.map(({ data }) => {
    const participant = data.info.participants.find(p => p.puuid === puuid);
    return {
      matchId: data.metadata.matchId,
      champion: participant.championName,
      win: participant.win
    };
  });
}

module.exports = {
  name: 'wins',
  description: 'Shows last 20 games in your match history',
  syntax: 'wins [summoner name] [number of games up to 95]',
  num_args: 2,
  args_to_lower: true,
  needs_api: false,
  has_state: false,
  
  async execute(message, args) {
    try {
      message.channel.send(`Getting stats for ${args[1]}, this may take a moment...`);
      const results = await getLast20Matches(args[1], args[2]);
      const embed = new MessageEmbed()
        .setTitle(`Last ${args[2]} matches for ${args[1]}`)
        .setColor('#0099ff')
        .setTimestamp();

      const championStats = results.reduce((stats, { champion, win }) => {
        if (!stats[champion]) {
          stats[champion] = { wins: 0, losses: 0 };
        }
        stats[champion][win ? 'wins' : 'losses']++;
        return stats;
      }, {});

      Object.entries(championStats).forEach(([champion, { wins, losses }]) => {
        embed.addField(champion, `Wins: ${wins} | Losses: ${losses}`, true);
      });

      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching data from Riot API:', error);
      message.channel.send('An error occurred while retrieving match history.');
    }
  }
};