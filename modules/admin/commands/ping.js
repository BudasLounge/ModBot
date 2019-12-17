module.exports = {
    name: 'ping',
    description: 'Sends a message back. Used to test if the bot is working.',
    syntax: 'ping [arbitrary argument for testing]'
    num_args: 1,
    execute(message, args) {
        message.channel.send('Admin Pong.');
    }
};