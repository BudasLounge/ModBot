module.exports = {
  name: 'palworld',
  description: 'Palworld server control commands (Moderator only)',
  syntax: 'palworld <action> [target] [message] [waittime]',
  num_args: 1,
  args_to_lower: false,
  needs_api: false,
  has_state: false,
  options: [
    {
      name: 'action',
      description: 'Action to perform on the Palworld server',
      type: 'STRING',
      required: true,
      choices: [
        { name: 'players — List online players',              value: 'players'  },
        { name: 'announce — Broadcast a message',             value: 'announce' },
        { name: 'kick — Kick a player',                       value: 'kick'     },
        { name: 'ban — Ban a player',                         value: 'ban'      },
        { name: 'unban — Unban a player',                     value: 'unban'    },
        { name: 'save — Force save the world',                value: 'save'     },
        { name: 'shutdown — Graceful shutdown with countdown',value: 'shutdown' },
        { name: 'stop — Immediately force stop the server',   value: 'stop'     },
      ],
    },
    {
      // Used by: kick, ban, unban
      // Slash: autocompletes to userId of online players; for unban type manually
      // Text:  first positional arg after action
      name: 'target',
      description: 'Player userId for kick/ban/unban (use "players" action to look up IDs)',
      type: 'STRING',
      required: false,
      autocomplete: true,
    },
    {
      // Used by: announce, kick, ban, shutdown
      // Slash: this is args[3]
      // Text:  args.slice(2) for announce; args.slice(3) for kick/ban; args.slice(3) for shutdown
      name: 'message_text',
      description: 'Message to display (announce/kick/ban/shutdown)',
      type: 'STRING',
      required: false,
    },
    {
      // Used by: shutdown only
      // Slash: args[4] (stringified integer)
      // Text:  args[2]
      name: 'waittime',
      description: 'Seconds before shutdown (shutdown only, default: 10)',
      type: 'INTEGER',
      required: false,
    },
  ],

  async autocomplete(interaction) {
    const axios = require('axios');
    const fs = require('fs');
    try {
      const password = fs.readFileSync('../palworld_password.txt').toString().trim();
      const resp = await axios.get('http://192.168.1.4:8212/v1/api/players', {
        auth: { username: 'admin', password },
        timeout: 5000,
      });
      const players = resp.data.players || [];
      const focused = interaction.options.getFocused().toLowerCase();
      const filtered = players.filter(p => p.name.toLowerCase().includes(focused));
      await interaction.respond(
        filtered.slice(0, 25).map(p => ({ name: p.name, value: p.userId }))
      );
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(message, args, extra) {
    const axios = require('axios');
    const fs = require('fs');
    const { EmbedBuilder } = require('discord.js');

    // ── Role check ────────────────────────────────────────────────────────────
    if (!message.member.roles.cache.some(role => role.name === 'Moderator')) {
      return message.reply({ content: 'You must have the **Moderator** role to use this command.' });
    }

    const action = (args[1] || '').toLowerCase();

    // ── Credentials ───────────────────────────────────────────────────────────
    let password;
    try {
      password = fs.readFileSync('../palworld_password.txt').toString().trim();
    } catch (err) {
      this.logger.error(`[palworld] Failed to read password: ${err.message}`);
      return message.reply({ content: '❌ Failed to read Palworld API credentials.' });
    }

    const PALWORLD_API = 'http://192.168.1.4:8212/v1/api';
    const auth = { username: 'admin', password };
    const apiPost = (endpoint, data) =>
      axios.post(`${PALWORLD_API}/${endpoint}`, data, { auth, timeout: 10000 });

    // Slash commands push null for optional args that weren't provided.
    // Text commands never produce null entries in args.
    const isSlash = args.includes(null);

    // ── Actions ───────────────────────────────────────────────────────────────
    switch (action) {

      // List online players with their userIds (needed for kick/ban/unban)
      case 'players': {
        try {
          const resp = await axios.get(`${PALWORLD_API}/players`, { auth, timeout: 10000 });
          const players = resp.data.players || [];
          const embed = new EmbedBuilder()
            .setColor('#0a74da')
            .setTitle('Palworld — Online Players')
            .setDescription(
              players.length === 0
                ? 'No players are currently online.'
                : players.map(p =>
                    `• **${p.name}**\n  \`${p.userId}\`  ping: ${Math.round(p.ping)}ms  level: ${p.level}`
                  ).join('\n')
            );
          return message.channel.send({ embeds: [embed] });
        } catch (err) {
          this.logger.error(`[palworld] players: ${err.message}`);
          return message.reply({ content: '❌ Failed to fetch player list. Is the server online?' });
        }
      }

      // Broadcast a message to all online players
      case 'announce': {
        const msg = isSlash ? args[3] : args.slice(2).join(' ');
        if (!msg) return message.reply({ content: 'Usage: `palworld announce <message>`' });
        try {
          await apiPost('announce', { message: msg });
          this.logger.info(`[palworld] ${message.author.tag} announced: "${msg}"`);
          return message.reply({ content: `✅ Announced: *${msg}*` });
        } catch (err) {
          this.logger.error(`[palworld] announce: ${err.message}`);
          return message.reply({ content: '❌ Failed to send announcement.' });
        }
      }

      // Kick a player by userId
      case 'kick': {
        const target = args[2];
        const msg    = isSlash ? (args[3] || '') : args.slice(3).join(' ');
        if (!target) return message.reply({ content: 'Usage: `palworld kick <userId> [message]`\nRun `palworld players` to get userIds.' });
        try {
          await apiPost('kick', { userid: target, message: msg });
          this.logger.info(`[palworld] ${message.author.tag} kicked ${target}: "${msg}"`);
          return message.reply({ content: `✅ Kicked \`${target}\`${msg ? ` — *${msg}*` : ''}` });
        } catch (err) {
          this.logger.error(`[palworld] kick ${target}: ${err.message}`);
          return message.reply({ content: `❌ Failed to kick \`${target}\`. Are they currently online?` });
        }
      }

      // Ban a player by userId
      case 'ban': {
        const target = args[2];
        const msg    = isSlash ? (args[3] || '') : args.slice(3).join(' ');
        if (!target) return message.reply({ content: 'Usage: `palworld ban <userId> [message]`\nRun `palworld players` to get userIds.' });
        try {
          await apiPost('ban', { userid: target, message: msg });
          this.logger.info(`[palworld] ${message.author.tag} banned ${target}: "${msg}"`);
          return message.reply({ content: `✅ Banned \`${target}\`${msg ? ` — *${msg}*` : ''}` });
        } catch (err) {
          this.logger.error(`[palworld] ban ${target}: ${err.message}`);
          return message.reply({ content: `❌ Failed to ban \`${target}\`.` });
        }
      }

      // Unban a player by userId
      case 'unban': {
        const target = args[2];
        if (!target) return message.reply({ content: 'Usage: `palworld unban <userId>`' });
        try {
          await apiPost('unban', { userid: target });
          this.logger.info(`[palworld] ${message.author.tag} unbanned ${target}`);
          return message.reply({ content: `✅ Unbanned \`${target}\`` });
        } catch (err) {
          this.logger.error(`[palworld] unban ${target}: ${err.message}`);
          return message.reply({ content: `❌ Failed to unban \`${target}\`.` });
        }
      }

      // Force save the world
      case 'save': {
        try {
          await apiPost('save', {});
          this.logger.info(`[palworld] ${message.author.tag} triggered a world save`);
          return message.reply({ content: '✅ World saved.' });
        } catch (err) {
          this.logger.error(`[palworld] save: ${err.message}`);
          return message.reply({ content: '❌ Failed to save the world.' });
        }
      }

      // Graceful shutdown with countdown
      // Text:  palworld shutdown [seconds] [message]   (seconds default 10)
      // Slash: waittime option = args[4]; message_text option = args[3]
      case 'shutdown': {
        const waittime = isSlash ? (parseInt(args[4]) || 10) : (parseInt(args[2]) || 10);
        const msg      = isSlash ? (args[3] || '')           : args.slice(3).join(' ');
        try {
          await apiPost('shutdown', { waittime, message: msg });
          this.logger.info(`[palworld] ${message.author.tag} initiated shutdown in ${waittime}s: "${msg}"`);
          return message.reply({ content: `✅ Server shutting down in **${waittime}s**${msg ? ` — *${msg}*` : ''}` });
        } catch (err) {
          this.logger.error(`[palworld] shutdown: ${err.message}`);
          return message.reply({ content: '❌ Failed to initiate shutdown.' });
        }
      }

      // Immediately force stop (no countdown)
      case 'stop': {
        try {
          await apiPost('stop', {});
          this.logger.info(`[palworld] ${message.author.tag} force-stopped the server`);
          return message.reply({ content: '✅ Server force-stopped.' });
        } catch (err) {
          this.logger.error(`[palworld] stop: ${err.message}`);
          return message.reply({ content: '❌ Failed to stop the server.' });
        }
      }

      // No action / unknown — show help
      default: {
        const embed = new EmbedBuilder()
          .setColor('#0a74da')
          .setTitle('Palworld Server Control')
          .setDescription('Requires the **Moderator** role.')
          .addFields(
            { name: 'players',                       value: 'List online players and their userIds' },
            { name: 'announce <message>',            value: 'Broadcast a message to all players' },
            { name: 'kick <userId> [message]',       value: 'Kick a player from the server' },
            { name: 'ban <userId> [message]',        value: 'Ban a player from the server' },
            { name: 'unban <userId>',                value: 'Remove a ban' },
            { name: 'save',                          value: 'Force save the world' },
            { name: 'shutdown [seconds] [message]',  value: 'Graceful shutdown with countdown (default 10s)' },
            { name: 'stop',                          value: 'Immediately force stop the server' },
          );
        return message.channel.send({ embeds: [embed] });
      }
    }
  },
};
