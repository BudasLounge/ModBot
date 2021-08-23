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

      var token = await fs.readFileSync("../hue_token.txt").toString();
      token = token.replace(/(\r\n|\n|\r)/gm, "");

      var url = `http://192.168.1.58/api/${token}/lights/7/state`;
      message.channel.send(url);
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
      else{
          lightResp = await axios.get("http://192.168.1.58/api/Y-rvKf4l0NUAWUc-cJ8AxKB3U2zzIGveGEgs1l9W/lights", {

          });
          message.channel.send(JSON.stringify(lightResp));
      }
    message.channel.send("Light controlled!");
    }
};
