module.exports = {
    name: 'players',
    description: 'Used to show which players are online on a server',
    syntax: 'players [short_name]',
    num_args: 1,
    args_to_lower: true,
    async execute(message, args, api) {
        const axios = require(axios);
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
        
        var msg = "";
        var respPlayers = await axios.get("http://192.168.1.2:" + respServer.minecraft_servers[0].status_api_port + "/player-list", {});
        console.log(respPlayers);
        var isOne = respPlayers.data.players.length == 1;
        msg += "There " + (isOne ? "is" : "are") + " " + respPlayers.data.players.length + (isOne ? " player" : " players") + " on " + serverlist.servers[server].displayname + " server";
        if(respPlayers.data.players.length == 0) {
            msg += ".";
        } else {
            msg += ":";
            for(var player of respPlayers.data.players) {
                msg += "\n  - " + player.username;
            }
        }
        message.channel.send(msg);
	} catch (error) {
		console.error(error);
	}
}
};