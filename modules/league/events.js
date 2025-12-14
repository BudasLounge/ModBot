var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;


async function onButtonClick(button){
    
}