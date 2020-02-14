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
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            output += "------------------------------\n";
            output += respServer.minecraft_servers[i].display_name + " server info:\n";
            output += "short name: " + respServer.minecraft_servers[i].short_name + "\n";
            output += "server ip: " + respServer.minecraft_servers[i].server_ip + "\n";
            output += "numeric ip: " + respServer.minecraft_servers[i].numeric_ip + ":" + respServer.minecraft_servers[i].port + "\n";
        }
        //output += "------------------------------```";
        const ListEmbed = new Discord.RichEmbed()
        .setTitle("List of all minecraft servers: ")
        .setDescription(output);
        message.channel.send(ListEmbed);
        console.log("<<display_all_servers");
    }
};