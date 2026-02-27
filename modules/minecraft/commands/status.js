module.exports = {
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status [name of server]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    options: [
        { name: 'server_name', description: 'Name of the server', type: 'STRING', required: true },
    ],
    async execute(message, args, extra) {
        const { performance } = require('perf_hooks');
        const perfStart = performance.now();
        const { EmbedBuilder } = require('discord.js');
        const pinger = require("minecraft-ping-js");

        const api = extra.api;

        message.channel.send({ content: 'Checking server status...' });

        try {
            const respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });

            if (respServer.minecraft_servers[0]) {
                const server = respServer.minecraft_servers[0];
                const ListEmbed = new EmbedBuilder()
                    .setColor("#f92f03")
                    .setTitle(`${server.display_name} Status`)
                    .setDescription(`IP: \`${server.server_ip}\``)
                    .addFields(
                        { name: "Notice:", value: "If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not." }
                    );

                try {
                    const response = await pinger.pingWithPromise(server.backend_ip, server.port);
                    
                    if (response) {
                        ListEmbed.addFields(
                            { name: "Status:", value: "✅ **ONLINE**", inline: true },
                            { name: "Players:", value: `${response.players.online}/${response.players.max}`, inline: true }
                        );
                        
                        if (response.version) {
                            ListEmbed.addFields({ name: "Version:", value: response.version.name, inline: true });
                        }
                        
                        if (response.motd && response.motd.clean) {
                            ListEmbed.addFields({ name: "MOTD:", value: response.motd.clean });
                        }
                        
                        // Handle player list with special character escaping
                        if (response.players.online > 0 && response.players.sample) {
                            const SensitiveCharacters = ['\\', '*', '_', '~', '`', '|', '>'];
                            let playersList = "";
                            
                            for (const player of response.players.sample) {
                                let escapedName = player.name;
                                for (const unsafe of SensitiveCharacters) {
                                    escapedName = escapedName.replaceAll(unsafe, `\\${unsafe}`);
                                }
                                playersList += `- ${escapedName}\n`;
                            }
                           
                            ListEmbed.addFields({ name: "Players Online:", value: playersList || "No player information available" });
                        } else if (response.players.online > 0) {
                            ListEmbed.addFields({ name: "Players Online:", value: "Players are online, but names couldn't be retrieved" });
                        } else {
                            ListEmbed.addFields({ name: "Players Online:", value: "No players currently online" });
                        }
                        
                        if (response.favicon) {
                            ListEmbed.setThumbnail("attachment://server-icon.png");
                        }
                    } else {
                        ListEmbed.addFields({ name: "Status:", value: "❌ **OFFLINE**" });
                        ListEmbed.setDescription("Server appears to be offline or not responding");
                    }

                } catch (status_error) {
                    this.logger.error(status_error.message);
                    ListEmbed.addFields(
                        { name: "Status:", value: "❌ **OFFLINE**" },
                        { name: "Error:", value: `Failed to connect: ${status_error.message}` }
                    );
                    ListEmbed.setDescription("Server appears to be offline or not responding");
                }
                
                const perfTime = ((performance.now() - perfStart) / 1000).toFixed(2);
                ListEmbed.setFooter({ text: `Response time: ${perfTime} seconds` });
                
                message.channel.send({ embeds: [ListEmbed] });
            } else {
                message.channel.send({ 
                    content: "Sorry, couldn't find a server with that shortname, try ,listmc for a list of all servers." 
                });
            }
        } catch (error) {
            this.logger.error(error);
            message.channel.send({ 
                content: `Error getting server information: ${error.message}` 
            });
        }
    }
};