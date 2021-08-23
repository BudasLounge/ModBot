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
    constructor(program_path, state_manager, logger) {
        this.program_path = program_path;
        this.modules = null;
        this.disabled_modules = null;
        this.state_manager = state_manager;
        this.logger = logger;
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

        this.logger.info("Discovering Modules in: " + modules_folder + " ...");
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

            this.logger.info("Discovering Commands in: " + commands_dir + " ...");
            var command_files = fs.readdirSync(commands_dir).filter(file => file.endsWith('.js'));

            for (var file of command_files) {
                var command = require(commands_dir + file);
                command.logger = this.logger;
                current_module.commands.set(command.name, command);
            }
        }

        if(this.modules.size > 0) {
            this.logger.info("Discovered " + this.modules.size + " active module(s) and " + this.disabled_modules.size + " inactive module(s):");
            for(var current_module_name of Array.from(this.modules.keys())) {
                this.logger.info("  + " + this.modules.get(current_module_name).config.display_name + " (" + this.modules.get(current_module_name).commands.size + " commands)");
            }

            for(var current_module_name of Array.from(this.disabled_modules.keys())) {
                this.logger.info("  - " + this.disabled_modules.get(current_module_name).config.display_name);
            }
        } else {
            this.logger.warn("No active modules found! Please enable at least one module for this bot to have any purpose!");
            this.logger.info("Discovered " + this.disabled_modules.size + " inactive modules:");
            for(var current_module_name of Array.from(this.disabled_modules.keys())) {
                this.logger.info("  - " + this.disabled_modules.get(current_module_name).config.display_name);
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

        var current_module;
        var current_command;

        //This block is for when the user runs the command in the form '//module:command'
        if(command_args[0].startsWith("//") && command_args[0].includes(":")) {
            var spec_module = command_args[0].substring(2, command_args[0].indexOf(":"));
            var spec_command = command_args[0].substring(command_args[0].indexOf(":") + 1);
            if(this.modules.has(spec_module)) { //Specified module exists
                current_module = this.modules.get(spec_module);
                var respModule = await api.get('module', {
                    name: current_module.config.name
                });

                if(respModule.modules.length == 0) { //Module exists in ModBot, but not in database
                    message.channel.send("Sorry, the database does not contain a record of the module: " + spec_module);
                    return;
                }

                var respEnabled = await api.get('enabled_module', {
                    server_id: message.channel.guild.id,
                    module_id: parseInt(respModule.modules[0].module_id)
                });

                if(respEnabled.enabled_modules.length == 0) { //The module is not enabled for the server this message came from
                    message.channel.send("That module is disabled on this server!");
                    return;
                }

                if(current_module.commands.has(spec_command)) { //Command exists in this module
                    current_command = current_module.commands.get(spec_command);
                } else { //Command specified does not exist in the specified module
                    message.channel.send("The module '" + spec_module + "' has no command '" + spec_command + "'.");
                    return;
                }
            } else { //Specified module does not exist
                message.channel.send("Sorry, I couldn't find the module: " + spec_module);
                return;
            }
        } else { //This section runs when user uses form '/command' (the module will be found automatically)
            var found_command = false;
            var matched_prefix = false;

            for(var current_module_name of Array.from(this.modules.keys())) { //Iterate all modules
                current_module = this.modules.get(current_module_name);

                if(message.content.startsWith(current_module.config.command_prefix)) { //This module's command prefix matches the one used
                    matched_prefix = true;
                    var command_name = command_args[0].substring(current_module.config.command_prefix.length);

                    if(current_module.commands.has(command_name)) { //The current module has a command with the specified name
                        var respModule = await api.get('module', {
                            name: current_module.config.name
                        });

                        if(respModule.modules.length == 0) { //Module exists in ModBot, but not in database
                            continue;
                        }

                        var respEnabled = await api.get('enabled_module', {
                            server_id: message.channel.guild.id,
                            module_id: parseInt(respModule.modules[0].module_id)
                        });

                        if(respEnabled.enabled_modules.length == 0) { //Module is not enabled on this server
                            continue;
                        }

                        found_command = true;
                        command_args[0] = command_name;
                        current_command = current_module.commands.get(command_args[0]);
                        break;
                    }
                }
            }

            if(matched_prefix && !found_command) {
                message.channel.send("Sorry, I couldn't find that command! Try /commands or /help for a list of all commands!");
                return;
            } else if(!matched_prefix) {
                return;
            }
        }

        if(command_args.length - 1 >= current_command.num_args) { //Command contains at least the required number of arguments
            if(current_command.args_to_lower) { //If set in command, make all arguments lowercase
                for(var i=0; i < command_args.length; i++) {
                    command_args[i] = command_args[i].toLowerCase();
                }
            }
            
            var extra = {}; //This will contain all of the extra variables that a command may need, based on its configuration

            if(current_module.config.is_core) { //If this module is a core module, it gains access to this ModuleHandler
                extra.module_handler = this;
            }

            if(current_command.has_state) { //If command uses state system, must grab the state
                var state = await this.state_manager.get_state(message.author.id, current_module.config.name + ":" + current_command.name);
                extra.state = state;
            }

            if(current_command.needs_api) { //If command needs to access the API, we pass it here
                extra.api = api;
            }

            await current_command.execute(message, command_args, extra); //NOTE: ALL command execute functions MUST be async!

            if(current_command.has_state) { //If this command used the state system, we must save any changes to the state
                this.state_manager.save_state(extra.state);
            }
        } else { //Not enough arguments provided
            this.invalid_syntax(current_module, command_args[0], message);
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
