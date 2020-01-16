module.exports = {
    name: 'commands',
    description: 'Provides a list of commands, optionally just the ones from a specific module',
    syntax: 'commands [module_name]',
    num_args: 0,
    args_to_lower: false,
    execute(message, args, mod_handler) {
        var output = '```';
        if(args.length > 1) {
            var module_name = args[1];
            if(mod_handler.modules.has(module_name)) {
                var selected_module = mod_handler.modules.get(module_name);

                var longest_syntax = "";
                var longest_module_name = module_name;
                for(var current_command_name of Array.from(selected_module.commands.keys())) {
                    var current_command = selected_module.commands.get(current_command_name);
                    if(current_command.syntax.length > longest_syntax.length) {
                        longest_syntax = current_command.syntax;
                    }
                }

                var desc_space = 134 - longest_syntax.length - longest_module_name.length;

                for(var current_command_name of Array.from(selected_module.commands.keys())) {
                    var current_command = selected_module.commands.get(current_command_name);

                    output += current_command.syntax;
                    if(current_command.syntax.length < longest_syntax.length) {
                        for(var i=current_command.syntax.length; i < longest_syntax.length; i++) {
                            output += " ";
                        }
                    }

                    output += " | " + selected_module.config.display_name;
                    if(selected_module.config.display_name.length < longest_module_name.length) {
                        for(var i=selected_module.config.display_name.length; i < longest_module_name.length; i++) {
                            output += " ";
                        }
                    }

                    output += " | ";
                    if(current_command.description.length > desc_space) {
                        output += current_command.description.substring(0, desc_space - 3) + "...";
                    } else {
                        output += current_command.description;
                    }

                    output += "\n";
                }
                output += "```";
                message.channel.send(output);
            } else {
                message.channel.send("Sorry, I couldn't find that module!");
            }
        } else {
            var longest_syntax = "";
            var longest_module_name = "";
            for(var current_module_name of Array.from(mod_handler.modules.keys())) {
                var current_module = mod_handler.modules.get(current_module_name);
                if(current_module.config.display_name.length > longest_module_name.length) {
                    longest_module_name = current_module.config.display_name;
                }
                for(var current_command_name of Array.from(current_module.commands.keys())) {
                    var current_command = current_module.commands.get(current_command_name);
                    if(current_command.syntax.length > longest_syntax.length) {
                        longest_syntax = current_command.syntax;
                    }
                }
            }

            var desc_space = 134 - longest_syntax.length - longest_module_name.length;

            for(var current_module_name of Array.from(mod_handler.modules.keys())) {
                var current_module = mod_handler.modules.get(current_module_name);
                for(var current_command_name of Array.from(current_module.commands.keys())) {
                    var current_command = current_module.commands.get(current_command_name);

                    output += current_command.syntax;
                    if(current_command.syntax.length < longest_syntax.length) {
                        for(var i=current_command.syntax.length; i < longest_syntax.length; i++) {
                            output += " ";
                        }
                    }

                    output += " | " + current_module.config.display_name;
                    if(current_module.config.display_name.length < longest_module_name.length) {
                        for(var i=current_module.config.display_name.length; i < longest_module_name.length; i++) {
                            output += " ";
                        }
                    }

                    output += " | ";
                    if(current_command.description.length > desc_space) {
                        output += current_command.description.substring(0, desc_space - 3) + "...";
                    } else {
                        output += current_command.description;
                    }

                    output += "\n";
                }
            }
            output += "```";
            message.channel.send(output);
        }
    }
};
