module.exports = {
    name: 'pal_status',
    description: 'Shows the status of the Palworld server',
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
        const { EmbedBuilder } = require('discord.js');

        let password;
        try {
            password = fs.readFileSync('../palworld_password.txt').toString().trim();
        } catch (err) {
            return message.reply({ content: '❌ Failed to read Palworld API credentials.' });
        }

        const PALWORLD_API = 'http://192.168.1.4:8212/v1/api';
        const auth = { username: 'admin', password };

        const embed = new EmbedBuilder()
            .setColor('#0a74da')
            .setTitle('Palworld Server Status');

        let online = false;
        let metricsData = null;
        let playersData = null;

        try {
            const [metricsResp, playersResp] = await Promise.all([
                axios.get(`${PALWORLD_API}/metrics`, { auth, timeout: 10000 }),
                axios.get(`${PALWORLD_API}/players`, { auth, timeout: 10000 }),
            ]);
            metricsData = metricsResp.data;
            playersData = playersResp.data.players;
            online = true;
        } catch (err) {
            // server is offline
        }

        if (online) {
            let status = `✅ **ONLINE**`;
            status += `\nPlayers: ${metricsData.currentplayernum}/${metricsData.maxplayernum}`;
            status += `\nServer FPS: ${metricsData.serverfps}`;

            embed.setDescription(status);

            if (playersData && playersData.length > 0) {
                const playerNames = playersData.map(p => `• ${p.name}`).join('\n');
                embed.addFields({ name: 'Players Online', value: playerNames });
            }
        } else {
            let status = `❌ **OFFLINE**`;
            status += `\n\nIf the server should be online, please contact a server admin.\nThe server should auto-restart within 5 minutes if it crashed.`;

            embed.setDescription(status);
        }

        return message.channel.send({ embeds: [embed] });
    },
};
