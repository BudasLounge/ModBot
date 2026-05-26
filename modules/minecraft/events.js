var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonStyle} = require('discord.js');

async function onButtonClick(button){
    if (!button.isButton() && !button.isModalSubmit() && !button.isStringSelectMenu()) return;
    if((button.member.roles.cache.find(r => r.id === "586313447965327365" || button.user.id === "185223223892377611" || button.user.id === "195677170432081920") && button.customId=="MINE-SERVERCREATOR")){
        const modal = new ModalBuilder()
        .setCustomId('MCSERVERCREATORMODAL')
        .setTitle('MC Server Adder');
        // Add components to modal
        // Create the text input components
        const displayNameInput = new TextInputBuilder()
            .setCustomId('display_name')
            // Short means only a single line of text
            .setStyle(TextInputStyle.Short);
        const shortNameInput = new TextInputBuilder()
            .setCustomId('short_name')
            .setStyle(TextInputStyle.Short);
        const portInput = new TextInputBuilder()
            .setCustomId('port')
            // Short means only a single line of text
            .setStyle(TextInputStyle.Short);
        const mcVersionInput = new TextInputBuilder()
            .setCustomId('mc_version')
            // Short means only a single line of text
            .setStyle(TextInputStyle.Short);
        const packVersionInput = new TextInputBuilder()
            .setCustomId('pack_version')
            // Short means only a single line of text
            .setStyle(TextInputStyle.Short);
        // Add inputs to the modal
        modal.addLabelComponents(
            label => label.setLabel('What is the display name of the server?').setTextInputComponent(displayNameInput),
            label => label.setLabel('Server short name?').setTextInputComponent(shortNameInput),
            label => label.setLabel('What is the port of the server?').setTextInputComponent(portInput),
            label => label.setLabel('What version of minecraft is this on?').setTextInputComponent(mcVersionInput),
            label => label.setLabel('What version of the modpack is this on?').setTextInputComponent(packVersionInput),
        );
        // Show the modal to the user
        await button.showModal(modal);
    }
    else if((button.member.roles.cache.find(r => r.id === "586313447965327365") || button.user.id === "185223223892377611") && button.customId=="MINE-SERVERDELETOR"){
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                _limit: 20
            });
        } catch(error){
            logger.error("Error fetching server list for delete GUI:", error.message || error);
            await button.reply({ content: "Failed to fetch server list. Please try again later." });
            return;
        };
        if (!respServer?.minecraft_servers?.length) {
            await button.reply({ content: "No servers found to delete." });
            return;
        }
        const serverSelector = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('MCSERVERDELETESELECT')
                .setPlaceholder('Select a server from the list')
                .setDisabled(false),
        );

        respServer.minecraft_servers.forEach(server => {
            serverSelector.components[0].addOptions([{
                label: `${server.display_name}`,
				description: `${server.short_name}`,
				value: `${server.short_name}`,
            }])
        });
        await button.reply({components:[serverSelector]});
    }
    else if(button.isStringSelectMenu() && (button.member.roles.cache.find(r => r.id === "586313447965327365") || button.user.id === "185223223892377611") && button.customId==="MCSERVERDELETESELECT"){
        const shortName = button.values[0];
        const confirmRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`MCSERVERDELETECONFIRM:${shortName}`)
                    .setLabel(`Delete ${shortName}`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('MCSERVERDELETECANCEL')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary),
            );
        await button.update({ content: `Delete Minecraft server \`${shortName}\`?`, components: [confirmRow] });
    }
    else if(button.isButton() && (button.member.roles.cache.find(r => r.id === "586313447965327365") || button.user.id === "185223223892377611") && button.customId.startsWith("MCSERVERDELETECONFIRM:")){
        const shortName = button.customId.slice("MCSERVERDELETECONFIRM:".length);
        try {
            const respDelete = await api.delete("minecraft_server", { short_name: shortName });
            if (respDelete?.ok) {
                await button.update({ content: `Deleted Minecraft server \`${shortName}\`.`, components: [] });
            } else {
                await button.update({ content: `Failed to delete Minecraft server \`${shortName}\`.`, components: [] });
            }
        } catch (err) {
            logger.error("Error deleting server:", err.message);
            await button.update({ content: "An error occurred while deleting the server.", components: [] });
        }
    }
    else if(button.isButton() && button.customId==="MCSERVERDELETECANCEL"){
        await button.update({ content: "Server deletion cancelled.", components: [] });
    }
    else if(button.isModalSubmit() && button.customId==="MCSERVERCREATORMODAL"){
        logger.info(">>MCSERVERCREATORMODAL()");
        if (
            (button.member.roles.cache.some(r => r.id === "586313447965327365") || button.user.id === "185223223892377611") 
            && button.customId === "MCSERVERCREATORMODAL"
        ) {
            logger.info("User has permission to use the button");
            const display_name = button.fields.getTextInputValue('display_name');
            const short_name = button.fields.getTextInputValue('short_name');
            const port = button.fields.getTextInputValue('port');
            const mc_version = button.fields.getTextInputValue('mc_version');
            const pack_version = button.fields.getTextInputValue('pack_version');
            logger.info(`Display Name: ${display_name}, Short Name: ${short_name}, Port: ${port}, MC Version: ${mc_version}, Pack Version: ${pack_version}`);
        
            let respServer;
        
            try {
                logger.info("Attempting to retrieve server info...");
                respServer = await api.get("minecraft_server", {
                    server_ip: `${short_name}.budaslounge.com`
                });
            } catch (error) {
                logger.error("Error fetching server:", error.message);
                button.channel.send({ content: "I hit a snag... " + error.message });
                return;
            }
            logger.info("Server info fetched");
        
            // If a server with that IP exists, inform the user and exit
            if (respServer?.minecraft_servers?.length > 0) {
                return button.channel.send({ 
                    content: "I found a server with that server_ip already, try again" 
                });
            }
        
            try {
                // Attempt to create a new Minecraft server record
                const respServerPost =  await api.post("minecraft_server", {
                    display_name: display_name,
                    short_name: short_name,
                    server_ip: short_name+".budaslounge.com",
                    port: port.toString(),
                    status_api_port: "none",
                    numeric_ip: "PROXIED",
                    mc_version: mc_version,
                    pack_version: pack_version,
                    rcon_port: (parseInt(port)+1).toString()
                });
            
                logger.info("Response from API POST:", respServerPost);
                // Check if the response indicates success. Adjust based on your API's conventions.
                if (!respServerPost || !respServerPost.ok) {
                    logger.error("API did not confirm the creation of the server:", respServerPost);
                    await button.channel.send({ content: "Failed to create server due to API response." });
                    return;
                }
            
                // Notify the user of successful creation
                await button.reply({ 
                    content: `Added a new server with Display Name: ${display_name}` 
                });
            } catch (err) {
                logger.error("Error creating server:", err.message);
                await button.channel.send({ content: "I hit a snag... " + err.message });
                return;
            }
            
        } else {
            button.channel.send({ content: "You don't have permission to use that button!" });
        }
        //else if((button.member.roles.cache.find(r => r.id === "586313447965327365") || button.user.id === "185223223892377611") && button.customId==="MCSERVERDELETORMODAL"){
        //}
        logger.info("<<MCSERVERCREATORMODAL() SUCCESS");     
    }
}

function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('interactionCreate', onButtonClick);
}
module.exports = register_handlers;
