module.exports = {
    name: 'chat',
    description: 'Talk to modbot!',
    syntax: 'chat [your message to the bot]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var fs = require('fs');
        var token = await fs.readFileSync("../openai_token.txt").toString();

        if (message.author.bot) return;
        args.shift()
        chatMessage = args.join(" ")
        try {
            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [
                    {role: "system", content: "You are a helpful assistant who responds succinctly"},
                    {role: "user", content: chatMessage}
                ],
              });
        
            const content = response.data.choices[0].message;
            return message.reply(content);
          } catch (err) {
            return message.reply(
              "Connection to OpenAI failed...\n"+err.error
            );
          }
        }
    }