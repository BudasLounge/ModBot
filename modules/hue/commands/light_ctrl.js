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
      const url = `http://192.168.1.58/api/Y-rvKf4l0NUAWUc-cJ8AxKB3U2zzIGveGEgs1l9W/lights/7/state`;
      var lightResp;
    try {
        lightResp = await axios.put(url, {
            on: true,
        });
    } catch (err) {
        this.logger.error(err);
    }
    message.channel.send("Light controlled!");
    }
};
