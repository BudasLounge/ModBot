module.exports = {
    name: 'lfg',
    description: 'Toggles if you want to be looking for a group or not',
    syntax: 'lfg [on/off]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        let role = message.guild.roles.get("761355940955291678");

        if(args[1] == "on"){
            message.member.addRole(role);
        }
        else if(args[1] == "off"){
            message.member.removeRole(role);
        }
    }
};