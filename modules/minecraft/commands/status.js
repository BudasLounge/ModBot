module.exports ={
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status [name of server]',
    num_args: 1,
    args_to_lower: true,
    async execute(message, args, api){
        const Discord = require('discord.js');
        const mcping = require('mc-ping-updated');
        var stat = mcping('budaslounge.com', 11180, function(err, res) {
            if (err) {
                    // Some kind of error
                    console.error(err);
            } else {
                    // Success!
                    message.channel.send(res);
                    console.log(res);
            }
        }, 3000);
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        } catch(error){
            console.error(error);
        } 
        console.log(respServer);
        if(respServer.minecraft_servers[0]){
            var item = await getServerState(respServer.minecraft_servers[0].display_name, respServer.minecraft_servers[0].port, respServer.minecraft_servers[0].numeric_ip, message.channel);
            const ListEmbed = new Discord.RichEmbed()
            .setColor("#f92f03")
            .setTitle(respServer.minecraft_servers[0].display_name + " status: ");
            ListEmbed.addField("status: ", item);
            message.channel.send(ListEmbed);
        }else{
            message.channel.send("Sorry, couldn't find a server with that shortname, try /listmc for a list of all servers.");
        }
    }
};
/*
function getServerStatus(server, port, ip, channel){
    const request = require('request');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    request(url, function(err, response, body) {
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
        channel.send(status);
    });
}
*/
async function getServerState(server, port, ip){
    var axios = require('axios');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    var response = await axios.get(url);
    response = response.data;
    var status = '*'+server+' server is currently offline*';
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
}