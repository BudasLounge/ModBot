const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'lol_link',
  description: 'Link your League of Legends account to your Discord user.',
  syntax: 'lol_link',
  num_args: 0,
  args_to_lower: false,
  needs_api: false,
  has_state: false,

  async execute(message, args) {
    // 1) anyone can use without args (this command already has num_args: 0)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('LEAGUE_LINK_BUTTON')
        .setLabel('Link LoL and Discord')
        .setStyle(ButtonStyle.Primary),
    );

    // 2) respond with button
    await message.channel.send({
      content: 'Click the button below to link your League of Legends account!',
      components: [row],
    });
  },
};
