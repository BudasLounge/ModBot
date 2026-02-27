const { exec } = require('child_process');

module.exports = {
    name: 'servermanager',
    description: 'Manages Minecraft server instances (start, stop, restart). Assumes services are named [server_short_name].service.',
    syntax: 'servermanager [server_short_name] [start|stop|restart]',
    num_args: 2, // server_short_name and action
    args_to_lower: true, // Convert args to lowercase
    needs_api: true,
    has_state: false,
    options: [
        { name: 'server_short_name', description: 'Short name of the server', type: 'STRING', required: true },
        { name: 'action',            description: 'Action to perform',         type: 'STRING', required: true, choices: ['start', 'stop', 'restart'] },
    ],
    async execute(message, args, extra) {
        const api = extra.api;

        // Permission Check (e.g., MCadmin role - consistent with rcon.js)
        if (!message.member.roles.cache.some(role => role.name === 'MCadmin')) {
            this.logger.warn(`User ${message.author.tag} (ID: ${message.author.id}) attempted to use servermanager without MCadmin role.`);
            return message.reply({ content: "You do not have permission to use this command." });
        }

        const serverShortName = args[1];
        const action = args[2];

        if (!serverShortName || !action) {
             return message.reply({ content: `Invalid syntax. Usage: \`${this.syntax}\`` });
        }

        const validActions = ['start', 'stop', 'restart'];
        if (!validActions.includes(action)) {
            return message.reply({ content: `Invalid action: "${action}". Must be one of: ${validActions.join(', ')}.` });
        }

        let serverDetails;
        try {
            const respServer = await api.get('minecraft_server', { short_name: serverShortName });
            serverDetails = respServer.minecraft_servers && respServer.minecraft_servers[0];
            if (!serverDetails) {
                this.logger.info(`Servermanager: Server with short_name "${serverShortName}" not found in API.`);
                return message.reply({ content: `No server found with short name "${serverShortName}". Use \`,listmc\` to find a valid server.` });
            }
        } catch (error) {
            this.logger.error(`Servermanager: Error fetching server data for "${serverShortName}": ${error.message || error}`);
            return message.reply({ content: 'Error retrieving server information. Please try again.' });
        }

        // Validate the server short_name retrieved from the database
        // to prevent command injection if a malicious short_name was somehow stored.
        // Service names should ideally be simple and not contain shell metacharacters.
        const safeShortNamePattern = /^[a-zA-Z0-9_-]+$/;
        if (!safeShortNamePattern.test(serverDetails.short_name)) {
            this.logger.error(`Servermanager: Invalid characters in server short_name from database: "${serverDetails.short_name}". Aborting.`);
            return message.reply({ content: `The server short name ("${serverDetails.short_name}") contains invalid characters and cannot be used.` });
        }

        // Use the validated serverDetails.short_name for the service name
        const serviceName = `${serverDetails.short_name}.service`; 
        const commandToExecute = `sudo systemctl ${action} ${serviceName}`;

        this.logger.info(`Servermanager: User ${message.author.tag} attempting to execute: ${commandToExecute}`);
        message.channel.send({ content: `Attempting to ${action} server "${serverDetails.display_name}" (service: ${serviceName})...` });

        exec(commandToExecute, (error, stdout, stderr) => {
            if (error) {
                this.logger.error(`Servermanager: Error executing command "${commandToExecute}": ${error.message}`);
                if (stderr) this.logger.error(`Servermanager: stderr: ${stderr}`);
                return message.channel.send({ content: `Failed to ${action} server "${serverDetails.display_name}". Error: ${error.message}. Check bot logs for details.` });
            }

            let outputMessage = `Server "${serverDetails.display_name}" ${action} command processed.\n`;
            if (stdout) {
                this.logger.info(`Servermanager: stdout for "${commandToExecute}": ${stdout}`);
                outputMessage += `Output:\n\`\`\`\n${stdout}\n\`\`\`\n`;
            }
            if (stderr) {
                this.logger.warn(`Servermanager: stderr for "${commandToExecute}" (might be informational): ${stderr}`);
                outputMessage += `Info/Warnings:\n\`\`\`\n${stderr}\n\`\`\`\n`;
            }
            if (!stdout && !stderr) {
                outputMessage += "No specific output from the command.";
            }

            message.channel.send({ content: outputMessage });
        });
    }
};
