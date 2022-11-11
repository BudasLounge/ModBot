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
        const { MessageActionRow, Modal, TextInputComponent } = require('discord.js');
        
		const modal = new Modal()
			.setCustomId('myModal')
			.setTitle('My Modal');
            const favoriteColorInput = new TextInputComponent()
			.setCustomId('favoriteColorInput')
		    // The label is the prompt the user sees for this input
			.setLabel("What's your favorite color?")
		    // Short means only a single line of text
			.setStyle('SHORT');
		const hobbiesInput = new TextInputComponent()
			.setCustomId('hobbiesInput')
			.setLabel("What's some of your favorite hobbies?")
		    // Paragraph means multiple lines of text.
			.setStyle('PARAGRAPH');
		// An action row only holds one text input,
		// so you need one action row per text input.
		const firstActionRow = new MessageActionRow().addComponents(favoriteColorInput);
		const secondActionRow = new MessageActionRow().addComponents(hobbiesInput);
		// Add inputs to the modal
		modal.addComponents(firstActionRow, secondActionRow);
		// Show the modal to the user
		await interaction.showModal(modal);

    }
};