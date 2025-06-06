/**
 * Entry point for the bot. Sets up the discord client,
 * loads all the internal systems, then discovers modules and commands.
 * CURRENTLY IN THE DEVELOP djs14 BRANCH!
 */

var fs = require('fs');
var axios = require('axios');
var request = require('request');
var shell = require('shelljs');
require('dotenv/config')

const {Client, GatewayIntentBits, Discord, ActivityType} = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildBans, GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent] });
var config = JSON.parse(fs.readFileSync('modbot.json'));

var ModuleHandler = require('./core/js/module_handler.js');
var EventRegistry = require('./core/js/event_registry.js');
var StateManager = require('./core/js/state_manager.js');
var LogHandler = require('./core/js/log_handler.js');

var logger = LogHandler.build_logger(__dirname + "/" + config.log_folder);

// Define the list of channels for auto-chat
const autoChatChannels = ['1373188051760709752']; // Replace with actual channel IDs

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
        channel.send({ content: config.startup_messages.restart});    }
    client.user.setActivity(config.bot_activity.name, { type: ActivityType.Playing });

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
    sessions.forEach(session => {
        logger.info(`Scheduling message for session ${session.module}`);
        const { module, next_session, schedule_channel } = session;

        // Parse the date-time string into a JavaScript Date object
        const dateTime = new Date(next_session);
        dateTime.setDate(dateTime.getDate() - 1);
        const existingJob = schedule.scheduledJobs[module];
        if (existingJob) {
            existingJob.cancel();
        }
        // Schedule the job
        schedule.scheduleJob(module, dateTime, async function() {
            logger.info(`Sending message for session ${session.module}`);
            const guild = await client.guilds.fetch('650865972051312673');
                if (!guild) {
                    logger.error(`Guild not found for ID 650865972051312673`);
                    return;
                }
            const channel = await guild.channels.resolve(schedule_channel);
            if (channel) {
                var unixTimeStamp = Math.floor(new Date(session.next_session).getTime()/1000);
                channel.send({content: "<@&"+session.role_id.toString()+">, the session starts <t:" + unixTimeStamp.toString() + ":R>"});
            }else {
                logger.error(`Channel not found for ID ${schedule_channel} in guild ${guild.id}`);
            }
        });
    });
    const jobs = schedule.scheduledJobs;
    const jobNames = Object.keys(jobs);

    if (jobNames.length === 0) {
        logger.info('No scheduled jobs.');
        return;
    }

    let jobList = 'All scheduled jobs:\n';
    jobNames.forEach(name => {
        const job = jobs[name];
        const nextInvocation = job.nextInvocation();
        jobList += `Job Name: ${name}, Next Invocation: ${nextInvocation ? nextInvocation.toString() : 'No next invocation'}\n`;
    });

    logger.info(jobList);
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

    // Check if the message is from a bot
    if (message.author.bot) return;

    // Check if the message is in an auto-chat channel and is not a command
    if (autoChatChannels.includes(message.channel.id) && !message.content.startsWith(config.prefix)) {
        let chatCommand;
        // Iterate over all loaded modules to find the 'chat' command
        for (const module of modules.modules.values()) {
            if (module.commands && module.commands.has('chat')) {
                chatCommand = module.commands.get('chat');
                break; // Command found, no need to check other modules
            }
        }

        if (chatCommand) {
            // Construct args for the chat command
            // The chat command expects args as an array of words in the message
            const args = message.content.split(' ');
            // The 'extra' object might be used by other commands, but chat.js doesn't seem to use it.
            // We'll pass an empty object for now.
            const extra = {}; 
            
            // It's good practice to ensure the command has an execute function
            if (typeof chatCommand.execute === 'function') {
                chatCommand.execute(message, args, extra)
                    .catch(err => {
                        logger.error(`Error executing auto-chat command: ${err}`);
                        message.reply("Sorry, I encountered an error trying to chat.");
                    });
            } else {
                logger.error(`Chat command does not have an execute function.`);
            }
        } else {
            logger.error(`Chat command not found for auto-chat.`);
        }
        return; // Don't process as a regular command if it was handled by auto-chat
    }

    modules.handle_command(message);
});