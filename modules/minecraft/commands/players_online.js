module.exports = {
    name: 'players',
    description: 'Used to show which players are online on a server',
    syntax: 'players [short_name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

        const axios = require('axios');
        const { EmbedBuilder } = require('discord.js'); // Updated to EmbedBuilder
        const {getStatus} = require("mc-server-status");
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
            var status;
            var flag = false;
            try{
                status = await getStatus(respServer.minecraft_servers[0].server_ip); // Corrected index from i to 0
            }catch(status_error){
                this.logger.error(status_error + ", setting flag to true");
                status = respServer.minecraft_servers[0].display_name + " is currently offline!\n\n";
                flag = true;
            }
            if(!flag){
                console.log("Making listEmbed now!");
                const ListEmbed = new EmbedBuilder() // Updated to EmbedBuilder
                .setColor("#f92f03")
                .setTitle("List of all players on " + respServer.minecraft_servers[0].display_name + ": ");
                var msg = "Players: ";
                var respPlayers = await axios.get(`http://${respServer.minecraft_servers[0].numeric_ip}:` + respServer.minecraft_servers[0].status_api_port + "/player-list", {});
                console.log(respPlayers);
                var isOne = respPlayers.data.players.length == 1;
                var num_players = "There " + (isOne ? "is" : "are") + " " + respPlayers.data.players.length + (isOne ? " player" : " players") + " on " + respServer.minecraft_servers[0].display_name + " server";
                if(respPlayers.data.players.length == 0) {
                    msg += "None";
                } else {
                    for(var player of respPlayers.data.players) {
                        msg += "\n" + player.username;
                    }
                }
                ListEmbed.addFields({ name: num_players, value: msg }); // Updated to addFields with object
                await message.channel.send({ embeds: [ListEmbed]}); // Added await
            }else{
                await message.channel.send({ content: "That server doesn't appear to be online right now!"}); // Added await
            }
        }else{
            await message.channel.send({ content: "That server doesn't appear to have status_api mod installed!"}); // Added await
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