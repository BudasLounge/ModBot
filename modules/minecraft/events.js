var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');

async function onButtonClick(button){
    if(button.customId=="MCSERVERCREATOR"){
        const { MessageActionRow, Modal, TextInputComponent } = require('discord.js');
        const modal = new Modal()
        .setCustomId('campaign-'+button.user.id.toString())
        .setTitle('MC Server Adder');
        // Add components to modal
        // Create the text input components
        const displayNameInput = new TextInputComponent()
            .setCustomId('display_name')
            // The label is the prompt the user sees for this input
            .setLabel("What is the display name of the server?")
            // Short means only a single line of text
            .setStyle('SHORT');
        const shortNameInput = new TextInputComponent()
            .setCustomId('short_name')
            .setLabel("Server short name?")
            .setStyle('SHORT');
        const portInput = new TextInputComponent()
            .setCustomId('port')
            // The label is the prompt the user sees for this input
            .setLabel("What is the port of the server?")
            // Short means only a single line of text
            .setStyle('SHORT');
        const mcVersionInput = new TextInputComponent()
            .setCustomId('mc_version')
            // The label is the prompt the user sees for this input
            .setLabel("What version of minecraft is this on?")
            // Short means only a single line of text
            .setStyle('SHORT');
        const packVersionInput = new TextInputComponent()
            .setCustomId('pack_version')
            // The label is the prompt the user sees for this input
            .setLabel("What version of the modpack is this on?")
            // Short means only a single line of text
            .setStyle('SHORT');
        // An action row only holds one text input,
        // so you need one action row per text input.
        const firstActionRow = new MessageActionRow().addComponents(displayNameInput);
        const secondActionRow = new MessageActionRow().addComponents(shortNameInput);
        const thirdActionRow = new MessageActionRow().addComponents(portInput);
        const fourthActionRow = new MessageActionRow().addComponents(mcVersionInput);
        const fifthActionRow = new MessageActionRow().addComponents(packVersionInput);
        // Add inputs to the modal
        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);
        // Show the modal to the user
        await button.showModal(modal);
    }
    else if(button.isModalSubmit()){
        if(button.customId==="CAMPAIGNCREATOR") return;
        if(!button.member.roles.cache.find(r => r.id === "586313447965327365") || !button.user.id === "185223223892377611"){
            var display_name = button.fields.getTextInputValue('display_name');
            var short_name = button.fields.getTextInputValue('short_name');
            var port = button.fields.getTextInputValue('port');
            var mc_version = button.fields.getTextInputValue('mc_version');
            var pack_version = button.fields.getTextInputValue('pack_version');
            try{
                logger.info("in try");
                var respServer = await api.get("minecraft_server", {
                    server_ip: short_name+".budaslounge.com"
                });
            } catch(error){
                logger.error(error.message);
            }
            if(respServer.minecraft_servers.length<1){
                var date = (new Date()).toISOString().split('T')[0];
                button.channel.send({content: date})
            try{
                await api.post("minecraft_server", {
                    display_name: display_name,
                    short_name: short_name,
                    server_ip: short_name+".budaslounge.com",
                    port: port.toString(),
                    status_api_port: "none",
                    numeric_ip: "71.38.104.228",
                    mc_version: mc_version,
                    pack_version: pack_version,
                    rcon_port: (parseInt(port)+1).toString(),
                    date_create: date
                });
            }catch(err){
                logger.error(err.message);
                button.channel.send({ content: "I hit a snag..."});
            }
            }else{
                button.channel.send({ content: "I found a server with that server_ip already, try again"});
            }
        }
        else{
            button.channel.send({ content: "You don't have permission to use that button!"});
        }
        button.reply({content:"Added a new server with Display Name: " +display_name});
    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;