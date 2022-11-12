var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');

async function onButtonClick(button){
    if (button.isButton()){
        if(button.customId.substring(0,3)=="ID-"){
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
                
                await button.update({content:"The invite was accepted. Have fun playing!", components: [], embeds: []})
                logger.info("Added a new player to the campaign successfully")
                let playerRole = button.guild.roles.cache.find(role => role.id === respCampaign.dnd_campaigns[0].role_id.toString());
                button.member.roles.add(playerRole);
                button.guild.channels.cache.get(respCampaign.dnd_campaigns[0].schedule_channel.toString()).send({content: "<@" + button.user.id + ">, welcome! This is where your game will take place. Wait for you DM to reach out and have fun!"})
            }
            else if(IDcheck.includes("D")){
                await button.update({content:"The invite was denied. If this was an error, contact your potential DM again.", components: [], embeds: []})
                logger.info("The invite was rejected.")
            }
        }else if(button.customId=="CAMPAIGNCREATOR"){
            const { MessageActionRow, Modal, TextInputComponent } = require('discord.js');
            const modal = new Modal()
			.setCustomId('myModal')
			.setTitle('My Modal');
            // Add components to modal
            // Create the text input components
            const favoriteColorInput = new TextInputComponent()
                .setCustomId('favoriteColorInput')
                // The label is the prompt the user sees for this input
                .setLabel("Are you a bitch?")
                // Short means only a single line of text
                .setStyle('SHORT');
            const hobbiesInput = new TextInputComponent()
                .setCustomId('hobbiesInput')
                .setLabel("Are you sure?")
                // Paragraph means multiple lines of text.
                .setStyle('PARAGRAPH');
            // An action row only holds one text input,
            // so you need one action row per text input.
            const firstActionRow = new MessageActionRow().addComponents(favoriteColorInput);
            const secondActionRow = new MessageActionRow().addComponents(hobbiesInput);
            // Add inputs to the modal
            modal.addComponents(firstActionRow, secondActionRow);
            // Show the modal to the user
            await button.showModal(modal);
        }
    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;