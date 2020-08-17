module.exports = {
    name: 'rando',
    description: 'returns a random league champion',
    syntax: 'rando',
    num_args: 0,
    args_to_lower: false,
    execute(message, api, args) {
        var respChamps;
        try{
            respChamps = await api.get("league_champion",{
                _limit: 150
            });
        } catch(error){
            this.logger.log(error.response);
        }
        var seed = (Math.floor(Math.random() * 150) + 1);
        message.channel.send(respChamps.league_champions[seed].name);
    }
};