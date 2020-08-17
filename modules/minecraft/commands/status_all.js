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
        console.log(">>display_all_servers_status");
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                _limit: 20
            });
        } catch(error){
            console.error(error.response);
        }
        console.log(respServer.minecraft_servers.length + " servers found...");
        const ListEmbed = new Discord.RichEmbed()
        .setColor("#f92f03")
        .setTitle("List of all minecraft servers: ");
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            var nextItem = "";
            //nextItem += getServerStatus(respServer.minecraft_servers[i].short_name, respServer.minecraft_servers[i].port, respServer.minecraft_servers[i].numeric_ip);
            nextItem += await getServerState(respServer.minecraft_servers[i].short_name, respServer.minecraft_servers[i].port, respServer.minecraft_servers[i].numeric_ip, respServer.minecraft_servers[i].status_api_port);
            //console.log(nextItem);
            ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", nextItem);
        }
        
        message.channel.send(ListEmbed);
        console.log("<<display_all_servers_status");
    }
};

/*async function getServerState(server, port, ip){
    var axios = require('axios');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    var response = await axios.get(url);
    response = response.data;
    var status = '*'+server+' server is currently offline*'
    if(response.online) {
        status = '**'+server+'** server is **online**  -  ';
        if(response.players.now) {
            status += '**' + response.players.now + '** people are playing!';
        } else {
            status += '*Nobody is playing!*';
        }
    }
    console.log("Returning message: "+status);
    return status;
}*/
async function getServerState(server, port, ip, status_api_port){
    var axios = require('axios');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    var response = await axios.get(url);
    response = response.data;
    var status = '*'+server+' server is currently offline*';
    try{
        if(response.online) {
            status = '**'+server+'** server is **online**  -  ';
            if(response.players.now) {
                status += '**' + response.players.now + '** people are playing!';
                if(status_api_port != "none"){
                    status += "\nPlayers: ";
                    var respPlayers = await axios.get("http://192.168.1.2:" + status_api_port + "/player-list", {});
                    console.log("returned from api:\n" + respPlayers.data.players);
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
        console.error(err);
    }
    console.log("Returning message: "+status);
    return status;
}
//http://mcapi.us/server/status?ip=104.218.144.200&port=11160