module.exports = {
    name: 'approve_champ',
    description: 'Approves the champion for your custom champ pool',
    syntax: 'approve_champ [champion name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        

    }
};