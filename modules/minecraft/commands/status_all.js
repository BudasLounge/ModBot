module.exports = {
  name: 'statusall',
  description: 'Shows all servers and their information',
  syntax: 'statusall',
  num_args: 0,
  args_to_lower: false,
  needs_api: true,
  has_state: false,
  async execute(message, args, { api }) {

    const { performance } = require('perf_hooks');
    const perfStart = performance.now();
    const { EmbedBuilder } = require('discord.js'); // Updated to EmbedBuilder
    const axios = require('axios');
    const pinger = require('minecraft-ping-js');

    await message.channel.send({ content: 'Let me get that for you... this might take a moment' }); // Added await

    const respServer = await api.get('minecraft_server', { _limit: 20 }).catch((error) => {
      this.logger.error(error.response);
    });

    if (!respServer.minecraft_servers[0]) return;

    const ListEmbed = new EmbedBuilder() // Updated to EmbedBuilder
      .setColor('#f92f03')
      .setTitle('List of all minecraft servers: ')
      .addFields({ name: 'Notice:\n', value: 'If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.' }); // Updated to addFields with object

    const SensitiveCharacters = ['\\', '*', '_', '~', '`', '|', '>'];

    const serverPromises = respServer.minecraft_servers.map(async (server) => {
      try {
        const item = await pinger.pingWithPromise(server.server_ip).catch(() => "OFFLINE");
        const isOnline = item.players.online > 0;

        let nextItem = `${server.display_name} is currently ${isOnline ? `online with ${item.players.online} player${item.players.online === 1 ? '' : 's'} online\n` : 'online but no players are.\n\n'}`;

        if (isOnline) {
          nextItem += 'Players online:\n';
          for (const { name } of item.players.sample) {
            const escapedName = SensitiveCharacters.reduce((acc, unsafe) => acc.replaceAll(unsafe, `\\${unsafe}`), name);
            nextItem += `- ${escapedName}\n`;
          }
        }

        ListEmbed.addFields({ name: `${server.display_name} server info:`, value: nextItem }); // Updated to addFields with object
        return nextItem;
      } catch (error) {
        this.logger.error(`${error}, setting flag to true`);
        const item = `${server.display_name} is currently offline!\n\n`;
        ListEmbed.addFields({ name: `${server.display_name} server info:`, value: item }); // Updated to addFields with object
        return item;
      }
    });

    const stat_server = await Promise.all(serverPromises);

    await message.channel.send({ // Added await
      embeds: [ListEmbed],
      content: `It took ${((performance.now() - perfStart) / 1000).toFixed(2)} seconds to get this list:`,
    });

    this.logger.info('<<display_all_servers_status');
  },
};
