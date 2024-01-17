/**
 * Entry point for the bot. Sets up the discord client,
 * loads all the internal systems, then discovers modules and commands.
 */

var fs = require('fs');
var axios = require('axios');
var request = require('request');
var shell = require('shelljs');
require('dotenv/config')

const {Intents} = require('discord.js');
const Discord = require('discord.js');
const client = new Discord.Client({ intents: [Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_BANS, Intents.FLAGS.GUILD_INVITES, Intents.FLAGS.GUILD_VOICE_STATES] });

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

    logger.info("Initialization of DnD scheduling messages starting...");
    const schedule = require('node-schedule');
    const APIClient = require('./core/js/APIClient.js');
    const api = new APIClient();

    var respDNDCampaigns;
    try{
        respDNDCampaigns = await api.get("dnd_campaign",{
            active: true,
            _limit: 200
        })
    }catch(err){
        logger.error(err.message);
    }
    const sessions = respDNDCampaigns.dnd_campaigns;
    logger.info(respDNDCampaigns)
    sessions.forEach(session => {
        logger.info(`Scheduling message for session ${session.module}`);
        const { next_session, schedule_channel } = session;

        // Parse the date-time string into a JavaScript Date object
        const dateTime = new Date(next_session);

        // Schedule the job
        schedule.scheduleJob(dateTime, async function() {
            const channel = await client.channels.fetch(schedule_channel);
            if (channel) {
                var unixTimeStamp = Math.floor(new Date(session.next_session).getTime()/1000);
                channel.send({content: "<@&"+session.role_id.toString()+">, the session starts <t:" + unixTimeStamp.toString() + ":R>"});
            }
        });
    });
    const scheduledJobs = schedule.scheduledJobs;
    logger.info('All scheduled jobs:', scheduledJobs);
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