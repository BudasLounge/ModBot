module.exports = {
    name: 'update_champ',
    description: 'updates information about a champion',
    syntax: 'update_champ [champion name] [field to edit] [new information]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var respChamps;
        try{
            respChamps = await api.get("league_champion",{
                name: args[1]
            });
        } catch(error){
            this.logger.error(error.response);
        }
        if(respChamps.league_champions[0]){
            var respUpdated;
            try{
                respUpdated = await api.get("league_champion",{

                });
            }catch{

            }
        }else{
            message.channel.send("No chamion with that name here!");
        }
    }
};