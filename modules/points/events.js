var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(button){
    if (!button.isButton()) return;
	console.log(button)
    button.deferUpdate();
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;