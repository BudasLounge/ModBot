module.exports = {
    name: 'chat',
    description: 'Talk to modbot!',
    syntax: 'chat [your message to the bot]',
    num_args: 2,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        if (message.author.bot) return;
        var fs = require('fs');
        const {Util} = require('discord.js');
        const HttpsProxyAgent = require('https-proxy-agent');
        this.logger.info("https-proxy-agent loaded" + HttpsProxyAgent)
        const http = require('http');
        //var token = await fs.readFileSync("../openai_token.txt").toString();
            //apiKey: process.env.API_KEY,
        const {  OpenAI } = require("openai");
        const openai = new OpenAI({
            apiKey: "anything",
            httpAgent: new HttpsProxyAgent("http://192.168.1.9:8000")
        })
        args.shift()
        chatMessage = args.join(" ")
        try {
          await message.channel.send({content: "Generating response..."})
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {role: "system", content: "You are a helpful assistant who responds succinctly"},
                    {role: "user", content: chatMessage}
                ],
              });
            var content = response.data.choices[0].message.content;
            //this.logger.info(JSON.stringify(content, null, 4))
            const messageChunks = Util.splitMessage(content, {
              maxLength: 2000,
              char:'\n'
            });
            messageChunks.forEach(async chunk => {
                await message.reply(chunk);
            })
            //return message.reply(content);
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