module.exports = {
    name: 'campaigncreator',
    description: 'Initiates campaign creation for admin approval',
    syntax: 'campaigncreator',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');
        const modalStarter = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("CAMPAIGNCREATOR")
                .setLabel("Click here to start the Campaign Creator tool!")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );

        message.channel.send({content: "Use the button below to start up the campaign creator tool! This will send a campaign request to the admins.\nUpon approval, a category and rooms will be create and a DM role assigned, you can then send invites in the Game-Invites channel.\n\nPlease an admin if you have any questions.",components: [modalStarter]});

    }
};