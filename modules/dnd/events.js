var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');

async function onButtonClick(button){
    if (button.isButton()){
        if(!button.customId.substring(0,3)==="ID-") return;
        if(!button.customId.includes(button.user.id)){
            await button.reply({content: "This invite was not made for you.", ephemeral: true})
        }
        if(button.customId.substring(button.customId.length-1)=="A"){

        }
        else if(button.customId.substring(button.customId.length-1)=="D"){

        }

    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;