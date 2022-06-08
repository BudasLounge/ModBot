module.exports = {
    name: 'speak',
    description: 'Bot joins discord channel and says something',
    syntax: 'speak [message here]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {

        const discordTTS=require("discord-tts");
        const {AudioPlayer, createAudioResource, StreamType, entersState, VoiceConnectionStatus, joinVoiceChannel} = require("@discordjs/voice");
        let voiceConnection;
        let audioPlayer=new AudioPlayer();

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
            message.channel.send({ content: "No bad words for now!"});
            return;
        }
        if(sayMessage.length>200){
            message.channel.send({ content: "That message is too long, no more than 200 characters per message!"});
            return;
        }
        var sayMessage = args.join();
        const stream=discordTTS.getVoiceStream(sayMessage);
        const audioResource=createAudioResource(stream, {inputType: StreamType.Arbitrary, inlineVolume:true});
        if(!voiceConnection || voiceConnection?.status===VoiceConnectionStatus.Disconnected){
            voiceConnection = joinVoiceChannel({
                channelId: message.member.voice.channelId,
                guildId: message.guildId,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            voiceConnection=await entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5_000);
        }
        
        if(voiceConnection.status===VoiceConnectionStatus.Connected){
            voiceConnection.subscribe(audioPlayer);
            await audioPlayer.play(audioResource);
        }
        //voiceConnection.destroy();
    }
}