var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

async function onButtonClick(button){
if (button.isButton() || button.isSelectMenu()){
    if(!(button.customId.substring(0,4)==="BETS")) return;
    button.channel.send(button.customId.substring(0,4))
if(button.isButton()){
    const moment = require("moment");
    button.customId = button.customId.substr(4)
    button.channel.send(button.customId)
    var serial = button.customId.substring(0,10);
    var stance = await button.customId.substring(button.customId.indexOf('-')+1, button.customId.indexOf('-')+3);
    var bet_amount = 0;
    var respCheckMaster;
    try{
        respCheckMaster = await api.get("bet_master",{
            serial:serial
        })
    }catch(err){
        this.logger.error(err.message);
    }
    if(stance === "fw" || stance === "al" || stance === "bl" || stance === "bd"){

    }else{
        var now = moment();
        var close_time = moment.unix(respCheckMaster.bet_masters[0].bet_closing_time);
        if(now.isAfter(close_time)){
            button.channel.send({content: button.user.username + ", the time window for joining this bet has closed!"});
            return;
        }
    }
    if(stance === "fw" || stance === "al"){
        if(button.user.id != respCheckMaster.bet_masters[0].initiator_discord_id){
            button.channel.send({content: button.user.username + ", only the bet initiator can determine if they won or lost. If you feel there has been an issue, contact an admin."});
            return;
        }
        if(respCheckMaster.bet_masters[0].status === "closed"){
            button.channel.send({content: button.user.username + ", this bet has already been decided and payed out. If you feel there has been an issue, contact an admin."})
            return;
        }
        var forBet = [];
        var againstBet = [];
        var pot = 0;
        var winTotal = 0;
        var respCheckAllInt;
        var respCheckBal;
        try{
            respCheckAllInt = await api.get("bet_interaction",{
                _limit: 400,
                serial:serial
            })
        }catch(err){
            console.log(err.message);
        }
        //this.logger.info(respCheckAllInt.bet_interactions[0]);
        if(respCheckAllInt.bet_interactions[0]){
            if(respCheckAllInt.bet_interactions.length<2){
                button.channel.send({content: "At least 2 people need to participate in this bet in order to pay out."});
                return;
            }
            for(var i = 0;i<respCheckAllInt.bet_interactions.length;i++){
                if(respCheckAllInt.bet_interactions[i].bet_stance === "for"){
                    forBet.push(respCheckAllInt.bet_interactions[i])
                    pot += parseInt(respCheckAllInt.bet_interactions[i].bet_value)
                }else{
                    againstBet.push(respCheckAllInt.bet_interactions[i])
                    pot += parseInt(respCheckAllInt.bet_interactions[i].bet_value)
                }
            }
        }else{
            button.channel.send({content: "Did not find"});
        }
        var output = "";
        if(stance === "fw"){
            if(forBet.length===0){
                output+="Looks like no one won this time!";
            }else{
                for(var l = 0;l<forBet.length;l++){
                    try{
                        var respWinBal = await api.get("bet_point",{
                            discord_user_id:forBet[l].better_discord_id,
                            discord_server_id:button.guild.id
                        })
                    }catch(err){
                        console.log(err.message)
                    }
                    winTotal += parseInt(forBet[l].bet_value)
                }
                for(var l = 0;l<forBet.length;l++){
                    try{
                        var respWinBal = await api.get("bet_point",{
                            discord_user_id:forBet[l].better_discord_id,
                            discord_server_id:button.guild.id
                        })
                    }catch(err){
                        console.log(err.message)
                    }
                    pot -= parseInt(forBet[l].bet_value)
                }
                for(var j = 0;j<forBet.length;j++){
                    try{
                        var respWinBal = await api.get("bet_point",{
                            discord_user_id:forBet[j].better_discord_id,
                            discord_server_id:button.guild.id
                        })
                    }catch(err){
                        console.log(err.message)
                    }
                    var winnings = Math.round((parseInt(forBet[j].bet_value)/parseInt(winTotal)) * parseInt(pot))
                    /*button.channel.send({content: "Here is the equation: Bet Value " + forBet[j].bet_value.toString() + "/ Win Total " + winTotal.toString() + " times the pot of " + pot.toString()})
                    button.channel.send({content: "Winnings after equation: " + winnings.toString() + " and here was the percentage: " + (parseInt(forBet[j].bet_value)/parseInt(winTotal))})*/
                    var new_bal = parseInt(respWinBal.bet_points[0].points_total) + parseInt(forBet[j].bet_value) + parseInt(winnings)
                    //button.channel.send({content: "New_bal after equation: " + new_bal.toString()})
                    try{
                        var respWin = await api.put("bet_point",{
                            point_id:parseInt(respWinBal.bet_points[0].point_id),
                            discord_user_id:forBet[j].better_discord_id,
                            discord_server_id:button.guild.id,
                            points_total:parseInt(new_bal)
                        })
                    }catch(err){
                        console.log(err);
                    }
                    output += forBet[j].better_discord_username + " added " + winnings + " to their wealth\n";
                }
            }            button.channel.send({content: "Bet with total pot of: " + pot + ". Which had " + forBet.length + " for it and " + againstBet.length + " against it. The winners will split: " + winTotal.toString()});
            const listWinners = new EmbedBuilder()
            .setColor("#f92f03")
            .setTitle("Here are the winners of this bet: ")
            .addFields({ name: "Winners: ", value: output.toString(), inline: false });

            button.channel.send({embeds: [listWinners] });
        }else{
            if(againstBet.length === 0){
                output+="Looks like no one won this time!";
            }else{
                for(var l = 0;l<againstBet.length;l++){
                    try{
                        var respWinBal = await api.get("bet_point",{
                            discord_user_id:againstBet[l].better_discord_id,
                            discord_server_id:button.guild.id
                        })
                    }catch(err){
                        console.log(err.message)
                    }
                    winTotal += parseInt(againstBet[l].bet_value)
                }
                for(var l = 0;l<againstBet.length;l++){
                    try{
                        var respWinBal = await api.get("bet_point",{
                            discord_user_id:againstBet[l].better_discord_id,
                            discord_server_id:button.guild.id
                        })
                    }catch(err){
                        console.log(err.message)
                    }
                    pot -= parseInt(againstBet[l].bet_value)
                }
                for(var k = 0;k<againstBet.length;k++){
                    try{
                        var respWinBalL = await api.get("bet_point",{
                            discord_user_id:againstBet[k].better_discord_id,
                            discord_server_id:button.guild.id
                        })
                    }catch(err){
                        console.log(err.message)
                    }
                    var winnings = Math.round((parseInt(againstBet[k].bet_value)/parseInt(winTotal)) * parseInt(pot))
                    var new_bal = parseInt(respWinBalL.bet_points[0].points_total) + parseInt(againstBet[k].bet_value) + parseInt(winnings)
                    try{
                        var respWin = await api.put("bet_point",{
                            point_id:parseInt(respWinBalL.bet_points[0].point_id),
                            discord_user_id:againstBet[k].better_discord_id,
                            discord_server_id:button.guild.id,
                            points_total:parseInt(new_bal)
                        })
                    }catch(err){
                        console.log(err);
                    }
                    output += againstBet[k].better_discord_username + " added " + winnings.toString() + " to their wealth\n";
                }
            }
            button.channel.send({content: "Bet with total pot of: " + pot + ". Which had " + forBet.length + " for it and " + againstBet.length + " against it. The winners will split: " + winTotal.toString()});            const listWinners = new EmbedBuilder()
            .setColor("#f92f03")
            .setTitle("Here are the winners of this bet: ")
            .addFields({ name: "Winners: ", value: output.toString(), inline: false });

            button.channel.send({embeds: [listWinners] });
        }
        try{
            var respUploadMaster = await api.put("bet_master",{
                serial:serial,
                status:"closed"
            })
        }catch(err){
            console.log(err.message)
        }
        button.deferUpdate();
        return;
    }else if(stance === "bl"){
        if(stance === "bl"){
            try{
                var respLog = await api.get("bet_interaction",{
                    _limit:400,
                    serial:serial
                })
            }catch(err){
                console.log(err.message)
            }
            var forOutput = "";
            var againstOutput = "";
            var forCount = 0;
            var againstCount = 0;
            if(respLog.bet_interactions[0]){
                for(var i = 0;i<respLog.bet_interactions.length;i++){
                    if(respLog.bet_interactions[i].bet_stance === "for"){
                        forOutput += respLog.bet_interactions[i].better_discord_username + "\n"
                        forCount++
                    }else{
                        againstOutput += respLog.bet_interactions[i].better_discord_username + "\n"
                        againstCount++
                    }
                }
                if(forOutput === ""){
                    forOutput = "none";
                }
                if(againstOutput === ""){
                    againstOutput = "none";
                }                const listBetters = new EmbedBuilder()
                .setColor("#f92f03")
                .setTitle("Here are the current standings: ")
                .addFields({ name: forCount + " For: ", value: forOutput.toString(), inline: false })
                .addFields({ name: againstCount + " Against: ", value: againstOutput.toString(), inline: false });
                button.channel.send({embeds: [listBetters]})
                button.deferUpdate();
                return;
            }else{
                button.channel.send({content: "Did not find"});
            }
        }
    }else if(stance === "bd"){
        if(button.user.id != respCheckMaster.bet_masters[0].initiator_discord_id){
            button.channel.send({content: "Only the bet initiator can determine if they won or lost. If you feel there has been an issue, contact an admin."});
            return;
        }
        if(respCheckMaster.bet_masters[0].status === "closed"){
            button.channel.send({content: "This bet has already been decided and payed out. If you feel there has been an issue, contact an admin."})
            return;
        }
        var respInt;
        try{
            respInt = await api.get("bet_interaction",{
                serial:serial,
                better_discord_id:respCheckMaster.bet_masters[0].initiator_discord_id,
                _limit:2
            })
        }catch(err){
            console.log(err.message);
        }
        if(respInt.bet_interactions.length>1){
            button.channel.send({content: "Currently cannot delete a bet with more than just the creator in it since that makes it a valid bet."})
            return;
        }
        var respGetBal;
        try{
            var respGetBal = await api.get("bet_point",{
                discord_user_id:respCheckMaster.bet_masters[0].initiator_discord_id,
                discord_server_id:button.guild.id
            })
        }catch(err){
            console.log(err.message)
        }
        var new_bal = parseInt(respGetBal.bet_points[0].points_total) + parseInt(respInt.bet_interactions[0].bet_value)
        var respRefund;
        try{
            respRefund = await api.put("bet_point",{
                point_id:parseInt(respGetBal.bet_points[0].point_id),
                points_total:parseInt(new_bal)
            })
        }catch(err){
            console.log(err.message);
        }
        console.log(respRefund);
        try{
            var respMasterClose = await api.put("bet_master",{
                serial:serial,
                status:"closed"
            })
        }catch(err){
            console.log(err.message)
        }
        button.deferUpdate()
        button.channel.send({content: "Bet was closed and points were refunded."})
        return;
    }
    else{
        bet_amount = await button.customId.substring(button.customId.indexOf('-')+3);
    }
    var respCheckServer;
    try{
        respCheckServer = await api.get("bet_config",{
            discord_server_id:button.guild.id
        })
    }catch(err){
        this.logger.error(err.message);
    }
    try{
        respCheckBal = await api.get("bet_point",{
            discord_user_id:button.user.id,
            discord_server_id:button.guild.id
        })
    }catch(err){
        this.logger.error(err.message);
    }
    if(respCheckBal.bet_points[0]){
        if(parseInt(respCheckBal.bet_points[0].points_total)<parseInt(bet_amount)){
            button.channel.send({content : "You don't have enough to bet! Here is your current balance: " + respCheckBal.bet_points[0].points_total});
            return;
        }
    }else{
        button.channel.send({content: "<@" + button.user.id+">"+"You need to run ,point_start in order to get in the system!"});
        return;
    }
    //button.channel.send({content: bet_amount.toString() + " " + stance});
    var respCheckMaster;
    try{
        respCheckMaster = await api.get("bet_master",{
            serial:serial
        })
    }catch(err){
        this.logger.error(err.message);
    }
    if(!respCheckMaster.bet_masters[0]){
        button.channel.send({content: "Couldn't find that bet, ask an admin for help"});
        return;
    }
    if(respCheckMaster.bet_masters[0].status === "closed"){
        button.channel.send({content: "That bet has already been payed out!"});
        return;
    }
    var respIntCheck;
    try{
        respIntCheck = await api.get("bet_interaction",{
            serial:serial,
            better_discord_id:button.user.id
        })
    }catch(err){
        this.logger.error(err.message);
    }
    if(respIntCheck.bet_interactions[0]){
        button.channel.send("You have already participated in this bet! All bets are final and unchangeable!");
        button.deferUpdate();
        return;
    }

    if(stance.includes("f")){
        stance = "for"
    }else{
        stance = "against"
    }
    var new_bal = respCheckBal.bet_points[0].points_total-bet_amount;
    //button.channel.send({content: "Updating a bet, here is the data: " + respCheckBal.bet_points[0].point_id + " " + respCheckBal.bet_points[0].discord_server_id.toString() + " " + respCheckBal.bet_points[0].discord_user_id.toString() + " " + new_bal.toString()})
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
    var respUploadInt;
    try{
        respUploadInt = await api.post("bet_interaction",{
            serial:serial,
            bet_value:parseInt(bet_amount),
            bet_stance:stance,
            better_discord_id:button.user.id,
            better_discord_username:button.user.username
        })
    }catch(err){
        this.logger.error(err.message);
    }
    if(respCheckServer.bet_configs[0].point_name.charAt(respCheckServer.bet_configs[0].point_name.length-1) === "s"){
        respCheckServer.bet_configs[0].point_name = respCheckServer.bet_configs[0].point_name.substring(0, respCheckServer.bet_configs[0].point_name.length-1);
    }
    button.channel.send({content: button.user.username + " has joined the bet with " + bet_amount + " " + respCheckServer.bet_configs[0].point_name + "s."});
    button.deferUpdate();
}else{
    button.channel.send({content: "Selected a menu item!"});
    button.deferUpdate()
}
}else{
    return;
}
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;