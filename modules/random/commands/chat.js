module.exports = {
  name: 'chat',
  description: 'Talk to modbot!',
  syntax: 'chat [your message to the bot]',
  num_args: 1,//minimum amount of arguments to accept
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
          
          const botMessage = await message.reply({content: "Generating response..."})
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
              let rawData = '';
              res.on('data', (chunk) => {
                  rawData += chunk;
              });
              res.on('end', () => {
                  try {
                      const parsedData = JSON.parse(rawData);
                      this.logger.info("parsedData from llm: " , parsedData)
                      const responseText = parsedData.response; // Extracting the response field
          
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