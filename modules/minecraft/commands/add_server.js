module.exports = {
    name: 'add_server',
    description: 'Used to add a new minecraft server to the database',
    syntax: 'add_server [display_name] [short_name] [server_ip] [port] [status_api_port] [numeric_ip]',
    num_args: 6,
    args_to_lower: true,
    async execute(message, args, api) {
        var respServer;
        try{
            respServer = await api.get("minecraft_server", {
                server_ip: args[3]
            });
        } catch(error){
            console.error(error);
        } 
        if(!respServer.minecraft_servers[0]){
            message.channel.send("Found nothing!");
        }
    }
};
