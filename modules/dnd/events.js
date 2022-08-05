var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');

async function onButtonClick(button){
    if (button.isButton()){
        if(!button.customId.substring(0,3)==="ID-") return;
        if(!button.customId.includes(button.user.id)){
            await button.reply({content: "This invite was not made for you.", ephemeral: true})
        }
        var IDcheck = button.customId.split("_").pop();
        if(IDcheck.includes("A")){
            try{
                var respAddToCampaign = api.post("dnd_players_in_campaign",{
                    discord_id:button.user.id.toString(),
                    campaign_id:parseInt(IDcheck.substring(1))
                })
            }catch(error){
                logger.error(error.message)
            }
            await button.update({content:"The invite was accepted. Have fun playing!"})
            logger.info("Added a new player to the campaign successfully")
        }
        else if(IDcheck.includes("D")){
            await button.update({content:"The invite was denied. If this was an error, contact your potential DM again."})
            logger.info("The invite was rejected.")
        }

    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;