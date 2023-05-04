module.exports = {
    name: 'wins',
    description: 'For testing league API pulling',
    syntax: 'wins [summoner name (case sensitive)',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        const request = require('request');
        const axios = require('axios')
        const summonerName = args[1];
        const region = 'americas';
        const apiKey = process.env.RIOT_API_KEY;

        // Construct the URL for the match history request
        const summonerIDget = `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/${summonerName}?api_key=${apiKey}`;
        request(summonerIDget, (error, response, body) => {
            if (error) {
                console.error(error);
                return
            }
        const summoner = JSON.parse(body)
        const matchHistoryUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${summoner.puuid}/ids?start=0&count20&api_key=${apiKey}`;
        message.reply(matchHistoryUrl)

            // Make the HTTP request to retrieve the match history
            request(matchHistoryUrl, (error, response, body) => {
            if (error) {
                console.error(error);
            } else {
                // Parse the JSON response body into a JavaScript object
                const matchHistory = JSON.parse(body);
                message.reply("MATCH DATA HERE:" + matchHistory)
                // Initialize the win and loss counts to 0
                let wins = 0;
                let losses = 0;

                // Iterate through the matches to count the wins and losses
                for (let i = 0; i < matchHistory.length; i++) {
                const match = matchHistory[i];
                message.reply(match)

                // Construct the URL for the match details request
                const matchDetailsUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/${match}?api_key=${apiKey}`;

                // Make the HTTP request to retrieve the match details
                request(matchDetailsUrl, (error, response, body) => {
                    if (error) {
                    console.error(error);
                    } else {
                    // Parse the JSON response body into a JavaScript object
                    const matchDetails = JSON.parse(body);
                        message.reply("MATCH DETAILS: " + matchDetails)
                    // Determine whether the summoner won or lost the match
                    const participantId = matchDetails.info.participants.find(participant => participant.summonerName.toLowerCase() === summonerName.toLowerCase()).participantId;
                    message.reply("partID: "+participantId)
                    this.logger.info("partID: "+participantId)
                    const participant = matchDetails.info.participants.find(participant => participant.participantId === participantId);
                    this.logger.info("part:"+participant)
                    if (participant.win) {
                        wins++;
                    } else {
                        losses++;
                    }

                    // Log the win/loss count after each match is processed
                    message.reply(`Wins: ${wins}, Losses: ${losses}`);
                    }
                });
                }
            }
            });
        })
    }
};