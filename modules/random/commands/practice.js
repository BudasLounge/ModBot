module.exports = {
    name: 'practice',
    description: '[what the command should do]',
    syntax: '[activation word] [any] [additional] [arguments]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        this.logger.info("Here are the variables: start: " + args[1]+"  end: " + args[2] +"  interval: "+args[3]+"  separator: "+ args[4]);
        var start = parseInt(args[1]);
        var end = parseInt(args[2]);
        var interval = parseInt(args[3]);
        var separator;
        if(args[4]){
            separator = args[4];
        }
        else{
            separator = " ";
        }
        if(interval>0 && start>end){
            message.channel.send({ content: "This will cause an error, try with different numbers. Up."});
        }
        else if(interval<0 && start<end){
            message.channel.send({ content: "This will cause an error, try with different numbers. Down."});
        }else{
            var output = "";
            /*for(var i = start;i<=end;i+=interval){
                if(separator == '\\n'){
                    output+= i + "\n";
                }else{
                    output+= i + " " + separator;
                }
            }*/
            
            var i = start;
            while (i<=end) {
                if(separator == '\\n'){
                    output+= i + "\n";
                }else{
                    output+= i + " " + separator;
                }
                i+=interval;
            }


                
            message.channel.send({ content: output});
        }
        message.channel.send({ content: "This is a practice command."});
    }
}