module.exports = {
    name: 'light_list',
    description: 'Returns a list of all lights that are controllabble.',
    syntax: 'light_list',
    num_args: 0,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    execute(message, args, extra) {
      var fs = require('fs');
      var token = fs.readFileSync("../hue_token.txt").toString();
      var respLight;
      try{
        respLight = await axios.get(`http://192.168.1.58/api/${token}/lights`, {

        });
      }catch(err){
        this.logger.error(err);
      }
      message.channel.send(respLight);

    }
};
