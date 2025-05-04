module.exports = {
    name: 'status',
    description: 'Finds the status of a minecraft server',
    syntax: 'status [name of server]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        const { performance } = require('perf_hooks');
        const perfStart = performance.now();
        const Discord = require('discord.js');
        const pinger = require("minecraft-ping-js");

        const api = extra.api;

        message.channel.send({ content: 'Checking server status...' });

        try {
            const respServer = await api.get("minecraft_server", {
                short_name: args[1]
            });

            if (respServer.minecraft_servers[0]) {
                const server = respServer.minecraft_servers[0];
                const ListEmbed = new Discord.MessageEmbed()
                    .setColor("#f92f03")
                    .setTitle(`${server.display_name} Status`)
                    .setDescription(`IP: \`${server.numeric_ip}\` | Port: \`${server.port || 25565}\``)
                    .addField("Notice:", "If the server crashed, it should auto restart in 5 minutes or less\nContact a server admin if it does not.");

                try {
                    const response = await pinger.pingWithPromise(server.backend_ip, server.port);
                    
                    if (response) {
                        ListEmbed.addField("Status:", "✅ **ONLINE**", true);
                        ListEmbed.addField("Players:", `${response.players.online}/${response.players.max}`, true);
                        
                        if (response.version) {
                            ListEmbed.addField("Version:", response.version.name, true);
                        }
                        
                        if (response.motd && response.motd.clean) {
                            ListEmbed.addField("MOTD:", response.motd.clean);
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
                            
                            ListEmbed.addField("Players Online:", playersList || "No player information available");
                        } else if (response.players.online > 0) {
                            ListEmbed.addField("Players Online:", "Players are online, but names couldn't be retrieved");
                        } else {
                            ListEmbed.addField("Players Online:", "No players currently online");
                        }
                        
                        if (response.favicon) {
                            ListEmbed.setThumbnail("attachment://server-icon.png");
                        }
                    } else {
                        ListEmbed.addField("Status:", "❌ **OFFLINE**");
                        ListEmbed.setDescription("Server appears to be offline or not responding");
                    }

                } catch (status_error) {
                    this.logger.error(status_error.message);
                    ListEmbed.addField("Status:", "❌ **OFFLINE**");
                    ListEmbed.addField("Error:", `Failed to connect: ${status_error.message}`);
                    ListEmbed.setDescription("Server appears to be offline or not responding");
                }
                
                const perfTime = ((performance.now() - perfStart) / 1000).toFixed(2);
                ListEmbed.setFooter(`Response time: ${perfTime} seconds`);
                
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