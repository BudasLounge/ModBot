module.exports = {
    name: 'rng',
    description: 'Random Number Generator',
    syntax: 'rng [optional starting number] [optional ending number]',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        var starting = 1;
        var ending = 10;
        if(Number.isInteger(parseInt(args[1]))){
            starting = args[1];
        }
        if(Number.isInteger(parseInt(args[2]))){
            ending = args[2];
        }
        var rng = Math.floor(Math.random() * (ending - starting) + starting);
        message.channel.send(rng);
    }
}