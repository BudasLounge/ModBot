var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu} = require('discord.js');
//todo: add a way to track how many times a user streams and for how long
async function onButtonClick(button){
    //if (!button.isButton()){return}
        if((button.customId.substr(0,5)==="VOICE")){
        button.customId = button.customId.substr(5)
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
                    if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                        //logger\.info\("Adding to existing row\."\)
                        totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                        flag = true;
                        break;
                    }
                }
                if(!flag){
                    logger.info("Creating a new row.")
                    totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
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
            await button.deferUpdate();
            for(var k = 0;k<count;k++){
                try{
                    const userId = totalTime[k][0];
                    const user = await button.guild.members.fetch(userId);
                    var mention = user.displayName;
                }catch(error){
                    logger.error(error.message);
                }
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
                ListEmbed.addField((k+1).toString() + ". " + mention, s.toString());
            }
            

            var timingFilters = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("VOICEnon-muted")
                    .setLabel("Non-muted times only")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                new MessageButton()
                    .setCustomId("VOICEmuted")
                    .setLabel("Muted times only")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                new MessageButton()
                    .setCustomId("VOICEtop")
                    .setLabel("Top Talkers")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
            );
            var timingFilters2 = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId("VOICE30days")
                    .setLabel("Top - Last 30 Days")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                new MessageButton()
                    .setCustomId("VOICE7days")
                    .setLabel("Top - Last 7 Days")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                    new MessageButton()
                    .setCustomId("VOICEchannel")
                    .setLabel("Top Talkers - By Channel")
                    .setStyle('PRIMARY')
                    .setDisabled("false"),
                    new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            );

        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
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
                if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
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
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
            logger.info(mention);
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
            ListEmbed.addField((k+1).toString() + ". " + mention, s.toString());
        }
        

        var timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEbottom")
                .setLabel("Bottom Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
    await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
    logger.info("Sent Voice Leaderboard!")
    break;
        case "muted":
            button.deferUpdate();
        logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:"true"
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
                if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                    logger.info("Adding to existing row.")
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
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
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
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
            ListEmbed.addField((k+1).toString() + ". " + mention, s.toString());
        }
        

        var timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
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
                if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
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
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
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
            ListEmbed.addField((k+1).toString() + ". " + mention, s.toString());
        }
        

        var timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
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
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEchannelUse")
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
            await button.deferUpdate();
            for (const voiceTracking of respVoice.voice_trackings) {
              const channelName = button.guild.channels.cache.get(voiceTracking.channel_id);
              if (!channelName) {
                // Skip if the channel doesn't exist
                continue;
              }
              const disconnectTime = parseInt(voiceTracking.disconnect_time) || currentTime;
              //if (!button.guild.members.cache.has(voiceTracking.user_id)) {
              //  logger.error("User not found in the guild. ID: " + voiceTracking.user_id + " Username: " + voiceTracking.username);
              //  continue;
              //}
              let user;
              try{
                //logger.info("Fetching user  " + voiceTracking.user_id + " with username " + voiceTracking.username)
                user = await button.guild.members.fetch(voiceTracking.user_id)
              }catch(error){
                logger.error(error.message +  " ID: " + voiceTracking.user_id+ " Username: " + voiceTracking.username);
                continue;
              }
              const usernameChannel = `${user.displayName}, channel: ${channelName.name}`;
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
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle("PRIMARY")
                .setDisabled(false)
            );
          
            const timingFilters2 = new MessageActionRow().addComponents(
              new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle("PRIMARY")
                .setDisabled(false)
            );
          
            await button.editReply({ components: [timingFilters, timingFilters2], embeds: [ListEmbed] });
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
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannelUse")
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
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle("PRIMARY")
                .setDisabled(false)
            );
          
            const timingFilters2 = new MessageActionRow().addComponents(
              new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle("PRIMARY")
                .setDisabled(false),
              new MessageButton()
                .setCustomId("VOICEchannelUse")
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
                if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
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
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
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
            ListEmbed.addField((k+1).toString() + ". " + mention, s.toString());
        }
        

        var timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("true"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
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
                if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                    //logger\.info\("Adding to existing row\."\)
                    totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                    flag = true;
                    break;
                }
            }
            if(!flag){
                logger.info("Creating a new row.")
                totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
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
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
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
            ListEmbed.addField((k+1).toString() + ". " + mention, s.toString());
        }
        

        var timingFilters = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        var timingFilters2 = new MessageActionRow()
        .addComponents(
            new MessageButton()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle('PRIMARY')
                .setDisabled("false"),
            new MessageButton()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle('PRIMARY')
                .setDisabled("true"),
                new MessageButton()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle('PRIMARY')
                .setDisabled("false"),
                new MessageButton()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle('PRIMARY')
                .setDisabled("false"),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;
    }
        }else if((button.customId.substr(0,4)==="GAME")){
            button.customId = button.customId.substr(4);
            var operation = button.customId.substr(0,button.customId.indexOf('-'));
            var hostId = button.customId.substr(button.customId.indexOf('-')+1);
            //button.channel.send("Operation: " + operation + ", Host ID: " + hostId);
            switch(operation){
                case "join":
                    const voiceChannel = button.member.voice.channel;
                    if (!voiceChannel) {
                        button.reply({ content: "You need to be in a voice channel to join a game.", ephemeral: true})
                        return;
                    }
                    logger.info("Adding " + button.member.displayName + " to " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(!respGame.game_joining_masters[0].status === "open"){
                        button.reply({ content: "That game is not currently open...", ephemeral: true}) 
                        return;
                    }
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.member.id
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(respGamePlayer.game_joining_players[0]){
                        button.reply({ content: "You are already in this game...", ephemeral: true})
                        return;
                    }
                    var respGameJoin;
                    try{
                        respGameJoin = await api.post("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.member.id
                        })
                    }catch(error){
                        logger.error(error.message);
                        button.reply({ content: "There was an error adding you to the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    var kickableList = new MessageSelectMenu()
                        .setCustomId('GAMEkick-'+hostId)
                        .setPlaceholder('Select someone to remove');
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        kickableList.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Kick from the game",
                            emoji: '👢',
                        })
                    }
                            
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addField("Info about the buttons:", "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact");
                        ListEmbed.addField("Current Players:", playersList);
                        var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEjoin-'+hostId)
                                .setLabel('Join')
                                .setStyle('PRIMARY'),
                            new MessageButton()
                                .setCustomId('GAMEleave-'+hostId)
                                .setLabel('Leave')
                                .setStyle('PRIMARY'),
                        );
                        var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Start')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                        );
                        var row3 = new MessageActionRow()
                            .addComponents(kickableList);

                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "leave":
                    logger.info("Removing " + button.member.displayName + " from " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.member.id
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGamePlayer.game_joining_players[0]){
                        button.reply({ content: "You are not currently in this game...", ephemeral: true})
                        return;
                    }
                    var respGameLeave;
                    try{
                        respGameLeave = await api.delete("game_joining_player", {
                            game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id)
                        })
                    }catch(error){
                        logger.error(error);
                        button.reply({ content: "There was an error removing you from the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }
                    if(playersList === ""){
                        playersList = "No players currently in the game...";
                    }
                    var kickableList = new MessageSelectMenu()
                    .setCustomId('GAMEkick-'+hostId)
                    .setPlaceholder('Select someone to remove');
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        kickableList.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Kick from the game",
                            emoji: '👢',
                        })
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addField("Info about the buttons:", "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact");
                        ListEmbed.addField("Current Players:", playersList);
                        var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEjoin-'+hostId)
                                .setLabel('Join')
                                .setStyle('PRIMARY'),
                            new MessageButton()
                                .setCustomId('GAMEleave-'+hostId)
                                .setLabel('Leave')
                                .setStyle('PRIMARY'),
                        );
                        var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Start')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                        );
                        var row3 = new MessageActionRow()
                            .addComponents(kickableList);
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "start":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can start the game...", ephemeral: true})
                        return;
                    }
                    logger.info("Starting " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(!respGame.game_joining_masters[0].status === "open"){
                        button.reply({ content: "This game has already started...", ephemeral: true}) 
                        return;
                    }
                    var respGameStart;
                    try{
                        respGameStart = await api.put("game_joining_master", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            status:"started"
                        })
                    }catch(error){
                        logger.error(error);
                        button.reply({ content: "There was an error starting the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(respPlayersList.game_joining_players.length<2){
                        button.reply({ content: "You need at least 2 players to start the game...", ephemeral: true})
                        return;
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }
                    //button.reply({ content: `The game has been started, new people cannot join!`, ephemeral: true})
                    
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addField("Game is starting...", "Only the host can interact with the menu now");
                    ListEmbed.addField("Current Players:", playersList);
                    var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEgamemodes-'+hostId)
                                .setLabel('See gamemodes')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle('SECONDARY'),
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End game')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle('SECONDARY'),
                        );
                    
                    button.update({ embeds: [ListEmbed], components: [row, row2] })
                    break;
                case "gamemodes":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can start the game...", ephemeral: true})
                        return;
                    }
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addField("Host is choosing gamemode...", "Only the host can interact with the menu now");
                    ListEmbed.addField("Current Players:", playersList);
                    var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMErandomize-'+hostId)
                                .setLabel('Random Teams')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEcaptains-'+hostId)
                                .setLabel('Captains pick')
                                .setStyle('SECONDARY'),
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End game')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Go back')
                                .setStyle('SECONDARY'),
                        );
                    
                    button.update({ embeds: [ListEmbed], components: [row, row2] })
                    break;
                case "end":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can end the game...", ephemeral: true})
                        return;
                    }
                    logger.info("Ending " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }   
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(respGame.game_joining_masters[0].status === "open" || respGame.game_joining_masters[0].status === "started"){
                        var respPlayersList;
                        try{
                            respPlayersList = await api.get("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                        }
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            var respTemp = await api.get("game_joining_player",{
                                game_id:Number(respGame.game_joining_masters[0].game_id),
                                player_id:respPlayersList.game_joining_players[i].player_id
                            })
                            respPlayers = await api.delete("game_joining_player",{
                                game_player_id:Number(respTemp.game_joining_players[0].game_player_id)
                            });
                        }
                        var respGameEnd;
                        try{
                            respGameEnd = await api.delete("game_joining_master", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                            button.reply({ content: "There was an error ending the game...", ephemeral: true})
                        }
                        var guild = button.guild;
                        var host = await guild.members.fetch(hostId);
                        var ListEmbed = new MessageEmbed()
                            .setColor("#c586b6")
                            .setTitle(`${host.displayName}'s game has ended.`);
                        button.update({ embeds: [ListEmbed], components: []})
                        button.channel.send({ content: `The game has been ended and everyone was removed from the party!`})
                    }
                    break;
                case "reopen":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can re-open the game...", ephemeral: true})
                        return;
                    }
                    logger.info("Re-opening " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(respGame.game_joining_masters[0].status === "started"){
                        var respGameStart;
                        try{
                            respGameStart = await api.put("game_joining_master", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                status:"open"
                            })
                        }catch(error){
                            logger.error(error);
                            button.reply({ content: "There was an error re-opening the game...", ephemeral: true})
                        }
                        var respPlayersList;
                        try{
                            respPlayersList = await api.get("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                        }
                        const kickableList = new MessageSelectMenu()
                            .setCustomId('GAMEkick-'+hostId)
                            .setPlaceholder('Select someone to remove');
                        var playersList = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                            var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                            kickableList.addOptions({
                                label: player.displayName,
                                value: respPlayersList.game_joining_players[i].player_id,
                                description: "Kick from the game",
                                emoji: '👢',
                            })
                        }
                        var playersList = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        }
                        button.channel.send({ content: `The game has been re-opened, new people can join!`})
                        var guild = button.guild;
                        var host = await guild.members.fetch(hostId);
                        var ListEmbed = new MessageEmbed()
                            .setColor("#c586b6")
                            .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addField("Info about the buttons:", "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact");
                        ListEmbed.addField("Current Players:", playersList);
                        var row = new MessageActionRow()
                            .addComponents(
                                new MessageButton()
                                    .setCustomId('GAMEjoin-'+hostId)
                                    .setLabel('Join')
                                    .setStyle('PRIMARY'),
                                new MessageButton()
                                    .setCustomId('GAMEleave-'+hostId)
                                    .setLabel('Leave')
                                    .setStyle('PRIMARY'),
                            );
                        var row2 = new MessageActionRow()
                            .addComponents(
                                new MessageButton()
                                    .setCustomId('GAMEstart-'+hostId)
                                    .setLabel('Start')
                                    .setStyle('SECONDARY'),
                                new MessageButton()
                                    .setCustomId('GAMEend-'+hostId)
                                    .setLabel('End')
                                    .setStyle('SECONDARY'),
                            );
                        var row3 = new MessageActionRow()
                            .addComponents(kickableList);
                        button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    }
                    break;
                case "randomize":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the gamemode...", ephemeral: true})
                        return;
                    }
                    logger.info("Randomizing " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(respGame.game_joining_masters[0].status === "started"){
                        var respPlayersList;
                        try{
                            respPlayersList = await api.get("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                        }
                        if(respPlayersList.game_joining_players.length<2){
                            button.channel.send({ content: "There are not enough players to randomize teams..."})
                            return;
                        }
                        var playersList = [];
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            playersList.push("<@" + respPlayersList.game_joining_players[i].player_id + ">");
                        }
                        var team2 = [];
                        
                        logger.info("PlayerList: " + playersList)
                        var maxTeamSize = Math.floor(playersList.length/2);
                        for(var i = 0;i<maxTeamSize;i++){
                            var random = Math.floor(Math.random() * playersList.length);
                            team2.push(playersList[random]);
                            playersList.splice(random,1);
                        }
                        logger.info("Team 1: " + playersList);
                        logger.info("Team 2: " + team2);
                        const voiceChannels = button.guild.channels.cache.filter((channel) => channel.type === 'GUILD_VOICE');
                        const channelListTeam1 = new MessageSelectMenu()
                            .setCustomId('GAMEchannelTeam1-'+hostId)
                            .setPlaceholder('Select a voice channel to send Team 1 to');
                        voiceChannels.forEach((channel) => {
                            channelListTeam1.addOptions([
                                {
                                label: channel.name,
                                value: channel.id,
                                },
                            ]);
                        });
                        const channelListTeam2 = new MessageSelectMenu()
                            .setCustomId('GAMEchannelTeam2-'+hostId)
                            .setPlaceholder('Select a voice channel to send Team 2 to');
                        voiceChannels.forEach((channel) => {
                            channelListTeam2.addOptions([
                                {
                                label: channel.name,
                                value: channel.id,
                                },
                            ]);
                        });
                        for(var i = 0;i<playersList.length;i++){
                            var respGamePlayer;
                            try{
                                respGamePlayer = await api.get("game_joining_player", {
                                    game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                    player_id:playersList[i].substr(2,playersList[i].length-3)
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                            var respGamePlayerUpdate;
                            try{
                                respGamePlayerUpdate = await api.put("game_joining_player", {
                                    game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id),
                                    team:"1"
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                        }
                        for(var i = 0;i<team2.length;i++){
                            var respGamePlayer;
                            try{
                                respGamePlayer = await api.get("game_joining_player", {
                                    game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                    player_id:team2[i].substr(2,team2[i].length-3)
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                            var respGamePlayerUpdate;
                            try{
                                respGamePlayerUpdate = await api.put("game_joining_player", {
                                    game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id),
                                    team:"2"
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                        }
                        var guild = button.guild;
                        var host = await guild.members.fetch(hostId);
                        var ListEmbed = new MessageEmbed()
                            .setColor("#c586b6")
                            .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addField("Game is randomized!", "Only the host can interact with the menu now");
                        ListEmbed.addField("Team 1:", playersList.join("\n"));
                        ListEmbed.addField("Team 2:", team2.join("\n"));
                        var row = new MessageActionRow()
                            .addComponents(
                                new MessageButton()
                                    .setCustomId('GAMErandomize-'+hostId)
                                    .setLabel('Randomize Teams')
                                    .setStyle('SECONDARY'),
                                new MessageButton()
                                    .setCustomId('GAMEreturn-'+hostId)
                                    .setLabel('Return players to starting channel')
                                    .setStyle('SECONDARY'),
                            );
                        var row2 = new MessageActionRow()
                            .addComponents(
                                new MessageButton()
                                    .setCustomId('GAMEend-'+hostId)
                                    .setLabel('End')
                                    .setStyle('SECONDARY'),
                                new MessageButton()
                                    .setCustomId('GAMEreopen-'+hostId)
                                    .setLabel('Re-open game')
                                    .setStyle('SECONDARY'),
                            );
                        var row3 = new MessageActionRow()
                            .addComponents(channelListTeam1);
                        var row4 = new MessageActionRow()
                            .addComponents(channelListTeam2);
                        button.update({ embeds: [ListEmbed], components: [row, row2, row3, row4] })
                    }
                    break;
                case "captains":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the game mode...", ephemeral: true})
                        return;
                    }
                    logger.info(hostId + " chose captain pick");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!respGame.game_joining_masters[0].status === "started"){
                        button.reply({ content: "The game has not started yet...this is definitely an error. Report it to the creator.", ephemeral: true})
                        return;
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(respPlayersList.game_joining_players.length<2){
                        button.channel.send({ content: "There are not enough players to do a captain pick..."})
                        return;
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var chooseCaptain1 = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain1-'+hostId)
                        .setPlaceholder('Select a player to make into the captain for Team 1');
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        chooseCaptain1.addOptions([
                            {
                                label: player.displayName,
                                value: respPlayersList.game_joining_players[i].player_id,
                                description: "Make Team 1 captain",
                            },
                        ]);
                    };
                    
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addField("Choosing Captains!", "Only the host can interact with the menu now");
                    ListEmbed.addField("Current Players:", playersList);
                    var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle('SECONDARY'),
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle('SECONDARY'),
                        );
                    var row3 = new MessageActionRow()
                        .addComponents(chooseCaptain1);
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "captain1":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the captain...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting captain 1");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        button.reply({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    const captain1 = button.values[0];
                    logger.info("captain1: " + captain1);
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    var newCaptain1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(respPlayersList.game_joining_players[i].player_id === captain1){
                            newCaptain1 = respPlayersList.game_joining_players[i].game_player_id;
                            break;
                        }
                    }
                    logger.info("captain1 " + captain1)
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.put("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:captain1,
                            captain:"yes",
                            game_player_id:parseInt(newCaptain1),
                            team:"1"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    logger.info("respGamePlayer: " + respGamePlayer);
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var chooseCaptain2 = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain2-'+hostId)
                        .setPlaceholder('Select a player to make into the captain for Team 2');
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(respPlayersList.game_joining_players[i].player_id === captain1){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        chooseCaptain2.addOptions([
                            {
                                label: player.displayName,
                                value: respPlayersList.game_joining_players[i].player_id,
                                description: "Make Team 2 captain",
                            },
                        ]);
                    };
                    
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addField("Choosing Captains!", "Only the host can interact with the menu now");
                    ListEmbed.addField("Current Players:", playersList);
                    var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle('SECONDARY'),
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle('SECONDARY'),
                        );
                    var row3 = new MessageActionRow()
                        .addComponents(chooseCaptain2);
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "captain2":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the captain...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting captain 2");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        button.reply({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    const captain2 = button.values[0];
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    var newCaptain2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(respPlayersList.game_joining_players[i].player_id === captain2){
                            newCaptain2 = respPlayersList.game_joining_players[i].game_player_id;
                            respPlayersList.game_joining_players[i].team = "2";
                            break;
                        }
                    }
                    logger.info("captain2 " + captain2)
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.put("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:captain2,
                            captain:"yes",
                            game_player_id:parseInt(newCaptain2),
                            team:"2"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }

                    var captain1pick = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain1pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 1');
                        captain1pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain1pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 1",
                            emoji: '1️⃣',
                        })
                    }
                    var captain2pick = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain2pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 2');
                        captain2pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain2pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 2",
                            emoji: '2️⃣',
                        })
                    }

                    var playersListNoTeam = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none"){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListNoTeam += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "1"){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListTeam1 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "2"){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListTeam2 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addField("Captains are choosing!", "Choose a player from the corresponding drop down to add them to your team!\nGrey buttons are for the host");
                        ListEmbed.addField("No team:", playersListNoTeam);
                        ListEmbed.addField("Team 1:", playersListTeam1);
                        ListEmbed.addField("Team 2:", playersListTeam2);
                    var row = new MessageActionRow()
                        .addComponents(
                            captain1pick
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            captain2pick
                        );
                    var row3 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle('SECONDARY'),
                        );
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })

                    break;
                case "captain1pick":                    
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    var respCaptain1;
                    try{
                        respCaptain1 = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            team:"1",
                            captain:"yes"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respCaptain1.game_joining_players[0]){
                        button.reply({ content: "Found no captain for team 1. Something broke..."})
                        return;
                    }

                    if(button.member.id !=respCaptain1.game_joining_players[0].player_id){
                        button.reply({ content: "Only the captain for team 1 can choose the player...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting captain 1 pick");

                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    const player1 = button.values[0];
                    if(player1 === "none"){
                        button.reply({ content: "You must select a player...", ephemeral: true})
                        return;
                    }else{
                        var captain1player = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            if(respPlayersList.game_joining_players[i].player_id === player1){
                                captain1player = respPlayersList.game_joining_players[i].game_player_id;
                                respPlayersList.game_joining_players[i].team = "1";
                                break;
                            }
                        }
                        var respCaptain1pick;
                        try{
                            respCaptain1pick = await api.put("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                game_player_id:parseInt(captain1player),
                                team:"1"
                            })
                        }catch(error){
                            logger.error(error.message);
                        }
                    }
                    var captain1pick = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain1pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 1');
                        captain1pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none" || !respPlayersList.game_joining_players[i].team === "2"){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain1pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 1",
                            emoji: '1️⃣',
                        })
                    }
                    var captain2pick = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain2pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 2');
                        captain2pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none" || !respPlayersList.game_joining_players[i].team === "1"){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain2pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 2",
                            emoji: '2️⃣',
                        })
                    }

                    var playersListNoTeam = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none"){
                            continue;
                        }
                        playersListNoTeam += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "1"){
                            continue;
                        }
                        playersListTeam1 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "2"){
                            continue;
                        }
                        playersListTeam2 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addField("Captains are choosing!", "Choose a player from the corresponding drop down to add them to your team!\nGrey buttons are for the host");
                    ListEmbed.addField("No team:", playersListNoTeam);
                    ListEmbed.addField("Team 1:", playersListTeam1);
                    ListEmbed.addField("Team 2:", playersListTeam2);
                    var row = new MessageActionRow()
                        .addComponents(
                            captain1pick
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            captain2pick
                        );
                    var row3 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle('SECONDARY'),
                        );
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "captain2pick":
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    var respCaptain2;
                    try{
                        respCaptain1 = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            team:"2",
                            captain:"yes"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respCaptain2.game_joining_players[0]){
                        button.reply({ content: "Found no captain for team 1. Something broke..."})
                        return;
                    }

                    if(button.member.id !=respCaptain2.game_joining_players[0].player_id){
                        button.reply({ content: "Only the captain for team 2 can choose the player...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting captain 2 pick");

                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    const player2 = button.values[0];
                    if(player2 === "none"){
                        button.reply({ content: "You must select a player...", ephemeral: true})
                        return;
                    }else{
                        var captain2player = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            if(respPlayersList.game_joining_players[i].player_id === player1){
                                captain2player = respPlayersList.game_joining_players[i].game_player_id;
                                respPlayersList.game_joining_players[i].team = "2";
                                break;
                            }
                        }
                        var respCaptain1pick;
                        try{
                            respCaptain1pick = await api.put("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                game_player_id:parseInt(captain1player),
                                team:"2"
                            })
                        }catch(error){
                            logger.error(error.message);
                        }
                    }
                    var captain1pick = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain1pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 1');
                        captain1pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none" || !respPlayersList.game_joining_players[i].team === "2"){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain1pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 1",
                            emoji: '1️⃣',
                        })
                    }
                    var captain2pick = new MessageSelectMenu()
                        .setCustomId('GAMEcaptain2pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 2');
                        captain2pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none" || !respPlayersList.game_joining_players[i].team === "1"){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain2pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 2",
                            emoji: '2️⃣',
                        })
                    }

                    var playersListNoTeam = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "none"){
                            continue;
                        }
                        playersListNoTeam += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "1"){
                            continue;
                        }
                        playersListTeam1 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!respPlayersList.game_joining_players[i].team === "2"){
                            continue;
                        }
                        playersListTeam2 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addField("Captains are choosing!", "Choose a player from the corresponding drop down to add them to your team!\nGrey buttons are for the host");
                    ListEmbed.addField("No team:", playersListNoTeam);
                    ListEmbed.addField("Team 1:", playersListTeam1);
                    ListEmbed.addField("Team 2:", playersListTeam2);
                    var row = new MessageActionRow()
                        .addComponents(
                            captain1pick
                        );
                    var row2 = new MessageActionRow()
                        .addComponents(
                            captain2pick
                        );
                    var row3 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle('SECONDARY'),
                        );
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                    break;
                case "channelTeam1":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can select the channel...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting channel for team 1");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                        logger.info("respGame: " + respGame);
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        button.reply({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            team:"1"
                        })
                        logger.info("respPlayersList: " + respPlayersList);
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players on team 1...", ephemeral: true})
                        return;
                    }
                    for(var i =0;i<respPlayersList.game_joining_players.length;i++){
                        var user = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        logger.info("user: " + user);
                        user.voice.setChannel(button.values[0]);
                    }
                    button.reply({ content: "Moved team 1 to the channel!", ephemeral: true})
                    break;
                case "channelTeam2":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can select the channel...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting channel for team 2");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                        logger.info("respGame: " + respGame);
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        button.reply({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            team:"2"
                        })
                        logger.info("respPlayersList: " + respPlayersList);
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players on team 2...", ephemeral: true})
                        return;
                    }
                    for(var i =0;i<respPlayersList.game_joining_players.length;i++){
                        var user = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        logger.info("user: " + user);
                        user.voice.setChannel(button.values[0]);
                    }
                    button.reply({ content: "Moved team 2 to the channel!", ephemeral: true})
                    break;
                case "return":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can return players...", ephemeral: true})
                        return;
                    }
                    logger.info("Returning players to starting channel");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                        logger.info("respGame: " + respGame);
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        button.reply({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        button.reply({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    for(var i =0;i<respPlayersList.game_joining_players.length;i++){
                        var user = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        user.voice.setChannel(respGame.game_joining_masters[0].starting_channel_id);
                    }
                    button.reply({ content: "Moved all players to their starting channel!", ephemeral: true})
                    break;
                case "kick":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can kick players...", ephemeral: true})
                        return;
                    }
                    if(button.values[0] === hostId){
                        button.reply({ content: "You cannot kick yourself from your own game...", ephemeral: true})
                        return;
                    }
                    logger.info("Kicking " + button.values[0] + " from " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.values[0]
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGamePlayer.game_joining_players[0]){
                        button.reply({ content: "You are not currently in this game...", ephemeral: true})
                        return;
                    }
                    var respGameLeave;
                    try{
                        respGameLeave = await api.delete("game_joining_player", {
                            game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id)
                        })
                    }catch(error){
                        logger.error(error);
                        button.reply({ content: "There was an error removing you from the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }
                    if(playersList === ""){
                        playersList = "No players currently in the game...";
                    }
                    var kickableList = new MessageSelectMenu()
                    .setCustomId('GAMEkick-'+hostId)
                    .setPlaceholder('Select someone to remove');
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        kickableList.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Kick from the game",
                            emoji: '👢',
                        })
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addField("Info about the buttons:", "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact");
                        ListEmbed.addField("Current Players:", playersList);
                        var row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEjoin-'+hostId)
                                .setLabel('Join')
                                .setStyle('PRIMARY'),
                            new MessageButton()
                                .setCustomId('GAMEleave-'+hostId)
                                .setLabel('Leave')
                                .setStyle('PRIMARY'),
                        );
                        var row2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Start')
                                .setStyle('SECONDARY'),
                            new MessageButton()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle('SECONDARY'),
                        );
                        var row3 = new MessageActionRow()
                            .addComponents(kickableList);
                    button.update({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "default":
                    logger.info("Default case hit, this should never happen");
                    break;
                    //todo: if someone makes a game but already has one open, close the old one and make a new one if it has been more than a certain time since it has been used
                    //todo: add ability to remove someone from a game
                }
        }
}

async function userJoinsVoice(oldMember, newMember){
    var newUserChannel = newMember.channelId;
    var oldUserChannel = oldMember.channelId;
    const currentTime = Math.floor(new Date().getTime() / 1000);
    logger.info("newMember: " + newMember);
    logger.info("oldMember: " + oldMember);
    for ( const item in newMember ) {
        logger.info("newMember." + item + ": " + newMember[item]);
    }
    for ( const item in oldMember ) {
        logger.info("oldMember." + item + ": " + oldMember[item]);
    }
    const user = newMember.guild.members.cache.get(newMember.id);
    const isUserInAfkChannel = (newUserChannel === newMember.guild.afkChannelId);
    var muted = "true";
    if(newMember.selfMute === false){
        muted = "false";
    }
    if (isUserInAfkChannel) {
        newUserChannel = undefined;
    }
    if(newUserChannel != undefined){
        const voiceTrackingData = {
            user_id: newMember.id,
            username: user.user.username,
            discord_server_id: newMember.guild.id,
            selfMute: newMember.selfMute,
            disconnect_time: 0
        };
        //for ( const item in voiceTrackingData ) {
        //    logger.info("voiceTrackingData." + item + ": " + voiceTrackingData[item]);
        //}
        try {
            const respVoice = await api.get("voice_tracking", voiceTrackingData);

            if (respVoice.voice_trackings[0]) {
                logger.info("Updating an existing tracking");
                const respVoiceUpdate = await api.put("voice_tracking", {
                    voice_state_id: parseInt(respVoice.voice_trackings[0].voice_state_id),
                    disconnect_time: currentTime
                });
                logger.info("Creating a new tracking for moving channels");
            try{
                var respVoiceNew = await api.post("voice_tracking",{
                    user_id:newMember.id,
                    username:user.user.username,
                    discord_server_id:newMember.guild.id,
                    connect_time:Math.floor(new Date().getTime() / 1000),
                    selfmute:muted,
                    channel_id:newUserChannel,
                    disconnect_time:0
                })
            }catch(error){
                logger.error(error);
            }
            }else{
                logger.info("Creating a brand new tracking");
                const voiceTrackingNewData = {
                    connect_time: currentTime,
                    selfmute: muted,
                    channel_id: newUserChannel,
                    disconnect_time: 0
                };
                const respVoiceNew = await api.post("voice_tracking", {
                    ...voiceTrackingData,
                    ...voiceTrackingNewData
                });
                logger.info(user.user.username + " joined a channel with an ID of: " + newUserChannel);
            }
        } catch (error) {
            logger.error(error.message);
        }
    }else{
    if (!newUserChannel) {
        try {
            const respVoice = await api.get("voice_tracking", {
            user_id: newMember.id,
            username: user.user.username,
            disconnect_time: 0
            });

            if (respVoice.voice_trackings[0]) {
            const respVoiceUpdate = await api.put("voice_tracking", {
                voice_state_id: parseInt(respVoice.voice_trackings[0].voice_state_id),
                disconnect_time: currentTime
            });
            }
        } catch (error) {
            logger.error(error.message);
        }

        logger.info(user.user.username + " left a channel with an ID of: " + oldUserChannel);
    }
    }
    /*let newUserChannel = newMember.channelId;
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
    }*/
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
