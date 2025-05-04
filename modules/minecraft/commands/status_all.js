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
      .setTitle('Minecraft Servers Status');

    const SensitiveCharacters = ['\\', '*', '_', '~', '`', '|', '>'];

    const serverPromises = sortedServers.map(async (server) => {
      try {
        const item = await pinger.pingWithPromise(server.server_ip).catch(() => "OFFLINE");
        
        let statusInfo = '';
        
        if (item === "OFFLINE") {
          statusInfo = `❌ **OFFLINE**`;
        } else {
          statusInfo = `✅ **ONLINE**\n**Players:** ${item.players.online}/${item.players.max}`;
          
          if (item.players.online > 0 && item.players.sample) {
            statusInfo += '\n' + item.players.sample.map(({ name }) => {
              const escapedName = SensitiveCharacters.reduce((acc, unsafe) => 
                acc.replaceAll(unsafe, `\\${unsafe}`), name);
              return `- ${escapedName}`;
            }).join('\n');
          } else if (item.players.online > 0) {
            statusInfo += '\nPlayers online (names unavailable)';
          }
        }
        
        ListEmbed.addField(server.display_name, statusInfo, false);
        return statusInfo;
      } catch (error) {
        ListEmbed.addField(server.display_name, `❌ **OFFLINE**`, false);
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

      let status = `✅ **ONLINE**\n`;
      status += `**Players:** ${metrics.currentplayernum}/${metrics.maxplayernum}`;
      
      const uptimeSeconds = metrics.uptime;
      const uptimeHours = Math.floor(uptimeSeconds / 3600);
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
      status += `\n**Uptime:** ${uptimeHours}h ${uptimeMinutes}m`;
      
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
          const playerNames = playersResp.data.players.map(p => `- ${p.name} (${p.accountName})`).join('\n');
          if (playerNames) {
            PalworldEmbed.addField('Players Online', playerNames);
          }
        } catch (playerError) {
          // Silent error - already showing player count in status
        }
      }
    } catch (error) {
      this.logger.error(`Palworld server error: ${error.message}`);
      PalworldEmbed.setDescription('❌ **OFFLINE**');
    }

    // Send the final Palworld embed
    await palworldMsg.delete().catch(() => {});
    message.channel.send({
      embeds: [PalworldEmbed]
    });

    this.logger.info('<<display_all_servers_status');
  },
};
