module.exports ={
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status [name of server]',
    num_args: 1,
    async execute(message, args, api){
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        } catch(error){
            console.error(error);
        } 
        getServerStatus(respServer.minecraft_servers[0].display_name, respServer.minecraft_servers[0].port, respServer.minecraft_servers[0].numeric_ip, message.channel);
    }
};

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