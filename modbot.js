var fs = require('fs');
var axios = require('axios');
var request = require('request');

var Discord = require('discord.js');
var client = new Discord.Client();

var config = JSON.parse(fs.readFileSync('modbot.json'));

var ModuleHandler = require('./core/js/module_handler.js');
var EventRegistry = require('./core/js/event_registry.js');
var StateManager = require('./core/js/state_manager.js');
var LogHandler = require('./core/js/log_handler.js');

var logger = LogHandler.build_logger(__dirname + "/" + config.log_folder);

var state_manager = new StateManager(logger);

var modules = new ModuleHandler(__dirname, state_manager, logger);
modules.discover_modules(__dirname + "/" + config.modules_folder);
modules.discover_commands();

var event_registry = new EventRegistry(client, logger);
event_registry.discover_event_handlers(modules);

logger.info("Event Registration Complete!");

authClient();

client.on('ready', () => {
    logger.info("I am ready!");
    var channel = client.channels.get(config.default_channel);

    if(fs.existsSync("updated.txt")) {
        channel.send(config.startup_messages.update);
        fs.unlinkSync("updated.txt");
    } else {
        channel.sendMessage(config.startup_messages.restart);
    }
    client.user.setActivity(config.bot_activity.name, { type: config.bot_activity.type });
});

function authClient() {
    var token;

    try {
        token = fs.readFileSync(config.token_file).toString();
        logger.info("Token: " + token);
    } catch (error) {
        logger.error(error);
    }

    client.login(token);
}

client.on('message', (message) => {
    modules.handle_command(message);
});
