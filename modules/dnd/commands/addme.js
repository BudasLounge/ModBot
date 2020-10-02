module.exports = {
    name: 'addme_dnd',
    description: 'Adds you to the dnd database',
    syntax: 'addme_dnd [dm]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var respFound;

        try{
            respFound = await api.get("dnd_player", {
                discord_id: message.member.id
            });
        }catch(error){
            this.logger.error(error);
        }

        if(respFound.dnd_players[0]){
            message.channel.send("That player is already in the database, good to go!");
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

            try{
                respFound = await api.get("dnd_player", {
                    discord_id: message.member.id
                });
            }catch(error){
                this.logger.error(error);
            }
            let role = message.guild.roles.get("735631143583481987");
            message.member.addRole(role);
            let rem_role = message.guild.roles.get("670370134925508717");
            message.member.removeRole(rem_role);
            message.channel.send("Added a player to the database! Ask an admin for help if you can't see the players lounge!");
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
            let dmRole = message.guild.roles.get("735644461627080765");
            message.member.addRole(dmRole);
            if(respFound.dnd_players[0].is_dm){
                message.channel.send("You're listed as a dm now");
            }else{
                message.channel.send("Something went wrong...try again or ask a mod for help.");
            }
        }
        
    }
};
