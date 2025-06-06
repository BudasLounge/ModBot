module.exports = {
    name: 'ip',
    description: 'Gets the IP of a server',
    syntax: 'ip [server name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        }catch(error){
            console.error(error);
        }
        if(!respServer.minecraft_servers[0]){
            await message.channel.send({ content: "short_name not found...checking display_name"});
            try{
                respServer = await api.get("minecraft_server", {
                    display_name: args[1]
                });
            }catch(error2){
                console.error(error2);
            }
        }
        if(respServer.minecraft_servers[0]){
            await message.channel.send({ content: "The IP of " + respServer.minecraft_servers[0].display_name + "(" + respServer.minecraft_servers[0].short_name + ")" + " is: **" + respServer.minecraft_servers[0].server_ip + "**"});
        }else{
            await message.channel.send({ content: "That server could not be found..."});
        }
    }
};