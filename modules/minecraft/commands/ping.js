module.exports = {
    name: 'ping',
    description: 'Ping!',
    syntax: 'ping',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) { // Added async
        await message.channel.send({ content: 'Minecraft Pong.'}); // Added await
    }
};
