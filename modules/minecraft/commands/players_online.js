module.exports = {
    name: 'players',
    description: 'Used to show which players are online on a server',
    syntax: 'players [short_name]',
    num_args: 1,
    args_to_lower: true,
    async execute(message, args, api) {
        const axios = require('axios');
        const Discord = require('discord.js');
        console.log(">>players_online");
	try {
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });
        } catch(error2){
            console.error(error2);
        }
        console.log("Found a server!");
        if(respServer.minecraft_servers[0].status_api_port.toLowerCase() != "none"){
            var status = await getServerState(respServer.minecraft_servers[0].display_name, respServer.minecraft_servers[0].port, respServer.minecraft_servers[0].numeric_ip, message.channel);
            if(status == "online"){
                console.log("Making listEmbed now!");
                const ListEmbed = new Discord.RichEmbed()
                .setColor("#f92f03")
                .setTitle("List of all players on " + respServer.minecraft_servers[0].display_name + ": ");
                var msg = "Players: ";
                var respPlayers = await axios.get("http://192.168.1.2:" + respServer.minecraft_servers[0].status_api_port + "/player-list", {});
                console.log(respPlayers);
                var isOne = respPlayers.data.players.length == 1;
                var num_players = "There " + (isOne ? "is" : "are") + " " + respPlayers.data.players.length + (isOne ? " player" : " players") + " on " + respServer.minecraft_servers[0].display_name + " server";
                if(respPlayers.data.players.length == 0) {
                    msg += ".";
                } else {
                    msg += ":";
                    for(var player of respPlayers.data.players) {
                        msg += "\n  - " + player.username;
                    }
                }
                ListEmbed.addField(num_players, msg);
                message.channel.send(ListEmbed);
            }
        }else{
            message.channel.send("That server doesn't appear to have status_api mod installed!");
        }
	} catch (error) {
		console.error(error);
    }
    console.log("<<players_online");
}
};


async function getServerState(server, port, ip){
    var axios = require('axios');
    var url = 'http://mcapi.us/server/status?ip='+ip+'&port=' + port;
    var response = await axios.get(url);
    response = response.data;
    var status = 'offline';
    if(response.online) {
        status = 'online';
    }
    console.log("Returning message: "+status);
    return status;
}