module.exports = {
    name: 'wins',
    description: 'Shows last 20 games in your match history',
    syntax: 'wins [summoner name] ',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        message.channel.send(`Getting stats for ${args[1]}, this may take a moment...`);
        require('dotenv').config();
        const axios = require('axios');
        const rateLimit = require('axios-rate-limit');

        const RIOT_API_KEY = process.env.RIOT_API_KEY; // Your Riot API Key should be in a .env file
        const RIOT_API_BASE_URL = 'https://na1.api.riotgames.com/lol'; // Replace REGION with the appropriate region code

        // Set up rate limiting according to the provided limits
        const http = rateLimit(axios.create(), {
            maxRequests: 20,
            perMilliseconds: 1000
        });

        // Also set up a longer term rate limit
        let longTermRequests = 0;
        const LONG_TERM_LIMIT = 100; // 100 requests
        const LONG_TERM_DURATION = 120 * 1000; // 2 minutes in milliseconds

        setInterval(() => {
        longTermRequests = 0; // Reset the long term request count every 2 minutes
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

        async function getLast20Matches(username) {
            try {
                // Step 1: Get the summoner ID
                const summonerResponse = await http.get(`${RIOT_API_BASE_URL}/summoner/v4/summoners/by-name/${encodeURIComponent(username)}`, {
                    headers: {
                        "X-Riot-Token": RIOT_API_KEY
                    }
                });
        
                const { accountId } = summonerResponse.data;
        
                // Step 2: Get the matchlist for the summoner
                const matchlistResponse = await http.get(`${RIOT_API_BASE_URL}/match/v4/matchlists/by-account/${accountId}?endIndex=20`, {
                    headers: {
                        "X-Riot-Token": RIOT_API_KEY
                    }
                });
        
                const { matches } = matchlistResponse.data;
        
                // Step 3: Get match details and determine wins/losses
                const results = await Promise.all(matches.map(async (match) => {
                    const matchDetailResponse = await http.get(`${RIOT_API_BASE_URL}/match/v4/matches/${match.gameId}`, {
                        headers: {
                            "X-Riot-Token": RIOT_API_KEY
                        }
                    });
        
                    const matchDetail = matchDetailResponse.data;
                    const participantId = matchDetail.participantIdentities.find(p => p.player.accountId === accountId).participantId;
                    const participant = matchDetail.participants.find(p => p.participantId === participantId);
        
                    return {
                        gameId: match.gameId,
                        champion: participant.championId,
                        win: participant.stats.win
                    };
                }));
        
                return results;
            } catch (error) {
                console.error('Error fetching data from Riot API:', error.message);
                if (error.response) {
                    // The request was made and the server responded with a status code
                    // that falls out of the range of 2xx
                    console.error('Response data:', error.response.data);
                    console.error('Response status:', error.response.status);
                    console.error('Response headers:', error.response.headers);
                } else if (error.request) {
                    // The request was made but no response was received
                    console.error('Request:', error.request);
                } else {
                    // Something happened in setting up the request that triggered an Error
                    console.error('Error message:', error.message);
                }
                throw error;
            }
        }

        // Usage
        getLast20Matches(args[1]).then(results => {
            let response = 'Last 20 matches:\n';
            results.forEach(result => {
                const winLoss = result.win ? 'Win' : 'Loss';
                response += `Game ID: ${result.gameId}, Champion ID: ${result.champion}, Result: ${winLoss}\n`;
            });
            message.channel.send(response);
        }).catch(error => {
            this.logger.error(error.message);
            message.channel.send('An error occurred while retrieving match history.');
        });
    }
    
};