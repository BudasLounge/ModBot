module.exports = {
    name: 'say',
    description: 'Speak some words into the world!',
    syntax: 'say [message]',
    num_args: 1,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        const say = require('say');
        args.shift();
        var sayMessage = args.join();
        if(sayMessage.length>=200){
            say.speak(sayMessage);
        }else{
            message.channel.send("That message is too long, no more than 200 characters per message!");
        }
        //say.stop();

    }
}