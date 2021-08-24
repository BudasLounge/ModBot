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
        var lightCount = [];
        for(var key in lightResp.data){
            lightCount.push(key);
        }

        var lightArray = [];
        for(var j = 0;i<lightCount.length;j++){
            lightArray[i] = await axios.get(`http://192.168.1.58/api/${token}/lights/${lightCount[i]}`, {

            });
        }

        //this.logger.info(lightResp.data);

        
        for(var i = 0;i<lightArray.length;i++){
            message.channel.send(lightArray[i]);
            //message.channel.send(lightArray[i] + " " + lightArray[i].state);
        }
        //message.channel.send(JSON.stringify(stringedResp));
    }
}