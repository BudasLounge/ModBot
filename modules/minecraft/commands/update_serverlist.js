module.exports = {
  name: 'updatesl',
  description: 'Used to update parts of the minecraft server list',
  syntax: 'updatesl [server name] [whats updating] [new value]',
  num_args: 3,
  args_to_lower: true,
  needs_api: true,
  has_state: false,
  async execute(message, args, extra) {
    const api = extra.api;
    const Discord = require('discord.js');
    const authorizedUser = message.member.roles.cache.find(r => r.id === '586313447965327365') || message.author.id === '185223223892377611';
    if (!authorizedUser) {
      return message.channel.send({ content: 'You don\'t have permission to use that command!' });
    }
    args.shift();
    const [shortName, fieldToUpdate, newValue] = args;
    let respServer;
    try {
      respServer = await api.get('minecraft_server', { short_name: shortName });
      if (!respServer.minecraft_servers[0]) {
        respServer = await api.get('minecraft_server', { display_name: shortName });
        if (!respServer.minecraft_servers[0]) {
          return message.channel.send({ content: 'No server with that short_hand or display_name.' });
        }
      }
      const data = { short_name: respServer.minecraft_servers[0].short_name };
      data[fieldToUpdate] = newValue;
      const respUpdate = await api.put('minecraft_server', data);
      if (respUpdate.ok == true) {
        const changedInfo = `
            short_name: ${respServer.minecraft_servers[0].short_name}
            display_name: ${respServer.minecraft_servers[0].display_name}
            server_ip + port: ${respServer.minecraft_servers[0].server_ip}
            numeric_ip: ${respServer.minecraft_servers[0].numeric_ip}:${respServer.minecraft_servers[0].port}
            status_api_port: ${respServer.minecraft_servers[0].status_api_port}
            mc_version: ${respServer.minecraft_servers[0].mc_version}
            pack_version: ${respServer.minecraft_servers[0].pack_version}
            vvvvv has been changed to vvvvv
            short_name: ${respUpdate.minecraft_server.short_name}
            display_name: ${respUpdate.minecraft_server.display_name}
            server_ip + port: ${respUpdate.minecraft_server.server_ip}
            numeric_ip: ${respUpdate.minecraft_server.numeric_ip}:${respUpdate.minecraft_server.port}
            status_api_port: ${respUpdate.minecraft_server.status_api_port}
            mc_version: ${respUpdate.minecraft_server.mc_version}
            pack_version: ${respUpdate.minecraft_server.pack_version}`;

        const listEmbed = new Discord.MessageEmbed()
          .setColor('#f92f03')
          .setTitle('Here\'s what changed: \n' + fieldToUpdate)
          .addField('A post function update: ', changedInfo);
        message.channel.send({ embeds: [listEmbed] });
      }
    } catch (err) {
      console.error(err);
      message.channel.send({ content: 'An error occurred.' });
    }
  }
};
