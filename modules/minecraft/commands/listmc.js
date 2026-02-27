const { EmbedBuilder } = require('discord.js'); // Updated to EmbedBuilder

module.exports = {
    name: 'listmc',
    description: 'Shows all servers and their information',
    syntax: 'listmc',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    options: [],

    async execute(message, args, { api }) {
        try {
            const respServer = await api.get('minecraft_server', { _limit: 20 });
            const servers = respServer.minecraft_servers;

            if (!servers.length) {
                return await message.channel.send({ content: 'No Minecraft servers found.' }); // Added await
            }

            const embed = new EmbedBuilder() // Updated to EmbedBuilder
                .setColor('#f92f03')
                .setTitle('List of All Minecraft Servers')
                .setFooter({ text: 'Server Information' }); // setFooter now takes an object

            // Loop through the servers and format the information cleanly
            servers.forEach(server => {
                // Format date nicely
                const dateCreated = new Date(server.date_created).toLocaleDateString();

                const serverInfo = `
**Server IP**: ${server.server_ip}
**Minecraft Version**: ${server.mc_version}
**Pack Version**: ${server.pack_version}
**Date Created**: ${dateCreated}
**URL**: ${server.url || 'N/A'}
**Join Type**: ${server.whitelist}
                `;

                embed.addFields({ name: `${server.display_name}`, value: serverInfo, inline: false }); // Updated to addFields with object, and inline property
            });

            await message.channel.send({ embeds: [embed] }); // Added await
        } catch (error) {
            console.error('Error fetching server list:', error);
            await message.channel.send({ content: 'An error occurred while fetching the server list.' }); // Added await
        }
    }
};
