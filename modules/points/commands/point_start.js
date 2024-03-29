module.exports = {
    name: 'point_start',
    description: 'Grants access to the point system. User ID is collected',
    syntax: 'point_start',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var init_id = message.member.id;
        var server_id = message.guild.id;
        var init_name = message.member.user.username;

        var respCheck;
        try{
            respCheck = await api.get("bet_point",{
                discord_user_id:init_id,
                discord_server_id:server_id
            });
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheck.bet_points[0]){
            message.channel.send({ content: "You are already in the system!"});
            return;
        }

        var respCheckServer;
        try{
            respCheckServer = await api.get("bet_config",{
                discord_server_id:server_id
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheckServer.bet_configs[0]){
            this.logger.info("Here is respCheckServer: " + respCheckServer.bet_configs[0].base_amount);
            var respNew;
            try{
                respNew = await api.post("bet_point",{
                    discord_user_id:init_id,
                    discord_server_id:server_id,
                    points_total:parseInt(respCheckServer.bet_configs[0].base_amount),
                    discord_username:init_name
                })
            }catch(err){
                this.logger.error(err.message);
            }
            this.logger.info("Here is that data: " + respNew);
            if(respNew.ok == true){
                if(respCheckServer.bet_configs[0].point_name.charAt(respCheckServer.bet_configs[0].point_name.length-1) === "s"){
                    respCheckServer.bet_configs[0].point_name = respCheckServer.bet_configs[0].point_name.substring(0, respCheckServer.bet_configs[0].point_name.length-1);
                }
                message.channel.send({ content: "<@" + message.member.id + ">, you have received " + respCheckServer.bet_configs[0].base_amount + " " + respCheckServer.bet_configs[0].point_name + "s and are now in the system. Have fun!"});
            }else{
                message.channel.send({ content: "There was an error."});
            }
        }else{
            message.channel.send({ content: "This server doesn't have a loaded config. Have an admin use ,point_start_server to get it loaded."});
        }
    }
}