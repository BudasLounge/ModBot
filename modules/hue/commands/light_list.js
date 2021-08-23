module.exports = {
    name: 'light_list',
    description: 'Returns a list of all lights that are controllabble.',
    syntax: 'light_list',
    num_args: 0,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    execute(message, args, extra) {
      var fs = require('fs');
      var token = fs.readFileSync("../hue_token.txt").toString();
      message.channel.send(token);
    }
};
