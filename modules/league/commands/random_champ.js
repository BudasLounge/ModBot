module.exports = {
    name: 'rando',
    description: 'returns a random league champion.',
    syntax: 'rando [role]or[@discord_name]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var roles = ["mid", "top", "adc", "sup", "jg"];
        if (args[1]) {
        this.logger.info("args[1] found: " + args[1]);
        if (args[1].includes("@")) {
            var respChampsCustom;
            var customID = message.mentions.users.first().id;
            try {
            respChampsCustom = await api.get("league_pref_champ", {
                _limit: 200,
                user_id: customID,
            });
            } catch (errorCustom) {
            this.logger.error(errorCustom.message, errorCustom.response);
            }
            if (respChampsCustom.league_pref_champs[0]) {
            if (!args[2]) {
                this.logger.info(respChampsCustom);
                var seedCustom = Math.floor(Math.random() * respChampsCustom.league_pref_champs.length);
                message.channel.send({
                content: "<@" + message.member.id + "> " + "Your champ is: " + respChampsCustom.league_pref_champs[seedCustom].champ_name,
                });
            } else if (roles.includes(args[2])) {
                this.logger.info(respChampsCustom);
                var champs = [];
                for (var i = 0; i < respChampsCustom.league_pref_champs.length; i++) {
                this.logger.info("In for loop");
                this.logger.info("champ data --> " + respChampsCustom.league_pref_champs[i]);
                var respChamps;
                try {
                    respChamps = await api.get("league_champion", {
                    name: respChampsCustom.league_pref_champs[i].champ_name,
                    role_primary: args[2],
                    });
                } catch (error2) {
                    this.logger.error({ error: error2.response });
                }
                if (respChamps.league_champions[0]) {
                    this.logger.info("Found a champion: " + respChamps);
                    champs.push(respChamps.league_champions[0]);
                }
                }
                this.logger.info("new champ list -->" + champs);
                var seedCustom = Math.floor(Math.random() * champs.length);
                this.logger.info("This is the seed: " + seedCustom + "\nthis is the max alloted seed: " + champs.length);
                message.channel.send({
                content: "<@" + message.member.id + "> " + "Your champ is: " + champs[seedCustom].name,
                });
            }
            } else {
            message.channel.send({ content: "That person hasn't approved any champions yet!" });
            }
        } else if (args[1] === "ad" || args[1] === "ap") {
            var respChampsAd;
            try {
            respChampsAd = await api.get("league_champion", {
                _limit: 200,
                ad_ap: args[1],
            });
            } catch (errorAd) {
            this.logger.error(errorAd.message, errorAd.response);
            }
            var seedAd = Math.floor(Math.random() * respChampsAd.league_champions.length);
            message.channel.send({
            content: "<@" + message.member.id + "> " + "Your " + args[1].toUpperCase() + " champ is: " + respChampsAd.league_champions[seedAd].name,
            });
        } else if (roles.includes(args[1])) {
            try {
            var [respChampsPrim, respChampsSec] = await Promise.all([
                api.get("league_champion", {
                _limit: 200,
                role_primary: args[1],
                }),
                api.get("league_champion", {
                _limit: 200,
                role_secondary: args[1],
                }),
            ]);
            } catch (error) {
            this.logger.error(error.response);
            }
            var respChamps = [...respChampsPrim.league_champions, ...respChampsSec.league_champions];
            var seed = Math.floor(Math.random() * respChamps.length);
            message.channel.send({
            content: "<@" + message.member.id + "> " + "Your " + args[1] + " champ is: " + respChamps[seed].name,
            });
        } else {
            message.channel.send({ content: "That role doesn't exist! Try:\nmid, top, sup, adc, jg" });
        }
        } else {
        try {
            var respAllChamps = await api.get("league_champion", {
            _limit: 200,
            });
        } catch (error) {
            this.logger.error(error.message);
        }
        var seed = Math.floor(Math.random() * respAllChamps.league_champions.length);
        try {
            message.channel.send({ content: "<@" + message.member.id + "> " + respAllChamps.league_champions[seed].name });
        } catch (error2) {
            this.logger.error(error2.message);
        }
        }
        
        /*var api = extra.api;
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
                        user_id: customID
                    });
                }catch(errorCustom){
                    this.logger.error(errorCustom.message, errorCustom.response);
                }
                if(respChampsCustom.league_pref_champs[0]){
                    if(!args[2]){
                        this.logger.info(respChampsCustom);
                        var seedCustom = (Math.floor(Math.random() * respChampsCustom.league_pref_champs.length));
                        message.channel.send({ content: "<@" + message.member.id + "> "+"Your champ is: " + respChampsCustom.league_pref_champs[seedCustom].champ_name});
                    }else if(roles.indexOf(args[2]) > -1){
                        var champs = [];
                        this.logger.info(respChampsCustom);
                        for(var i = 0;i<respChampsCustom.league_pref_champs.length;i++){
                            this.logger.info("In for loop");
                            this.logger.info("champ data --> " + respChampsCustom.league_pref_champs[i]);
                            var respChamps;
                            try{
                                respChamps = await api.get("league_champion",{
                                    name: respChampsCustom.league_pref_champs[i].champ_name,
                                    role_primary: args[2]
                                });
                            } catch(error2){
                                this.logger.error({error: error2.response});
                            }
                            if(respChamps.league_champions[0]){
                                this.logger.info("Found a champion: " + respChamps);
                                champs.push(respChamps.league_champions[0]);
                            }
                        }
                        this.logger.info("new champ list -->" + champs);
                        var seedCustom = (Math.floor(Math.random() * champs.length));
                        this.logger.info("This is the seed: "+ seedCustom + "\nthis is the max alloted seed: "+ champs.length);
                        message.channel.send({ content: "<@" + message.member.id + "> "+"Your champ is: " + champs[seedCustom].name});
                    }
                }else{
                    message.channel.send({ content: "That person hasn't approved any champions yet!"});
                }
            }else if(args[1] == "ad"){
                var respChampsAd;
                try{
                    respChampsAd = await api.get("league_champion",{
                        _limit: 200,
                        ad_ap: "ad"
                    });
                }catch(errorAd){
                    this.logger.error(errorAd.message, errorAd.response);
                }
                var seedAd = (Math.floor(Math.random() * respChampsAd.league_champions.length));
                message.channel.send({ content: "<@" + message.member.id + "> "+"Your AD champ is: " + respChampsAd.league_champions[seedAd].name});
            }else if(args[1] == "ap"){
                var respChampsAp;
                try{
                    respChampsAp = await api.get("league_champion",{
                        _limit: 200,
                        ad_ap: "ap"
                    });
                }catch(errorAp){
                    this.logger.error(errorAp.message, errorAp.response);
                }
                var seedAp = (Math.floor(Math.random() * respChampsAp.league_champions.length));
                message.channel.send({ content: "<@" + message.member.id + "> "+"Your AP champ is: " + respChampsAp.league_champions[seedAp].name});
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
                    var respChamps = [].concat(respChampsPrim.league_champions, respChampsSec.league_champions, respChampsPrim.league_champions, respChampsPrim.league_champions, respChampsPrim.league_champions);
                    //this.logger.info(respChamps);
                    var seed = (Math.floor(Math.random() * respChamps.length));
                    message.channel.send({ content: "<@" + message.member.id + "> "+"Your " + args[1] + " champ is: " + respChamps[seed].name});
                }else{
                    message.channel.send({ content: "That role doesn't exist! Try:\nmid, top, sup, adc, jg"});
                }
            }
        }
        else{
            try{
                var respAllChamps = await api.get("league_champion",{
                    _limit: 200
                });
            } catch(error){
                this.logger.error(error.message);
            }
            var seed = (Math.floor(Math.random() * respAllChamps.league_champions.length));
            try{
                message.channel.send({ content: "<@" + message.member.id + "> "+respAllChamps.league_champions[seed].name});
            }catch(error2){
                this.logger.error(error2.message);
            }
        }*/
    }
};