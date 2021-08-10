module.exports = {
    name: 'loop_sep',
    description: 'loops to a number',
    syntax: 'loop_sep [start] [end] [interval] [separator]',
    num_args: 3,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        this.logger.info("Here are the variables:\nstart: " + args[1]+"\nend: " + args[2] +"\ninterval: "+args[3]+"\nseparator: "+ args[4]);
        var start = Number(args[1]);
        var end = Number(args[2]);
        var interval = Number(args[3]);
        var separator;
        if(args[4]){
            separator = args[4];
        }else{
            separator = " ";
        }
        if(interval>0 && args[1]>args[2]){
            message.channel.send("This will cause an error, try with different numbers");
        }
        else if(interval<0 && args[1]<args[2]){
            message.channel.send("This will cause an error, try with different numbers");
        }else{
            var output = "";
            for(var i = start;i<end;i+=interval){
                output+= i + " " + separator;
            }
            message.channel.send(output);
        }
    }
};