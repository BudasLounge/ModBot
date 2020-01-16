var Discord = require('discord.js');
var fs = require('fs');

class ModuleHandler {
    constructor(program_path) {
        this.program_path = program_path;
        this.modules = null;
        this.disabled_modules = null;
    }

    discover_modules(modules_folder) {
        this.modules = new Discord.Collection();
        this.disabled_modules = new Discord.Collection();

        console.log("Discovering Modules in: " + modules_folder + " ...");
        var module_folders = fs.readdirSync(modules_folder, { withFileTypes: true });
        for(var folder of module_folders) {
            if(folder.isDirectory() && fs.existsSync(modules_folder + "/" + folder.name + "/bot_module.json")) {
                var module_config = JSON.parse(fs.readFileSync(modules_folder + "/" + folder.name + "/bot_module.json"));
                var the_module = {
                    config: module_config,
                    location: modules_folder + "/" + folder.name + "/"
                };

                if(the_module.config.enabled) {
                    this.modules.set(the_module.config.name, the_module);
                } else {
                    this.disabled_modules.set(the_module.config.name, the_module);
                }
            }
        }
    }

    discover_commands() {

        for(var current_module_name of Array.from(this.modules.keys())) {
            var current_module = this.modules.get(current_module_name);
            current_module.commands = new Discord.Collection();

            var commands_dir = current_module.location + current_module.config.commands_directory + "/";
            console.log("Discovering Commands in: " + commands_dir + " ...");
            var command_files = fs.readdirSync(commands_dir).filter(file => file.endsWith('.js'));

            for (var file of command_files) {
                var command = require(commands_dir + file);
                current_module.commands.set(command.name, command);
            }
        }

        if(this.modules.size > 0) {
            console.log("Discovered " + this.modules.size + " active module(s) and " + this.disabled_modules.size + " inactive module(s):");
            for(var current_module_name of Array.from(this.modules.keys())) {
                console.log("  + " + this.modules.get(current_module_name).config.display_name + " (" + this.modules.get(current_module_name).commands.size + " commands)");
            }

            for(var current_module_name of Array.from(this.disabled_modules.keys())) {
                console.log("  - " + this.disabled_modules.get(current_module_name).config.display_name);
            }
        } else {
            console.log("No active modules found! Please enable at least one module for this bot to have any purpose!");
            console.log("Discovered " + this.disabled_modules.size + " inactive modules:");
            for(var current_module_name of Array.from(this.disabled_modules.keys())) {
                console.log("  - " + this.disabled_modules.get(current_module_name).config.display_name);
            }
        }
    }

    handle_command(message) {
        if(message.author.bot) return; //Ignore messages from bots

        var command_args = message.content.split(" ");

        if(command_args[0].startsWith("//") && command_args[0].includes(":")) {
            var spec_module = command_args[0].substring(2, command_args[0].indexOf(":"));
            var spec_command = command_args[0].substring(command_args[0].indexOf(":") + 1);
            if(this.modules.has(spec_module)) {
                var current_module = this.modules.get(spec_module);
                if(current_module.commands.has(spec_command)) {
                    if(command_args.length - 1 >= current_module.commands.get(spec_command).num_args) {
                        var current_command = current_module.commands.get(spec_command);
                        if(current_module.config.is_core) {
                            current_command.execute(message, current_command.args_to_lower ? command_args.toLowerCase() : command_args, this);
                        } else {
                            current_command.execute(message, current_command.args_to_lower ? command_args.toLowerCase() : command_args);
                        }
                    } else {
                        this.invalid_syntax(current_module, spec_command, message);
                    }
                } else {
                    message.channel.send("The module '" + spec_module + "' has no command '" + spec_command + "'.");
                }
            } else {
                message.channel.send("Sorry, I couldn't find the module: " + spec_module);
            }
        } else {
            var found_command = false;
            var matched_prefix = false;

            for(var current_module_name of Array.from(this.modules.keys())) {
                var current_module = this.modules.get(current_module_name);

                if(message.content.startsWith(current_module.config.command_prefix)) {
                    matched_prefix = true;
                    var command_name = command_args[0].substring(current_module.config.command_prefix.length);

                    if(current_module.commands.has(command_name)) {
                        found_command = true;
                        command_args[0] = command_name;
                        if(command_args.length - 1 >= current_module.commands.get(command_args[0]).num_args) {
                            var current_command = current_module.commands.get(command_args[0]);
                            if(current_module.config.is_core) {
                                current_command.execute(message, current_command.args_to_lower ? command_args.toLowerCase() : command_args, this);
                            } else {
                                current_command.execute(message, current_command.args_to_lower ? command_args.toLowerCase() : command_args);
                            }
                        } else {
                            this.invalid_syntax(current_module, command_args[0], message);
                        }
                        break;
                    }
                }
            }

            if(matched_prefix && !found_command) {
                message.channel.send("Sorry, I couldn't find that command!");
            }
        }
    }

    invalid_syntax(current_module, command, message) {
        var prefix = current_module.config.command_prefix;
        message.channel.send("Not enough arguments! Syntax: `" + prefix + current_module.commands.get(command).syntax + "`");
    }
}

module.exports = ModuleHandler;
