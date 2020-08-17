module.exports = {
    name: 'list_champs',
    description: 'returns all league champions',
    syntax: 'list_champs',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var respChamps;
        try{
            respChamps = await api.get("league_champion",{
                _limit: 150
            });
        } catch(error){
            this.logger.error(error.response);
        }
        var output = "";
        for(var i = 1; i<respChamps.league_champions.length;i++){
            output += respChamps.league_champions[i].name + "\n";
        }
        try{
            extra.message_helper.send(output);
            message.channel.send(output);
        } catch(error2){
            this.logger.error(error2.response);
        }
    }
};