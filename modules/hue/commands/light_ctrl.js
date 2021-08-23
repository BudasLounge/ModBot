module.exports = {
    name: 'light_ctrl',
    description: 'Controls a lights on or off state and its color, if applicable',
    syntax: 'light_ctrl [on/off] [lightID] [R] [G] [B]',
    num_args: 2,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {

        var d = new Date(); // current time
        var hours = d.getHours();
        var mins = d.getMinutes();
        var day = d.getDay();
        if(hours >= 8 && (hours < 23)){

        }else{
            message.channel.send("This command is closed from 11pm to 8am. Try again later!");
        return;
        }

        var fs = require('fs');
        var axios = require('axios');

        var token = await fs.readFileSync("../hue_token.txt").toString();
        token = token.replace(/(\r\n|\n|\r)/gm, "");
        var lightID = args[2];
        if(lightID === "6"){
            if(args[3] == "rando"){
                args[3] = Math.random() * (255-1) +1;
                args[4] = Math.random() * (255-1) +1;
                args[5] = Math.random() * (255-1) +1;
            }
        if(Number.isInteger(parseInt(args[3])) && Number.isInteger(parseInt(args[4])) && Number.isInteger(parseInt(args[5]))){
            message.channel.send("Valid RGB!");
        }else{
            message.channel.send("Invalid RGB, defaulting to 100 100 100");
            args[3] = 100;
            args[4] = 100;
            args[5] = 100;
        }
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
            this.logger.info("Converted values were: " + fx + " " + fy);
        }
        

        var url = `http://192.168.1.58/api/${token}/lights/${lightID}/state`;
        var lightResp;

      if(args[1] == "on"){
        try {
            if(lightID === "6"){
                lightResp = await axios.put(url, {
                    on: true,
                    xy:[fx,fy],
                });
            }
            else{
                lightResp = await axios.put(url, {
                    on: true,
                });
            }
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
          /*lightResp = await axios.get(`http://192.168.1.58/api/${token}/lights`, {

          });
          message.channel.send(JSON.stringify(lightResp));*/
          message.channel.send("Usage: /light_ctrl [on/off] [lightID] [R] [G] [B]")
      }
    message.channel.send("Light controlled!");
    }
};
