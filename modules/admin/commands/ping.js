module.exports = {
    name: 'ping',
    description: 'Sends a message back. Used to test if the bot is working.',
    syntax: 'ping [arbitrary argument for testing]',
    num_args: 1,
    args_to_lower: true,
    execute(message, args) {
        var output = "Here's your message in lowercase: ";
        for(var arg of args) {
          output += arg;
        }
        message.channel.send(output);
    }
};
