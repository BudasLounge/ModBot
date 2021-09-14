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
        const {MessageEmbed} = require('discord.js');
        var init_id = message.member.user.id;
        var respCheckServer;
        try{
            respCheckServer = await api.get("bet_config",{
                discord_server_id:message.guild.id
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheckServer.bet_configs[0]){
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
                if(!respCheckBal.bet_points[0].points_total>0){
                    message.channel.send({content : "You don't have enough to bet at all!"});
                    return;
                }
            }else{
                message.channel.send({content: "You need to run /point_start in order to get in the system!"});
                return;
            }
            var serial = makeid(10);
            var init_name = message.member.user.username;
            var bet_amount;
            if(Number.isInteger(parseInt(args[1])) || args[1].charAt(args[1].length-1)==="%"){
                if(Number.isInteger(parseInt(args[1].slice(0,-1))) && args[1].charAt(args[1].length-1)==="%"){
                    percent = parseInt(args[1].slice(0,-1))/100
                    bet_amount = Math.floor(parseInt(respCheckBal.bet_points[0].points_total) * percent);
                    message.channel.send({content: "Created bet with " + bet_amount.toString() + " and percent: " + percent.toString()+" together that is: "+Math.floor(parseInt(respCheckBal.bet_points[0].points_total) * percent).toString()});
                }else {
                    bet_amount = parseInt(args[1]);
                    message.channel.send({content: "No percents here"});
                }
            }else{
                message.channel.send({content: "Please input a valid amount to bet!"});
                return;
            }
            if(respCheckBal.bet_points[0].points_total<bet_amount){
                message.channel.send({content : "You don't have enough to bet that amount!\nHere is your remaining balance: " + respCheckBal.bet_points[0].points_total.toString()});
                return;
            }
            const {MessageButton,MessageActionRow} = require('discord.js');
            const ForBet = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId(serial+"-f"+Math.floor(bet_amount/2))
                        .setLabel('Bet Half ('+Math.floor(bet_amount/2)+")")
                        .setStyle('SUCCESS'),
                    new MessageButton()
                        .setCustomId(serial+"-f"+Math.floor(bet_amount))
                        .setLabel('Bet Equal ('+Math.floor(bet_amount)+")")
                        .setStyle('SUCCESS'),
                    new MessageButton()
                        .setCustomId(serial+"-f"+Math.floor(bet_amount*2))
                        .setLabel('Bet Double ('+Math.floor(bet_amount*2)+")")
                        .setStyle('SUCCESS'),
                );
                const AgainstBet = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId(serial+"-l"+Math.floor(bet_amount/2))
                        .setLabel('Bet Half ('+Math.floor(bet_amount/2)+")")
                        .setStyle('DANGER'),
                    new MessageButton()
                        .setCustomId(serial+"-l"+Math.floor(bet_amount))
                        .setLabel('Bet Equal ('+Math.floor(bet_amount)+")")
                        .setStyle('DANGER'),
                    new MessageButton()
                        .setCustomId(serial+"-l"+Math.floor(bet_amount*2))
                        .setLabel('Bet Double ('+Math.floor(bet_amount*2)+")")
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
                if(respCheckServer.bet_configs[0].point_name.charAt(respCheckServer.bet_configs[0].point_name.length-1) === "s"){
                    respCheckServer.bet_configs[0].point_name = respCheckServer.bet_configs[0].point_name.substring(0, respCheckServer.bet_configs[0].point_name.length-1);
                }
                const outputEmbed = new MessageEmbed()
                .setTitle("New bet created")
                .addField(init_name.toString() + " has placed a bet for: " + bet_amount.toString() + " " + respCheckServer.bet_configs[0].point_name + "s", "Use the buttons below to partake in the bet!");
                await message.reply({content: "New bet", embeds: [outputEmbed], components: [BetWin, ForBet, AgainstBet]});
            }
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