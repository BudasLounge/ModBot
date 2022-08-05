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
                var respCampaign = await api.get("dnd_campaign",{
                    campaign_id:parseInt(IDcheck.substring(1))
                })
            }catch(error2){
                logger.error(error2.message)
            }
            logger.info("IDcheck: "+IDcheck + " customID: "+button.customId)
            if(!respCampaign.dnd_campaigns[0]){
                button.channel.reply({content: "This invite seems to have an issue. Contact and Admin please.", ephemeral: true});
                return;
            }

            try{
                var respAddToCampaign = await api.post("dnd_players_in_campaign",{
                    discord_id:button.user.id.toString(),
                    campaign_id:parseInt(IDcheck.substring(1))
                })
            }catch(error){
                logger.error(error.message)
            }
            
            await button.update({content:"The invite was accepted. Have fun playing!", components: []})
            logger.info("Added a new player to the campaign successfully")
            let playerRole = button.guild.roles.cache.find(role => role.id === respCampaign.dnd_campaigns[0].role_id.toString());
            button.member.roles.add(playerRole);
            button.guild.channels.cache.get(respCampaign.dnd_campaigns[0].schedule_channel.toString()).send({content: "<@" + button.user.id + ">, welcome! This is where you game will take place. Wait for you DM to reach out and have fun!"})
        }
        else if(IDcheck.includes("D")){
            await button.update({content:"The invite was denied. If this was an error, contact your potential DM again.", components: []})
            logger.info("The invite was rejected.")
        }

    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;