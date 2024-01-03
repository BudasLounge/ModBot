module.exports ={
    name: 'listmc',
    description: 'Shows all servers and their information',
    syntax: 'listmc',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, { api }) {
        const Discord = require('discord.js');
        const respServer = await api.get("minecraft_server", {
            _limit: 20
        });
        const ListEmbed = new Discord.MessageEmbed()
            .setColor("#f92f03")
            .setTitle("List of all minecraft servers: ");
        respServer.minecraft_servers.map(({ display_name, short_name, server_ip, numeric_ip, port, mc_version, pack_version, date_created, url }) => {
            const nextItem = `${display_name}:\nshort name: ${short_name}\nserver ip: ${server_ip}\nnumeric ip: ${numeric_ip}:${port}\nminecraft version: ${mc_version}\npack version: ${pack_version}\ndate created: ${date_created}\nurl: ${url}\n`;
            ListEmbed.addField(`${display_name} server info:`, nextItem);
        });
        message.channel.send({ embeds: [ListEmbed] });
    }
};