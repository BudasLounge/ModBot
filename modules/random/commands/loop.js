module.exports = {
    name: 'loop',
    description: 'loops on interval with separator',
    syntax: 'loop [start] [end] [interval] [separator]',
    num_args: 3,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        this.logger.info("Here are the variables:\nstart: " + args[1]+"\nend: " + args[2] +"\ninterval: "+args[3]+"\nseparator: "+ args[4]);
        var start = parseInt(args[1]);
        var end = parseInt(args[2]);
        var interval = parseInt(args[3]);
        var separator;
        if(args[4]){
            separator = args[4];
        }else{
            separator = " ";
        }
        if(interval>0 && start>end){
            message.channel.send({ content: "This will cause an error, try with different numbers. Up."});
        }
        else if(interval<0 && start<end){
            message.channel.send({ content: "This will cause an error, try with different numbers. Down."});
        }else{
            var output = "";
            for(var i = start;i<end;i+=interval){
                if(separator == '\\\n'){
                    output+= i + "\n";
                }else{
                    output+= i + " " + separator;
                }
            }
            message.channel.send({ content: output});
        }
    }
};