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

        var lightArray = [];
        for(light in lightResp.data){
            lightArray.push(light);
        }
        var stringedResp = Object.values(lightResp.data);
        this.logger.info(lightResp.data);
        for(var key in stringedResp){
            message.channel.send(key);
            message.channel.send(stringedResp[key]);
            //message.channel.send(lightArray[i] + " " + lightArray[i].state);
        }
        //message.channel.send(JSON.stringify(stringedResp));
    }
}