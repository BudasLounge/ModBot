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
    }
}