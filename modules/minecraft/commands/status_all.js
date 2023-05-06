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
    const Discord = require('discord.js');
    const axios = require('axios');
    const { getStatus } = require('mc-server-status');
    const perfStart = performance.now();
    const respServer = await api.get('minecraft_server', { _limit: 20 }).catch((error) => {
      this.logger.error(error.response);
    });
    if (!respServer.minecraft_servers[0]) return;
    message.channel.send({ content: 'Let me get that for you... this might take a moment' });
    const ListEmbed = new Discord.MessageEmbed().setColor('#f92f03').setTitle('List of all minecraft servers: ')
      .addField('Notice:\n', 'If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.');
    let stat_server = '';
    for (const server of respServer.minecraft_servers) {
      try {
        this.logger.info("server: " + server.display_name)
        const item = await getStatus(server.server_ip);
        const isOnline = item.players.online > 0;
        let nextItem = `${server.display_name} is currently ${isOnline ? `online with ${item.players.online} player${item.players.online === 1 ? '' : 's'} online\n` : 'online but no players are.\n\n'}`;
        this.logger.info(nextItem)
        if (isOnline) {
            this.logger.info("isOnline: " + isOnline)
          const SensitiveCharacters = ['\\', '*', '_', '~', '`', '|', '>'];
          nextItem += 'Players online:\n';
          for (const { name } of item.players.sample) {
            for (const unsafe of SensitiveCharacters) {
              name.replaceAll(unsafe, `\\${unsafe}`);
            }
            nextItem += `- ${name}\n`;
          }
        }
        if (server.status_api_port !== 'none') {
          const [respTPS, respUptime] = await Promise.all([
            axios.get(`http://${server.numeric_ip}:${server.status_api_port}/tps`, {}),
            axios.get(`http://${server.numeric_ip}:${server.status_api_port}/uptime`, {}),
          ]);
          nextItem += `\nTPS: ${respTPS.data.overallTps}\nUptime: ${respUptime.data.uptime}\n`;
        }
        ListEmbed.addField(`${server.display_name} server info:`, nextItem);
        stat_server += nextItem;
      } catch (error) {
        this.logger.error(`${error}, setting flag to true`);
        const item = `${server.display_name} is currently offline!\n\n`;
        ListEmbed.addField(`${server.display_name} server info:`, item);
        stat_server += `${server.display_name} server info: ${item}`;
      }
    }
    message.channel.send({
      embeds: [ListEmbed],
      content: `It took ${((performance.now() - perfStart) / 1000).toFixed(2)} seconds to get this list:`,
    });
    this.logger.info('<<display_all_servers_status');
  },
};
