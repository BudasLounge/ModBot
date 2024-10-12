const fs = require('fs');
const Rcon = require('rcon');

module.exports = {
    name: 'rcon',
    description: 'Pushes an rcon command to a Minecraft server',
    syntax: 'rcon [minecraft_shortname] [rcon_command/minecraft_server_command]',
    num_args: 2, // minimum number of arguments required
    args_to_lower: true, // arguments should be lower case
    needs_api: true, // if this command needs access to the API
    has_state: false, // if this command uses the state engine
    async execute(message, args, extra) {
        const api = extra.api;

        // Read RCON password and sanitize it
        let password;
        try {
            password = fs.readFileSync('../rcon_password.txt').toString().trim();
        } catch (err) {
            console.error('Error reading RCON password:', err);
            return message.reply({ content: 'Unable to read RCON password. Please check the configuration.' });
        }

        // Display help information
        if (args[1] === 'help') {
            return message.reply({
                content: "Arguments:\n`minecraft_shortname`: the short name of the Minecraft server (first part of the IP, use ,listmc to find).\n`rcon_command`: any in-game server command, usually prefixed with `/`.\nMUST BE LISTED AS AN MC ADMIN TO USE THIS COMMAND."
            });
        }

        // Ensure the user has the required role
        if (!message.member.roles.cache.some(role => role.name === 'MCadmin')) {
            return message.reply({ content: "You are not an MC Admin, so you cannot use this command." });
        }

        // Ensure all arguments are provided
        if (!args[2]) {
            return message.reply({ content: "Please provide all required arguments. Use `rcon help` for instructions." });
        }

        // Fetch the server information from the API
        let respServer;
        try {
            respServer = await api.get('minecraft_server', { short_name: args[1] });
        } catch (error) {
            console.error('Error fetching server data:', error.message);
            return message.reply({ content: 'Error retrieving server information. Please try again.' });
        }

        // Check if the server exists
        const server = respServer.minecraft_servers && respServer.minecraft_servers[0];
        if (!server) {
            return message.reply({ content: "No server found with that short name. Use `,listmc` to find a valid server." });
        }

        // Construct the RCON command
        const command = args.slice(2).join(' ');

        // Establish RCON connection
        if (server.server == "windows"){
            const conn = new Rcon("192.168.1.4", server.rcon_port, password);
        }else if (server.server == "linux"){
            const conn = new Rcon("192.168.1.9", server.rcon_port, password);
        }


        // RCON connection events
        conn.on('auth', function() {
            console.log('RCON authenticated.');
            console.log('Sending command:', command);
            conn.send(command);
        }).on('response', function(str) {
            console.log('RCON response:', str);
            message.reply({ content: `Command executed successfully:\n${str}` }); // Notify user with response
        }).on('error', function(err) {
            console.error('RCON error:', err);
            message.reply({ content: 'An error occurred while executing the command.' });
        }).on('end', function() {
            console.log('RCON connection closed.');
            conn.disconnect(); // Close connection gracefully without exiting the process
        });

        // Connect to RCON
        conn.connect();
    }
};
