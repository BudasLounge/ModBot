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
                .setLabel("Click here to start the Campaign Creator tool")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );

        message.channel.send({components: [modalStarter]});

    }
};