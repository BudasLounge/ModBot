module.exports = {
    name: 'invite',
    description: 'Invites a player to your campaign. (must be sent from within the actual campaign folder)',
    syntax: 'invite [@player]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;

    }
};