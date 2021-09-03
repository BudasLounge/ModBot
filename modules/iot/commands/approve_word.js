module.exports = {
    name: 'approve_word',
    description: 'Approves words for the /say command',
    syntax: 'approve [word]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        try{
            var respCheckWord = await api.get("allowed_word",{
                word:args[1]
            })
        }catch(err2){
            this.logger.error(err2);
        }
        if(message.author.id === "185223223892377611"){
            if(!respCheckWord.allowed_words[0]){
                try{
                    var respApprovedWords = await api.post("allowed_word",{
                        word:args[1],
                        approved:1
                    })
                }catch(err){
                    this.logger.error(err);
                }

                if(respApprovedWords.ok){
                    message.channel.send("Word approved!");
                }
                else{
                    message.channel.send("Failed to approve, try again!");
                }
            }else{
                try{
                    var respUpdateApprovedWords = await api.put("allowed_word",{
                        word:args[1],
                        approved:1
                    })
                }catch(err2){
                    this.logger.error(err2);
                }

                if(respUpdateApprovedWords.ok){
                    message.channel.send("Word approved!");
                }
                else{
                    message.channel.send("Failed to approve, try again!");
                }
            }
        }else{
            if(respCheckWord[0]){
                message.channel.send("That word is already being queued for approval.");
            }else{
                try{
                    var respApprovedWords = await api.post("allowed_word",{
                        word:args[1],
                        approved:0
                    })
                }catch(err){
                    this.logger.error(err);
                }
                if(respApprovedWords.ok){
                    message.channel.send("Word was sent for approval!");
                }
                else{
                    message.channel.send("Failed to send for approval, try again!");
                }
            }
        }
    }
}