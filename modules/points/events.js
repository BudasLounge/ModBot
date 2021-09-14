var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
var LogHandler = require('../core/js/log_handler.js');
var logger = LogHandler.build_logger("../" + __dirname + "/" + config.log_folder);

async function onButtonClick(button){
    if (!button.isButton()) return;
	logger.info(button)
    button.deferUpdate();
}

function register_handlers(event_registry) {
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;