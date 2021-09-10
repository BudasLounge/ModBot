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
                message.channel.send("This command requires an admin role but no main admin role has been selected for this server.");
                return;
            }
            else if(!message.member.roles.cache.has(respAdminID.discord_servers[0].admin_role_id)){
                message.channel.send("You do not have permission to use this command.");
                return;
            }
        }else{
            message.channel.send("This command requires an admin role but no main admin role has been selected for this server.");
            return;
        }

        var options = ["discord_Server_id", "point_name", "recharge_amount", "base_amount", "recharge_cooldown"];
        if(options.indexOf(args[1]) > -1){

        }else{
            message.channel.send("That option doesn't exist try:discord_Server_id, point_name, recharge_amount, base_amount, recharge_cooldown\n")
        }

    }
}