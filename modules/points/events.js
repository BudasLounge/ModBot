var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(interaction){
	this.logger.info(interaction);
    
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick());
}

module.exports = register_handlers;