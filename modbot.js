const fs = require('fs');
const axios = require('axios');
const request = require('request');

const Discord = require('discord.js');
const client = new Discord.Client();

const config = JSON.parse(fs.readFileSync('modbot.json'));

const ModuleHandler = require('./core/js/module_handler.js');

var modules = new ModuleHandler();
modules.discover_modules();
modules.discover_commands();

authClient();

client.on('ready', () => {
    console.log("I am ready!");
    var channel = client.channels.get(config.default_channel);
    channel.sendMessage('I am online!');
    client.user.setActivity(config.bot_activity.name, { type: config.bot_activity.type });
});

function authClient() {
    var token;

    try {
        token = fs.readFileSync(config.token_file).toString();
    } catch (error) {
        console.error(error);
    }

    client.login(token);
}

client.on('message', (message) => {
    modules.handle_command(message);
});