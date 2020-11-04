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
            if(args[1]>99){
                message.channel.send("https://www.scpwiki.com/scp-"+args[1]);
            }else if(9<args[1]&&args[1]<99){
                message.channel.send("https://www.scpwiki.com/scp-0"+args[1]);
            }else{
                message.channel.send("https://www.scpwiki.com/scp-00"+args[1]);
            }
        }
    }
};