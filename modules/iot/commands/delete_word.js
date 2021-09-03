module.exports = {
    name: 'delete_word',
    description: 'Deletes words for the /say command',
    syntax: 'delete [word]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        if(message.author.id === "185223223892377611"){
            try{
                var respApprovedWords = await api.delete("allowed_word",{
                    word:args[1]
                })
            }catch(err){
                this.logger.error(err);
            }
            if(respApprovedWords.ok){
                message.channel.send("Word deleted!");
            }
            else{
                message.channel.send("Failed to delete, try again!");
            }
        }else{
            message.channel.send("You are not approved to do that function");
        }
    }
}