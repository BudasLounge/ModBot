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
        var lightResp = await axios.get(`http://192.168.1.58/api/${token}/lights`, {

        });
        message.channel.send("Compiling light list...");
        var lightCount = [];
        for(var key in lightResp.data){
            this.logger.info("Pushing key: " + key);
            key = key.replace(/(\r\n|\n|\r)/gm, "");
            lightCount.push(key);
        }
        this.logger.info("Collected keys, moving to getting states.");
        var lightArray = [];
        for(var j = 0;j<lightCount.length;j++){
            this.logger.info("Calling for light: " + lightCount[j]);
            var resp = await axios.get(`http://192.168.1.58/api/${token}/lights/${lightCount[j]}`, {

            });
            lightArray[j] = resp.data;
        }


       /* for(var k = 0;k<lightArray.length;k++){
            lightArray["lightID"] = lightCount[k];
        }*/
        this.logger.info("Collected states and data, moving on to outputs.");
        this.logger.info(lightArray);
        /*lightArray.sort(function(a, b) {
            return compareStrings(a.name, b.name);
          })*/

        var output = "";
        for(var i = 0;i<lightArray.length;i++){
            if(lightArray[i].state.on){
                output += lightArray[i].name + " has lightID: " + lightCount[i] + " and is ON\n";
            }else{
                output += lightArray[i].name + " has lightID: " + lightCount[i] + " and is OFF\n";
            }
        }
        message.channel.send(output);
    }
}

function compareStrings(a, b) {
    // Assuming you want case-insensitive comparison
    a = a.toLowerCase();
    b = b.toLowerCase();
  
    return (a < b) ? -1 : (a > b) ? 1 : 0;
  }