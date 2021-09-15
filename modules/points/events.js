var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(button){
    if (!button.isButton()) return;
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
    if(stance === "fw" || stance === "al"){
        var forBet = [];
        var againstBet = [];
        var pot;
        try{
            var respCheckAllInt = await api.get("bet_interaction",{
                _limit: 500,
                serial:serial
            })
        }catch(err){
            this.logger.error(err.message);
        }
        if(respCheckAllInt.bet_interactions[0]){
            for(var i = 0;i<respCheckAllInt.bet_interactions.length;i++){
                if(respCheckAllInt.bet_interactions[i].bet_stance === "for"){
                    forBet.push(respCheckAllInt.bet_interactions[i].bet_id)
                    pot += parseInt(respCheckAllInt.bet_interactions[i].bet_value)
                }else{
                    againstBet.push(respCheckAllInt.bet_interactions[i].bet_id)
                    pot += parseInt(respCheckAllInt.bet_interactions[i].bet_value)
                }
            }
        }
        button.channel.send({content: "Bet with total pot of: " + pot + ". Which had " + forBet.length + " for it and " + againstBet.length + " against it"});
        if(stance === "fw"){
            for(var j = 0;j<forBet.length;j++){

            }
            for(var k = 0;k<againstBet.length;k++){

            }
        }else{
            for(var j = 0;j<forBet.length;j++){

            }
            for(var k = 0;k<againstBet.length;k++){

            }
        }
        return;
    }else{
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
    var respCheckBal;
    try{
        respCheckBal = await api.get("bet_point",{
            discord_user_id:button.user.id,
            discord_server_id:button.guild.id
        })
    }catch(err){
        this.logger.error(err.message);
    }
    if(respCheckBal.bet_points[0]){
        if(respCheckBal.bet_points[0].points_total<bet_amount){
            button.channel.send({content : "You don't have enough to bet!"});
            return;
        }
    }else{
        button.channel.send({content: "You need to run /point_start in order to get in the system!"});
        return;
    }
    button.channel.send({content: bet_amount.toString() + " " + stance});
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
    button.channel.send({content: "Updating a bet, here is the data: " + respCheckBal.bet_points[0].point_id + " " + respCheckBal.bet_points[0].discord_server_id.toString() + " " + respCheckBal.bet_points[0].discord_user_id.toString() + " " + new_bal.toString()})
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
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;