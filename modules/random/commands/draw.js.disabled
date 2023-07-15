module.exports = {
    name: 'draw',
    description: 'Make ModBot draw you a picture!',
    syntax: 'draw [your prompt here]',
    num_args: 1,//minimum amount of arguments to accept
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
        var numberToGen = 1
        if(!isNaN(args[1])){
            if(parseInt(args[1])>5){
                return message.reply("I can only generate up to 5 images per minute!")
            }
            numberToGen = args[1]
            args.shift()
            args.shift()
        }else{
        args.shift()
        }
        promptMessage = args.join(" ")
        try {
          message.channel.send({content: "Generating image..."})
            const response = await openai.createImage({
                prompt: promptMessage,
                n: parseInt(numberToGen),
                size: "1024x1024"
              });
            response.data.data.forEach(data => {
                message.reply(data.url)
            });
            //this.logger.info(JSON.stringify(content, null, 4))
            return
          } catch (err) {
            if(err.message.includes("429")){
                return message.reply("Reached my rate limit! Please wait 60 seconds before trying again...")
            }
            return message.reply(
              "Connection to OpenAI failed...\n"+err
            );
          }
        }
    }