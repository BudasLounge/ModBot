module.exports = {
    name: 'wins',
    description: 'For testing league API pulling',
    syntax: 'wins [summoner name (case sensitive)',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        const summonerName = args[1];
        const apiKey = process.env.RIOT_API_KEY;
        const {Client} = require('shieldbow')
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
            const leagueEntry = await summoner.fetchLeagueEntries();
            const championMastery = summoner.championMastery;
            message.reply(leagueEntry)
            const soloQ = leagueEntry.get('RANKED_SOLO_5x5');
            const highest = await championMastery.highest();

            message.reply(`Summoner name: ${summoner.name} (level: ${summoner.level}).`);
            message.reply(`SoloQ: ${soloQ.tier} ${soloQ.division} (${soloQ.lp} LP).`);
            message.reply(`Highest champion mastery: ${highest.champion.name} (M${highest.level} ${highest.points} points).`);
        });

    }
};