module.exports = {
    name: 'wins',
    description: 'Shows last 20 games in your match history',
    syntax: 'wins [summoner name] [number of games up to 95]',
    num_args: 2,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    
    async execute(message, args, extra) {
        message.channel.send(`Getting stats for ${args[1]}, this may take a moment...`);
        require('dotenv').config();
        const {Util} = require('discord.js');
        const axios = require('axios');
        const rateLimit = require('axios-rate-limit');

        const RIOT_API_KEY = process.env.RIOT_API_KEY;
        const RIOT_ACCOUNT_BASE_URL = 'https://na1.api.riotgames.com/lol';
        const RIOT_API_BASE_URL = 'https://americas.api.riotgames.com/lol';
        let hasSentLongTermLimitMessage = false;
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
            if (longTermRequests >= LONG_TERM_LIMIT && !hasSentLongTermLimitMessage) {
                message.channel.send(`The rate limit of ${LONG_TERM_LIMIT} requests per ${LONG_TERM_DURATION / 1000 / 60} minutes has been exceeded. Please wait 2 minutes before trying again.`);
                hasSentLongTermLimitMessage = true; // Set the flag so the message won't be sent again
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
                if(hasSentLongTermLimitMessage) return;
                const retryAfter = error.response.headers['retry-after'] ? parseInt(error.response.headers['retry-after']) : 1;
                if (retryAfter > 10) {
                    message.channel.send(`The rate limit of ${LONG_TERM_LIMIT} requests per ${LONG_TERM_DURATION / 1000 / 60} minutes has been exceeded.`);
                    hasSentLongTermLimitMessage = true; // Set the flag so the message won't be sent again
                    return;
                }
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

                const matchIdsResponse = await http.get(`${RIOT_API_BASE_URL}/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${args[2]}`, {
                    headers: {
                        "X-Riot-Token": RIOT_API_KEY
                    }
                });
                const matchIds = matchIdsResponse.data;
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
                /*if (longTermRequests >= LONG_TERM_LIMIT) {
                    message.channel.send(`The rate limit of ${LONG_TERM_LIMIT} requests per ${LONG_TERM_DURATION / 1000 / 60} minutes has been exceeded. Please wait 2 minutes before trying again.`);
                } else {*/
                    this.logger.error('Error fetching data from Riot API:', error);
                    if (error.response) {
                        this.logger.error('Response data:', error.response.data);
                        this.logger.error('Response status:', error.response.status);
                        this.logger.error('Response headers:', error.response.headers);
                    } else if (error.request) {
                        this.logger.error('Request:', error.request);
                    } else {
                        this.logger.error('Error message:', error);
                    }
                    // Send a generic error message if the rate limit message hasn't been sent
                    if (!hasSentLongTermLimitMessage) {
                        message.channel.send('An error occurred while retrieving match history.');
                    }
                    throw error;
                //}
            }
        }

        getLast20Matches(args[1]).then(results => {
            const embed = new MessageEmbed()
                .setTitle(`Last ${args[2]} matches for ${args[1]}`)
                .setColor('#0099ff')
                .setTimestamp();
        
            const championWins = {};
            results.forEach(result => {
                const champion = result.champion;
                if (!championWins[champion]) {
                    championWins[champion] = {
                        wins: 0,
                        losses: 0
                    };
                }
                if (result.win) {
                    championWins[champion].wins++;
                } else {
                    championWins[champion].losses++;
                }
            });
        
            for (const [champion, { wins, losses }] of Object.entries(championWins)) {
                embed.addField(champion, `Wins: ${wins} | Losses: ${losses}`, true);
            }
        
            message.channel.send({ embeds: [embed] });
            //message.channel.send(response);
        }).catch(error => {
            this.logger.error(error.message);
            message.channel.send('An error occurred while retrieving match history.');
        });
    }
};