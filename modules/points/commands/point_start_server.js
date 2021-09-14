module.exports = {
    name: 'point_start_server',
    description: 'Grants access to the point system for the server.',
    syntax: 'point_start_server',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
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
        
        var server_id = message.guild.id;
        var respCheck;
        try{
            respCheck = await api.get("bet_config",{
                discord_server_id:server_id
            });
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheck.bet_configs[0]){
            message.channel.send({ content: "This server is already in. Use /points_config to change settings!"});
            return;
        }

        var respNew;
        try{
            respNew = await api.post("bet_config",{
                discord_server_id:server_id
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respNew.ok){
            message.channel.send({ content: "This server was added to the system. Use /points_config to check your configuration."});
        }else{
            message.channel.send({ content: "There was an error."});
        }
    }
}