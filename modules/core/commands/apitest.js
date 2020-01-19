var APIClient = require('../../../core/js/APIClient.js');
module.exports = {
    name: 'apitest',
    description: 'Testing API',
    syntax: 'apitest',
    num_args: 0,
    args_to_lower: false,
    async execute(message, args, api, mod_handler) {
        var respServers = await api.get('server', {
            _limit: 1
        });

        message.channel.send("I found a server: " + respServers.servers[0].name);
    }
};
