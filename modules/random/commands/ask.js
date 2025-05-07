module.exports = {
  name: 'ask',
  description: 'Talk to modbot!',
  syntax: 'ask [your message to the bot]',
  num_args: 1,//minimum amount of arguments to accept
  args_to_lower: false,//if the arguments should be lower case
  needs_api: false,//if this command needs access to the api
  has_state: false,//if this command uses the state engine
  async execute(message, args, extra) {
      if (message.author.bot) return;
      var fs = require('fs');
      var http = require('http');
      args.shift()
      chatMessage = args.join(" ")
      let botMessage; // Define botMessage here to be accessible in catch blocks
      try {
          
          botMessage = await message.reply({content: "Generating response..."})
          const data = JSON.stringify({
              model: "mixtral",
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
              res.on('end', async () => {
                  try {
                      const parsedData = JSON.parse(rawData);
                      this.logger.info("parsedData from llm: " , parsedData)
                      const responseText = parsedData.response; // Extracting the response field
          
                      await botMessage.delete(); // Use await for delete
                      // Manual message splitting
                      const maxLength = 2000;
                      let currentChunk = '';
                      for (const char of responseText) {
                          if (currentChunk.length + char.length <= maxLength) {
                              currentChunk += char;
                          } else {
                              await message.reply({ content: currentChunk });
                              currentChunk = char;
                          }
                      }
                      if (currentChunk.length > 0) {
                          await message.reply({ content: currentChunk });
                      }
                  } catch (e) {
                      this.logger.error("Error parsing JSON: " + e.message);
                      if (botMessage) { // Check if botMessage was initialized
                        await botMessage.edit({ content: "An error occurred while processing the response.\n" + e.message});
                      } else {
                        await message.reply({ content: "An error occurred while processing the response.\n" + e.message});
                      }
                  }
              });
          });

          req.on('error', async (error) => { // Added async here
              this.logger.error("Request error: " + error.message);
              if (botMessage) { // Check if botMessage was initialized
                await botMessage.edit({ content: "An error occurred while making the request.\n" + error.message});
              } else {
                await message.reply({ content: "An error occurred while making the request.\n" + error.message});
              }
          });

          req.write(data);
          req.end();
          //return message.reply(content);
          return
        } catch (err) {
          this.logger.error("top level error: " + err);
          if (botMessage) { // Check if botMessage was initialized
            await botMessage.edit({ // Use await and object syntax
              content: "An error has occured while trying to talk to the bot...\n"+err
            });
          } else {
            await message.reply({ // Use await and object syntax
              content: "An error has occured while trying to talk to the bot...\n"+err
            });
          }
        }
      }
  }