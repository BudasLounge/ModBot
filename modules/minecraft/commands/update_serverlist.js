module.exports = {
    name: 'updatesl',
    description: 'Used to update parts of the minecraft server list',
    syntax: 'updatesl [server name] [whats updating] [new value]',
    num_args: 3,
    args_to_lower: true,
    async execute(message, args, api) {
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        }catch(err){
            console.error(err);
        }
        if(!respServer.minecraft_servers[0]){
            message.channel.send("No server with that short_hand...checking display_name");
            try{
                respServer = await api.get("minecraft_server", {
                    display_name: args[1]
                });
            }catch(err2){
                console.error(err2);
            }
        }
        if(respServer.minecraft_servers[0]){
            message.channel.send("Found one!");
        }else{
            message.channel.send("Nothing found...");
        }
    }
};
