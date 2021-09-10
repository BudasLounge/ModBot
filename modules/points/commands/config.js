module.exports = {
    name: 'points_config',
    description: 'Updates config options for the servers point system',
    syntax: 'points_config [item to change] [new value]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: true,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {

    }
}