module.exports = {
    name: 'pal_status',
    description: 'Shows the status of the palworld server',
    syntax: '[activation word] [any] [additional] [arguments]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {

    }
}