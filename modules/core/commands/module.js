var APIClient = require('../../../core/js/APIClient.js');
module.exports = {
    name: 'reload',
    description: 'Reloads all modules and their commands/config files.',
    syntax: 'reload',
    num_args: 0,
    async execute(message, args, mod_handler) {
        var api = new APIClient();
        var respServers = await api.get('server', {
            _limit: 1
        });

        message.channel.send("I found a server: " + respServers.servers[0].name);
    }
};