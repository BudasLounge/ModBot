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
        const axios = require('axios');
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
        message.channel.send({content: "Let me get that for you... this might take a moment"});
        this.logger.info(respServer.minecraft_servers.length + " servers found...");
        var stat_server = ""; 
        const ListEmbed = new Discord.MessageEmbed()
        .setColor("#f92f03")
        .setTitle("List of all minecraft servers: ");
        ListEmbed.addField("Notice:\n","If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.");
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            this.logger.info("Working on server: " + respServer.minecraft_servers[i].display_name);
            var item;
            var flag = false;
            try{
                item = await getStatus(respServer.minecraft_servers[i].server_ip);
            }catch(status_error){
                this.logger.error(status_error + ", setting flag to true");
                item = respServer.minecraft_servers[i].display_name + " is currently offline!\n\n";
                flag = true;
            }
            if(flag == true){
                this.logger.info("Adding listEmbed for offline server");
                ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", item);
                stat_server += respServer.minecraft_servers[i].display_name + " server info: " + respServer.minecraft_servers[i].display_name + " is currently offline!\n\n";
            }else{
                var respTPS = "";
                this.logger.info("Adding listEmbed for online server");
                if(respServer.minecraft_servers[i].status_api_port.toString() != "none"){
                    this.logger.info("Found a status API!")
                    respTPS = await axios.get("http://192.168.1.2:11051/tps" /*respServer.minecraft_servers[0].status_api_port*/, {});
                }
                if(item.players.online>0){
                    var nextItem = respServer.minecraft_servers[i].display_name + " is currently online with: " + item.players.online + " players online!\n";
                    nextItem += "Players online:\n";
                    for(var j = 0;j<item.players.online;j++){
                        nextItem += "- " + item.players.sample[j].name + "\n";
                    }
                    nextItem += "\n";
                }else{
                    var nextItem = respServer.minecraft_servers[i].display_name + " is currently online but no players are.\n\n";
                }
                if(respTPS == ""){
                    ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:",nextItem);
                }else{
                    ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", "TPS: " + respTPS.data.overallTps + "\n" + nextItem);
                }
                
                stat_server += nextItem;
            }
        }
        message.channel.send({ embeds: [ListEmbed]});
        //message.channel.send({ content: stat_server);
        this.logger.info("<<display_all_servers_status");
    }
};
