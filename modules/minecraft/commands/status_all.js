module.exports = {
  name: 'statusall',
  description: 'Shows all servers and their information',
  syntax: 'statusall',
  num_args: 0,
  args_to_lower: false,
  needs_api: true,
  has_state: false,
  options: [],
  async execute(message, args, { api }) {

    const { performance } = require('perf_hooks');
    const perfStart = performance.now();
    const { EmbedBuilder } = require('discord.js');
    const pinger = require('minecraft-ping-js');
    const fs = require('fs');
    const net = require('net');

    // Read Palworld password from file
    const password = fs.readFileSync('../palworld_password.txt').toString().trim();

    // Minimal RCON client using Node's built-in net module.
    // Palworld's RCON returns all responses with id=0 (non-standard),
    // so we use a simple auth-then-command flow on a fresh connection per call.
    const rconSend = (host, port, pwd, command) => new Promise((resolve, reject) => {
      const client = net.createConnection({ host, port });
      let buf = Buffer.alloc(0);
      let authed = false;
      let done = false;

      const finish = (val, err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        client.destroy();
        if (err) reject(err); else resolve(val);
      };

      const timer = setTimeout(() => finish(null, new Error('RCON timeout')), 10000);

      const sendPkt = (id, type, body) => {
        const bodyBuf = Buffer.concat([Buffer.from(body, 'utf8'), Buffer.from([0, 0])]);
        const pkt = Buffer.alloc(12 + bodyBuf.length);
        pkt.writeInt32LE(4 + 4 + bodyBuf.length, 0);
        pkt.writeInt32LE(id, 4);
        pkt.writeInt32LE(type, 8);
        bodyBuf.copy(pkt, 12);
        client.write(pkt);
      };

      client.on('connect', () => sendPkt(1, 3, pwd));

      client.on('data', (data) => {
        buf = Buffer.concat([buf, data]);
        while (buf.length >= 4) {
          const len = buf.readInt32LE(0);
          if (buf.length < len + 4) break;
          const type = buf.readInt32LE(8);
          const body = buf.slice(12, 4 + len - 2).toString('utf8');
          buf = buf.slice(4 + len);

          if (!authed && type === 2) {
            authed = true;
            sendPkt(2, 2, command);
          } else if (authed) {
            finish(body, null);
          }
        }
      });

      client.on('error', (e) => finish(null, e));
      client.on('close', () => { if (!done) finish(null, new Error('RCON connection closed')); });
    });

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
      const RCON_HOST = '192.168.1.4';
      const RCON_PORT = 25575;

      // Run Info and ShowPlayers as sequential RCON calls
      const infoResponse = await rconSend(RCON_HOST, RCON_PORT, password, 'Info');
      const playersResponse = await rconSend(RCON_HOST, RCON_PORT, password, 'ShowPlayers');

      // Info response: "Welcome to Pal Server[v0.7.3.90464] Budaslounge\n"
      const versionMatch = infoResponse.match(/\[v([\d.]+)\]/);
      const version = versionMatch ? versionMatch[1] : null;

      // ShowPlayers response: "name,playeruid,steamid\nPlayer1,uid,steamid\n..."
      const playerLines = playersResponse
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('name,'));
      const playerCount = playerLines.length;

      let status = `✅ **ONLINE**`;
      if (version) status += `\nVersion: ${version}`;
      status += `\nPlayers: ${playerCount}`;

      PalworldEmbed.setDescription(status);

      if (playerCount > 0) {
        const playerNames = playerLines.map(l => `• ${l.split(',')[0]}`).join('\n');
        PalworldEmbed.addFields({ name: 'Players Online', value: playerNames });
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