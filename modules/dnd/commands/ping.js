module.exports = {
    name: 'ping',
    description: 'Ping!',
    syntax: 'ping',
    num_args: 0,
    execute(message, args) {
        message.channel.send('D&D Pong.');
    }
};