module.exports = {
    name: 'puzzle',
    description: 'Helps you find the answers.',
    syntax: 'puzzle [info]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var answersArray = {"first": "Ask Cella for the number", "2319":"It's all in reverse?"};
        var flag = false;
        for(var key in answersArray){
            this.logger.info("in key finding function");
            if(key == args[1]){
                this.logger.info("setting flag to true");
                flag = true;
            }
        }
        if(flag = true){
            message.channel.send(answersArray[args[1]]);
        };
    }
};