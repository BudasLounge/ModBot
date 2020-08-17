module.exports = {
    name: 'rando',
    description: 'returns a random league champion',
    syntax: 'rando',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var respChamps;
        if(args[1]){
            try{
                respChamps = await api.get("league_champion",{
                    _limit: 150,
                    role_primary: args[1]
                });
            } catch(error2){
                this.logger.error(error2.response);
            }
            this.logger.info("array length is: "+ respChamps.league_champions.length);
            var seed = (Math.floor(Math.random() * respChamps.league_champions.length)+1);
            this.logger.info(seed);
            message.channel.send("Your " + args[1] + " champ is: " + respChamps.league_champions[seed].name);
        }
        else{
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
    }
};