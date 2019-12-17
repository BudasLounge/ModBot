var Discord = require('discord.js');
var fs = require('fs');

class ModuleHandler {
    constructor(program_path) {
        this.program_path = program_path;
        this.modules = null;
        this.registered_commands = null;
    }

    discover_modules(modules_folder) {
        this.modules = new Discord.Collection();

        console.log("Discovering Modules in: " + modules_folder);
        var module_folders = fs.readdirSync(modules_folder, { withFileTypes: true });
        for(var folder of module_folders) {
            if(folder.isDirectory() && fs.existsSync(modules_folder + "/" + folder.name + "/bot_module.json")) {
                var module_config = JSON.parse(fs.readFileSync(modules_folder + "/" + folder.name + "/bot_module.json"));
                var the_module = {
                    config: module_config,
                    location: modules_folder + "/" + folder.name + "/"
                };

                this.modules.set(the_module.config.name, the_module);
            }
        }
    }

    discover_commands() {
        this.registered_commands = [];

        for(var current_module_name of Array.from(this.modules.keys())) {
            var current_module = this.modules.get(current_module_name);
            current_module.commands = new Discord.Collection();
            
            var commands_dir = current_module.location + current_module.config.commands_directory + "/";
            console.log("Discovering Commands in: " + commands_dir);
            var command_files = fs.readdirSync(commands_dir).filter(file => file.endsWith('.js'));

            for (var file of command_files) {
                var command = require(commands_dir + file);

                if(this.registered_commands.includes(command.name)) {
                    current_module.commands.set(current_module.name + ":" + command.name, command);
                } else {
                    current_module.commands.set(command.name, command);
                }
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
                    current_module.commands.get(spec_command).execute(message, command_args);
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
                matched_prefix = true;
                var current_module = this.modules.get(current_module_name);

                if(message.content.startsWith(current_module.config.command_prefix)) {
                    command_args[0] = command_args[0].substring(current_module.config.command_prefix.length);

                    if(current_module.commands.has(command_args[0])) {
                        found_command = true;
                        current_module.commands.get(command_args[0]).execute(message, command_args);
                    }
                }
            }

            if(matched_prefix && !found_command) {
                message.channel.send("Sorry, I couldn't find that command!");
            }
        }
    }
}

module.exports = ModuleHandler;