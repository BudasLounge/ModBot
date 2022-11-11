module.exports = {
    name: 'invite',
    description: 'Invites a player to your campaign. (must be sent from within the actual campaign folder)',
    syntax: 'invite [@player] [name of campaign]',
    num_args: 2,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        if(!args[2]){
            await message.reply({content: "You did not enter enough information, try this:\n,invite [@player] [name of campaign]"})
            message.delete()
            return;
        }
        var api = extra.api;
        const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

        var respFoundPlayer;
        var respFoundCampaign;
        var respPlayersInCampaign;

        var invitedPlayer = message.mentions.users.first().id

        args.shift()
        args.shift()
        var campaign_name = args.join(" ")
        //validate that the DM is in the player database
        try{
            respFoundPlayer = await api.get("dnd_player", {
                discord_id: message.member.id
            });
        }catch(error){
            this.logger.error(error.message);
        }

        if(!respFoundPlayer.dnd_players[0]){
            message.channel.send({ content: "It seems you are not in the player database yet. Re-read the rules and follow the instructions!"});
            return;
        }

        //validate that a campaign exists for the DM inviting players (NEED TO ADD FUNCTIONALITY FOR IF THE DM HAS MULTIPLE CAMPAIGNS)
        try{
            respFoundCampaign = await api.get("dnd_campaign",{
                dm_id: message.member.id,
                module:campaign_name
            })
        }catch(error2){
            this.logger.error(error2.message)
        }

        if(!respFoundCampaign.dnd_campaigns[0]){
            message.channel.send({content: "I can't find a campaign linked with that information, double check spellings and try again. Ask an admin to help you get started!"});
            return;
        }

        //check if the invited player already is in the campaign they are being invited to
        try{
            respPlayersInCampaign = await api.get("dnd_players_in_campaign",{
                campaign_id:respFoundCampaign.dnd_campaigns[0].campaign_id,
                discord_id: invitedPlayer
            })
        }catch(error3){
            this.logger.error(error3.message)
        }

        if(respPlayersInCampaign.dnd_players_in_campaigns[0]){
            message.channel.send({content: "This player is already a part of this campaign!"});
            return;
        }


        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("ID-"+invitedPlayer+"_A"+respFoundCampaign.dnd_campaigns[0].campaign_id)
                    .setLabel('Accept')
                    .setStyle('SUCCESS'),
                new MessageButton()
                    .setCustomId("ID-"+invitedPlayer+"_D"+respFoundCampaign.dnd_campaigns[0].campaign_id)
                    .setLabel('Deny')
                    .setStyle('DANGER'),
            )

        const outputEmbed = new MessageEmbed()
        .setTitle(message.member.user.username + " has invited you to play in their campaign: " + respFoundCampaign.dnd_campaigns[0].module)
        .addField("You have been invited to play!", "Please choose to accept or deny this request from the buttons below.")
        message.guild.channels.cache.get("1005137919662629004").send({embeds: [outputEmbed], content: "<@" + invitedPlayer + ">", components: [row]});
        message.delete()
    }
};