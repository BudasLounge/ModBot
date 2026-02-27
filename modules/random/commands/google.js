module.exports = {
    name: 'google',
    description: 'The power of the internet',
    syntax: 'google [the words that be added]',
    num_args: 1,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    options: [
        { name: 'query', description: 'Search query', type: 'STRING', required: true },
    ],
    async execute(message, args, extra) {
        args.shift();
        var query = args.join("+");
        var finalQuery = "https://lmgt.org/?q="+query;
        await message.channel.send({content: finalQuery});
    }
}
