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
            if(args[1].includes("@")){
                var respChampsCustom;
                var customID = message.mentions.users.first().id;
                try{
                    respChampsCustom = await api.get("league_pref_champ",{
                        _limit: 200,
                        user_id:customID
                    });
                }catch(errorCustom){
                    this.logger.error(errorCustomMessage, errorCustom.response);
                }
                this.logger.info(respChampsCustom);
                var seedCustom = (Math.floor(Math.random() * respChampsCustom.league_pref_champs.length));
                message.channel.send("<@" + message.member.id + "> "+"Your champ is: " + respChampsCustom.league_pref_champs[seedCustom].champ_name);
            }else if(args[1] == "ad"){
                var respChampsAd;
                try{
                    respChampsAd = await api.get("league_champion",{
                        _limit: 200,
                        ad_ap: "ad"
                    });
                }catch(errorAd){
                    this.logger.error(errorAdMessage, errorAd.response);
                }
                var seedAd = (Math.floor(Math.random() * respChampsAd.league_champions.length));
                message.channel.send("<@" + message.member.id + "> "+"Your AD champ is: " + respChampsAd.league_champions[seedAd].name);
            }else if(args[1] == "ap"){
                var respChampsAp;
                try{
                    respChampsAp = await api.get("league_champion",{
                        _limit: 200,
                        ad_ap: "ap"
                    });
                }catch(errorAp){
                    this.logger.error(errorApMessage, errorAp.response);
                }
                var seedAp = (Math.floor(Math.random() * respChampsAp.league_champions.length));
                message.channel.send("<@" + message.member.id + "> "+"Your AP champ is: " + respChampsAp.league_champions[seedAp].name);
            }else{
                if(roles.indexOf(args[1]) > -1){
                    try{
                        respChampsPrim = await api.get("league_champion",{
                            _limit: 200,
                            role_primary: args[1]
                        });
                    } catch(error2){
                        this.logger.error({error: error2.response});
                    }
                    try{
                        respChampsSec = await api.get("league_champion",{
                            _limit: 200,
                            role_secondary: args[1]
                        });
                    } catch(error3){
                        this.logger.error(error3.response);
                    }
                    var respChamps = [].concat(respChampsPrim.league_champions, respChampsSec.league_champions, respChampsPrim.league_champions);
                    //this.logger.info(respChamps);
                    var seed = (Math.floor(Math.random() * respChamps.length));
                    message.channel.send("<@" + message.member.id + "> "+"Your " + args[1] + " champ is: " + respChamps[seed].name);
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