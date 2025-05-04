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
                .setFooter({ text: 'Server Information' });

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
**Access**: ${server.whitelist === 'Public' ? '🟢 Public' : '🔒 Whitelist'}
                `;

                embed.addField(`${server.display_name} (${server.short_name})`, serverInfo, false);
            });

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching server list:', error);
            message.channel.send({ content: 'An error occurred while fetching the server list.' });
        }
    }
};
