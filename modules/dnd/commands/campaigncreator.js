module.exports = {
    name: 'campaigncreator',
    description: 'Initiates campaign creation for admin approval',
    syntax: 'campaigncreator',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    options: [],
    async execute(message, args, extra) {
        var api = extra.api;
        const {ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle} = require('discord.js');
        const modalStarter = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("CAMPAIGNCREATOR")
                .setLabel("Click here to start the Campaign Creator tool!")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        const outputEmbed = new EmbedBuilder()
        .setTitle("Campaign Creator tool!")
        .addFields({ name: "Click the button below", value: "Use the button below to start up the campaign creator tool! This will send a campaign request to the admins.\nUpon approval, a category and rooms will be create and a DM role assigned, you can then send invites in the Game-Invites channel.\n\nPlease an admin if you have any questions."});
        message.channel.send({embeds: [outputEmbed],components: [modalStarter]});

    }
};