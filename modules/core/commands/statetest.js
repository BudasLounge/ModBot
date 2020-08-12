module.exports = {
    name: 'statetest',
    description: 'Helps test the saved-state system!',
    syntax: 'statetest',
    num_args: 0,
    args_to_lower: true,
    has_state: true,
    async execute(message, args, api, state, mod_handler) {
      this.logger.info(state.data);

      message.channel.send("" + state);
    }
};
