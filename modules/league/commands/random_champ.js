module.exports = {
    name: 'rando',
    description: 'returns a random league champion',
    syntax: 'rando',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, api, args, extra) {
        var respChamps;
        try{
            respChamps = await api.get("league_champion",{
                _limit: 150
            });
        } catch(error){
            this.logger.error(error.response);
        }
        var seed = (Math.floor(Math.random() * 150) + 1);
        try{
            message.channel.send(respChamps.league_champions[seed].name);
        } catch(error2){
            this.logger.error(error2.response);
        }
    }
};