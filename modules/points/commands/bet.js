module.exports = {
    name: 'bet',
    description: 'Opens up a bet.',
    syntax: 'bet [any] [additional] [arguments]',
    num_args: 2,//minimum amount of arguments to accept
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
        if(args[1]){
            if(Number.isInteger(parseInt(args[1].slice(0,-1)))){
                
            }
            if(Number.isInteger(parseInt(args[1]))){

            }
        }

        const {MessageButton,MessageActionRow} = require('discord.js');
        const ForBet = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(serial+"for")
                    .setLabel('For Bet')
                    .setStyle('SUCCESS'),
            );
            const AgainstBet = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(serial+"against")
                    .setLabel('Against Bet')
                    .setStyle('DANGER'),
            );
            const BetWin = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(serial+"w")
                    .setLabel('Creator Won')
                    .setStyle('SUCCESS'),
                    new MessageButton()
                    .setCustomId(serial+"l")
                    .setLabel('Creator Lost')
                    .setStyle('DANGER'),
            );

        await message.reply({content: "Returned!", components: [BetWin, ForBet, AgainstBet]});
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