module.exports = {
    name: 'light_ctrl',
    description: 'controls a light.',
    syntax: 'light_ctrl',
    num_args: 2,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        var fs = require('fs');
        var axios = require('axios');

        var token = await fs.readFileSync("../hue_token.txt").toString();
        token = token.replace(/(\r\n|\n|\r)/gm, "");
        var lightID = args[2];

        var red = args[3];
        var green = args[4];
        var blue = args[5];
        red = (red > 0.04045) ? Math.pow((red + 0.055) / (1.0 + 0.055), 2.4) : (red / 12.92);
        green = (green > 0.04045) ? Math.pow((green + 0.055) / (1.0 + 0.055), 2.4) : (green / 12.92);
        blue = (blue > 0.04045) ? Math.pow((blue + 0.055) / (1.0 + 0.055), 2.4) : (blue / 12.92);
        var X = red * 0.664511 + green * 0.154324 + blue * 0.162028;
        var Y = red * 0.283881 + green * 0.668433 + blue * 0.047685;
        var Z = red * 0.000088 + green * 0.072310 + blue * 0.986039;
        var fx = X / (X + Y + Z);
        var fy = Y / (X + Y + Z);

        var url = `http://192.168.1.58/api/${token}/lights/${lightID}/state`;
        var lightResp;

      if(args[1] == "on"){
        try {
            lightResp = await axios.put(url, {
                on: true,
                xy:[fx,fy],
                //hue: parseInt(args[3]),
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
