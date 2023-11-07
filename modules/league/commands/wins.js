module.exports = {
    name: 'wins',
    description: 'Shows last 20 games in your match history',
    syntax: 'wins [summoner name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        message.channel.send(`Getting stats for ${args[1]}, this may take a moment...`);
        require('dotenv').config();
        const axios = require('axios');
        const rateLimit = require('axios-rate-limit');

        const RIOT_API_KEY = process.env.RIOT_API_KEY;
        const RIOT_ACCOUNT_BASE_URL = 'https://na1.api.riotgames.com/lol';
        const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol';

        const http = rateLimit(axios.create(), {
            maxRequests: 20,
            perMilliseconds: 1000
        });

        let longTermRequests = 0;
        const LONG_TERM_LIMIT = 100;
        const LONG_TERM_DURATION = 120 * 1000;

        setInterval(() => {
            longTermRequests = 0;
        }, LONG_TERM_DURATION);

        http.interceptors.request.use(config => {
            if (longTermRequests >= LONG_TERM_LIMIT) {
                const errorMsg = `Rate limit exceeded: ${LONG_TERM_LIMIT} requests per ${LONG_TERM_DURATION / 1000} seconds`;
                return Promise.reject(new Error(errorMsg));
            }
            longTermRequests++;
            return config;
        }, error => {
            return Promise.reject(error);
        });

        http.interceptors.response.use(response => {
            return response;
        }, async (error) => {
            if (error.response && error.response.status === 429) {
                const retryAfter = error.response.headers['retry-after'] ? parseInt(error.response.headers['retry-after']) : 1;
                console.log(`Rate limit exceeded. Retrying after ${retryAfter} seconds.`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return http.request(error.config);
            }
            return Promise.reject(error);
        });

        async function getLast20Matches(username) {
            try {
                const summonerResponse = await http.get(`${RIOT_ACCOUNT_BASE_URL}/summoner/v4/summoners/by-name/${encodeURIComponent(username)}`, {
                    headers: {
                        "X-Riot-Token": RIOT_API_KEY
                    }
                });
                const { puuid } = summonerResponse.data;

                const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`, {
                    headers: {
                        "X-Riot-Token": RIOT_API_KEY
                    }
                });
                const matchIds = matchIdsResponse.data;
                setTimeout(() => {
                    // code to execute after 1 second
                }, 1000);
                const results = await Promise.all(matchIds.map(async (matchId) => {
                    const matchDetailResponse = await http.get(`${RIOT_API_BASE_URL}/match/v5/matches/${matchId}`, {
                        headers: {
                            "X-Riot-Token": RIOT_API_KEY
                        }
                    });

                    const matchDetail = matchDetailResponse.data;
                    const participant = matchDetail.info.participants.find(p => p.puuid === puuid);

                    return {
                        matchId: matchId,
                        champion: participant.championName,
                        win: participant.win
                    };
                }));

                return results;
            } catch (error) {
                if (longTermRequests >= LONG_TERM_LIMIT) {
                    message.channel.send(`The rate limit of ${LONG_TERM_LIMIT} requests per ${LONG_TERM_DURATION / 1000 / 60} minutes has been exceeded. Please wait 2 minutes before trying again.`);
                } else {
                    this.logger.error('Error fetching data from Riot API:', error.message);
                    if (error.response) {
                        this.logger.error('Response data:', error.response.data);
                        this.logger.error('Response status:', error.response.status);
                        this.logger.error('Response headers:', error.response.headers);
                    } else if (error.request) {
                        this.logger.error('Request:', error.request);
                    } else {
                        this.logger.error('Error message:', error.message);
                    }
                    message.channel.send('An error occurred while retrieving match history.');
                }
            }
        }

        getLast20Matches(args[1]).then(results => {
            let response = 'Last 20 matches:\n';
            results.forEach(result => {
                const winLoss = result.win ? 'Win' : 'Loss';
                response += `Game ID: ${result.matchId}, Champion: ${result.champion}, Result: ${winLoss}\n`;
            });
            message.channel.send(response);
        }).catch(error => {
            this.logger.error(error.message);
            message.channel.send('An error occurred while retrieving match history.');
        });
    }
};