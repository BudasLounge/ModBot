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
        var serial = makeid(10);
        const {MessageButton,MessageActionRow} = require('discord.js');
        const row = new MessageActionRow()
			.addComponents(
				new MessageButton()
					.setCustomId(serial)
					.setLabel('Primary')
					.setStyle('PRIMARY'),
			);

        await message.reply({content: "Returned!", components: [row]});
    }
}

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}