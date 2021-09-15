var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(button){
    if (!button.isButton()) return;
	var serial = button.customId.substring(0,10);
    var stance = await button.customId.substring(button.customId.indexOf('-')+1, button.customId.indexOf('-')+3);
    var bet_amount = await button.customId.substring(button.customId.indexOf('-')+3);
    button.channel.send({content: bet + " " + stance});
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

    button.deferUpdate();
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;