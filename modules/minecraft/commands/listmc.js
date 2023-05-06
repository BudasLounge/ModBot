module.exports = {
    name: 'listmc',
    description: 'Shows all servers and their information',
    syntax: 'listmc',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
      const { api } = extra;
  
      this.logger.info('>>display_all_servers');
      try {
        const { minecraft_servers } = await api.get('minecraft_server', { _limit: 20 });
        this.logger.info(`${minecraft_servers.length} servers found...`);
  
        const embed = new Discord.MessageEmbed()
          .setColor('#f92f03')
          .setTitle('List of all minecraft servers:');
  
        const fields = minecraft_servers.map(({ display_name, short_name, server_ip, numeric_ip, port, mc_version, pack_version, date_created }) => ({
          name: `${display_name} server info:`,
          value: `${display_name}:\nshort name: ${short_name}\nserver ip: ${server_ip}\nnumeric ip: ${numeric_ip}:${port}\nminecraft version: ${mc_version}\npack version: ${pack_version}\ndate created: ${date_created}\n\n`
        }));
  
        embed.addFields(fields);
  
        message.channel.send({ embeds: [embed] });
        this.logger.info('<<display_all_servers');
      } catch (error) {
        this.logger.error(error);
      }
    }
  };