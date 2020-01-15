module.exports = {
    name: 'modules',
    description: 'Provides information about the modules ModBot has loaded. Optional second argument to filter modules. Default is \'all\'',
    syntax: 'modules [enabled|disabled|all]',
    num_args: 0,
    execute(message, args, mod_handler) {
        var output = '```';
        var module_type = "all";
        if(args.length > 1) {
            module_type = args[1];
        }

        if(module_type == "enabled" || module_type == "all") {
            var num_mods = 0;
            output += "Enabled Modules:\n";
            for(var current_module_name of Array.from(mod_handler.modules.keys())) {
                var current_module = mod_handler.modules.get(current_module_name);
                output += "  - " + current_module.config.name + " (" + current_module.config.display_name + ")\n";
                num_mods++;
            }

            if(num_mods == 0) {
                output += "  (None)\n";
            }
        }

        if(module_type == "all") {
            output += "\n";
        }

        if(module_type == "disabled" || module_type == "all") {
            var num_mods = 0;
            output += "Disabled Modules:\n";
            for(var current_module_name of Array.from(mod_handler.disabled_modules.keys())) {
                var current_module = mod_handler.disabled_modules.get(current_module_name);
                output += "  - " + current_module.config.name + " (" + current_module.config.display_name + ")\n";
                num_mods++;
            }

            if(num_mods == 0) {
                output += "  (None)\n";
            }
        }

        output += "```";
        message.channel.send(output);
    }
};
