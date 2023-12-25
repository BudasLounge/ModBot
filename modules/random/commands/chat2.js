module.exports = {
    name: 'chat2',
    description: 'Talk to modbot!',
    syntax: 'chat2 [your message to the bot]',
    num_args: 2,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        if (message.author.bot) return;
        var fs = require('fs');
        var http = require('http');
        const {Util} = require('discord.js');
        args.shift()
        chatMessage = args.join(" ")
        try {
            await message.channel.send({content: "Generating response..."})
            const data = JSON.stringify({
                model: "mistral",
                prompt: chatMessage,
                stream: false
            });
            const options = {
                host: 'localhost',
                port: 11434,
                path: '/api/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };
            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    const messageChunks = Util.splitMessage(responseData, {
                        maxLength: 2000,
                        char: '\n'
                    });
                    messageChunks.forEach(async chunk => {
                        await message.reply(chunk);
                    });
                });
            });

            req.on('error', (error) => {
                this.logger.error("Request error: " + error.message);
                message.reply("An error occurred while making the request.\n" + error.message);
            });

            req.write(data);
            req.end();
            //return message.reply(content);
            return
          } catch (err) {
            this.logger.error("top level error: " + err);
            message.reply(
              "An error has occured while trying to talk to the bot...\n"+err
            );
          }
        }
    }