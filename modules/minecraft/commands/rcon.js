module.exports = {
    name: 'rcon',
    description: 'pushes an rcon command to a minecraft server',
    syntax: 'rcon [minecraft_shortname] [rcon_command/minecraft_server_command]',
    num_args: 2,//minimum amount of arguments to accept
    args_to_lower: true,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api
        var Rcon = require('rcon');


        if(args[1]==="help"){
            message.reply({ content: "Arguments:\nminecraft_shortname: the short name of the minecraft server. Typically the first part of their IP, can be found with ,listmc\nrcon_command: any in-game server command that would usually follow a //\nMUST BE LISTED AS AN MC ADMIN TO USE THIS COMMAND"});
        }

        if(!message.member.roles.cache.some(role => role.name === "MCadmin")){
            message.reply({content: "You are not an MC Admin, you cannot use this command."})
            return;
        }

        if(!args[2]){
            message.reply({ content: "Please make sure to fill out all arguments. Use 'rcon help' to see how to use it!"});
        }

        var respServer;
            try{
                respServer = await api.get("minecraft_server", {
                    short_name: args[1]
                });
            } catch(error){
                this.logger.error(error.message);
            } 
        if(!respServer.minecraft_servers[0]){
            message.reply({ content: "No server with that shortname exists, use ,listmc to find one!"});
            return;
        }

        var conn = new Rcon(respServer.minecraft_servers[0].numeric_ip, respServer.minecraft_servers[0].rcon_port, 'BudasloungeMinecraft');

        conn.on('auth', function() {
        // You must wait until this event is fired before sending any commands,
        // otherwise those commands will fail.
        this.logger.info("Authenticated");
        this.logger.info("Sending command: help")
        conn.send("help");
        }).on('response', function(str) {
        this.logger.info("Response: " + str);
        }).on('error', function(err) {
        this.logger.info("Error: " + err);
        }).on('end', function() {
        this.logger.info("Connection closed");
        process.exit();
        });

        conn.connect();

    }
}