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
        const { Events, Modal } = require('discord.js');

		const modal = new Modal()
			.setCustomId('myModal')
			.setTitle('My Modal');


    }
};