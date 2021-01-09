module.exports ={
    name: 'statusall',
    description: 'Shows all servers and their information',
    syntax: 'statusall',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require('discord.js');
        const {getStatus} = require("mc-server-status");
        this.logger.info(">>display_all_servers_status");
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                _limit: 20
            });
        } catch(error){
            this.logger.error(error.response);
        }
        if(!respServer.minecraft_servers[0]){
            return;
        }
        this.logger.info(respServer.minecraft_servers.length + " servers found...");
        const ListEmbed = new Discord.RichEmbed()
        .setColor("#f92f03")
        .setTitle("List of all minecraft servers: ");
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            this.logger.info("Working on server: " + respServer.minecraft_servers[i].display_name);
            var item;
            var flag = false;
            try{
                item = await getStatus(respServer.minecraft_servers[i].server_ip);
            }catch(status_error){
                this.logger.error(status_error + ", setting flag to true");
                item = respServer.minecraft_servers[i].display_name + " is currently offline!";
                flag = true;
            }
            if(flag == true){
                this.logger.info("Adding listEmbed for offline server");
                ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", item);
            }else{
                this.logger.info("Adding listEmbed for online server");
                if(item.players.online>0){
                    var nextItem = respServer.minecraft_servers[i].display_name + " is currently online with: " + item.players.online + " players online!\n";
                    nextItem += "Players online:\n";
                    for(var j = 0;j<item.players.online;j++){
                        nextItem += "- " + item.players.sample[j].name + "\n";
                    }
                }else{
                    var nextItem = respServer.minecraft_servers[i].display_name + " is currently online but no players are.";
                }
                ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", nextItem);
            }
        }
        message.channel.send(ListEmbed);
        this.logger.info("<<display_all_servers_status");
    }
};
