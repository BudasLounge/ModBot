module.exports = {
    name: 'lfg',
    description: 'Toggles if you want to be looking for a group or not',
    syntax: 'lfg [on/off]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    options: [
        { name: 'toggle', description: 'Turn LFG on or off', type: 'STRING', required: false, choices: ['on', 'off'] },
    ],
    async execute(message, args, extra) {

        if(args[1] == "on"){
            message.member.roles.add("761355940955291678");
            message.channel.send({ content: "You were added to the lfg group!"});
        }
        else if(args[1] == "off"){
            message.member.roles.remove("761355940955291678");
            message.channel.send({ content: "You were taken out of the lfg group!"});
        }
    }
};