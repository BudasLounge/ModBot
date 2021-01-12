module.exports ={
    name: 'listmc',
    description: 'Shows all servers and their information',
    syntax: 'listmc',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra){
        var api = extra.api;

        const Discord = require('discord.js');
        console.log(">>display_all_servers");
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                _limit: 20
            });
        } catch(error){
            console.error(error);
        }
        console.log(respServer.minecraft_servers.length + " servers found...");
        const ListEmbed = new Discord.RichEmbed()
        .setColor("#f92f03")
        .setTitle("List of all minecraft servers: ");
        ListEmbed.addField("If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.")
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            var nextItem = "";
            nextItem += "short name: " + respServer.minecraft_servers[i].short_name + "\n";
            nextItem += "server ip: " + respServer.minecraft_servers[i].server_ip + "\n";
            nextItem += "numeric ip: " + respServer.minecraft_servers[i].numeric_ip + ":" + respServer.minecraft_servers[i].port + "\n";
            nextItem += "minecraft version: " + respServer.minecraft_servers[i].mc_version + "\n";
            nextItem += "pack version: " + respServer.minecraft_servers[i].pack_version + "\n";
            nextItem += "date created: " + respServer.minecraft_servers[i].date_created;
            ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", nextItem);
        }
        message.channel.send(ListEmbed);
        console.log("<<display_all_servers");
    }
};
