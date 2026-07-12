module.exports = {
    name: 'pal_status',
    description: 'Shows the status of the Palworld server (internal API + external port check)',
    syntax: 'pal_status',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    options: [],
    async execute(message, args) {
        if (!message.member.roles.cache.some(role => role.name === 'Moderator')) {
            return message.reply({ content: 'You must have the **Moderator** role to use this command.' });
        }

        const axios = require('axios');
        const fs = require('fs');
        const net = require('net');
        const { EmbedBuilder } = require('discord.js');

        let password;
        try {
            password = fs.readFileSync('../palworld_password.txt').toString().trim();
        } catch (err) {
            return message.reply({ content: '❌ Failed to read Palworld API credentials.' });
        }

        const PALWORLD_API = 'http://192.168.1.4:8212/v1/api';
        const auth = { username: 'admin', password };
        const EXTERNAL_IP = '68.224.159.205';
        const EXTERNAL_PORT = 8211;

        const embed = new EmbedBuilder()
            .setColor('#0a74da')
            .setTitle('Palworld Server Status');

        let internalOnline = false;
        let metricsData = null;
        let playersData = null;

        try {
            const [metricsResp, playersResp] = await Promise.all([
                axios.get(`${PALWORLD_API}/metrics`, { auth, timeout: 10000 }),
                axios.get(`${PALWORLD_API}/players`, { auth, timeout: 10000 }),
            ]);
            metricsData = metricsResp.data;
            playersData = playersResp.data.players;
            internalOnline = true;
        } catch (err) {
            // server is offline internally
        }

        let externalOnline = false;
        try {
            externalOnline = await new Promise((resolve) => {
                const socket = new net.Socket();
                socket.setTimeout(5000);
                socket.on('connect', () => { socket.destroy(); resolve(true); });
                socket.on('error', () => { socket.destroy(); resolve(false); });
                socket.on('timeout', () => { socket.destroy(); resolve(false); });
                socket.connect(EXTERNAL_PORT, EXTERNAL_IP);
            });
        } catch (err) {
            externalOnline = false;
        }

        if (internalOnline) {
            let status = `✅ **ONLINE**`;
            status += `\nPlayers: ${metricsData.currentplayernum}/${metricsData.maxplayernum}`;
            status += `\nServer FPS: ${metricsData.serverfps}`;
            status += `\n\nExternal (${EXTERNAL_IP}:${EXTERNAL_PORT}): ${externalOnline ? '✅ Reachable' : '⚠️ Unreachable'}`;

            embed.setDescription(status);

            if (playersData && playersData.length > 0) {
                const playerNames = playersData.map(p => `• ${p.name}`).join('\n');
                embed.addFields({ name: 'Players Online', value: playerNames });
            }
        } else {
            let status = `❌ **OFFLINE**`;
            status += `\n\nExternal (${EXTERNAL_IP}:${EXTERNAL_PORT}): ${externalOnline ? '⚠️ Port open but API unresponsive' : '❌ Unreachable'}`;
            status += `\n\nIf the server should be online, please contact a server admin.\nThe server should auto-restart within 5 minutes if it crashed.`;

            embed.setDescription(status);
        }

        return message.channel.send({ embeds: [embed] });
    },
};
