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
        this.logger.info("[update_champ] Execute called", { userId: message.member?.id, argsLength: args.length });

        const hasPrivilegedRole = message.member.roles.cache.find(role => role.id === "745067270287392839" || role.name === "Moderator");
        if(hasPrivilegedRole){
        if (!args[1] || !args[2] || !args[3]) {
            message.channel.send({ content: "Usage: /update_champ [champion name] [field to edit] [new information]"});
            return;
        }

        const allowedFields = ["name", "role_primary", "role_secondary", "ad_ap"];
        if (!allowedFields.includes(args[2])) {
            message.channel.send({ content: "You can only edit: name, role_primary, role_secondary, ad_ap"});
            return;
        }

        const updatedValue = args.slice(3).join(" ").trim();
        if (!updatedValue) {
            message.channel.send({ content: "New value cannot be empty."});
            return;
        }

        if (args[2] === "ad_ap" && updatedValue !== "ad" && updatedValue !== "ap") {
            message.channel.send({ content: "ad_ap must be either 'ad' or 'ap'."});
            return;
        }

        try{
            respChamps = await api.get("league_champion",{
                name: args[1]
            });
        } catch(error){
            this.logger.error("[update_champ] Failed champion lookup", { error: error?.response || error?.message || error });
            message.channel.send({ content: "I couldn't find that champion right now. Please try again."});
            return;
        }
        if(respChamps && respChamps.league_champions && respChamps.league_champions[0]){
            this.logger.info("[update_champ] Champion found", { champion: respChamps.league_champions[0].name });
            try{
                var data = {name: respChamps.league_champions[0].name};
                data[args[2]] = updatedValue;
                var respUpdate = await api.put("league_champion" , data);
                if(respUpdate && respUpdate.ok === true){
                    const ListEmbed = new Discord.EmbedBuilder()
                        .setColor("#f92f03")
                        .setTitle("Here's what changed: ");
                    this.logger.info("[update_champ] Building change summary embed", { champion: respChamps.league_champions[0].name, field: args[2] });
                    var changedInfo = "";
                    changedInfo += "name: " + respChamps.league_champions[0].name + "\n";
                    changedInfo += "role_primary: " + respChamps.league_champions[0].role_primary + "\n";
                    changedInfo += "role_secondary: " + respChamps.league_champions[0].role_secondary + "\n";
                    changedInfo += "\n\nvvvvv has been changed to vvvvv\n\n";
                    changedInfo += "name: " + respUpdate.league_champion.name + "\n";
                    changedInfo += "role_primary: " + respUpdate.league_champion.role_primary + "\n";
                    changedInfo += "role_secondary: " + respUpdate.league_champion.role_secondary + "\n";
                    changedInfo += "ad_ap: " + respUpdate.league_champion.ad_ap + "\n";
                    this.logger.info("[update_champ] Change summary prepared", { champion: respUpdate.league_champion.name });
                    ListEmbed.addFields({ name: "A post function update: ", value: changedInfo, inline: false });
                    message.channel.send({ embeds: [ListEmbed]});
                } else {
                    message.channel.send({ content: "Update failed. Please try again."});
                }
            }catch(error2){
                this.logger.error("[update_champ] Failed champion update", { error: error2?.response || error2?.message || error2 });
                message.channel.send({ content: "Update failed. Please try again."});
            }
        }else{
            message.channel.send({ content: "No champion with that name here!"});
        }
    }else{
        message.channel.send({ content: "You don't have permission to use that command!"});
    }
    }
};