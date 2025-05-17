module.exports = {
  name: 'wipe_channel',
  description: 'Wipes all messages from a specified channel.',
  syntax: 'wipe_channel [channel_id]',
  num_args: 1,
  args_to_lower: false,
  needs_api: false,
  has_state: false,
  async execute(message, args, extra) {
    if (message.author.bot) return;

    const channelId = args[1];
    if (!channelId) {
      return message.reply('Please provide a channel ID.');
    }

    const channel = message.guild.channels.cache.get(channelId);

    if (!channel) {
      return message.reply('Could not find that channel. Please check the ID.');
    }

    if (channel.type !== 'GUILD_TEXT') {
      return message.reply('This command can only be used on text channels.');
    }

    if (!message.guild.members.me.permissionsIn(channel).has('ManageMessages')) {
        return message.reply('I do not have permission to delete messages in that channel.');
    }
    
    if (!message.member.permissionsIn(channel).has('ManageMessages')) {
        return message.reply('You do not have permission to delete messages in that channel.');
    }

    try {
      let fetched;
      do {
        fetched = await channel.messages.fetch({ limit: 100 });
        if (fetched.size > 0) {
          await channel.bulkDelete(fetched, true);
        }
      } while (fetched.size > 0);

      const confirmationMessage = await message.reply(`Successfully wiped all messages from ${channel.name}.`);
      setTimeout(() => confirmationMessage.delete(), 5000); // Delete confirmation after 5 seconds

    } catch (error) {
      this.logger.error(`Error wiping channel ${channelId}: ${error.message}`);
      message.reply('An error occurred while trying to wipe the channel. Please check the logs.');
    }
  }
};
