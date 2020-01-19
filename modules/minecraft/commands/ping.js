module.exports = {
    name: 'ping',
    description: 'Ping!',
    syntax: 'ping',
    num_args: 0,
    args_to_lower: false,
    execute(message, args, api) {
        message.channel.send('Minecraft Pong.');
    }
};
