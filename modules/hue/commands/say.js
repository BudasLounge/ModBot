module.exports = {
    name: 'say',
    description: 'Speak some words into the world!',
    syntax: 'say [message]',
    num_args: 1,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        const Filter = require('bad-words');
        filter = new Filter();
        filter.removeWords()
        const say = require('say');
        args.shift();
        var sayMessage = args.join();
        if(filter.isProfane(sayMessage)){
            message.channel.send("No bad words for now!");
            return;
        }
        if(sayMessage.length<=200){
            say.speak(sayMessage);
            message.channel.send("Message was spoken!");
        }else{
            message.channel.send("That message is too long, no more than 200 characters per message!");
        }
        //say.stop();

    }
}