module.exports = {
    name: 'bet',
    description: 'Opens up a bet.',
    syntax: 'bet [any] [additional] [arguments]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: true,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api;
        const {MessageButton,MessageActionRow} = require('discord.js');
        const row = new MessageActionRow()
			.addComponents(
				new MessageButton()
					.setCustomId('primary')
					.setLabel('Primary')
					.setStyle('PRIMARY'),
			);

        message.channel.send({content: "Returned!", components: [row]});
    }
}