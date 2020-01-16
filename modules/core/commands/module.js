var APIClient = require('../../../core/js/APIClient.js');
module.exports = {
    name: 'module',
    description: 'Enable or disable a module, or check whether the module is enabled.',
    syntax: 'module <enable|disable|status> <module>',
    num_args: 2,
    args_to_lower: true,
    async execute(message, args, mod_handler) {
        var api = new APIClient();
        if(args[1] == "enable") {
            var respModule = await api.get('module', {
                name: args[2]
            });

            if(respModule.modules.length <= 0) {
                message.channel.send("Sorry, I couldn't find that module!");
                return;
            }

            var target_module_id = respModule.modules[0].module_id;

            var respEnabled = await api.get('enabled_module', {
                server_id: message.channel.guild.id,
                module_id: target_module_id
            });

            if(respEnabled.enabled_modules.length == 0) {
                var respCreate = await api.post('enabled_module', {
                    module_id: parseInt(target_module_id),
                    server_id: message.channel.guild.id
                });
                message.channel.send("Successfully enabled module on this server!");
            } else {
                message.channel.send("That module is already enabled on this server!");
            }
        } else if(args[1] == "disable") {
            var respModule = await api.get('module', {
                name: args[2]
            });

            if(respModule.modules.length <= 0) {
                message.channel.send("Sorry, I couldn't find that module!");
                return;
            }

            var target_module_id = respModule.modules[0].module_id;

            var respEnabled = await api.get('enabled_module', {
                server_id: message.channel.guild.id,
                module_id: target_module_id
            });

            if(respEnabled.enabled_modules.length == 0) {
                message.channel.send("That module is already disabled on this server!");
            } else {
                console.log("Deleting link: " + respEnabled.enabled_modules[0].link_id);
                var respDelete = await api.delete('enabled_module', {
                    link_id: parseInt(respEnabled.enabled_modules[0].link_id)
                });
                message.channel.send("Successfully disabled module on this server!");
            }
        } else if(args[1] == "status") {
            var respModule = await api.get('module', {
                name: args[2]
            });

            if(respModule.modules.length <= 0) {
                message.channel.send("Sorry, I couldn't find that module!");
                return;
            }

            var target_module_id = respModule.modules[0].module_id;

            var respEnabled = await api.get('enabled_module', {
                server_id: message.channel.guild.id,
                module_id: target_module_id
            });

            if(respEnabled.enabled_modules.length == 0) {
                message.channel.send("Module Status: Disabled");
            } else {
                message.channel.send("Module Status: Enabled");
            }
        } else {
            message.channel.send("Unrecognized argument! Syntax: " + this.syntax);
        }
    }
};
