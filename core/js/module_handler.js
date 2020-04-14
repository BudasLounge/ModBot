var Discord = require('discord.js');
var fs = require('fs');
var APIClient = require('./APIClient.js');

/**
 * The ModuleHandler class is the meat and bones of ModBot's modular system. This class handles discovering modules, loading modules,
 * checking configs, discovering commands within each module, and running commands.
 */
class ModuleHandler {

    /**
     * Constructor for ModuleHandler
     *
     * @param {string} program_path The absolute path to the root directory of ModBot
     */
    constructor(program_path, state_manager) {
        this.program_path = program_path;
        this.modules = null;
        this.disabled_modules = null;
        this.state_manager = state_manager;
    }

    /**
     * As the name says, discovers modules.
     *
     * Takes the path of the folder containing modules as a parameter. Checks each directory within the
     * given folder to see if it is a valid module. If the directory contains a bot_module.json file, this function will create the module
     * and register it with this ModuleHandler (by adding it to this.modules). Note that if a module's config has the module globally disabled,
     * it will be added to this.disabled_modules instead. Globally disabled modules will not have their commands or event handlers loaded.
     *
     * @param {string} modules_folder The location of the folder containing the modules for this bot.
     */
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

    /**
     * Discovers commands within each module.
     *
     * For each enabled module found, this function will check the module's config file for the directory containing
     * command files. This directory should contain one .js file for each command to be added. The command files require
     * a specific format, so make sure to look at one as an example.
     */
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

    /**
     * This function is in charge of handling commands (discovering what command was called, and from which module, then executing the command)
     *
     * This function takes a message as its only parameter. It will loop through all the enabled modules and check the registered command prefix
     * for that module. If the registered prefix for the module matches the beginning of the message, that module will be checked to see if it
     * has a command with the name of the command that was run. If a command is found, this function will check the number of arguments provided
     * to the command to see if it matches the amount of arguments required for that command. If so, its execute() function will be run.
     *
     * If the module that the command belongs to is registered as a core module, this ModuleHandler will be passed as a parameter to the execute()
     * function. This allows core modules to access the internals of ModBot.
     *
     * Additionally, if the message given is of the format "//[module]:[command]", this function will ONLY check the provided module for the command
     * to run. This is helpful for commands from different modules that use the same name, because normally the bot would just pick the command from
     * the first module found to run.
     *
     * One more thing: every command will be passed an instance of APIClient(), which allows the commands an easy way to get access to the API. For more
     * information on how to structure a command file, look at one of the existing commands (I reccommend ping, since it's simple).
     */
    async handle_command(message) {
        var api = new APIClient();
        if(message.author.bot) return; //Ignore messages from bots

        var command_args = message.content.split(" ");

        if(command_args[0].startsWith("//") && command_args[0].includes(":")) {
            var spec_module = command_args[0].substring(2, command_args[0].indexOf(":"));
            var spec_command = command_args[0].substring(command_args[0].indexOf(":") + 1);
            if(this.modules.has(spec_module)) {
                var current_module = this.modules.get(spec_module);
                var respModule = await api.get('module', {
                    name: current_module.config.name
                });

                if(respModule.modules.length == 0) {
                    message.channel.send("That module could not be found!");
                    return;
                }

                var respEnabled = await api.get('enabled_module', {
                    server_id: message.channel.guild.id,
                    module_id: parseInt(respModule.modules[0].module_id)
                });

                if(respEnabled.enabled_modules.length == 0) {
                    message.channel.send("That module is disabled on this server!");
                    return;
                }

                if(current_module.commands.has(spec_command)) {
                    if(command_args.length - 1 >= current_module.commands.get(spec_command).num_args) {
                        var current_command = current_module.commands.get(spec_command);
                        if(current_module.config.is_core) {
                            if(current_command.args_to_lower) {
                                for(var i=0; i < command_args.length; i++) {
                                    command_args[i] = command_args[i].toLowerCase();
                                }
                            }

                            if(current_command.has_state) {
                                var state = this.state_manager.get_state(message.author.id, current_module.config.name + ":" + current_command.name);
                                current_command.execute(message, command_args, api, state, this);
                                this.state_manager.save_state(state);
                            } else {
                                current_command.execute(message, command_args, api, this);
                            }
                        } else {
                            if(current_command.args_to_lower) {
                                for(var i=0; i < command_args.length; i++) {
                                    command_args[i] = command_args[i].toLowerCase();
                                }
                            }

                            if(current_command.has_state) {
                                var state = this.state_manager.get_state(message.author.id, current_module.config.name + ":" + current_command.name);
                                current_command.execute(message, command_args, api, state);
                                this.state_manager.save_state(state);
                            } else {
                                current_command.execute(message, command_args, api);
                            }
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
                        try{
                        var respModule = await api.get('module', {
                            name: current_module.config.name
                        });
                    }catch(err1){
                        console.error(err1.response);
                    }

                        var respEnabled = await api.get('enabled_module', {
                            server_id: message.channel.guild.id,
                            module_id: parseInt(respModule.modules[0].module_id)
                        });

                        if(respEnabled.enabled_modules.length == 0) {
                            continue;
                        }

                        found_command = true;
                        command_args[0] = command_name;
                        if(command_args.length - 1 >= current_module.commands.get(command_args[0]).num_args) {
                            var current_command = current_module.commands.get(command_args[0]);
                            if(current_module.config.is_core) {
                                if(current_command.args_to_lower) {
                                    for(var i=0; i < command_args.length; i++) {
                                        command_args[i] = command_args[i].toLowerCase();
                                    }
                                }

                                if(current_command.has_state) {
                                    var state = this.state_manager.get_state(message.author.id, current_module.config.name + ":" + current_command.name);
                                    current_command.execute(message, command_args, api, state, this);
                                    this.state_manager.save_state(state);
                                } else {
                                    current_command.execute(message, command_args, api, this);
                                }
                            } else {
                                if(current_command.args_to_lower) {
                                    for(var i=0; i < command_args.length; i++) {
                                        command_args[i] = command_args[i].toLowerCase();
                                    }
                                }

                                if(current_command.has_state) {
                                    var state = this.state_manager.get_state(message.author.id, current_module.config.name + ":" + current_command.name);
                                    current_command.execute(message, command_args, api, state);
                                    this.state_manager.save_state(state);
                                } else {
                                    current_command.execute(message, command_args, api);
                                }
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

    /**
     * This function is called when a command is run, but not enough arguments are provided.
     *
     * @param current_module The module this command belongs to
     * @param command The command that was matched to the message
     * @param message The message the user sent containing this command
     */
    invalid_syntax(current_module, command, message) {
        var prefix = current_module.config.command_prefix;
        message.channel.send("Not enough arguments! Syntax: `" + prefix + current_module.commands.get(command).syntax + "`");
    }
}

module.exports = ModuleHandler;
