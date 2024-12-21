const { MessageEmbed } = require('discord.js');

module.exports = {
    name: 'listmc',
    description: 'Shows all servers and their information',
    syntax: 'listmc',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,

    async execute(message, args, { api }) {
        try {
            const respServer = await api.get('minecraft_server', { _limit: 20 });
            const servers = respServer.minecraft_servers;

            if (!servers.length) {
                return message.channel.send({ content: 'No Minecraft servers found.' });
            }

            const embed = new MessageEmbed()
                .setColor('#f92f03')
                .setTitle('List of All Minecraft Servers')
                .setFooter('Server Information');

            // Loop through the servers and format the information cleanly
            servers.forEach(server => {
                const serverInfo = `
**Short Name**: ${server.short_name}
**Server IP**: ${server.server_ip}
**Numeric IP**: ${server.numeric_ip}:${server.port}
**Minecraft Version**: ${server.mc_version}
**Pack Version**: ${server.pack_version}
**Date Created**: ${new Date(server.date_created).toLocaleDateString()}
**URL**: ${server.url || 'N/A'}
**Join Type**: ${server.whitelist}
                `;

                embed.addField(`${server.display_name}`, serverInfo, false);
            });

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching server list:', error);
            message.channel.send({ content: 'An error occurred while fetching the server list.' });
        }
    }
};
