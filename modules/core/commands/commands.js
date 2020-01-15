module.exports = {
    name: 'commands',
    description: 'Provides a list of commands, optionally just the ones from a specific module',
    syntax: 'commands [module_name]',
    num_args: 0,
    execute(message, args, mod_handler) {
        var output = '```';
        if(args.length > 1) {
            var module_name = args[1];
            if(mod_handler.modules.has(module_name)) {
                var selected_module = mod_handler.modules.get(module_name);
                output += "**Commands from module '" + module_name + "':**\n";
                for(var current_command_name of Array.from(selected_module.commands.keys())) {
                    var current_command = selected_module.commands.get(current_command_name);
                    output += current_command.syntax + " | " + selected_module.config.display_name + " | " + current_command.description + "\n";
                }
                output += "```";
                message.channel.send(output);
            } else {
                message.channel.send("Sorry, I couldn't find that module!");
            }
        } else {
            for(var current_module_name of Array.from(mod_handler.modules.keys())) {
                var current_module = mod_handler.modules.get(current_module_name);
                output += "**Commands from module '" + module_name + "':**\n";
                for(var current_command_name of Array.from(current_module.commands.keys())) {
                    var current_command = current_module.commands.get(current_command_name);
                    output += current_command.syntax + " | " + current_module.config.display_name + " | " + current_command.description + "\n";
                }
                output += "\n";
            }
            output += "```";
            message.channel.send(output);
        }
    }
};