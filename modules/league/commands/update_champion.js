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
        const Discord = require('discord.js');
        var respChamps;
        if(message.member.roles.cache.find(role => role.id === "745067270287392839")){
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
                data[args[2]] = args[3];
                var respUpdate = await api.put("league_champion" , data);
                if(respUpdate.ok == true){
                    const ListEmbed = new Discord.EmbedBuilder()
                        .setColor("#f92f03")
                        .setTitle("Here's what changed: ");
                    this.logger.info("created ListEmbed");
                    var changedInfo = "";
                    changedInfo += "name: " + respChamps.league_champions[0].name + "\n";
                    changedInfo += "role_primary: " + respChamps.league_champions[0].role_primary + "\n";
                    changedInfo += "role_secondary: " + respChamps.league_champions[0].role_secondary + "\n";
                    changedInfo += "\n\nvvvvv has been changed to vvvvv\n\n";
                    changedInfo += "name: " + respUpdate.league_champion.name + "\n";
                    changedInfo += "role_primary: " + respUpdate.league_champion.role_primary + "\n";
                    changedInfo += "role_secondary: " + respUpdate.league_champion.role_secondary + "\n";
                    this.logger.info("filled changedInfo variable");
                    ListEmbed.addFields({ name: "A post function update: ", value: changedInfo, inline: false });
                    message.channel.send({ embeds: [ListEmbed]});
                }
            }catch(error2){
                this.logger.error({error: error2.response});
            }
        }else{
            message.channel.send({ content: "No champion with that name here!"});
        }
    }else{
        message.channel.send({ content: "You don't have permission to use that command!"});
    }
    }
};