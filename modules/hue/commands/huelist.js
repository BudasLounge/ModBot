module.exports = {
    name: 'huelist',
    description: 'Lists all Hue devices',
    syntax: 'huelist',
    num_args: 0,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {

        var fs = require('fs');
        var axios = require('axios');

        var token = await fs.readFileSync("../hue_token.txt").toString();
        token = token.replace(/(\r\n|\n|\r)/gm, "");
        lightResp = await axios.get(`http://192.168.1.58/api/${token}/lights`, {

          });
          message.channel.send(JSON.parse(lightResp));
    }
}