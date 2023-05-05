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
        var summonerName = "";
        const apiKey = process.env.RIOT_API_KEY;
        const {Client} = require('shieldbow')
        var gameCount = 20
        if(!isNaN(args[1])){
            if(args[1]>100){
                args[1] = 100
                message.channel.send("I can only go up to 100 games for now, setting it to 100...")
            }
            gameCount = parseInt(args[1])
            args.shift()
            args.shift()
            summonerName = args.join(" ")
        }else{
            args.shift()
            summonerName = args.join(" ")
        }
        // Construct the URL for the match history request

        const client = new Client(apiKey);

        client
        .initialize({
            region: 'na',
            ratelimiter: {
                throw: false,
                strategy: 'spread',
            }, // defaults to 'na' anyways.
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
                const matchInfo = await client.matches.fetch(match)
                const redTeam = matchInfo.teams.get('red')
                const blueTeam = matchInfo.teams.get('blue')
                for(const player in redTeam){
                    if(player.summoner.name == summoner.name){
                        ourPlayer = player
                    }
                }
                for(const player in blueTeam){
                    if(player.summoner.name == summoner.name){
                        ourPlayer = player
                    }
                }
                const champWins = {};
                if(ourPlayer.win){
                    countWin++
                    if(!champWins[ourPlayer.champion.name]){
                        champWins[ourPlayer.champion.name] = 1
                    }else{
                        champWins[ourPlayer.champion.name]++
                    }
                }else{
                    countLoss++
                }
            }
            for(const champ in champWins){
                output += champ + ": " + champWins[champ] + "\n"
            }
            output += "\nWin:Loss\n" + countWin.toString() + ":" + countLoss.toString()
            message.reply(output)
        });
    }
    
};