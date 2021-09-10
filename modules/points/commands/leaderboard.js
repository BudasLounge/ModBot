module.exports = {
    name: 'bet_rank',
    description: 'Returns the leaderboard for this server',
    syntax: 'bet_rank',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require('discord.js');
        var server_id = message.guild.id;
        var respUsers;
        var pointUsers = [];
        try{
            respUsers = await api.get("bet_point",{
                discord_server_id:server_id,
                _limit:200
            });
        }catch(err){
            this.logger.error(err.message);
        }
        var respCheckServer;
        try{
            respCheckServer = await api.get("bet_config",{
                discord_server_id:server_id
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheckServer.bet_configs[0]){
            if(respUsers.bet_points[0]){
                for(var i = 0;i<respUsers.bet_points.length;i++){
                    pointUsers.push([respUsers.bet_points[i].discord_username, respUsers.bet_points[i].points_total]);
                }

                pointUsers.sort(compareSecondColumn);

                function compareSecondColumn(a, b) {
                    if (a[1] === b[1]) {
                        return 0;
                    }
                    else {
                        return (a[1] > b[1]) ? -1 : 1;
                    }
                }
                var output = "Let's see who is in the lead:\n";
                //const ListEmbed = new Discord.MessageEmbed()
                //.setColor("#f92f03")
                //.setTitle("Let's see who is in the lead: ");
                if(respCheckServer.bet_configs[0].point_name.charAt(respCheckServer.bet_configs[0].point_name.length-1) === "s"){
                    respCheckServer.bet_configs[0].point_name = respCheckServer.bet_configs[0].point_name.substring(0, respCheckServer.bet_configs[0].point_name.length-1);
                }
                var stop;
                if(pointUsers.length<25){
                    stop = pointUsers.length;
                }else{
                    stop = 25;
                }
                for(var j=0; j<stop; j++){
                    output += pointUsers[j][0] + ": " + pointUsers[j][1] + " " + respCheckServer.bet_configs[0].point_name + "s\n";
                }
                ListEmbed.addField("The list: ", output);
                message.channel.send(output);
            }else{
                message.channel.send("Hit an error");
                return;
            }
        }else{
            message.channel.send("This server doesn't have a loaded config. Have an admin use /point_start_server to get it loaded.");
        }
    }
}