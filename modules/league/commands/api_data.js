module.exports = {
    name: 'api_test',
    description: 'For testing league API pulling',
    syntax: 'api_test [summoner name (case sensitive)',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var fs = require('fs');
        logger = this.logger;
        let LeagueAPI = require('leagueapiwrapper');
        token = fs.readFileSync("/home/bots/riot_token.txt", "utf8");
        LeagueAPI = new LeagueAPI(token, Region.NA);
 
        var matchData = await LeagueAPI.getSummonerByName(args[1])
            .then(function(accountObject) {
        // Gets match list for the account
                return LeagueAPI.getMatchList(accountObject);
            })
            .then(function(activeGames) { 
                console.log(activeGames);
            })
        .catch(console.log);

            this.logger.info(matchData);

    
        var testMatch = await LeagueAPI.getMatch(3593248505);
        message.channel.send("Here's the match data:" + testMatch);
    }
};