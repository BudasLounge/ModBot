module.exports = {
    name: 'ping',
    description: 'Ping!',
    syntax: 'ping',
    num_args: 0,
    args_to_lower: false,
    execute(message, args) {
        message.channel.send('D&D Pong.');
    }
};
