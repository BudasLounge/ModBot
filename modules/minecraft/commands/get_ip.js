module.exports = {
    name: 'ip',
    description: 'Gets the IP of a server',
    syntax: 'ip [server name]',
    num_args: 1,
    args_to_lower: true,
    execute(message, args, api) {
        message.channel.send('returning data');
    }
};