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
            try{
                var respUpdate = await api.put("minecraft_server", {
                    args[2]: args[3]
                });
            } catch(err3){
                console.error(err3);
            }
        }else{
            message.channel.send("Nothing found...");
        }


    }
};
