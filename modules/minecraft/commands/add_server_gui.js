module.exports = {
    name: 'add_server_gui',
    description: 'Used to add a new minecraft server to the database, but with a gui',
    syntax: 'add_server_gui', //[display_name] [short_name] [server_ip] [port] [status_api_port] [numeric_ip] [mc_version] [pack version]
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

        this.logger.info(">>add_server_gui");
        if(message.member.roles.cache.find(r => r.id === "586313447965327365") || message.author.id === "185223223892377611" || message.author.id === "195677170432081920"){
            const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');
            const modalStarter = new MessageActionRow()
            .addComponents(
                new MessageButton()
                .setCustomId("MINE-SERVERCREATOR")
                .setLabel("Click here to start the Server Adding tool!")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            );
            const outputEmbed = new MessageEmbed()
            .setTitle("Server Adding Tool!")
            .addField("Click the button below","Use the button below to start up the server adding tool!")
            message.channel.send({embeds: [outputEmbed],components: [modalStarter]});
        }else{
            message.channel.send({ content: "You don't have permission to use that command!"});
        }
        this.logger.info("<<add_server_gui");
    }

};
