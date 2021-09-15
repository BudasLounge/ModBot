var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(button){
    if (!button.isButton()) return;
	var serial = button.customId.substring(0,10);
    console.log(button.customId);
    button.channel.send({content: "Serial: " + serial});
    button.deferUpdate();
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;