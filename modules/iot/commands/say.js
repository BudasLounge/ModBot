module.exports = {
    name: 'say',
    description: 'Speak some words into the world!',
    syntax: 'say [message]',
    num_args: 1,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const moment = require('moment');
        var d = new Date(); // current time
        var hours = d.getHours();
        var now = moment();
        

        if((hours >= 8 && (hours < 22)) || message.author.id === "185223223892377611"){

        }else{
            var deadline = now.clone().hour(8).minute(0).second(0);
            var opening_time;
            if(now.isAfter(deadline)) {
                var tomorrow  = moment(new Date()).add(1,'days').hour(8).minute(0).second(0);
                opening_time = tomorrow.diff(now, "hours") + ' hrs, ' + (tomorrow.diff(now, "minutes") % 60) + ' mins'
                //opening_time = tomorrow.from(now);
            }else {
                opening_time = deadline.diff(now, "hours") + ' hrs, ' + (deadline.diff(now, "minutes") % 60) + ' mins'
                //opening_time = deadline.from(now);
            }
            message.channel.send("This command is closed. It will open again " + opening_time + ". Try again later!");
            return;
        }
        var approvedWords = [];
        try{
            var respApprovedWords = await api.get("allowed_word", {
                //approved: "true"
            });
            for(var i = 0;i<respApprovedWords.allowed_words.length;i++){
                if(respApprovedWords.allowed_words[i].approved === "1"){
                    approvedWords.push(respApprovedWords.allowed_words[i].word);
                }
            }
        }catch(err){
            this.logger.error(err);
        }

        const Filter = require('bad-words');
        filter = new Filter();

        filter.removeWords(...approvedWords);
        const say = require('say');
        args.shift();
        var sayMessage = args.join();
        if(filter.isProfane(sayMessage)){
            message.channel.send("No bad words for now!");
            return;
        }
        if(sayMessage.length<=200){
            say.speak(sayMessage);
            message.channel.send("Message was spoken!");
        }else{
            message.channel.send("That message is too long, no more than 200 characters per message!");
        }
        //say.stop();

    }
}