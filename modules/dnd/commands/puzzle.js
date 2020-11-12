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
        var answersArray = {"html": "Let's check out those hacker skills on a friend's domain", "finished":"h y  mna aImii  i. yea t  v r.es acpyntt  tnmpm m  sb anefsTyaImoa dh ahtgyreIabltuImerit","2":"Here's your answer! https://www.scpwiki.com/scp-002"};
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