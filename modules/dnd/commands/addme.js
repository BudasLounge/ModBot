module.exports = {
    name: 'addme_dnd',
    description: 'Adds you to the dnd database',
    syntax: 'addme_dnd [dm]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        message.channel.send("addme going in");
        var respFound;

        try{
            respFound = await api.get("dnd_player", {
                discord_id: message.member.id
            });
        }catch(error){
            this.logger.error(error);
        }

        if(respFound.dnd_players[0]){
            message.channel.send("Found a player with the id of: " + respFound.dnd_players[0].discord_id);
        }else{
            message.channel.send("let's get you added");
            try{
                var respPlayer = await api.post("dnd_player", {
                    discord_id: message.member.id,
                    is_dm: false
                });
            }catch(error2){
                this.logger.error(error2);
            }
        }
        
        if(args[1] == "dm"){
            message.channel.send("Let's get you added as a DM");
            try{
                var respPlayer = await api.put("dnd_player", {
                    discord_id: message.member.id,
                    is_dm: true
                });
            }catch(error3){
                this.logger.error(error3);
            }

            try{
                respFound = await api.get("dnd_player", {
                    discord_id: message.member.id
                });
            }catch(error){
                this.logger.error(error);
            }
            message.channel.send(respFound.dnd_players[0].is_dm);
            if(respFound.dnd_players[0].is_dm){

            }
        }
        
    }
};
