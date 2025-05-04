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
    
    // Sort servers alphabetically by display_name
    const sortedServers = [...respServer.minecraft_servers].sort((a, b) => 
      a.display_name.localeCompare(b.display_name)
    );

    const ListEmbed = new Discord.MessageEmbed()
      .setColor('#f92f03')
      .setTitle('Minecraft Servers Status')
      .addField('Notice:', 'If a server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.');

    const SensitiveCharacters = ['\\', '*', '_', '~', '`', '|', '>'];

    const serverPromises = sortedServers.map(async (server) => {
      try {
        const item = await pinger.pingWithPromise(server.server_ip).catch(() => "OFFLINE");
        
        // Create field for each server with better formatting
        const serverField = {
          name: `${server.display_name}`,
          value: '',
          inline: false
        };
        
        if (item === "OFFLINE") {
          serverField.value = `❌ **OFFLINE**\n\nServer appears to be offline or not responding`;
        } else {
          const isOnline = item.players.online > 0;
          serverField.value = `✅ **ONLINE**\n`;
          serverField.value += `**Players:** ${item.players.online}/${item.players.max}\n`;
          
          if (item.version) {
            serverField.value += `**Version:** ${item.version.name}\n`;
          }
          
          if (isOnline && item.players.sample) {
            serverField.value += '\n**Players online:**\n';
            for (const { name } of item.players.sample) {
              const escapedName = SensitiveCharacters.reduce((acc, unsafe) => acc.replaceAll(unsafe, `\\${unsafe}`), name);
              serverField.value += `- ${escapedName}\n`;
            }
          } else if (isOnline) {
            serverField.value += '\nPlayers are online, but names couldn\'t be retrieved\n';
          } else {
            serverField.value += '\nNo players currently online\n';
          }
        }
        
        ListEmbed.addField(serverField.name, serverField.value, serverField.inline);
        return serverField;
      } catch (error) {
        this.logger.error(`${error}, setting flag to true`);
        ListEmbed.addField(
          `${server.display_name}`, 
          `❌ **OFFLINE**\n\nServer appears to be offline or not responding\n**Error:** ${error.message}`, 
          false
        );
        return error;
      }
    });

    await Promise.all(serverPromises);
    message.channel.send({embeds: [ListEmbed]})
    
    // Send a separate message to better separate the different game statuses
    const palworldMsg = await message.channel.send({ content: `Now getting Palworld status...` });
    
    // Create Palworld embed
    const PalworldEmbed = new Discord.MessageEmbed()
      .setColor('#0a74da')
      .setTitle('Palworld Server Status');

    try {
      // Create promise with timeout for Palworld API
      const fetchPalworldMetrics = async () => {
        return await axios.get('http://192.168.1.4:8212/v1/api/metrics', {
          auth: { username: 'admin', password },
          timeout: 15000 // 15 second timeout
        });
      };
      
      const metricsResp = await fetchPalworldMetrics();
      const metrics = metricsResp.data;

      PalworldEmbed.setDescription('✅ **ONLINE**')
        .addField('Player Count', `${metrics.currentplayernum} / ${metrics.maxplayernum}`, true)
        .addField('Server FPS', `${metrics.serverfps}/60`, true);
      
      const uptimeSeconds = metrics.uptime;
      const uptimeHours = Math.floor(uptimeSeconds / 3600);
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
      PalworldEmbed.addField('Uptime', `${uptimeHours}h ${uptimeMinutes}m`, true);

      // If players online, fetch player list with timeout
      if (metrics.currentplayernum > 0) {
        try {
          const fetchPlayers = async () => {
            return await axios.get('http://192.168.1.4:8212/v1/api/players', {
              auth: { username: 'admin', password },
              timeout: 15000 // 15 second timeout
            });
          };
          
          const playersResp = await fetchPlayers();
          
          // Map each player as "name" ("accountName")
          const playerNames = playersResp.data.players.map(p => `${p.name} (${p.accountName})`);
          const namesList = playerNames.length ? playerNames.join('\n') : 'No players online';
          PalworldEmbed.addField('Players Online', namesList);
        } catch (playerError) {
          this.logger.error(`Failed to fetch Palworld player list: ${playerError.message}`);
          PalworldEmbed.addField('Players Online', `${metrics.currentplayernum} player(s) online\n(Unable to fetch player names)`);
        }
      } else {
        PalworldEmbed.addField('Players Online', 'No players online');
      }
    } catch (error) {
      this.logger.error(`Palworld server error: ${error.message}`);
      
      // More robust offline message
      PalworldEmbed.setDescription('❌ **OFFLINE**')
        .addField('Status', 'Palworld server appears to be offline!', false)
        .addField('Error Details', error.code === 'ECONNABORTED' ? 
          'Connection timed out after 15 seconds' : 
          'Unable to connect to the Palworld server API', false)
        .addField('What to do', 'If the server should be online, please contact a server admin', false)
        .addField('Auto-restart', 'The server should auto-restart within 5 minutes if it crashed', false);
        
      // If we have specific error information, add it (useful for admins)
      if (error.response) {
        PalworldEmbed.addField('Status Code', `${error.response.status} ${error.response.statusText}`, true);
      } else if (error.code) {
        PalworldEmbed.addField('Connection Error', `${error.code}`, true);
      }
    }

    // Update the total execution time
    const perfTime = ((performance.now() - perfStart) / 1000).toFixed(2);
    PalworldEmbed.setFooter(`Total execution time: ${perfTime} seconds`);

    // Send the final Palworld embed
    await palworldMsg.delete().catch(() => {});
    message.channel.send({
      embeds: [PalworldEmbed],
      content: `Here's the Palworld server status:`,
    });

    this.logger.info('<<display_all_servers_status');
  },
};
