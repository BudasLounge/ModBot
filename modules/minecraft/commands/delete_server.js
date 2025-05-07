module.exports = {
    name: 'delete_server',
    description: 'Used to delete a minecraft server to the database',
    syntax: 'delete_server [short_name or display_name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

        var respServer;
        if(message.member.roles.cache.some(role => role.name === "MCadmin")){
            try{
                respServer = await api.get("minecraft_server", {
                    short_name: args[1]
                });
            }catch(error){
                console.error(error);
            }
            if(!respServer.minecraft_servers[0]){
                message.channel.send({ content: "short_name not found...checking display_name"});
                try{
                    respServer = await api.get("minecraft_server", {
                        display_name: args[1]
                    });
                }catch(error2){
                    console.error(error2);
                }
            }
            if(respServer.minecraft_servers[0]){
                var server_id = respServer.minecraft_servers[0].server_id;
                var respDelete = await api.delete("minecraft_server", {
                    server_id: server_id
                });  
                if(respDelete.ok){
                    message.channel.send({ content: respServer.minecraft_servers[0].display_name + " has been successfully deleted."});
                }
            }else{
                message.channel.send({ content: "That server could not be found..."});
            }
        }else{
            message.channel.send({ content: "You don't have permission to do that"});
        }
    }
};