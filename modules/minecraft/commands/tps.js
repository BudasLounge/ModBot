module.exports = {
    name: 'tps',
    description: 'gets the tps of a server',
    syntax: 'tps [server]',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    options: [
        { name: 'server', description: 'Server short name', type: 'STRING', required: true },
    ],
    async execute(message, args, extra) {
    }
}