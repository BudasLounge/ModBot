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
        //var token = await fs.readFileSync("../openai_token.txt").toString();
        const { Configuration, OpenAIApi } = require("openai");
        const configuration = new Configuration({
            apiKey: process.env.API_KEY
        })
        const openai = new OpenAIApi(configuration);

        args.shift()
        chatMessage = args.join(" ")
        try {
          message.channel.send({content: "Generating response..."})
            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [
                    {role: "system", content: "You are a helpful assistant who responds succinctly"},
                    {role: "user", content: chatMessage}
                ],
              });
            var content = response.data.choices[0].message;
            this.logger.info("Content: " + content)
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
            return message.reply(
              "Connection to OpenAI failed...\n"+err
            );
          }
        }
    }