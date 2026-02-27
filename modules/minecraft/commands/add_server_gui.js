module.exports = {
    name: 'add_server_gui',
    description: 'Used to add a new minecraft server to the database, but with a gui',
    syntax: 'add_server_gui', //[display_name] [short_name] [server_ip] [port] [status_api_port] [numeric_ip] [mc_version] [pack version]
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    options: [],
    async execute(message, args, extra) {
        var api = extra.api;

        this.logger.info(">>add_server_gui");
        if(message.member.roles.cache.find(r => r.id === "586313447965327365") || message.author.id === "185223223892377611" || message.author.id === "195677170432081920"){
            const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, SelectMenuBuilder, ButtonStyle } = require('discord.js'); // Updated imports
            const modalStarter = new ActionRowBuilder() // Updated to ActionRowBuilder
            .addComponents(
                new ButtonBuilder() // Updated to ButtonBuilder
                .setCustomId("MINE-SERVERCREATOR")
                .setLabel("Click here to start the Server Adding tool!")
                .setStyle(ButtonStyle.Primary) // Updated to ButtonStyle.Primary
                .setDisabled(false), // setDisabled takes a boolean
            );
            const outputEmbed = new EmbedBuilder() // Updated to EmbedBuilder
            .setTitle("Server Adding Tool!")
            .addFields({ name: "Click the button below", value: "Use the button below to start up the server adding tool!"}); // Updated to addFields with object
            await message.channel.send({embeds: [outputEmbed],components: [modalStarter]});
        }else{
            await message.channel.send({ content: "You don't have permission to use that command!"});
        }
        this.logger.info("<<add_server_gui");
    }

};
