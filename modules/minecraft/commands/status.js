module.exports ={
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status "name of server"',
    num_args: 1,
    execute(message, args, mod_handler){
        for(var server in serverlist.servers){
            if(server == messageArr[1]){
                getServerStatus(serverlist.servers[server].displayname, serverlist.servers[server].port, serverlist.servers[server].ip, message.channel);
                return;
            }
        }
        message.channel.send("Could not find a server with name: "+messageArr[1]);
    }
};
function getServerStatus(server, port, ip, channel){
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