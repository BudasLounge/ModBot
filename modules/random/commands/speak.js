const discordTTS=require("discord-tts");
const {AudioPlayer, AudioPlayerStatus, AudioPlayerIdleState, createAudioResource, StreamType, entersState, VoiceConnectionStatus, joinVoiceChannel, getVoiceConnection} = require("@discordjs/voice");
//comment for file update
module.exports = {
    name: 'speak',
    description: 'Bot joins discord channel and says something',
    syntax: 'speak [message here]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    voiceConnection: null,
    audioPlayer: null,
    audioQueue: [],
    tryPlayNextAudio() {
        if(this.audioQueue.length > 0) {
            this.audioPlayer.play(this.audioQueue.shift());
            this.logger.info("Shifted TTS Queue");
        } else {
            this.audioPlayer.stop();
            this.voiceConnection.destroy()
            this.audioPlayer = null;
            this.voiceConnection = null;
        }
    },
    async execute(message, args, extra) {
        var api = extra.api;
        var is_new_connection = false;

        if(args.length > 1 && args[1] === "<clear>") {
            counter = 0;
            while(this.audioQueue.length > 0) {
                counter++;
                this.audioQueue.shift();
            }

            await message.channel.send({ content: "Cleared " + counter + " lines from the queue!" });
            this.logger.info("TTS Queue cleared");
            return;
        } else if(args.length > 1 && args[1] === "<shutup>") {
            this.audioPlayer.state = { status: AudioPlayerStatus.Idle };
            await message.channel.send({ content: "Jeez, fine. I'll stop talking." });
            this.logger.info("I shut up now");
            return;
        }

        if(this.voiceConnection === null || this.audioPlayer === null) {
            this.voiceConnection = joinVoiceChannel({
                channelId: message.member.voice.channelId,
                guildId: message.guildId,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            this.voiceConnection = await entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5_000);
            this.audioPlayer = new AudioPlayer();
            is_new_connection = true;
        }

        var approvedWords = [];
        try{
            var respApprovedWords = await api.get("allowed_word", {
                approved: parseInt(1)
            });
            for(var i = 0;i<respApprovedWords.allowed_words.length;i++){
                    approvedWords.push(respApprovedWords.allowed_words[i].word);
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
        if (!this.audioPlayer) {
            this.audioPlayer = new AudioPlayer();
        }
        this.audioPlayer.state = { status: AudioPlayerStatus.Idle };
        if(sayMessage.length>200){
            await message.channel.send({ content: "That message is too long, no more than 200 characters per message!" });
            return;
        }

        const stream = discordTTS.getVoiceStream(sayMessage);
        const audioResource = createAudioResource(stream, {inputType: StreamType.Arbitrary, inlineVolume:true});
        this.audioQueue.push(audioResource);
        this.logger.info("Adding message to TTS Queue");

        if(is_new_connection) {
            if(this.voiceConnection.status === VoiceConnectionStatus.Connected) {
                this.voiceConnection.subscribe(this.audioPlayer);

                this.audioPlayer.on(AudioPlayerStatus.Idle, this.tryPlayNextAudio.bind(this));

                this.audioPlayer.on('error', async error => {
                    await message.channel.send({ content: "Hit an error!" });
                    this.logger.error(error);
                });

                //Starts the playing the first time since we didn't catch the original idle event
                this.tryPlayNextAudio();
            }
        }
    }
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}