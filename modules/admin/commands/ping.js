module.exports = {
    name: 'ping',
    description: 'Sends a message back. Used to test if the bot is working.',
    syntax: 'ping [arbitrary argument for testing]',
    num_args: 0,
    args_to_lower: true,
    has_state: false,
    execute(message, args, api, state) {
        /*console.log(state);
        if(!state.data.has('respSent')) {
          var output = "Here's your message in lowercase: ";
          for(var arg of args) {
            output += " " + arg;
          }
          message.channel.send(output);
        } else if(message.content.toLowerCase().includes("thank")) {
          message.channel.send("You're welcome!");
          state.delete = true;
      }*/

      message.channel.send("Admin Pong!");
    }
};
