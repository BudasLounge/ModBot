module.exports = {
    name: 'list_champs',
    description: 'returns all league champions',
    syntax: 'list_champs [champ name] or [@user]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        function splitMessageByLine(content, maxLength) {
            var lines = content.split('\n');
            var chunks = [];
            var currentChunk = '';

            for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                var line = lines[lineIndex];

                if (line.length > maxLength) {
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        currentChunk = '';
                    }

                    for (var charIndex = 0; charIndex < line.length; charIndex += maxLength) {
                        chunks.push(line.slice(charIndex, charIndex + maxLength));
                    }
                    continue;
                }

                var candidate = currentChunk.length > 0 ? currentChunk + '\n' + line : line;
                if (candidate.length > maxLength) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk = candidate;
                }
            }

            if (currentChunk.length > 0) {
                chunks.push(currentChunk);
            }

            return chunks;
        }
        this.logger.info("[list_champs] Execute called", { userId: message.member?.id, argsLength: args.length });
        var respChamps;
        if(args[1]){
            if(args[1].includes("@")){
                var respChampsCustom;
                var mentionedUser = message.mentions.users.first();
                if (!mentionedUser) {
                    message.channel.send({ content: "Please @mention a valid user."});
                    return;
                }
                var customID = mentionedUser.id;
                var output = "Here is " + args[1] + "'s champion list:\n";
                try{
                    respChampsCustom = await api.get("league_pref_champ",{
                        _limit: 200,
                        user_id: customID
                    });
                }catch(errorCustom){
                    this.logger.error("[list_champs] Failed custom champion lookup", { error: errorCustom?.response || errorCustom?.message || errorCustom });
                    message.channel.send({ content: "I couldn't fetch that user's champion list right now."});
                    return;
                }
                if(respChampsCustom && respChampsCustom.league_pref_champs && respChampsCustom.league_pref_champs[0]){
                    for(var i = 0;i<respChampsCustom.league_pref_champs.length;i++){
                        this.logger.info("[list_champs] Appending custom champion", { champ: respChampsCustom.league_pref_champs[i].champ_name });
                        output+=respChampsCustom.league_pref_champs[i].champ_name +"\n";
                    }
                }else{
                    message.channel.send({ content: "That person hasn't approved any champions yet!"});
                    return;
                }
                message.channel.send({ content: output});
            }else{
                try{
                    respChamps = await api.get("league_champion",{
                        name: args[1]
                    });
                } catch(error2){
                    this.logger.error("[list_champs] Failed champion lookup", { error: error2?.response || error2?.message || error2 });
                    message.channel.send({ content: "I couldn't look up that champion right now."});
                    return;
                }
                if(respChamps && respChamps.league_champions && respChamps.league_champions[0]){
                    var output = "Champion: " + respChamps.league_champions[0].name + "\nPrimary role: " + respChamps.league_champions[0].role_primary + "\nSecondary role: " + respChamps.league_champions[0].role_secondary + "\nDamage type: " + respChamps.league_champions[0].ad_ap;
                    try {
                        await message.author.send({ content: output});
                    } catch(dmError) {
                        this.logger.error("[list_champs] Failed to DM user", { error: dmError?.message || dmError });
                        message.channel.send({ content: "I couldn't DM you. Please enable DMs from server members and try again."});
                        return;
                    }
                    message.channel.send({ content: "Sent a PM!"});
                }else{
                    message.channel.send({ content: "Couldn't find a champion by that name!"});
                }
            }
        }
        else{
            try{
                respChamps = await api.get("league_champion",{
                    _limit: 200
                });
            } catch(error){
                this.logger.error("[list_champs] Failed to fetch champions", { error: error?.response || error?.message || error });
                message.channel.send({ content: "I couldn't fetch champions right now."});
                return;
            }
            var output = "Champion - Primary Role / Secondary Role\n";
            
            this.logger.info("[list_champs] Champion list retrieved", { count: respChamps?.league_champions?.length || 0 });
            for(var i = 0; i<respChamps.league_champions.length;i++){
                output += respChamps.league_champions[i].name + " - " + respChamps.league_champions[i].role_primary + "/" +respChamps.league_champions[i].role_secondary +"\n";
            } 
            var messageChunks = splitMessageByLine(output, 2000);
            this.logger.info("[list_champs] Sending champion list via DM", { chunkCount: messageChunks.length });
            try {
                for (var chunkIndex = 0; chunkIndex < messageChunks.length; chunkIndex++) {
                    await message.author.send({ content: messageChunks[chunkIndex] });
                }
            } catch(dmErrorAll) {
                this.logger.error("[list_champs] Failed to DM full champion list", { error: dmErrorAll?.message || dmErrorAll });
                message.channel.send({ content: "I couldn't DM you. Please enable DMs from server members and try again."});
                return;
            }
            //message.author.send({ content: output });
            /*const ListEmbed = new Discord.MessageEmbed()
                .setColor("#f92f03")
                .setTitle("A list of all champions: ");
            var embeds = extra.MessageHelper.split_embed(ListEmbed, output);
            for(var e = 0;e<embeds.length;e++){
                message.channel.send({ content: embeds[e]);
            }*/
        
        message.channel.send({ content: "Sent a PM!"});
        }
    }
};