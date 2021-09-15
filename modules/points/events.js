var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(button){
    if (!button.isButton()) return;
    var serial = button.customId.substring(0,10);
    var stance = await button.customId.substring(button.customId.indexOf('-')+1, button.customId.indexOf('-')+3);
    var bet_amount = 0;
    if(stance === "fw" || stance === "al"){
        button.channel.send({content: "Still working on this part..."});
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
        return;
    }

    if(stance.includes("f")){
        stance = "for"
    }else{
        stance = "against"
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