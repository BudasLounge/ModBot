module.exports = {
    name: 'loop',
    description: 'loops to a number',
    syntax: 'loop [start] [end] [interval] [separator]',
    num_args: 3,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        var start = args[1];
        var end = args[2];
        var interval = args[3];
        var separator;
        if(args[4]){
            separator = args[4];
        }
        if(interval>0 && args[1]>args[2]){
            message.channel.send("This will cause an error, try with different numbers");
        }
        else if(interval<0 && args[1]<args[2]){
            message.channel.send("This will cause an error, try with different numbers");
        }else{
            var output;
            for(var i = start;i<end;i+=interval){
                output+= i + " " + separator;
            }
            message.channel.send(output);
        }
    }
};