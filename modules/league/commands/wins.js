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

        const summonerName = args[1];
        const region = 'na1';
        const apiKey = 'RGAPI-09a3d630-4744-4345-9026-e5368912b158';

        // Construct the URL for the match history request
        const matchHistoryUrl = `https://${region}.api.riotgames.com/lol/match/v4/matchlists/by-account/${summonerName}?api_key=${apiKey}`;

        // Make the HTTP request to retrieve the match history
        request(matchHistoryUrl, (error, response, body) => {
        if (error) {
            console.error(error);
        } else {
            // Parse the JSON response body into a JavaScript object
            const matchHistory = JSON.parse(body);
            this.logger.info(matchHistory)
            // Initialize the win and loss counts to 0
            let wins = 0;
            let losses = 0;

            // Iterate through the matches to count the wins and losses
            for (let i = 0; i < matchHistory.matches.length; i++) {
            const match = matchHistory.matches[i];
            const matchId = match.gameId;
            const champion = match.champion;
            const role = match.role;
            const lane = match.lane;

            // Construct the URL for the match details request
            const matchDetailsUrl = `https://${region}.api.riotgames.com/lol/match/v4/matches/${matchId}?api_key=${apiKey}`;

            // Make the HTTP request to retrieve the match details
            request(matchDetailsUrl, (error, response, body) => {
                if (error) {
                console.error(error);
                } else {
                // Parse the JSON response body into a JavaScript object
                const matchDetails = JSON.parse(body);

                // Determine whether the summoner won or lost the match
                const participantId = matchDetails.participantIdentities.find(participant => participant.player.summonerName.toLowerCase() === summonerName.toLowerCase()).participantId;
                const participant = matchDetails.participants.find(participant => participant.participantId === participantId);
                if (participant.stats.win) {
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
    }
};