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
        var answersArray = {"friend": "Ask Cella for the number", "2319":"RETAIИMƎNT UNSUCCESSFULLUFSSECCUSNU\nᗡIMƎИƧIOИA⅃ PLASTIYTIC UNTENELBA\nƎW ƎƧOHT OTO THOSE WƎ FAILED ƧU ƎVIᎮЯOᖷ"};
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