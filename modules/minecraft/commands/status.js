module.exports ={
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status [name of server]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra){
        var api = extra.api;
        var util = require('util')
        const Discord = require('discord.js');
        const pinger = require("minecraft-ping-js");
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        } catch(error){
            this.logger.error(error);
        } 
        this.logger.info(respServer);
        if(respServer.minecraft_servers[0]){
            var item;
            var flag = false;
            const ListEmbed = new Discord.MessageEmbed()
            .setColor("#f92f03")
            .setTitle(respServer.minecraft_servers[0].display_name + " status: ");
            ListEmbed.addField("Notice:\n","If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.")
            
            message.channel.send({content: respServer.minecraft_servers[0].numeric_ip + ":" + respServer.minecraft_servers[0].port})
            try{
                await pinger.pingWithPromise('192.168.1.4', 36010).then(response => {item = response}).catch(response => {item = response})
                this.logger.info("ITEM IN TRY: " + item)
            }catch(status_error){
                this.logger.error(status_error.message);
                item = respServer.minecraft_servers[0].display_name + " is currently offline!";
                ListEmbed.addField("status: ", item);
                message.channel.send({ embeds: [ListEmbed]});
                flag = true;
            }
            this.logger.info("ITEM:" + item);
            console.log(util.inspect(item, false, null));
            if(flag == false){
                var output = respServer.minecraft_servers[0].display_name + " is currently online with: " + item.players.online + " players online!\n";
                output += "Players online:\n";
                for(var i = 0;i<item.players.online;i++){
                    output += "- " + item.players.sample[i].name + "\n";
                }
                ListEmbed.addField("status: ", output);
                message.channel.send({ embeds: [ListEmbed]});
            }
        }else{
            message.channel.send({ content: "Sorry, couldn't find a server with that shortname, try /listmc for a list of all servers."});
        }
    }
};