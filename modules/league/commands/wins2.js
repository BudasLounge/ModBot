const {performance} = require('perf_hooks');
const util = require('util')
const {Client} = require('shieldbow')

module.exports = {
    name: 'wins2',
    description: 'For testing league API pulling',
    syntax: 'wins2 [number of games(optional)] [summoner name] ',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        var perfStart = performance.now();
        message.channel.send({content : "Getting stats, this may take a moment..."})
        var summonerName = "";
        const apiKey = process.env.RIOT_API_KEY;
        var gameCount = 20
        if(!isNaN(args[1])){
            if(args[1]>70){
                args[1] = 70
                message.channel.send("I can only go up to 70 games for now, setting it to 70...")
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
                retry: {
                    retries: 3,
                    retryDelay: 4000,
                },
                throw: false,
                strategy: 'spread',
            }, 
        })
        .then(async () => {
            // After initialization, you can use the client to make requests
            // For example, lets fetch the following details of a summoner
            // - Summoner name, summoner level
            // - SoloQ ranking and LP
            // - The highest champion mastery
            var summoner;
            try{
                summoner = await client.summoners.fetchBySummonerName(summonerName);
            }catch(err){
                message.reply("Summoner not found!")
                return;
            }
            const matchList = await summoner.fetchMatchList({count:gameCount})
            var output = ""
            output +=`Summoner name: ${summoner.name} (level: ${summoner.level}).\n`;
            try{
                const [soloQ, flexQ] = await Promise.all([
                    summoner.fetchLeagueEntry("RANKED_SOLO_5x5"),
                    summoner.fetchLeagueEntry("RANKED_FLEX_SR"),
                ]);
                if(soloQ){
                    output +=`SoloQ: ${soloQ.tier} ${soloQ.division} (${soloQ.lp} LP).\n`;
                }else{
                    output +="No soloQ rank found, finish your provisionals!\n"
                }
                if(flexQ){
                    output +=`FlexQ: ${flexQ.tier} ${flexQ.division} (${flexQ.lp} LP).\n`;
                }else{
                    output +="No flexQ rank found, finish your provisionals!\n"
                }
            }catch(err){
                output += "No rank found, finish your provisionals!\n"
            }
            const championMastery = summoner.championMastery;
            const highest = await championMastery.highest();
            
            output +=`Highest champion mastery: ${highest.champion.name} (M${highest.level} ${highest.points} points).\n`;
            var countWin = 0
            var countLoss = 0
            const champWins = {};
            const matches = await Promise.all(matchList.map((match) => client.matches.fetch(match)))
            for(const matchInfo of matches){
                const redTeam = await matchInfo.teams.get("red").participants;
                const blueTeam = await matchInfo.teams.get("blue").participants;
                let ourPlayer = null;

                for (const player of [...redTeam, ...blueTeam]) {
                if (player.summoner.name == summoner.name) {
                    ourPlayer = player;
                    break;
                }
                }
                if(ourPlayer.win){
                    countWin++
                    if(!champWins[ourPlayer.champion.id]){
                        champWins[ourPlayer.champion.id] = {wins : 1}
                    }else{
                        champWins[ourPlayer.champion.id]['wins']++
                    }
                }else{
                    countLoss++
                }
            }
            for(const champ in champWins){
                output += champ + ": " + champWins[champ].wins + "\n"
            }
            output += "\nWin:Loss\n" + countWin.toString() + ":" + countLoss.toString()
            message.reply(output + `\nIt took ${((performance.now()-perfStart)/1000).toFixed(2)} seconds to get this list`)
        });
    }
    
};