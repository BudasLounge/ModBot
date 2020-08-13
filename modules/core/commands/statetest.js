module.exports = {
    name: 'statetest',
    description: 'Helps test the saved-state system!',
    syntax: 'statetest',
    num_args: 0,
    args_to_lower: true,
    has_state: true,
    async execute(message, args, api, state, mod_handler) {
      var stage = state.data.has("stage") ? state.data.get("stage") : 0;
      switch(stage) {
        case 0:
          message.channel.send("This is the first response!");
          break;
        case 1:
          message.channel.send("This is the second message!");
          break;
        case 2:
          message.channel.send("This is the third and final message. It can go for however long you want, though!");
          state.delete = true;
          break;
        default:
          message.channel.send("Somehow, the 'stage' state data got to a value it shouldn't be!");
      }

      state.data.set("stage", stage + 1);
    }
};
