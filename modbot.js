var fs = require('fs');
var axios = require('axios');
var request = require('request');
var shell = require('shelljs');

//var discord = require('discord.js');
const {Intents, Client} = require('discord.js');
const client = new Client({ intents: [Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_BANS, Intents.FLAGS.GUILD_INVITES, Intents.FLAGS.GUILD_VOICE_STATES] });

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
    shell.exec('/home/bots/clean_logs.sh');
    logger.info("Logs older than 3 days have been cleaned");
    logger.info("I am ready!");

    var channel = await client.channels.fetch(config.default_channel);
    
    if(fs.existsSync("updated.txt")) {
        channel.send({ content: config.startup_messages.update});
        fs.unlinkSync("updated.txt");
    } else {
        channel.send({ content: config.startup_messages.restart});
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

client.on('messageCreate', (message) => {
    logger.info("Got message!");
    //Add ability to check first time someone sends a message (not command) and grant them points
    modules.handle_command(message);
});

client.on('voiceStateUpdate', (oldState, newState) => {
    // check for bot
    if (oldState.member.user.bot) return;
    if(newState.channelID === null) //left
        console.log('user left channel', oldState.channelID);
    else if(oldState.channelID === null) // joined
        console.log('user joined channel', newState.channelID);
    else // moved
        console.log('user moved channels', oldState.channelID, newState.channelID);
})