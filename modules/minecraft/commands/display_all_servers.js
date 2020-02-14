module.exports ={
    name: 'showAll',
    description: 'Shows all servers and their information',
    syntax: 'showAll',
    num_args: 0,
    async execute(message, args, api){
        const Discord = require('discord.js');
        console.log(">>display_all_servers");
        try{
            respServer = await api.get("minecraft_server", {
                
            });
        } catch(error){
            console.error(error);
        }
        console.log(respServer.minecraft_servers.length + " servers found...");
        //var output = "```";
        var output = "";
        const ListEmbed = new Discord.RichEmbed()
        .setColor("#f92f03")
        .setTitle("List of all minecraft servers: ");
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            var nextItem = "";
            nextItem += "short name: " + respServer.minecraft_servers[i].short_name + "\n";
            nextItem += "server ip: " + respServer.minecraft_servers[i].server_ip + "\n";
            nextItem += "numeric ip: " + respServer.minecraft_servers[i].numeric_ip + ":" + respServer.minecraft_servers[i].port;

            ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", nextItem);
        }
        //output += "------------------------------```";
        message.channel.send(ListEmbed);
        console.log("<<display_all_servers");
    }
};