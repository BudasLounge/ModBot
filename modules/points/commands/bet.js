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
        var init_id = message.member.user.id;
        var respCheckBal;
        try{
            respCheckBal = await api.get("bet_point",{
                discord_user_id:init_id,
                discord_server_id:message.guild.id
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheckBal.bet_points[0]){
            if(!respCheckBal.bet_points[0]>0){
                message.channel.send({content : "You don't have enough to do that bet!"});
                return;
            }
        }else{
            message.channel.send({content: "You need to run /point_start in order to get in the system!"});
            return;
        }




        var serial = makeid(10);
        var init_name = message.member.user.username;
        var bet_amount;
        if(Number.isInteger(parseInt(args[1].slice(0,-1)))){
            
        }
        if(Number.isInteger(parseInt(args[1])))


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
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}