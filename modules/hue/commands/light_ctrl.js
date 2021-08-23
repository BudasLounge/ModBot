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
      var axios = require('axios');
      var token = fs.readFileSync("../hue_token.txt").toString();
      const url = `http://192.168.1.58/api/`+token+`/lights/7/state`;
      var lightResp;
      if(args[1] == "on"){
        try {
            lightResp = await axios.put(url, {
                on: true,
            });
        } catch (err) {
            this.logger.error(err);
        }
      }else if(args[1] == "off"){
        try {
            lightResp = await axios.put(url, {
                on: false,
            });
        } catch (err) {
            this.logger.error(err);
        }
      }
    
    message.channel.send("Light controlled!");
    }
};
