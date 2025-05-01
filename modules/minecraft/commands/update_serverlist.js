const { MessageEmbed } = require('discord.js');

module.exports = {
  name: 'updatesl',
  description: 'Used to update parts of the Minecraft server list',
  syntax: 'updatesl [server name] [field] [new value] (or "updatesl help" to see available fields)',
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

    // Check if user is asking for help
    if (args[1]?.toLowerCase() === 'help') {
      const helpEmbed = new MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Minecraft Server List Update Help')
        .setDescription('Available fields that can be updated:')
        .addFields(
          { name: 'short_name', value: 'The server\'s short name identifier' },
          { name: 'display_name', value: 'The server\'s display name' },
          { name: 'server_ip', value: 'The server IP address (with port if needed)' },
          { name: 'numeric_ip', value: 'The numeric IP address' },
          { name: 'port', value: 'The server port' },
          { name: 'status_api_port', value: 'Port for the status API' },
          { name: 'mc_version', value: 'Minecraft version' },
          { name: 'pack_version', value: 'Modpack version' },
          { name: 'url', value: 'URL for the modpack' }
        )
        .setFooter({ text: 'Usage: updatesl [server name] [field] [new value]' });
      
      return message.channel.send({ embeds: [helpEmbed] });
    }

    // Not enough arguments
    if (args.length < 4) {
      return message.channel.send({ 
        content: 'Not enough arguments. Use `updatesl help` to see available fields and proper syntax.' 
      });
    }

    const [shortName, fieldToUpdate, newValue] = args.slice(1);

    // Define allowed fields for update
    const allowedFields = ['short_name', 'display_name', 'server_ip', 'numeric_ip', 
                          'port', 'status_api_port', 'mc_version', 'pack_version', 'url'];
    
    // Check if the field is valid
    if (!allowedFields.includes(fieldToUpdate)) {
      return message.channel.send({ 
        content: `Invalid field: "${fieldToUpdate}". Use \`updatesl help\` to see available fields.` 
      });
    }

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
• **IP + Port**: ${server.server_ip}
• **Numeric IP**: ${server.numeric_ip}:${server.port}
• **Status API Port**: ${server.status_api_port}
• **MC Version**: ${server.mc_version}
• **Pack Version**: ${server.pack_version}
• **Pack URL**: ${server.url}

**After Update:**
• **Short Name**: ${updatedServer.short_name}
• **Display Name**: ${updatedServer.display_name}
• **IP + Port**: ${updatedServer.server_ip}
• **Numeric IP**: ${updatedServer.numeric_ip}:${updatedServer.port}
• **Status API Port**: ${updatedServer.status_api_port}
• **MC Version**: ${updatedServer.mc_version}
• **Pack Version**: ${updatedServer.pack_version}
• **Pack URL**: ${updatedServer.url}
`;

        const embed = new MessageEmbed()
          .setColor('#f92f03')
          .setTitle(`Field Updated: ${fieldToUpdate}`)
          .setDescription(changedInfo)
          .setFooter({ text: 'Minecraft Server List Update' });

        return message.channel.send({ embeds: [embed] });
      }

      return message.channel.send({ content: 'Update failed. Please try again.' });
    } catch (err) {
      console.error('Error during update:', err);
      return message.channel.send({ content: 'An error occurred while processing your request.' });
    }
  }
};
