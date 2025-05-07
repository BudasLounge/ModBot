module.exports = {
    name: 'whoison',
    description: 'Used to show all players online on all server',
    syntax: 'whoison',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

        const axios = require('axios');
        const { EmbedBuilder } = require('discord.js'); // Updated to EmbedBuilder
        console.log(">>all_players_online");
	try {
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                _limit:20
            });
            console.log(respServer);
        } catch(error2){
            console.error(error2);
        }
        const ListEmbed = new EmbedBuilder() // Updated to EmbedBuilder
            .setColor("#f92f03")
            .setTitle("List of all players on all online servers:");
        for(var i = 0;i<respServer.minecraft_servers.length;i++){
            if(respServer.minecraft_servers[i].status_api_port.toLowerCase() != "none"){
                var status = await getServerState(respServer.minecraft_servers[i].display_name, respServer.minecraft_servers[i].port, respServer.minecraft_servers[i].numeric_ip, message.channel);
                if(status == "online"){
                    var msg = "Players: ";
                    var respPlayers = await axios.get("http://192.168.1.4:" + respServer.minecraft_servers[i].status_api_port + "/player-list", {});
                    console.log(respPlayers);
                    var isOne = respPlayers.data.players.length == 1;
                    var num_players = "There " + (isOne ? "is" : "are") + " " + respPlayers.data.players.length + (isOne ? " player" : " players") + " on " + respServer.minecraft_servers[i].display_name + " server";
                    if(respPlayers.data.players.length == 0) {
                        msg += "no players here!";
                    } else {
                        for(var player of respPlayers.data.players) {
                            msg += "\n  - " + player.username;
                        }
                    }
                    ListEmbed.addFields({ name: num_players, value: msg }); // Updated to addFields with object
                }
            }
        }
        await message.channel.send({ embeds: [ListEmbed]}); // Added await
	} catch (error) {
		console.error(error);
    }
    console.log("<<all_players_online");
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