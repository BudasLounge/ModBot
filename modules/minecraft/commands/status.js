module.exports ={
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status [name of server]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra){
        const Discord = require('discord.js');
        const pinger = require("minecraft-ping-js");

        const api = extra.api;

        try {
        const respServer = await api.get("minecraft_server", {
            short_name: args[1]
        });

        if (respServer.minecraft_servers[0]) {
            const server = respServer.minecraft_servers[0];
            const ListEmbed = new Discord.EmbedBuilder() // Updated to EmbedBuilder
            .setColor("#f92f03")
            .setTitle(server.display_name + " status: ")
            .addFields({ name: "Notice:\n", value: "If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not."}); // Updated to addFields with object

            try {
            const response = await pinger.pingWithPromise(server.numeric_ip, server.port);
            const item = response || "OFFLINE";
            const output = server.display_name + " is currently online with: " + item.players.online + " players online!\nPlayers online:\n" +
                item.players.sample.map(player => "- " + player.name).join("\n");

            ListEmbed.addFields({ name: "status: ", value: output }); // Updated to addFields with object
            await message.channel.send({ embeds: [ListEmbed] }); // Added await
            } catch (status_error) {
            this.logger.error(status_error.message);
            const item = server.display_name + " is currently offline!";
            ListEmbed.addFields({ name: "status: ", value: item }); // Updated to addFields with object
            await message.channel.send({ embeds: [ListEmbed] }); // Added await
            }
        } else {
            await message.channel.send({ content: "Sorry, couldn't find a server with that shortname, try ,listmc for a list of all servers." }); // Added await
        }
        } catch (error) {
        this.logger.error(error);
        }
    }
};