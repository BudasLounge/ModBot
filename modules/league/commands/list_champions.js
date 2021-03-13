module.exports = {
    name: 'list_champs',
    description: 'returns all league champions',
    syntax: 'list_champs [champ name] or [@user]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require('discord.js');
        var respChamps;
        if(args[1]){
            if(args[1].includes("@")){
                var respChampsCustom;
                var customID = message.mentions.users.first().id;
                var output = "Here is " + args[1] + "'s champion list:\n";
                try{
                    respChampsCustom = await api.get("league_pref_champ",{
                        _limit: 200,
                        user_id: customID
                    });
                }catch(errorCustom){
                    this.logger.error(errorCustomMessage, errorCustom.response);
                }
                if(respChampsCustom.league_pref_champs[0]){
                    for(var i = 0;i<respChampsCustom.league_pref_champs.length;i++){
                        this.logger.info("In for loop");
                        this.logger.info("champ data --> " + respChampsCustom.league_pref_champs[i]);
                        output+=respChampsCustom.league_pref_champs[i].champ_name +"\n";
                    }
                }else{
                    message.channel.send("That person hasn't approved any champions yet!");
                }
                message.channel.send(output, {split:true});
            }else{
                try{
                    respChamps = await api.get("league_champion",{
                        name: args[1]
                    });
                } catch(error2){
                    this.logger.error(error2.response);
                }
                if(respChamps.league_champions[0]){
                    var output = "Champion: " + respChamps.league_champions[0].name + "\nPrimary role: " + respChamps.league_champions[0].role_primary + "\nSecondary role: " + respChamps.league_champions[0].role_secondary + "\nDamage type: " + respChamps.league_champions[0].ad_ap;
                    message.author.send(output);
                    message.channel.send("Sent a PM!");
                }else{
                    message.channel.send("Couldn't find a champion by that name!");
                }
            }
        }
        else{
            try{
                respChamps = await api.get("league_champion",{
                    _limit: 200
                });
            } catch(error){
                this.logger.error(error.response);
            }
            var output = "Champion - Primary Role / Secondary Role\n";
            for(var i = 0; i<respChamps.league_champions.length;i++){
                output += respChamps.league_champions[i].name + " - " + respChamps.league_champions[i].role_primary + "/" +respChamps.league_champions[i].role_secondary +"\n";
            } 
            message.author.send(output, {split:true});
            /*const ListEmbed = new Discord.RichEmbed()
                .setColor("#f92f03")
                .setTitle("A list of all champions: ");
            var embeds = extra.MessageHelper.split_embed(ListEmbed, output);
            for(var e = 0;e<embeds.length;e++){
                message.channel.send(embeds[e]);
            }*/
        
        message.channel.send("Sent a PM!");
        }
    }
};