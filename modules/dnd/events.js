var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');

async function onButtonClick(button){
    if (button.isButton()){
        if(!button.customId.substring(0,3)==="ID-") return;

        
    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}