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
                
            });
        } catch(error){
            this.logger.error(error.response);
        }
        var seed = (Math.floor(Math.random() * 150) + 1);
        try{
            message.channel.send(respChamps.league_champions[seed].name);
        } catch(error2){
            this.logger.error(error2.response);
        }
    }
};