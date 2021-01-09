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
        const Discord = require('discord.js');
        const {getStatus} = require("mc-server-status");
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
            const ListEmbed = new Discord.RichEmbed()
            .setColor("#f92f03")
            .setTitle(respServer.minecraft_servers[0].display_name + " status: ");
            try{
                item = await getStatus(respServer.minecraft_servers[0].server_ip);
            }catch(status_error){
                this.logger.error(status_error);
                item = respServer.minecraft_servers[0].display_name + " is currently offline!";
                ListEmbed.addField("status: ", item);
                message.channel.send(ListEmbed);
                flag = true;
            }
            if(flag){
                return;
            }
            var output = respServer.minecraft_servers[0].display_name + " is currently online with: " + item.players.online + " players online!";
            ListEmbed.addField("status: ", output);
            message.channel.send(ListEmbed);
        }else{
            message.channel.send("Sorry, couldn't find a server with that shortname, try /listmc for a list of all servers.");
        }
    }
};

/*async function getServerState(server, port, ip, status_api_port){
    this.logger.info("getServerState()>\n");
    var axios = require('axios');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    var response = await axios.get(url);
    response = response.data;
    var status = '*'+server+' server is currently offline*';
    try{
        if(response.online) {
            this.logger.info("Found players online...\n");
            status = '**'+server+'** server is **online**  -  ';
            if(response.players.now) {
                status += '**' + response.players.now + '** people are playing!';
                if(status_api_port != "none"){
                    this.logger.info("Found a status_api port...\n");
                    status += "\nPlayers: ";
                    var respPlayers = await axios.get("http://192.168.1.2:" + status_api_port + "/player-list", {});
                    this.logger.info("returned from api:\n" + respPlayers.data.players);
                    if(respPlayers.data.players.length == 0) {
                        status += ".";
                    } else {
                        for(var player of respPlayers.data.players) {
                            status += "\n  - " + player.username;
                        }
                    }
                }
            } else {
                status += '*Nobody is playing!*';
            }
        }
    }catch(err){
        this.logger.error(err);
    }
    this.logger.info("getServerState()<\n");
    this.logger.info("Returning message: "+status);
    return status;
}*/