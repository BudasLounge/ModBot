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
    const Discord = require('discord.js');
    const axios = require('axios');
    const pinger = require('minecraft-ping-js');
    const fs = require('fs');

    // Read Palworld password from file
    const password = fs.readFileSync('../palworld_password.txt').toString().trim();

    message.channel.send({ content: 'Let me get that for you... this might take a moment' });

    const respServer = await api.get('minecraft_server', { _limit: 20 }).catch((error) => {
      this.logger.error(error.response);
    });

    if (!respServer.minecraft_servers[0]) return;

    const ListEmbed = new Discord.MessageEmbed()
      .setColor('#f92f03')
      .setTitle('List of all minecraft servers: ')
      .addField('Notice:\n', 'If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.');

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

        ListEmbed.addField(`${server.display_name} server info:`, nextItem);
        return nextItem;
      } catch (error) {
        this.logger.error(`${error}, setting flag to true`);
        const item = `${server.display_name} is currently offline!\n\n`;
        ListEmbed.addField(`${server.display_name} server info:`, item);
        return item;
      }
    });

    await Promise.all(serverPromises);
    message.channel.send({embeds: [ListEmbed]})
    
    // Send a separate message to better separate the different game statuses
    message.channel.send({ content: `Now getting palworld status...` })
    
    // Create Palworld embed
    const PalworldEmbed = new Discord.MessageEmbed()
      .setColor('#0a74da')
      .setTitle('Palworld Server Status');

    try {
      // Fetch Palworld metrics
      const metricsResp = await axios.get('http://192.168.1.4:8212/v1/api/metrics', {
        auth: { username: 'admin', password }
      });
      const metrics = metricsResp.data;

      PalworldEmbed.addField('Player Count', `${metrics.currentplayernum} / ${metrics.maxplayernum}`, true);
      PalworldEmbed.addField('Server FPS', `${metrics.serverfps}/60`, true);
      
      const uptimeSeconds = metrics.uptime;
      const uptimeHours = Math.floor(uptimeSeconds / 3600);
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
      PalworldEmbed.addField('Uptime', `${uptimeHours}h ${uptimeMinutes}m`, true);

      // If players online, fetch player list
      if (metrics.currentplayernum > 0) {
        const playersResp = await axios.get('http://192.168.1.4:8212/v1/api/players', {
          auth: { username: 'admin', password }
        });
        // Map each player as "name" ("accountName")
        const playerNames = playersResp.data.players.map(p => `${p.name} (${p.accountName})`);
        const namesList = playerNames.length ? playerNames.join('\n') : 'No players online';
        PalworldEmbed.addField('Players Online', namesList);
      } else {
        PalworldEmbed.addField('Players Online', 'No players online');
      }
    } catch (error) {
      this.logger.error(`Palworld server error: ${error.message}`);
      
      // More robust offline message
      PalworldEmbed.setDescription('⚠️ **Palworld server appears to be offline!**')
        .addField('Error Details', 'Unable to connect to the Palworld server API')
        .addField('What to do', 'If the server should be online, please contact a server admin')
        .addField('Auto-restart', 'The server should auto-restart within 5 minutes if it crashed');
        
      // If we have specific error information, add it (useful for admins)
      if (error.response) {
        PalworldEmbed.addField('Status Code', `${error.response.status} ${error.response.statusText}`, true);
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        PalworldEmbed.addField('Connection Error', `${error.code}: Server may be down or restarting`, true);
      }
    }

    // Send the final Palworld embed
    message.channel.send({
      embeds: [PalworldEmbed],
      content: `It took ${((performance.now() - perfStart) / 1000).toFixed(2)} seconds to get this list:`,
    });

    this.logger.info('<<display_all_servers_status');
  },
};
