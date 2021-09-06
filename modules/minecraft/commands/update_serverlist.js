module.exports = {
    name: 'updatesl',
    description: 'Used to update parts of the minecraft server list',
    syntax: 'updatesl [server name] [whats updating] [new value]',
    num_args: 3,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

        if(message.member.roles.cache.find(r => r.id === "586313447965327365") || message.author.id === "185223223892377611"){
        const Discord = require('discord.js');
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
                var data = {short_name: respServer.minecraft_servers[0].short_name};
                data[args[2]] = args[3];
                var respUpdate = await api.put("minecraft_server", data);
                if(respUpdate.ok == true){
                    //const ListEmbed = new Discord.RichEmbed()
                    //.setColor("#f92f03")
                    //.setTitle("Here's what changed: ");
                    var changedInfo = "";
                    changedInfo += "short_name: " + respServer.minecraft_servers[0].short_name + "\n";
                    changedInfo += "display_name: " + respServer.minecraft_servers[0].display_name + "\n";
                    changedInfo += "server_ip + port: " + respServer.minecraft_servers[0].server_ip + "\n";
                    changedInfo += "numeric_ip: " + respServer.minecraft_servers[0].numeric_ip + ":" + respServer.minecraft_servers[0].port + "\n";
                    changedInfo += "status_api_port: " + respServer.minecraft_servers[0].status_api_port + "\n";
                    changedInfo += "mc_version: " + respServer.minecraft_servers[0].mc_version + "\n";
                    changedInfo += "pack_version: " + respServer.minecraft_servers[0].pack_version;
                    changedInfo += "\n\nvvvvv has been changed to vvvvv\n\n";
                    changedInfo += "short_name: " + respUpdate.minecraft_server.short_name + "\n";
                    changedInfo += "display_name: " + respUpdate.minecraft_server.display_name + "\n";
                    changedInfo += "server_ip + port: " + respUpdate.minecraft_server.server_ip + "\n";
                    changedInfo += "numeric_ip: " + respUpdate.minecraft_server.numeric_ip + ":" + respUpdate.minecraft_server.port + "\n";
                    changedInfo += "status_api_port: " + respUpdate.minecraft_server.status_api_port + "\n";
                    changedInfo += "mc_version: " + respUpdate.minecraft_server.mc_version + "\n";
                    changedInfo += "pack_version: " + respUpdate.minecraft_server.pack_version;

                    //ListEmbed.addField("A post function update: ", changedInfo);
                    message.channel.send(changeInfo);
                }
            } catch(err3){
                this.logger.error(err3.response);
            }
        }else{
            message.channel.send("Nothing found...");
        }
    }else{
        message.channel.send("You don't have permission to use that command!");
    }
}
};
