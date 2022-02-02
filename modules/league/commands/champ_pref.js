module.exports = {
    name: 'approve_champ',
    description: 'Approves the champion for your custom champ pool',
    syntax: 'approve_champ [champion name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        
        const Discord = require('discord.js');
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
                var respUpdate = await api.post("league_pref_champ" , {
                    champ_name: args[1],
                    user_id:message.member.id
                });
                this.logger.info(respUpdate);
                if(respUpdate.ok == true){
                    message.channel.send({ content: respChamps.league_champions[0].name.toString() + " is now <@" + message.member.id.toString() + "> approved"});
                }
            }catch(error2){
                this.logger.error({error: error2.response});
            }
        }else{
            message.channel.send({ content: "No champion with that name here!"});
        }
    }
};