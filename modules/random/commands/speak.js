module.exports = {
    name: 'speak',
    description: 'Bot joins discord channel and says something',
    syntax: 'speak [message here]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        args.shift();
        var sayMessage = args.join();
        message.channel.send({ content: sayMessage, tts: true});
    }
}