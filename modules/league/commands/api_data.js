module.exports = {
    name: 'api_test',
    description: 'For testing league API pulling',
    syntax: 'api_test [summoner name (case sensitive)',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        logger = this.logger;
        let LeagueAPI = require('leagueapiwrapper');
        LeagueAPI = new LeagueAPI("RGAPI-09a3d630-4744-4345-9026-e5368912b158", Region.NA);
 
        var matchData = await LeagueAPI.getSummonerByName('LeagueOfDrMundo')
            .then(function(accountObject) {
        // Gets match list for the account
                return LeagueAPI.getMatchList(accountObject);
            })
            .then(function(activeGames) { 
                logger.info(activeGames);
            })
        .catch(logger.info);

            this.logger.log(matchData);

        

        var testMatch = await LeagueAPI.getMatch(3072454619);
        message.channel.send("here's the data:" + testMatch);
    }
};