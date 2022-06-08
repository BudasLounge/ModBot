module.exports = {
    name: 'speak2',
    description: 'Bot joins discord channel and says something',
    syntax: 'speak2 [message here]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api;
        const discordTTS=require("discord-tts");
        const {AudioPlayer, AudioPlayerStatus, createAudioResource, StreamType, entersState, VoiceConnectionStatus, joinVoiceChannel, getVoiceConnection} = require("@discordjs/voice");
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
            this.logger.error(err.message);
        }

        const Filter = require('bad-words');
        filter = new Filter();

        filter.removeWords(...approvedWords);
        args.shift();
        var sayMessage = args.join(' ');
        if(filter.isProfane(sayMessage)){
            sayMessage = "That had some bad words in it, bitch, try again";
        }
        if(sayMessage.length>200){
            message.channel.send({ content: "That message is too long, no more than 200 characters per message!"});
            return;
        }
        const stream=discordTTS.getVoiceStream(sayMessage);
        const audioResource=createAudioResource(stream, {inputType: StreamType.Arbitrary, inlineVolume:true});
        
        voiceConnection = null
        audioPlayer = null
        audioQueue = []
        if(voiceConnection === null) {
            //create voice connection
        }
        if(audioPlayer === null) {
            audioPlayer = new AudioPlayer();

            audioPlayer.on(AudioPlayerStatus.Idle, () => {
                if(audioQueue.length > 0) {
                    audioPlayer.play(audioQueue[0]);
                    audioQueue.shift(); //Shifts array to left, removing first entry (since we just played it)
                } else {
                    //Destroy audio player, disconnect voiceConnection, then...
                    audioPlayer = null;
                    voiceConnection = null;
                }
            });
        }

        //Create audio resource
        
        audioQueue.push(audioResource);
    }
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}