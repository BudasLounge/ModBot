module.exports = {
    name: 'api_test',
    description: 'For testing league API pulling',
    syntax: 'api_test [summoner name (case sensitive)',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        let LeagueAPI = require('leagueapiwrapper');
        LeagueAPI = new LeagueAPI("RGAPI-09a3d630-4744-4345-9026-e5368912b158", Region.NA);
 
        accountData = LeagueAPI.getSummonerByName(args[1]);
        this.logger.info(accountData);
    }
};