module.exports = {
    name: 'puzzle',
    description: 'For Foundation personnel use only.',
    syntax: 'puzzle [keyword here]',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        var answersArray = {};
        var flag = false;
        for(var key in answersArray){
            this.logger.info("in key finding function");
            if(key == args[1]){
                this.logger.info("setting flag to true");
                flag = true;
            }
        }
        if(flag == true){
            message.channel.send(answersArray[args[1]]);
        }else{
            message.channel.send("Try and find some key words");
        }
    }
};