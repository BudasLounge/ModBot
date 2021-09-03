module.exports = {
    name: 'lctrl',
    description: 'Controls a lights on or off state and its color, if applicable',
    syntax: 'lctrl [on/off] [lightID] [R] [G] [B]',
    num_args: 2,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {

        const moment = require('moment');
        var d = new Date(); // current time
        var hours = d.getHours();
        var now = moment();
        

        if((hours >= 8 && (hours < 23)) || message.author.id === "185223223892377611"){

        }else{
            var deadline = now.clone().hour(8).minute(0).second(0);
            var opening_time;
            if(now.isAfter(deadline)) {
                var tomorrow  = moment(new Date()).add(1,'days').hour(8).minute(0).second(0);
                opening_time = tomorrow.diff(now, "hours") + ' hrs, ' + (tomorrow.diff(now, "minutes") % 60) + ' mins'
                //opening_time = tomorrow.from(now);
            }else {
                opening_time = deadline.diff(now, "hours") + ' hrs, ' + (deadline.diff(now, "minutes") % 60) + ' mins'
                //opening_time = deadline.from(now);
            }
            message.channel.send("This command is closed. It will open again " + opening_time + ". Try again later!");
            return;
        }

        var fs = require('fs');
        var axios = require('axios');
        var token = await fs.readFileSync("../hue_token.txt").toString();
        token = token.replace(/(\r\n|\n|\r)/gm, "");

        var lightPrep = await axios.get(`http://192.168.1.58/api/${token}/lights`, {

        });
        var lightCount = [];
        for(var key in lightPrep.data){
            this.logger.info("Pushing key: " + key);
            key = key.replace(/(\r\n|\n|\r)/gm, "");
            lightCount.push(key);
        }
        var multi = false;
        if(args[2].includes("-")){
            multi = true;
            var start = args[2].substring(0, args[2].indexOf("-"));
            var end = args[2].substring(args[2].indexOf("-")+1);
            if(!Number.isInteger(parseInt(start)) || !Number.isInteger(parseInt(end))){
                message.channel.send("Please enter a valid range of lightIDs (make sure the values are numeric)");
                return;
            }
        }else{
            if(!Number.isInteger(parseInt(args[2]))){
                message.channel.send("Please enter a valid lightID");
                return;
            }
        }

        var lightID = args[2];
        if(lightID === "12"){
            if(args[3] == "rando"){
                args[3] = Math.random() * (255-1) +1;
                args[4] = Math.random() * (255-1) +1;
                args[5] = Math.random() * (255-1) +1;
            }
        if((Number.isInteger(parseInt(args[3])) && Number.isInteger(parseInt(args[4])) && Number.isInteger(parseInt(args[5]))) || args[1] == "off"){
            
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
          if(multi){
              this.logger.info("In multi "+start + " " + end);
            for(var i = start;i<=end;i++){
                this.logger.info("Loop " + i);
                url = `http://192.168.1.58/api/${token}/lights/${i}/state`
                try{
                    lightResp = await axios.put(url, {
                        on: true,
                    });
                } catch (err) {
                    this.logger.error(err);
                    message.channel.send("Err!");
                    return;
                }
            }
            message.channel.send("Multiple lights controlled!");
          }else{
            try {
                if(lightID === "12"){
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
                message.channel.send("Err!");
                return;
            }
            message.channel.send("Light controlled!");
        }
      }else if(args[1] == "off"){
        if(multi){
            this.logger.info("In multi: "+start + " " + end);
            for(var i = start;i<=end;i++){
                this.logger.info("Loop " + i);
                url = `http://192.168.1.58/api/${token}/lights/${i}/state`
                try{
                    lightResp = await axios.put(url, {
                        on: false,
                    });
                } catch (err) {
                    this.logger.error(err);
                    message.channel.send("Err!");
                    return;
                }
            }
            message.channel.send("Multiple lights controlled!");
        }else{
            try {
                lightResp = await axios.put(url, {
                    on: false,
                });
            } catch (err) {
                this.logger.error(err);
                message.channel.send("Err!");
                return;
            }
            message.channel.send("Light controlled!");
        }   
      }
      else{
          message.channel.send("Usage: /light_ctrl [on/off] [lightID] [R] [G] [B]")
      }
    
    }
};
