const { MessageEmbed } = require('discord.js');

module.exports = {
  name: 'updatesl',
  description: 'Used to update parts of the Minecraft server list',
  syntax: 'updatesl [server name] [whats updating] [new value]',
  num_args: 3,
  args_to_lower: true,
  needs_api: true,
  has_state: false,
  
  async execute(message, args, extra) {
    const api = extra.api;

    const authorizedUser = message.member.roles.cache.has('586313447965327365') || message.author.id === '185223223892377611';
    if (!authorizedUser) {
      return message.channel.send({ content: 'You don\'t have permission to use that command!' });
    }

    const [shortName, fieldToUpdate, newValue] = args.slice(1);

    try {
      let { minecraft_servers: [server] } = await api.get('minecraft_server', { short_name: shortName });

      if (!server) {
        ({ minecraft_servers: [server] } = await api.get('minecraft_server', { display_name: shortName }));
        if (!server) {
          return message.channel.send({ content: 'No server found with that short_name or display_name.' });
        }
      }

      const data = { short_name: server.short_name, [fieldToUpdate]: newValue };
      const respUpdate = await api.put('minecraft_server', data);

      if (respUpdate.ok) {
        const updatedServer = respUpdate.minecraft_server;

        // Creating the information in a cleaner, tabular style
        const changedInfo = `
**Before Update:**
• **Short Name**: ${server.short_name}
• **Display Name**: ${server.display_name}
• **IP + Port**: ${server.server_ip}:${server.port}
• **Numeric IP**: ${server.numeric_ip}:${server.port}
• **Status API Port**: ${server.status_api_port}
• **MC Version**: ${server.mc_version}
• **Pack Version**: ${server.pack_version}

**After Update:**
• **Short Name**: ${updatedServer.short_name}
• **Display Name**: ${updatedServer.display_name}
• **IP + Port**: ${updatedServer.server_ip}:${updatedServer.port}
• **Numeric IP**: ${updatedServer.numeric_ip}:${updatedServer.port}
• **Status API Port**: ${updatedServer.status_api_port}
• **MC Version**: ${updatedServer.mc_version}
• **Pack Version**: ${updatedServer.pack_version}
`;

        const embed = new MessageEmbed()
          .setColor('#f92f03')
          .setTitle(`Field Updated: ${fieldToUpdate}`)
          .setDescription(changedInfo)
          .setFooter('Minecraft Server List Update');

        return message.channel.send({ embeds: [embed] });
      }

      return message.channel.send({ content: 'Update failed. Please try again.' });
    } catch (err) {
      console.error('Error during update:', err);
      return message.channel.send({ content: 'An error occurred while processing your request.' });
    }
  }
};
