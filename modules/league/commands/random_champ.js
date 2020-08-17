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
        var respChampsPrim;
        var respChampsSec;
        var respChamps;
        if(args[1]){
            try{
                respChampsPrim = await api.get("league_champion",{
                    _limit: 150,
                    role_primary: args[1]
                });
            } catch(error2){
                this.logger.error(error2.response);
            }
            try{
                respChampsSec = await api.get("league_champion",{
                    _limit: 150,
                    role_secondary: args[1]
                });
            } catch(error3){
                this.logger.error(error3.response);
            }
            respChamps = {...respChampsPrim, ...respChampsPrim};
            var seed = (Math.floor(Math.random() * respChamps.league_champions.length));
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
            var seed = (Math.floor(Math.random() * 150));
            try{
                message.channel.send(respChamps.league_champions[seed].name);
            } catch(error2){
                this.logger.error(error2.response);
            }
        }
    }
};