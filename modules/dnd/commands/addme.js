module.exports = {
    name: 'addme_dnd',
    description: 'Adds you to the dnd database',
    syntax: 'addme_dnd',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        try{
            var respPlayer = await api.post("dnd_player", {
                discord_id: message.member.id,
                is_dm: 0
            });
        }catch(error2){
            this.logger.error(error2);
        }
        var respFound;
        try{
            respFound = await api.get("dnd_player", {
                discord_id: message.member.id
            });
        }catch(error){
            this.logger.error(error);
        }
        if(respFound.dnd_players[0]){
            message.channel.send("Found a player with the id of: " + respFound.dnd_players[0].discord_id);
        }
    }
};
