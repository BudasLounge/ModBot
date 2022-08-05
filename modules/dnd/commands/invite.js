module.exports = {
    name: 'invite',
    description: 'Invites a player to your campaign. (must be sent from within the actual campaign folder)',
    syntax: 'invite [@player]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

        var respFoundPlayer;
        var respFoundCampaign;
        var respPlayersInCampaign;

        var invitedPlayer = message.mentions.users.first().id
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
                dm_id: message.member.id
            })
        }catch(error2){
            this.logger.error(error2.message)
        }

        if(!respFoundCampaign.dnd_campaigns[0]){
            message.channel.send({content: "I can't find a campaign linked for you. Ask an admin to help you get started!"});
            return;
        }
        /*if(!message.channel.parent.id === respFoundCampaign.dnd_campaigns[0].category_id){
            message.channel.send({content: "Make sure to invite players from within your campaign's designated area."});
            return;
        }*/

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
                    .setCustomId("ID-"+invitedPlayer+"-A")
                    .setLabel('Accept')
                    .setStyle('SUCCESS'),
                new MessageButton()
                    .setCustomId("ID-"+invitedPlayer+"-D")
                    .setLabel('Deny')
                    .setStyle('DANGER'),
            )

        const outputEmbed = new MessageEmbed()
        .setTitle( "<@" + invitedPlayer + "> " + ",you have been invited to play!")
        .addField(message.author.name + "has invited you to play in their campaign: " + respFoundCampaign.dnd_campaigns[0].module)
        .addField("Please choose to accept or deny this request from the buttons below.")
        message.guild.channels.cache.get("1005137919662629004").send({embeds: [outputEmbed], components: [row]});
    }
};