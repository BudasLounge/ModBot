module.exports = {
    name: 'update_cella',
    description: 'adds the is_cella tag to a champion',
    syntax: 'update_cella [champion name]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require('discord.js');
        if(message.sender == "459248333299515392" || message.sender == "185223223892377611"){
        var respChamps;
        try{
            respChamps = await api.get("league_champion",{
                name: args[1]
            });
        } catch(error){
            this.logger.error(error.response);
        }
        if(respChamps.league_champions[0]){
            this.logger.info("Found a champion");
            try{
                var data = {name: respChamps.league_champions[0].name};
                data[args[2]] = 1;
                var respUpdate = await api.put("league_champion" , data);
                if(respUpdate.ok == true){
                    message.channel.send(respChamps.league_champions[0].name + " is now Cella approved");
                }
            }catch(error2){
                this.logger.error({error: error2.response});
            }
        }else{
            message.channel.send("No champion with that name here!");
        }
    }
}
};