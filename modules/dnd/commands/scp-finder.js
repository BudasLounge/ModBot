module.exports = {
    name: 'scp',
    description: 'returns a link to a mentioned scp',
    syntax: 'scp [scp number]',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        if(args[1]){
            message.channel.send("https://www.scpwiki.com/scp-"+args[1]);
        }
    }
};