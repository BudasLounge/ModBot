var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags} = require('discord.js');

async function onButtonClick(button){
    if (!button.isButton()) return;
    if(!(button.customId.substr(0,3)==="DND")) return;
    if (button.isButton()){
        const customId = button.customId.slice(3)
        if(customId.substring(0,3)=="ID-"){
            if(!customId.includes(button.user.id)){
                await button.reply({content: "This invite was not made for you.", flags: MessageFlags.Ephemeral})
                return;
            }
            var IDcheck = customId.split("_").pop();
            if(IDcheck.includes("A")){
                try{
                    var respCampaign = await api.get("dnd_campaign",{
                        campaign_id:parseInt(IDcheck.substring(1))
                    })
                }catch(error2){
                    logger.error(error2.message)
                }
                logger.info("IDcheck: "+IDcheck + " customID: "+customId)
                if(!respCampaign.dnd_campaigns[0]){
                    button.reply({content: "This invite seems to have an issue. Contact an Admin please.", flags: MessageFlags.Ephemeral});
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
        }else if(customId=="CAMPAIGNCREATOR"){
            const modal = new ModalBuilder()
			.setCustomId('campaign-'+button.user.id.toString())
			.setTitle('Campaign Creator');
            // Add components to modal
            // Create the text input components
            const moduleInput = new TextInputBuilder()
                .setCustomId('module')
                // Short means only a single line of text
                .setStyle(TextInputStyle.Short);
            const roleInput = new TextInputBuilder()
                .setCustomId('role_name')
                .setStyle(TextInputStyle.Short);
            const textChannelInput = new TextInputBuilder()
                .setCustomId('textchannel')
                // Short means only a single line of text
                .setStyle(TextInputStyle.Short);
            const voiceChannelInput = new TextInputBuilder()
                .setCustomId('voicechannel')
                // Short means only a single line of text
                .setStyle(TextInputStyle.Short);
            // An action row only holds one text input,
            // so you need one action row per text input.
            // Add inputs to the modal
            modal.addLabelComponents(
                label => label.setLabel('What is the name of the module?').setTextInputComponent(moduleInput),
                label => label.setLabel('Player role name?').setTextInputComponent(roleInput),
                label => label.setLabel('How many text channels do you need?').setTextInputComponent(textChannelInput),
                label => label.setLabel('How many voice channels do you need?').setTextInputComponent(voiceChannelInput),
            );
            // Show the modal to the user
            await button.showModal(modal);
			// testing master push
        }
    }
    else if(button.isModalSubmit()){
        if(button.customId){

        }
    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;
