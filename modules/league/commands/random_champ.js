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
        var roles = ["mid","top","adc","sup","jg"];
        if(args[1]){
            this.logger.info("args[1] found: "+args[1]);
            if(args[1] == "cella"){
                var respChampsCella;
                try{
                    respChampsCella = await api.get("league_champion",{
                        _limit: 150,
                        is_cella: 1
                    });
                }catch(errorCella){
                    this.logger.error(errorCellaMessage, errorCella.response);
                }
                var seedCella = (Math.floor(Math.random() * respChampsCella.league_champions.length));
                message.channel.send("<@" + message.member.id + "> "+"Your champ is: " + respChampsCella.league_champions[seed].name);
            }else{
                if(roles.indexOf(args[1]) > -1){
                    try{
                        respChampsPrim = await api.get("league_champion",{
                            _limit: 150,
                            role_primary: args[1]
                        });
                    } catch(error2){
                        this.logger.error({error: error2.response});
                    }
                    try{
                        respChampsSec = await api.get("league_champion",{
                            _limit: 150,
                            role_secondary: args[1]
                        });
                    } catch(error3){
                        this.logger.error(error3.response);
                    }
                    respChamps = {...respChampsPrim, ...respChampsSec};
                    var seed = (Math.floor(Math.random() * respChamps.league_champions.length));
                    message.channel.send("<@" + message.member.id + "> "+"Your " + args[1] + " champ is: " + respChamps.league_champions[seed].name);
                }else{
                    message.channel.send("That role doesn't exist! Try:\nmid, top, sup, adc, jg");
                }
            }
        }
        else{
            try{
                respChamps = await api.get("league_champion",{
                    _limit: 150
                });
            } catch(error){
                this.logger.error({error:error.response});
            }
            var seed = (Math.floor(Math.random() * 150));
            try{
                message.channel.send("<@" + message.member.id + "> "+respChamps.league_champions[seed].name);
            } catch(error2){
                this.logger.error({error: error2.response});
            }
        }
    }
};