module.exports = {
    name: 'voicetime',
    description: 'Prints a leaderboard of everyone\'s time spent in chat',
    syntax: 'voicetime [FUTURE ARGS HERE]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require('discord.js');
        const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');
        this.logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:message.guild.id
            })
        }catch(error){
            this.logger.error(error);
        }

        if(!respVoice.voice_trackings[0]){
            message.channel.send({ content: "There is no data available yet..."}) 
            return;
        }

        this.logger.info("Starting the additive loop");
        var totalTime = [];
        this.logger.info(respVoice.voice_trackings.length);
        this.logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(respVoice.voice_trackings[i].disconnect_time == "None"){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000).toString()
            }
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    this.logger.info("Adding to existing row.")
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                this.logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
        }
        this.logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        const ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard");
        for(var k = 0;k<totalTime.length;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 7, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField(totalTime[k][0], s.toString());
        }
        this.logger.info("Sent Voice Leaderboard!")

        const timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("non-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("channel")
                .setLabel("Top - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("true"),
        );
        const timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("true"),
        );

        message.channel.send({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
    }
}


function compareSecondColumn(a, b) {
    if (a[1] === b[1]) {
        return 0;
    }
    else {
        return (a[1] > b[1]) ? -1 : 1;
    }
}