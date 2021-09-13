var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

async function onButtonClick(button){
	this.logger.info(button.id);
    button.defer();
}

function register_handlers(event_registry) {
    event_registry.register('clickButton', onButtonClick);
}

module.exports = register_handlers;