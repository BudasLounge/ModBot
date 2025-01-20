module.exports = {
    name: 'delete_server',
    description: 'Used to delete a Minecraft server from the database',
    syntax: 'delete_server [short_name or display_name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        const { api } = extra;

        // Check if the user has the MCadmin role
        if (!message.member.roles.cache.some(role => role.name === "MCadmin")) {
            return message.channel.send({ content: "You don't have permission to do that" });
        }

        // Use args[1] because args[0] is the command itself
        const queryValue = args[1];
        if (!queryValue) {
            return message.channel.send({ content: "Please provide a server short name or display name." });
        }

        let server;

        // Try fetching the server by short_name first
        try {
            const responseByShort = await api.get("minecraft_server", { short_name: queryValue });
            server = responseByShort?.minecraft_servers?.[0];
        } catch (error) {
            console.error("Error retrieving server by short_name:", error);
        }

        // If not found by short_name, try display_name
        if (!server) {
            await message.channel.send({ content: "short_name not found...checking display_name" });
            try {
                const responseByDisplay = await api.get("minecraft_server", { display_name: queryValue });
                server = responseByDisplay?.minecraft_servers?.[0];
            } catch (error) {
                console.error("Error retrieving server by display_name:", error);
            }
        }

        // If server still isn't found, inform the user
        if (!server) {
            return message.channel.send({ content: "That server could not be found..." });
        }

        // Attempt to delete the server
        try {
            const respDelete = await api.delete("minecraft_server", { short_name: server.short_name });
            if (respDelete.ok) {
                return message.channel.send({ 
                    content: `${server.display_name} has been successfully deleted.` 
                });
            } else {
                return message.channel.send({ 
                    content: "Failed to delete the server. Please try again." 
                });
            }
        } catch (deleteError) {
            console.error("Error deleting server:", deleteError);
            return message.channel.send({ 
                content: "An error occurred while deleting the server." 
            });
        }
    }
};
