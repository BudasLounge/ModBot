module.exports = {
    name: 'list_champs',
    description: 'returns all league champions',
    syntax: 'list_champs [name]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require('discord.js');
        var respChamps;
        if(args[1]){
            try{
                respChamps = await api.get("league_champion",{
                    name: args[1]
                });
            } catch(error2){
                this.logger.error(error2.response);
            }
            if(respChamps.league_champions[0]){
                var output = "Champion: " + respChamps.league_champions[0].name + "\nPrimary role: " + respChamps.league_champions[0].role_primary + "\nSecondary role: " + respChamps.league_champions[0].role_secondary;
                message.author.send(output);
            }else{
                message.author.send("Couldn't find a champion by that name!");
            }
        }
        else{
            try{
                respChamps = await api.get("league_champion",{
                    _limit: 150
                });
            } catch(error){
                this.logger.error(error.response);
            }
            var output = "Champion | Primary Role | Secondary Role\n";
            for(var i = 1; i<respChamps.league_champions.length;i++){
                output += respChamps.league_champions[i].name + " - " + respChamps.league_champions[i].role_primary + "/" +respChamps.league_champions[i].role_secondary +"\n";
            } 
            message.author.send(output, {split:true});
            /*const ListEmbed = new Discord.RichEmbed()
                .setColor("#f92f03")
                .setTitle("A list of all champions: ");
                ListEmbed.addField("A post function update: ", output);
                MessageHelper.send(output);
        */
        }
        message.channel.send("Sent a PM!");
    }
};