module.exports = {
  name: 'getmyid',
  description: 'Tells the user their discord ID.',
  syntax: 'getmyid',
  num_args: 0,
  args_to_lower: true,
  has_state: false,
  async execute(message, args, api, state, mod_handler) {
    message.channel.send("Your Discord ID is: " + message.author.id);
  }
};