module.exports ={
    name: 'statusall',
    description: 'Shows all servers and their information',
    syntax: 'statusall',
    num_args: 0,
    async execute(message, args, api){
        const Discord = require('discord.js');
        console.log(">>display_all_servers_status");
        try{
            respServer = await api.get("minecraft_server", {
                
            });
        } catch(error){
            console.error(error);
        }
        console.log(respServer.minecraft_servers.length + " servers found...");
        const ListEmbed = new Discord.RichEmbed()
        .setColor("#f92f03")
        .setTitle("List of all minecraft servers: ");
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            var nextItem = "";
            nextItem += getServerStatus(respServer.minecraft_servers[i].short_name, respServer.minecraft_servers[i].port, respServer.minecraft_servers[i].numeric_ip);
            
            //console.log(nextItem);
            ListEmbed.addField(respServer.minecraft_servers[i].display_name + " server info:", nextItem);
        }
        getServerState(respServer.minecraft_servers[0].short_name, respServer.minecraft_servers[0].port, respServer.minecraft_servers[0].numeric_ip);
        message.channel.send(ListEmbed);
        console.log("<<display_all_servers_status");
    }
};


async function getServerStatus(server, port, ip, channel){
    
    const request = require('request');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    await request(url, function(err, response, body) {
        if(err) {
            console.log(err);
            return message.reply('Error getting server status...');
        }
        body = JSON.parse(body);
        var status = '*'+server+' server is currently offline*';
        if(body.online) {
            status = '**'+server+'** server is **online**  -  ';
            if(body.players.now) {
                status += '**' + body.players.now + '** people are playing!';
            } else {
                status += '*Nobody is playing!*';
            }
        }
        console.log("Returning message: "+status);
        return status;
    });
    //var response = await request.get(url);
}

async function getServerState(server, port, ip){
    var axios = require('axios');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    var response = await axios.get(url);
    //response = JSON.parse(response.body);
    console.log(response.data);
}
//http://mcapi.us/server/status?ip=104.218.144.200&port=11160