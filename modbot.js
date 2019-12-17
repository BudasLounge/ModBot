var fs = require('fs');
var axios = require('axios');
var request = require('request');

var Discord = require('discord.js');
var client = new Discord.Client();

var config = JSON.parse(fs.readFileSync('modbot.json'));

var ModuleHandler = require('./core/js/module_handler.js');

var modules = new ModuleHandler(__dirname);
modules.discover_modules(__dirname + config.modules_folder);
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
        console.log(config.token_file);
        token = fs.readFileSync(config.token_file).toString();
    } catch (error) {
        console.error(error);
    }

    client.login(token);
}

client.on('message', (message) => {
    modules.handle_command(message);
});