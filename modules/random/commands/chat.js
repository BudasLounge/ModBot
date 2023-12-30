module.exports = {
    name: 'chat',
    description: 'Talk to modbot!',
    syntax: 'chat [{model_name}] [your message to the bot]',
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
        this.logger.info("chatMessage: " , chatMessage)
        try {
            const fetchedMessages = await message.channel.messages.fetch({ 
                limit: 10,
                before: message.id,
            }).then(messages => messages.filter(msg => msg.author.id === message.author.id || msg.author.bot));
            this.logger.info("fetchedMessages: " , fetchedMessages)
            const messageArray = Array.from(fetchedMessages.values()).reverse(); // Ensure chronological order
            this.logger.info("messageArray: " , messageArray)
            // Create an array of formatted messages for the API
            const formattedMessages = messageArray.map(msg => {
                this.logger.info("msg: " , msg)
                return {
                    role: msg.author.id === message.author.id ? 'user' : 'assistant',
                    content: msg.content
                };
            });
            // Add the current message
            formattedMessages.push({
                role: 'user',
                content: args.join(" ")
            });
            
            this.logger.info("formattedMessages: " , formattedMessages)
            const botMessage = await message.reply({content: "Generating response..."})
            var data;
            if(args[0].includes("{")){
                modelName = args[0].split("{")[1].split("}")[0]
                this.logger.info("modelName: " , modelName)
                data = JSON.stringify({
                    model: modelName,
                    messages: formattedMessages,
                    stream: false
                });
            }else{
                data = JSON.stringify({
                    model: "mistral",
                    messages: formattedMessages,
                    stream: false
                });
            }
            
            const options = {
                host: 'localhost',
                port: 11434,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };
            const req = http.request(options, (res) => {
                let rawData = '';
                res.on('data', (chunk) => {
                    rawData += chunk;
                });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(rawData);
                        this.logger.info("parsedData: " , parsedData.message)
                        const responseText = parsedData.message.content; // Extracting the response field
            
                        const messageChunks = Util.splitMessage(responseText, {
                            maxLength: 2000,
                            char: '\n'
                        });
                        botMessage.delete();
                        messageChunks.forEach(async chunk => {
                            await message.reply(chunk);
                        });
                    } catch (e) {
                        this.logger.error("Error parsing JSON: " + e.message);
                        message.reply("An error occurred while processing the response.\n" + e.message);
                    }
                });
            });

            req.on('error', (error) => {
                this.logger.error("Request error: " + error.message);
                botMessage.edit("An error occurred while making the request.\n" + error.message);
            });

            req.write(data);
            req.end();
            //return message.reply(content);
            return
          } catch (err) {
            this.logger.error("top level error: " + err);
            botMessage.edit(
              "An error has occured while trying to talk to the bot...\n"+err
            );
          }
        }
    }