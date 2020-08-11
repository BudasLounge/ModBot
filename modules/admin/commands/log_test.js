module.exports = {
    name: 'logtest',
    description: 'Tests the logging function',
    syntax: 'logtest',
    num_args: 0,
    args_to_lower: true,
    has_state: false,
    execute(message, args, api, state) {
      if(this.hasOwnProperty("logger")) {
          logger.log("This is a test of the logging system in commands!");
          message.channel.send("Found the logger!");
      } else {
          message.channel.send("There was a problem trying to find the logger!");
      }

      message.channel.send("Admin Pong!");
    }
};
