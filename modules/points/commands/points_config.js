module.exports = {
    name: 'points_config',
    description: 'Updates config options for the servers point system',
    syntax: 'points_config [item to change] [new value]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: true,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api;
        var respAdminID = "";
        try{
            respAdminID = await api.get("discord_server",{
                server_id:message.guild.id
            });
        }catch(err){
            this.logger.error(err.message);
        }
        if(respAdminID.discord_servers[0]){
            if(respAdminID.discord_servers[0].admin_role_id === ""){
                message.channel.send({ content: "This command requires an admin role but no main admin role has been selected for this server."});
                return;
            }
            else if(!message.member.roles.cache.has(respAdminID.discord_servers[0].admin_role_id)){
                message.channel.send({ content: "You do not have permission to use this command."});
                return;
            }
        }else{
            message.channel.send({ content: "This command requires an admin role but no main admin role has been selected for this server."});
            return;
        }
        try{
            var respCheck = await api.get("bet_config",{
                discord_server_id:message.guild.id
            });
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheck.bet_configs[0]){
            var options = ["point_name", "recharge_amount", "base_amount", "recharge_cooldown", "bet_buyin_time"];
            if(options.indexOf(args[1]) > -1){
                if((args[1] === "base_amount" || args[1] === "recharge_cooldown") && Number.isInteger(parseInt(args[2]))){
                    args[2] = parseInt(args[2]);
                }
                var data = {discord_server_id:message.guild.id};
                data[args[1]] = args[2];
                var respUpdate;
                try{
                    respUpdate = await api.put("bet_config", data);
                }catch(err){
                    this.logger.error(err.message);
                }
                if(respUpdate.ok){
                    message.channel.send({ content: "Successfully updated this server's config"});
                }
            }else{
                message.channel.send({ content: "That option doesn't exist try:point_name, recharge_amount, base_amount, recharge_cooldown, bet_buyin_time\n"})
            }
        }else{
            message.channel.send({ content: "That server hasn't been set up yet. Use /point_start_server to get a config loaded"});
        }

    }
}