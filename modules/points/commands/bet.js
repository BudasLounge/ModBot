module.exports = {
    name: 'bet',
    description: 'Opens up a bet.',
    syntax: 'bet [amount/percentage] [reason for bet]',
    num_args: 2,//minimum amount of arguments to accept
    args_to_lower: true,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const moment = require('moment');
        const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        var api = extra.api;
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
            var init_name = message.member.user.username;
            var bet_amount;
            if(Number.isInteger(parseInt(args[1])) || args[1].charAt(args[1].length-1)==="%"){
                if(Number.isInteger(parseInt(args[1].slice(0,-1))) && args[1].charAt(args[1].length-1)==="%"){
                    percent = parseInt(args[1].slice(0,-1))/100
                    bet_amount = Math.floor(parseInt(respCheckBal.bet_points[0].points_total) * percent);
                }else {
                    bet_amount = parseInt(args[1]);
                }
            }else{
                message.channel.send({content: "Please input a valid amount to bet!"});
                return;
            }
            if(respCheckBal.bet_points[0].points_total<bet_amount){
                message.channel.send({content : "You don't have enough to bet that amount!\nHere is your remaining balance: " + respCheckBal.bet_points[0].points_total.toString()});
                return;
            }
            var flag = true;
            var serial = makeid(10);
            var respCheckBet;
            while(flag){
                this.logger.info("In while loop");
                try{
                    respCheckBet = await api.get("bet_master",{
                        serial:serial
                    })
                }catch(err){
                    this.logger.error(err.message);
                }
                this.logger.info(respCheckBet);
                if(!respCheckBet.bet_masters[0]){
                    flag = false;
                }else{
                    serial = await makeid(10);
                }
            }
            var now = moment();
            var closing_time = now.add(parseInt(respCheckServer.bet_configs[0].bet_buyin_time), 'minutes');
            args.shift();
            args.shift();
            var reason = args.join(" ");
            var respUploadMaster;
            try{
                respUploadMaster = await api.post("bet_master",{
                    serial:serial,
                    initiator_discord_id:init_id,
                    initiator_discord_username:message.member.user.username,
                    status:"open",
                    bet_reason:reason,
                    bet_closing_time:closing_time.unix().toString()
                })
            }catch(err){
                this.logger.error(err.message);
            }
            

            var new_bal = respCheckBal.bet_points[0].points_total-bet_amount;
            //message.channel.send({content: "Updating a bet, here is the data: " + respCheckBal.bet_points[0].point_id + " " + respCheckBal.bet_points[0].discord_server_id.toString() + " " + respCheckBal.bet_points[0].discord_user_id.toString() + " " + new_bal.toString()})
            var respBalUpdate;
            try{
                respBalUpdate = await api.put("bet_point",{
                    point_id:parseInt(respCheckBal.bet_points[0].point_id),
                    discord_server_id:respCheckBal.bet_points[0].discord_server_id,
                    discord_user_id:respCheckBal.bet_points[0].discord_user_id,
                    points_total:parseInt(new_bal)
                })
            }catch(err){
                this.logger.error(err.message)
                return;
            }

            var respUploadInteraction;
            try{
                respUploadInteraction = await api.post("bet_interaction",{
                    bet_value:parseInt(bet_amount),
                    serial:serial,
                    bet_stance:"for",
                    better_discord_id:init_id,
                    better_discord_username:message.member.user.username
                })
            }catch(err){
                this.logger.info(err.message);
            }
            this.logger.info(respUploadInteraction);

            const ForBet = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-fh"+Math.ceil(bet_amount/2))
                        .setLabel('Bet Half ('+Math.ceil(bet_amount/2)+")")
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-fe"+Math.floor(bet_amount))
                        .setLabel('Bet Equal ('+Math.floor(bet_amount)+")")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-fd"+Math.floor(bet_amount*2))
                        .setLabel('Bet Double ('+Math.floor(bet_amount*2)+")")
                        .setStyle(ButtonStyle.Success),
                );
                const AgainstBet = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-lh"+Math.ceil(bet_amount/2))
                        .setLabel('Bet Half ('+Math.ceil(bet_amount/2)+")")
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-le"+Math.floor(bet_amount))
                        .setLabel('Bet Equal ('+Math.floor(bet_amount)+")")
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-ld"+Math.floor(bet_amount*2))
                        .setLabel('Bet Double ('+Math.floor(bet_amount*2)+")")
                        .setStyle(ButtonStyle.Danger),
                );
                const BetWin = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-fw")
                        .setLabel('Creator Won')
                        .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-al")
                        .setLabel('Creator Lost')
                        .setStyle(ButtonStyle.Danger),
                );
                const BetUtils = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-bl")
                        .setLabel("Who's in this bet?")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("BETS-"+serial+"-bd")
                        .setLabel("Delete Bet")
                        .setStyle(ButtonStyle.Secondary),
                )
                const SelectMenu = new ActionRowBuilder()
			    .addComponents(
				    new StringSelectMenuBuilder()
                        .setCustomId("BETS-"+'select')
                        .setPlaceholder('Select a bet amount')
                        .setDisabled(true)
                        .addOptions([
						{
							label: Math.floor(bet_amount*1.25).toString(),
							description: 'For - 125%',
							value: 'first_option',
						},
						{
							label: Math.floor(bet_amount*1.25).toString(),
							description: 'Against - 125%',
							value: 'second_option',
						},
                        {
							label: Math.floor(bet_amount*1.5).toString(),
							description: 'For - 150%',
							value: 'third_option',
						},
						{
							label: Math.floor(bet_amount*1.5).toString(),
							description: 'Against - 150%',
							value: 'fourth_option',
						},
                        {
							label: Math.floor(bet_amount*1.75).toString(),
							description: 'For - 175%',
							value: 'fifth_option',
						},
						{
							label: Math.floor(bet_amount*1.75).toString(),
							description: 'Against - 175%',
							value: 'sixth_option',
						},
                        {
							label: Math.floor(bet_amount*2).toString(),
							description: 'For - 200%',
							value: 'seventh_option',
						},
						{
							label: Math.floor(bet_amount*2).toString(),
							description: 'Against - 200%',
							value: 'eigth_option',
						},
					]),
			);
                if(respCheckServer.bet_configs[0].point_name.charAt(respCheckServer.bet_configs[0].point_name.length-1) === "s"){
                    respCheckServer.bet_configs[0].point_name = respCheckServer.bet_configs[0].point_name.substring(0, respCheckServer.bet_configs[0].point_name.length-1);
                }
                const outputEmbed = new EmbedBuilder()
                .setTitle("New bet created")
                .addFields({ name: init_name.toString() + " has placed a bet for: " + bet_amount.toString() + " " + respCheckServer.bet_configs[0].point_name + "s", value: "The subject of the bet is: \n" + reason})
                .addFields({ name: "Use the buttons below to partake in the bet!", value: "Green means you agree, red means you disagree"})
                await message.reply({embeds: [outputEmbed], components: [BetWin, ForBet, AgainstBet, BetUtils, SelectMenu], content: "Reference number: " + serial + "\nThe bet will close: <t:"+ closing_time.unix().toString()+":R>"});
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