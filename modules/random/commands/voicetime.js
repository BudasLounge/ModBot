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
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(respVoice.voice_trackings[i].disconnect_time == "None"){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000).toString()
            }
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    this.logger.info("Adding to existing row: " + respVoice.voice_trackings[i].username + ": " + Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time)))
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
        this.logger.info(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        const ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                //change 365 to a higher number if someone hits 365 days of cumulative voice timings
                { d: 365, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            this.logger.info(totalTime[k][0] + " diff: " + diff.toString() + " s: "+ s);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        const timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("non-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("muted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("lonely")
                .setLabel("Alone times only")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("bottom")
                .setLabel("Bottom Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
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
                new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );

        message.channel.send({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        this.logger.info("Sent Voice Leaderboard!")
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