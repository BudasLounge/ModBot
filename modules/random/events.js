var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');

async function onButtonClick(button){
    if (button.isButton()){
        if(button.customId.length>=13) return;
        switch(button.customId){
        case "bottom":
            logger.info("Gathering all voice timings");
            try{
                var respVoice = await api.get("voice_tracking",{
                    discord_server_id:button.guild.id
                })
            }catch(error){
                logger.error(error);
            }

            logger.info("Starting the additive loop");
            var totalTime = [];
            logger.info(respVoice.voice_trackings.length);
            logger.info(totalTime.length);
            for(var i = 0;i<respVoice.voice_trackings.length;i++){
                if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                    respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
                }
                var flag = false;
                for(var j = 0;j<totalTime.length;j++){
                    if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                        //logger\.info\("Adding to existing row\."\)
                        totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                        flag = true;
                        break;
                    }
                }
                if(!flag){
                    logger.info("Creating a new row.")
                    totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
                }
            }
            logger.info("Printing array to a table, will only show up in live console, not logs...")
            console.table(totalTime);
            var output = "";

            totalTime.sort(compareSecondColumnReverse);
            logger.info("Printing array to a table after sorting...")
            console.table(totalTime);
            var output = "";
            var ListEmbed = new MessageEmbed()
            .setColor("#c586b6")
            .setTitle("Voice Channel Leaderboard (Bottom 10)");
            var count = 10;
            if(totalTime.length<count) {count = totalTime.length;}
            for(var k = 0;k<count;k++){
                var diff = Math.floor(totalTime[k][1]), units = [
                    { d: 60, l: "seconds" },
                    { d: 60, l: "minutes" },
                    { d: 24, l: "hours" },
                    { d: 365, l: "days" }
                ];
            
                var s = '';
                for (var i = 0; i < units.length; ++i) {
                s = (diff % units[i].d) + " " + units[i].l + " " + s;
                diff = Math.floor(diff / units[i].d);
                }
                ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
            }
            

            var timingFilters = new MessageActionRow()
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
                    .setCustomId("top")
                    .setLabel("Top Talkers")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
            );
            var timingFilters2 = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("30days")
                    .setLabel("Top - Last 30 Days")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                new MessageButton()
                    .setCustomId("7days")
                    .setLabel("Top - Last 7 Days")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                    new MessageButton()
                    .setCustomId("channel")
                    .setLabel("Top Talkers - By Channel")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                    new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            );

        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
    break;


        case "top":
        logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id
            })
        }catch(error){
            logger.error(error);
        }

        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
            }
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        logger.info("Printing array to a table after sorting...")
            console.table(totalTime);
        var ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 365, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        var timingFilters = new MessageActionRow()
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
                .setCustomId("bottom")
                .setLabel("Bottom Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );

    await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
    logger.info("Sent Voice Leaderboard!")
    break;
   
   
    case "muted":
        logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:true
            })
        }catch(error){
            logger.error(error);
        }
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            button.deferUpdate();
            return;
        }
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
            }
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10 muters)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 365, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        var timingFilters = new MessageActionRow()
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
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;


    case "non-muted":
        logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:false
            })
        }catch(error){
            logger.error(error);
        }
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            return;
        }
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
            }
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10 non-muters)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 365, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        var timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("non-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("muted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;


        case "channel":


            logger.info("Gathering all voice timings");
            /*try{
                var respVoice = await api.get("voice_tracking",{
                    discord_server_id:button.guild.id,
                    selfmute:false
                })
            }catch(error){
                logger.error(error);
            }
            if(!respVoice.voice_trackings[0]){
                button.channel.send({ content: "There is no data available yet..."}) 
                return;
            }
            logger.info("Starting the additive loop");
            var totalTime = [];
            logger.info(respVoice.voice_trackings.length);
            logger.info(totalTime.length);
            for(var i = 0;i<respVoice.voice_trackings.length;i++){
                var channelName = button.guild.channels.cache.get(respVoice.voice_trackings[i].channel_id)
                if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                    respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
                }
                var flag = false;
                for(var j = 0;j<totalTime.length;j++){
                    if(totalTime[j][0] == respVoice.voice_trackings[i].username + ", channel: " + channelName.name){
                        //logger\.info\("Adding to existing row\."\)
                        totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                        flag = true;
                        break;
                    }
                }
                if(!flag){
                    logger.info("Creating a new row.")
                    totalTime.push([respVoice.voice_trackings[i].username + ", channel: " + channelName.name, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
                }
            }
            logger.info("Printing array to a table, will only show up in live console, not logs...")
            console.table(totalTime);
            var output = "";
    
            totalTime.sort(compareSecondColumn);
            var ListEmbed = new MessageEmbed()
            .setColor("#c586b6")
            .setTitle("Voice Channel Leaderboard (Top 10 channel times)");
            var count = 10;
            if(totalTime.length<count) {count = totalTime.length;}
            for(var k = 0;k<count;k++){
                var diff = Math.floor(totalTime[k][1]), units = [
                    { d: 60, l: "seconds" },
                    { d: 60, l: "minutes" },
                    { d: 24, l: "hours" },
                    { d: 365, l: "days" }
                ];
            
                var s = '';
                for (var i = 0; i < units.length; ++i) {
                s = (diff % units[i].d) + " " + units[i].l + " " + s;
                diff = Math.floor(diff / units[i].d);
                }
                ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
            }
            var timingFilters = new MessageActionRow()
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
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")*/
        try {
            const respVoice = await api.get("voice_tracking", {
              discord_server_id: button.guild.id,
              selfmute: false
            });
          
            if (!respVoice.voice_trackings[0]) {
              await button.channel.send({ content: "There is no data available yet..." });
              return;
            }
          
            const totalTime = new Map();
            const currentTime = Math.floor(new Date().getTime() / 1000);
          
            for (const voiceTracking of respVoice.voice_trackings) {
              const channelName = button.guild.channels.cache.get(voiceTracking.channel_id);
              if (!channelName) {
                // Skip if the channel doesn't exist
                continue;
              }
              const disconnectTime = parseInt(voiceTracking.disconnect_time) || currentTime;
          
              const usernameChannel = `${voiceTracking.username}, channel: ${channelName.name}`;
              const connectionTime = Math.floor(disconnectTime - parseInt(voiceTracking.connect_time));
          
              if (totalTime.has(usernameChannel)) {
                totalTime.set(usernameChannel, totalTime.get(usernameChannel) + connectionTime);
              } else {
                totalTime.set(usernameChannel, connectionTime);
              }
            }
          
            console.table([...totalTime]);
          
            const sortedTotalTime = [...totalTime].sort((a, b) => b[1] - a[1]);
          
            const ListEmbed = new MessageEmbed()
              .setColor("#c586b6")
              .setTitle("Voice Channel Leaderboard (Top 10 channel times)");
          
            const count = Math.min(10, sortedTotalTime.length);
          
            for (let i = 0; i < count; i++) {
              const [usernameChannel, time] = sortedTotalTime[i];
              let diff = time;
              const units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 365, l: "days" }
              ];
          
              let s = "";
              for (let i = 0; i < units.length; ++i) {
                s = `${diff % units[i].d} ${units[i].l} ${s}`;
                diff = Math.floor(diff / units[i].d);
              }
          
              ListEmbed.addField(`${i + 1}. ${usernameChannel}`, s);
            }
          
            const timingFilters = new MessageActionRow().addComponents(
              new MessageButton()
                .setCustomId("non-muted")
                .setLabel("Non-muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("muted")
                .setLabel("Muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle("PRIMARY")
                .setDisabled(false)
            );
          
            const timingFilters2 = new MessageActionRow().addComponents(
              new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle("PRIMARY")
                .setDisabled(false)
            );
          
            await button.update({ components: [timingFilters, timingFilters2], embeds: [ListEmbed] });
            console.info("Sent Voice Leaderboard!");
          } catch (error) {
            console.error(error);
          }
        break;
       
       
        case "channelUse":
            logger.info("Gathering all voice timings");
        /*try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:false
            })
        }catch(error){
            logger.error(error);
        }
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            return;
        }
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            var channelNameUse = button.guild.channels.cache.get(respVoice.voice_trackings[i].channel_id)
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
            }
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == channelNameUse.name){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                logger.info("Channel name: " + channelNameUse.name)
                totalTime.push([channelNameUse.name, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10 Channels by use)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
            ];

            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        var timingFilters = new MessageActionRow()
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
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("true"),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")*/
        try {
            const respVoice = await api.get("voice_tracking", {
              discord_server_id: button.guild.id,
              selfmute: false
            });
          
            if (!respVoice.voice_trackings[0]) {
              await button.channel.send({ content: "There is no data available yet..." });
              return;
            }
          
            const totalTime = new Map();
            const currentTime = Math.floor(new Date().getTime() / 1000);
          
            for (const voiceTracking of respVoice.voice_trackings) {
              let channelNameUse = button.guild.channels.cache.get(voiceTracking.channel_id);
          
              if (!channelNameUse) {
                // Skip if the channel doesn't exist
                continue;
              }
          
              const disconnectTime = parseInt(voiceTracking.disconnect_time) || currentTime;
              const connectionTime = Math.floor(disconnectTime - parseInt(voiceTracking.connect_time));
          
              const channelName = channelNameUse.name;
              if (totalTime.has(channelName)) {
                totalTime.set(channelName, totalTime.get(channelName) + connectionTime);
              } else {
                totalTime.set(channelName, connectionTime);
              }
            }
          
            console.table([...totalTime]);
          
            const sortedTotalTime = [...totalTime].sort((a, b) => b[1] - a[1]);
          
            const ListEmbed = new MessageEmbed()
              .setColor("#c586b6")
              .setTitle("Voice Channel Leaderboard (Top 10 Channels by use)");
          
            const count = Math.min(10, sortedTotalTime.length);
          
            for (let i = 0; i < count; i++) {
              const [channelName, time] = sortedTotalTime[i];
              let diff = time;
              const units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
              ];
          
              let s = "";
              for (let i = 0; i < units.length; ++i) {
                s = `${diff % units[i].d} ${units[i].l} ${s}`;
                diff = Math.floor(diff / units[i].d);
              }
          
              ListEmbed.addField(`${i + 1}. ${channelName}`, s);
            }
          
            const timingFilters = new MessageActionRow().addComponents(
              new MessageButton()
                .setCustomId("non-muted")
                .setLabel("Non-muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("muted")
                .setLabel("Muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle("PRIMARY")
                .setDisabled(false)
            );
          
            const timingFilters2 = new MessageActionRow().addComponents(
              new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("7days")
                .setLabel("Top - Last 7 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle("PRIMARY")
                .setDisabled(true)
            );
          
            await button.update({ components: [timingFilters, timingFilters2], embeds: [ListEmbed] });
            console.info("Sent Voice Leaderboard!");
          } catch (error) {
            console.error(error);
          }
        break;
        
        
        case "30days":
            logger.info("Gathering all voice timings");
            var today = Math.floor(new Date().getTime() / 1000);
            var startDate = (today - (30*24*60*60));
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                _filter: "disconnect_time > " + startDate
            })
        }catch(error){
            logger.error(error);
        }
        logger.info(respVoice)
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            return;
        }
        
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
            }
            if(parseInt(respVoice.voice_trackings[i].connect_time)<parseInt(startDate))respVoice.voice_trackings[i].connect_time=startDate;
            var flag = false;
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top talkers - Last 30 days)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        var timingFilters = new MessageActionRow()
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
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
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
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;


        case "7days":
            logger.info("Gathering all voice timings");
            var today = Math.floor(new Date().getTime() / 1000);
            var startDate = (today - (7*24*60*60));
            logger.info("Start Date: " + startDate);
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                _filter: "disconnect_time > " + startDate
            });
        }catch(error){
            logger.error(error);
        }
        logger.info(respVoice)
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            return;
        }
        
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
            }
            if(parseInt(respVoice.voice_trackings[i].connect_time)<startDate)respVoice.voice_trackings[i].connect_time=startDate;
            var flag = false;
            logger.info("Connect Time: " + parseInt(respVoice.voice_trackings[i].connect_time) + ", Disconnect Time: " + parseInt(respVoice.voice_trackings[i].disconnect_time));
            for(var j = 0;j<totalTime.length;j++){
                if(totalTime[j][0] == respVoice.voice_trackings[i].username){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].username, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
            }
            logger.info("Added to user '" + respVoice.voice_trackings[i].username + "' time: " + Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time)))
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new MessageEmbed()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top talkers - Last 7 days)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addField((k+1).toString() + ". " + totalTime[k][0], s.toString());
        }
        

        var timingFilters = new MessageActionRow()
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
                .setCustomId("top")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
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
                new MessageButton()
                .setCustomId("channelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;
}
        //button.channel.send({content: "Coming from Random!"});
        //button.deferUpdate()
    }
}

async function userJoinsVoice(oldMember, newMember){
    let newUserChannel = newMember.channelId;
    let oldUserChannel = oldMember.channelId;
    logger.info("newMember: " + newMember);
    logger.info("oldMember: " + oldMember);
    let user = newMember.guild.members.cache.get(newMember.id);
    if(newUserChannel === newMember.guild.afkChannelId){
        newUserChannel = undefined
    }
    if(newUserChannel != undefined){
        var respVoice;
        try{
            respVoice = await api.get("voice_tracking", {
                user_id:newMember.id,
                username:user.user.username,
                discord_server_id:newMember.guild.id,
                disconnect_time:0
            })
        }catch(error){
            logger.error(error);
        }
        if(respVoice.voice_trackings[0]){
            logger.info("Updating an existing tracking");
            try{
                var respVoiceUpdate = await api.put("voice_tracking",{
                    voice_state_id:parseInt(respVoice.voice_trackings[0].voice_state_id),
                    disconnect_time:Math.floor(new Date().getTime() / 1000)
                })
            }catch(error){
                logger.error(error);
            }
            logger.info("Creating a new tracking");
            try{
                var respVoiceNew = await api.post("voice_tracking",{
                    user_id:newMember.id,
                    username:user.user.username,
                    discord_server_id:newMember.guild.id,
                    connect_time:Math.floor(new Date().getTime() / 1000),
                    selfmute:newMember.selfMute,
                    channel_id:newUserChannel,
                    disconnect_time:0
                })
            }catch(error){
                logger.error(error);
            }
        }else{
            logger.info("Creating a brand new tracking");
            try{
                var respVoiceNew = await api.post("voice_tracking",{
                    user_id:newMember.id,
                    username:user.user.username,
                    discord_server_id:newMember.guild.id,
                    connect_time:Math.floor(new Date().getTime() / 1000),
                    selfmute:newMember.selfMute,
                    channel_id:newUserChannel,
                    disconnect_time:0
                })
            }catch(error){
                logger.error(error);
            }
        }
        logger.info(user.user.username + " joined a channel with an ID of: " + newUserChannel);
    }else{
        var respVoice;
        try{
            respVoice = await api.get("voice_tracking", {
                user_id:newMember.id,
                username:user.user.username,
                disconnect_time:0
            })
        }catch(error){
            logger.error(error);
        }
        if(respVoice.voice_trackings[0]){
            try{
                var respVoiceUpdate = await api.put("voice_tracking",{
                    voice_state_id:parseInt(respVoice.voice_trackings[0].voice_state_id),
                    disconnect_time:Math.floor(new Date().getTime() / 1000)
                })
            }catch(error){
                logger.error(error);
            }
        }
        logger.info(user.user.username + " left a channel with an ID of: " + oldUserChannel);
    }
}

/*async function parseRaw(packet) {
    // We don't want this to run on unrelated packets
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;
    console.log(packet);
    // Grab the channel to check the message from
    const channel = client.channels.get(packet.d.channel_id);
    // There's no need to emit if the message is cached, because the event will fire anyway for that
    if (channel.messages.has(packet.d.message_id)) return;
    // Since we have confirmed the message is not cached, let's fetch it
    channel.fetchMessage(packet.d.message_id).then(message => {
        // Emojis can have identifiers of name:id format, so we have to account for that case as well
        const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
        // This gives us the reaction we need to emit the event properly, in top of the message object
        const reaction = button.reactions.get(emoji);
        // Adds the currently reacting user to the reaction's users collection.
        if (reaction) reaction.users.set(packet.d.user_id, client.users.get(packet.d.user_id));
        // Check which type of event it is before emitting
        if (packet.t === 'MESSAGE_REACTION_ADD') {
            client.emit('messageReactionAdd', reaction, client.users.get(packet.d.user_id));
        }
        /*if (packet.t === 'MESSAGE_REACTION_REMOVE') {
            client.emit('messageReactionRemove', reaction, client.users.get(packet.d.user_id));
        }*/
 //   });
//}

function register_handlers(event_registry) {
    logger = event_registry.logger;
    event_registry.register('voiceStateUpdate', userJoinsVoice);
    event_registry.register('interactionCreate', onButtonClick);
}

module.exports = register_handlers;
function compareSecondColumnReverse(a, b) {
    if (a[1] === b[1]) {
        return 0;
    }
    else {
        return (a[1] < b[1]) ? -1 : 1;
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