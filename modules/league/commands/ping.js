module.exports = {
    name: 'ping',
    description: 'Ping!',
    syntax: 'ping',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    execute(message, args, extra) {
        message.channel.send('League Pong.');
    }
};
