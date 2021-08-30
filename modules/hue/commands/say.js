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
        var message = args.join();
        say.speak("Testing");
        //say.stop();

    }
}