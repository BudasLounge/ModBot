module.exports = {
    name: 'wins',
    description: 'For testing league API pulling',
    syntax: 'wins [summoner name (case sensitive)] [number of games to look over]',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        message.channel.send({content : "Getting stats, this may take a moment..."})
        const util = require('util')
        const summonerName = args[1];
        const apiKey = process.env.RIOT_API_KEY;
        const {Client} = require('shieldbow')
        var gameCount = 20
        if(!isNaN(args[2])){
            gameCount = parseInt(args[2])
        }
        // Construct the URL for the match history request

        const client = new Client(apiKey);

        client
        .initialize({
            region: 'na', // defaults to 'na' anyways.
        })
        .then(async () => {
            // After initialization, you can use the client to make requests
            // For example, lets fetch the following details of a summoner
            // - Summoner name, summoner level
            // - SoloQ ranking and LP
            // - The highest champion mastery

            const summoner = await client.summoners.fetchBySummonerName(summonerName);
            const matchList = await summoner.fetchMatchList({count:gameCount})
            const leagueEntry = await summoner.fetchLeagueEntries();
            const championMastery = summoner.championMastery;
            const highest = await championMastery.highest();
            var output = ""
            output +=`Summoner name: ${summoner.name} (level: ${summoner.level}).\n`;
            const soloQ = leagueEntry.get('RANKED_SOLO_5x5');
            if(soloQ){
                output +=`SoloQ: ${soloQ.tier} ${soloQ.division} (${soloQ.lp} LP).\n`;
            }else{
                output +="No soloQ rank found, finish your provisionals!\n"
            }
            output +=`Highest champion mastery: ${highest.champion.name} (M${highest.level} ${highest.points} points).\n`;
            var countWin = 0
            var countLoss = 0
            for(const match of matchList){
                this.logger.info("Match: " + match)
                const matchInfo = await client.matches.fetch(match)
                var red = true
                const participantsBlue = matchInfo.teams.get("blue").participants
                for(const person of participantsBlue){
                    if(summoner.name === person.summoner.name){
                        red = false
                    }
                }
                if(red){
                    if(matchInfo.teams.get("red").win){
                        countWin++
                    }else{
                        countLoss++
                    }
                }else{
                    if(matchInfo.teams.get("blue").win){
                        countWin++
                    }else{
                        countLoss++
                    }
                }
            }
            output += "Win:Loss\n" + countWin.toString() + ":" + countLoss.toString()
            message.reply(output)
        });

    }
};