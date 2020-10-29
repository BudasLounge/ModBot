module.exports = {
    name: 'state_test',
    description: 'Testing out state engine',
    syntax: 'state_test',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: true,
    async execute(message, args, extra) {
        var state = extra.state;
        if(!state.data.has("name")) {
            if(args.length == 2) {
              state.add_data("name", "STRING", args[1]);
              message.channel.send("Okay, " + state.data.get("name").data + ". I'll remember your name until this state times out!");
            } else {
              message.channel.send("Hi there! My name is ModBot! What's yours? (run /state_test <your_name>)");
            }
          } else {
            message.channel.send("Hello again, " + state.data.get("name").data);
          }
    }
};