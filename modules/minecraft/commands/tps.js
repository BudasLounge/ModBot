module.exports = {
    name: 'tps',
    description: 'gets the tps of a server',
    syntax: 'tps [server]',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    options: [
        { name: 'server', description: 'Server short name', type: 'STRING', required: true, autocomplete: true },
    ],
    async autocomplete(interaction) {
        const APIClient = require('../../../core/js/APIClient.js');
        const api = new APIClient();
        try {
            const resp = await api.get('minecraft_server', { _limit: 25 });
            const servers = (resp.minecraft_servers || []);
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const filtered = servers.filter(s =>
                s.short_name.toLowerCase().includes(focusedValue) ||
                s.display_name.toLowerCase().includes(focusedValue)
            );
            await interaction.respond(
                filtered.slice(0, 25).map(s => ({ name: s.display_name, value: s.short_name }))
            );
        } catch (err) {
            console.error('[tps autocomplete] Error fetching servers:', err.message);
            await interaction.respond([]);
        }
    },
    async execute(message, args, extra) {
    }
}