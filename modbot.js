var fs = require('fs');
var axios = require('axios');
var request = require('request');
var shell = require('shelljs');

var discord = require('discord.js');
const client = new discord.Client();

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

async function botInit () {
    shell.exec('~./clean_logs.sh');
    logger.info("Logs older than 3 days have been cleaned");
    logger.info("I am ready!");

    var channel = await client.channels.fetch(config.default_channel);
    
    if(fs.existsSync("updated.txt")) {
        channel.send(config.startup_messages.update);
        fs.unlinkSync("updated.txt");
    } else {
        channel.send(config.startup_messages.restart);
    }

    client.user.setActivity(config.bot_activity.name, { type: config.bot_activity.type });
}

client.on('ready', botInit);

function authClient() {
    var token;

    try {
        token = fs.readFileSync(config.token_file).toString();
        token = token.replace(/\s+/g, '');
    } catch (error) {
        logger.error(error);
    }

    client.login(token);
}

client.on('message', (message) => {
    logger.info("Got message!");
    modules.handle_command(message);
});
