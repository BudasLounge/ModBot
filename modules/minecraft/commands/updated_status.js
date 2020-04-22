module.exports ={
    name: 'up_status',
    description: 'Finds the status of a minecraft server',
    syntax: 'up_status [name of server]',
    num_args: 1,
    args_to_lower: true,
    async execute(message, args, api){
        const Discord = require('discord.js');
        const mcping = require('mc-ping-updated');
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        } catch(error){
            console.error(error);
        } 
        mcping(respServer.minecraft_servers[0].server_ip, respServer.minecraft_servers[0].port, function(err, res) {
            if (!(typeof err === 'undefined' || err === null)) {
                var ServerStatus = ' server is currently offline';
                console.log(ServerStatus);
            }
            else if (typeof res.players.online === 0) { 
                var ServerStatusNoOne = ' server is **online**  -  *Nobody is playing!*'; 
                console.log(ServerStatusNoOne);
            }
            else if (!(typeof res.players.online === 0)) { 
                var ServerStatusSomeone =  ' server is **online**  -  **'+res.players.online+'** people are playing!'; 
                console.log(ServerStatusSomeone); 
            }
        })
        //console.log(status);
        //message.channel.send(status);
    }
};

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