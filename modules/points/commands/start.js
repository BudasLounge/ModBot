module.exports = {
    name: 'point_start',
    description: 'Grants access to the point system. User ID is collected',
    syntax: 'point_start',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var init_id = message.member.id;
        var server_id = message.guild.id;

        var respCheck;
        try{
            respCheck = await api.get("bet_point",{
                discord_user_id:init_id,
                discord_server_id:server_id
            });
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheck.bet_points[0]){
            message.channel.send("You are already in the system!");
            return;
        }

        var respNew;
        try{
            respNew = await api.post("bet_point",{
                discord_user_id:init_id,
                discord_server_id:server_id,
                points_total:100
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respNew.ok){
            message.channel.send("<@" + message.member.id + ">, you have received 100 points and are now in the system. Have fun!");
        }else{
            message.channel.send("There was an error.");
        }
    }
}