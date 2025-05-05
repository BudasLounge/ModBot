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

        // Validate server details
        if (!server.backend_ip || !server.rcon_port) {
            return message.reply({ content: "Server configuration is incomplete. Missing IP or RCON port." });
        }

        // Construct the RCON command
        const command = args.slice(2).join(' ');
        let conn;
        
        try {
            // Establish RCON connection
            conn = new Rcon(server.backend_ip, server.rcon_port, password);
            
            // Set connection timeout
            const timeout = setTimeout(() => {
                if (conn) {
                    console.log('RCON connection timed out');
                    message.reply({ content: `Connection to ${server.backend_ip}:${server.rcon_port} timed out. Server might be down or unreachable.` });
                    try { conn.disconnect(); } catch (e) { /* ignore cleanup errors */ }
                }
            }, 5000); // 5 second timeout
            
            // RCON connection events
            conn.on('auth', function() {
                clearTimeout(timeout);
                console.log('RCON authenticated.');
                console.log('Sending command:', command);
                conn.send(command);
            }).on('response', function(str) {
                console.log('RCON response:', str);
                message.reply({ content: `Command executed successfully:\n${str}` }); // Notify user with response
            }).on('error', function(err) {
                clearTimeout(timeout);
                console.error('RCON error:', err);
                const errorMessage = `Failed to connect to ${server.backend_ip}:${server.rcon_port}. ${err.code === 'ECONNREFUSED' ? 
                    'The server is refusing connections. It might be down, the RCON port might be wrong, or a firewall might be blocking the connection.' : 
                    'An error occurred while executing the command.'}`;
                message.reply({ content: errorMessage });
            }).on('end', function() {
                clearTimeout(timeout);
                console.log('RCON connection closed.');
            });
            
            // Connect to RCON with error handling
            conn.connect();
        } catch (err) {
            console.error('Error setting up RCON connection:', err);
            message.reply({ content: `Failed to set up RCON connection: ${err.message}` });
        }
    }
};
