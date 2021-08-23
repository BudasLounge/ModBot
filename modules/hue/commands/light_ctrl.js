module.exports = {
    name: 'light_ctrl',
    description: 'controls a light.',
    syntax: 'light_ctrl',
    num_args: 0,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
      var fs = require('fs');
      var token = fs.readFileSync("../hue_token.txt").toString();
      const url = `http://192.168.1.58/api/${token}/lights/`;
      var lightResp;
    try {
        lightResp = await axios.get(url, {
           
        });
    } catch (err) {
        this.logger.error(err);
    }
    message.channel.send(lightResp);
    //message.channel.send("Light controlled!");
    }
};
