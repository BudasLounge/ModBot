module.exports = {
    name: 'lfg',
    description: 'Toggles if you want to be looking for a group or not',
    syntax: 'lfg [on/off]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {

        if(args[1] == "on"){
            message.member.addRole("761355940955291678");
            message.channel.send({ content: "You were added to the lfg group!"});
        }
        else if(args[1] == "off"){
            message.member.removeRole("761355940955291678");
            message.channel.send({ content: "You were taken out of the lfg group!"});
        }
    }
};