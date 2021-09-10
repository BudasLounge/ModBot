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
                    return (a[1] < b[1]) ? -1 : 1;
                }
            }
            var output = "";
            const ListEmbed = new Discord.MessageEmbed()
            .setColor("#f92f03")
            .setTitle("Let's see who is in the lead: ");
            for(var j=0; j<pointUsers.length; j++){
                output =+ pointUsers[j][0] + ": " + pointUsers[j][1] + "\n";
            }
            message.channel.send(output);
        }else{
            message.channel.send("Hit an error");
            return;
        }
    }
}