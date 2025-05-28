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
    const { EmbedBuilder } = require('discord.js');
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
    
    // Sort servers alphabetically by display_name - force case insensitive sorting
    const sortedServers = [...respServer.minecraft_servers].sort((a, b) => 
      a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase())
    );
    
    // Debug logging to verify sorting
    this.logger.info("Server order after sorting:");
    sortedServers.forEach(server => {
      this.logger.info(`- ${server.display_name}`);
    });

    const ListEmbed = new EmbedBuilder()
      .setColor('#f92f03')
      .setTitle('Minecraft Servers Status')
      .setDescription('If a server crashed, it should auto restart in 5 minutes or less.\nContact a server admin if it should be online but remains offline.');

    const SensitiveCharacters = ['\\', '*', '_', '~', '`', '|', '>'];
    
    // Create empty fields array to ensure order is preserved
    const serverFields = [];

    const serverPromises = sortedServers.map(async (server, index) => {
      try {
        const item = await pinger.pingWithPromise(server.server_ip).catch(() => "OFFLINE");
        
        let statusInfo = '';
        
        if (item === "OFFLINE") {
          statusInfo = `❌ **OFFLINE**`;
        } else {
          statusInfo = `✅ **ONLINE**\nPlayers: ${item.players.online}/${item.players.max}`;
          
          if (item.players.online > 0 && item.players.sample) {
            statusInfo += '\n' + item.players.sample.map(({ name }) => {
              const escapedName = SensitiveCharacters.reduce((acc, unsafe) => 
                acc.replaceAll(unsafe, `\\${unsafe}`), name);
              return `• ${escapedName}`;
            }).join('\n');
          } else if (item.players.online > 0) {
            statusInfo += '\n(Player names unavailable)';
          }
        }
        
        // Store field data with original index to preserve order
        serverFields[index] = {
          name: server.display_name,
          value: statusInfo,
          inline: false
        };
        
        return statusInfo;
      } catch (error) {
        // Store field data with original index to preserve order
        serverFields[index] = {
          name: server.display_name,
          value: `❌ **OFFLINE**`,
          inline: false
        };
        return error;
      }
    });

    await Promise.all(serverPromises);
    
    // Add fields in correct order
    serverFields.forEach(field => {
      if (field) { // Check if field exists
        ListEmbed.addFields({ name: field.name, value: field.value, inline: field.inline });
      }
    });
    
    message.channel.send({ embeds: [ListEmbed] });
    
    // Send a separate message to better separate the different game statuses
    const palworldMsg = await message.channel.send({ content: `Now getting Palworld status...` });
    
    // Create Palworld embed
    const PalworldEmbed = new EmbedBuilder()
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

      let status = `✅ **ONLINE**\n`;
      status += `Players: ${metrics.currentplayernum}/${metrics.maxplayernum}`;
      
      const uptimeSeconds = metrics.uptime;
      const uptimeHours = Math.floor(uptimeSeconds / 3600);
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
      status += `\nUptime: ${uptimeHours}h ${uptimeMinutes}m`;
      
      PalworldEmbed.setDescription(status);

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
          const playerNames = playersResp.data.players.map(p => `• ${p.name} (${p.accountName})`).join('\n');
          if (playerNames) {
            PalworldEmbed.addFields({ name: 'Players Online', value: playerNames });
          }
        } catch (playerError) {
          // Silent error - already showing player count in status
        }
      }
    } catch (error) {
      this.logger.error(`Palworld server error: ${error.message}`);
      PalworldEmbed.setDescription('❌ **OFFLINE**\n\nIf the server should be online, please contact a server admin.\nThe server should auto-restart within 5 minutes if it crashed.');
    }

    // Send the final Palworld embed
    await palworldMsg.delete().catch(() => {});
    message.channel.send({
      embeds: [PalworldEmbed]
    });

    this.logger.info('<<display_all_servers_status');
  },
};