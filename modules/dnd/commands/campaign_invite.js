module.exports = {
    name: 'invite',
    description: 'Invites a player to your campaign',
    syntax: 'invite [@user]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        /*var api = extra.api;
        message.mentions.users.first().id;
        message.channel.parentID;*/
    }

};