module.exports = {
    name: 'draw',
    description: 'Make ModBot draw you a picture!',
    syntax: 'draw [your prompt here]',
    num_args: 2,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        if (message.author.bot) return;
        var fs = require('fs');
        const {Util} = require('discord.js');
        //var token = await fs.readFileSync("../openai_token.txt").toString();
        const { Configuration, OpenAIApi } = require("openai");
        const configuration = new Configuration({
            apiKey: process.env.API_KEY
        })
        const openai = new OpenAIApi(configuration);

        args.shift()
        promptMessage = args.join(" ")
        try {
          message.channel.send({content: "Generating image..."})
            const response = await openai.createImage({
                prompt: promptMessage,
                n: 4,
                size: "1920x1080"
              });
            var content = response.data.data[0].url;
            //this.logger.info(JSON.stringify(content, null, 4))
            return message.reply(content);
          } catch (err) {
            return message.reply(
              "Connection to OpenAI failed...\n"+err
            );
          }
        }
    }