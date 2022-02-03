module.exports = {
    name: 'lmgtfy',
    description: 'The power of the internet',
    syntax: 'lmgtfy [the words that be added]',
    num_args: 1,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        args.shift();
        var query = args.join("+");
        var finalQuery = "https://lmgtfy.app/?q="+query;
        message.channel.send({content: finalQuesry});
    }
}
