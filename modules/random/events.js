var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const {MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu, Permissions} = require('discord.js');
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
                    await button.deferReply({ ephemeral: true });
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master",{
                            host_id:hostId
                        });
                    } catch(error){
                        logger.error(`Error fetching game master for host ${hostId} on JOIN: ${error.message || error}`);
                        await button.editReply({ content: "Could not find an active game to join." });
                        return;
                    }
                    if(!respGame.game_joining_masters || !respGame.game_joining_masters[0]){
                        await button.editReply({ content: "This game session seems to have ended or is invalid." });
                        return;
                    }
                    var gameId = respGame.game_joining_masters[0].game_id;
                    var respPlayer;
                    try{
                        respPlayer = await api.get("game_joining_player",{
                            game_id:gameId,
                            player_id:button.user.id
                        });
                    }catch(error){
                        logger.error(`Error checking if player ${button.user.id} is in game ${gameId}: ${error.message || error}`);
                        // Continue to attempt to add, as this might be a "not found" error which is expected
                    }

                    if(respPlayer && respPlayer.game_joining_players && respPlayer.game_joining_players[0]){
                        await button.editReply({ content: "You are already in the game!" });
                    }else{
                        try{
                            var respAddPlayer = await api.post("game_joining_player",{
                                game_id:gameId,
                                player_id:button.user.id
                            });
                            if(respAddPlayer.ok){ // Assuming .ok is a success flag
                                await button.editReply({ content: "You have joined the game!" });
                                logger.info(`Player ${button.user.id} joined game ${gameId}`);
                            } else {
                                logger.error(`Failed to add player ${button.user.id} to game ${gameId}. API Response: ${JSON.stringify(respAddPlayer)}`);
                                await button.editReply({ content: "Could not join the game. Please try again." });
                            }
                        }catch(error){
                            logger.error(`Error adding player ${button.user.id} to game ${gameId}: ${error.message || error}`);
                            await button.editReply({ content: "An error occurred while trying to join the game." });
                        }
                    }
                break;
                case "leave":
                    await button.deferReply({ ephemeral: true });
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master",{
                            host_id:hostId
                        });
                    } catch(error){
                        logger.error(`Error fetching game master for host ${hostId} on LEAVE: ${error.message || error}`);
                        await button.editReply({ content: "Could not find an active game to leave." });
                        return;
                    }
                    if(!respGame.game_joining_masters || !respGame.game_joining_masters[0]){
                        await button.editReply({ content: "This game session seems to have ended or is invalid." });
                        return;
                    }
                    var gameId = respGame.game_joining_masters[0].game_id;
                    var respPlayer;
                    try{
                        respPlayer = await api.get("game_joining_player",{
                            game_id:gameId,
                            player_id:button.user.id
                        });
                    }catch(error){
                        logger.error(`Error fetching player ${button.user.id} from game ${gameId} for LEAVE: ${error.message || error}`);
                        await button.editReply({ content: "An error occurred. You might not be in the game or the game has ended." });
                        return;
                    }

                    if(respPlayer && respPlayer.game_joining_players && respPlayer.game_joining_players[0]){
                        try{
                            var respDeletePlayer = await api.delete("game_joining_player",{
                                game_player_id:Number(respPlayer.game_joining_players[0].game_player_id)
                            });
                            if(respDeletePlayer.ok){ // Assuming .ok is a success flag
                                await button.editReply({ content: "You have left the game." });
                                logger.info(`Player ${button.user.id} left game ${gameId}`);
                            } else {
                                logger.error(`Failed to remove player ${button.user.id} from game ${gameId}. API Response: ${JSON.stringify(respDeletePlayer)}`);
                                await button.editReply({ content: "Could not leave the game. Please try again." });
                            }
                        }catch(error){
                            logger.error(`Error deleting player ${button.user.id} from game ${gameId}: ${error.message || error}`);
                            await button.editReply({ content: "An error occurred while trying to leave the game." });
                        }
                    }else{
                        await button.editReply({ content: "You are not in this game, or it has already ended." });
                    }
                break;
                case "start":
                    if(button.user.id !== hostId){
                        await button.reply({ content: "Only the host can start the game.", ephemeral: true });
                        return;
                    }
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master",{
                            host_id:hostId
                        });
                    } catch(error){
                        logger.error(`Error fetching game master for host ${hostId} on START: ${error.message || error}`);
                        await button.reply({ content: "Could not find game data to start.", ephemeral: true });
                        return;
                    }

                    if(!respGame.game_joining_masters || !respGame.game_joining_masters[0]){
                        await button.reply({ content: "This game session seems to have ended or is invalid.", ephemeral: true });
                        return;
                    }
                    var gameId = respGame.game_joining_masters[0].game_id;
                    var startingChannelId = respGame.game_joining_masters[0].starting_channel_id;
                    var hostMember = await button.guild.members.fetch(hostId).catch(err => logger.error(`Failed to fetch host member ${hostId}: ${err.message || err}`));
                    var targetVoiceChannel = hostMember ? hostMember.voice.channel : null;

                    if (!targetVoiceChannel) {
                        await button.reply({ content: "Host is not in a voice channel. Cannot start the game.", ephemeral: true });
                        return;
                    }

                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id: gameId
                        });
                    }catch(error){
                        logger.error(`Error fetching players for game ${gameId} on START: ${error.message || error}`);
                        await button.channel.send({ content: "Could not retrieve player list. Game cannot start."});
                        return;
                    }

                    if(!respPlayersList.game_joining_players || respPlayersList.game_joining_players.length === 0){
                        await button.reply({ content: "No players have joined the game yet. Cannot start.", ephemeral: true });
                        return;
                    }

                    await button.deferUpdate(); // Acknowledge the button click immediately
                    button.channel.send({ content: `Game ${gameId} is starting! Moving players to ${targetVoiceChannel.name}...`});
                    logger.info(`Game ${gameId} starting by host ${hostId}. Moving players to channel ${targetVoiceChannel.id}`);

                    for(var i = 0; i < respPlayersList.game_joining_players.length; i++){
                        try{
                            var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                            if(player.voice.channel && player.voice.channel.id !== targetVoiceChannel.id){
                                await player.voice.setChannel(targetVoiceChannel);
                                logger.info(`Moved player ${player.id} to channel ${targetVoiceChannel.id}`);
                            } else if (!player.voice.channel){
                                logger.info(`Player ${player.id} is not in a voice channel, cannot move.`);
                                // Optionally notify player or host
                            }
                        }catch(moveError){
                            logger.error(`Failed to move player ${respPlayersList.game_joining_players[i].player_id} to channel ${targetVoiceChannel.id}: ${moveError.message || moveError}`);
                            button.channel.send({ content: `Could not move ${player.displayName} to the game channel.`}).catch(e => logger.error("Failed to send move error message"));
                        }
                    }
                    // Disable Join/Leave buttons, change Start to "Game in Progress", End remains active
                    // This requires modifying the original message with the buttons
                    const gameMessage = button.message;
                    const newRow = new MessageActionRow()
                        .addComponents(
                            new MessageButton().setCustomId(`GAMEjoin-${hostId}`).setLabel('Join').setStyle('PRIMARY').setDisabled(true),
                            new MessageButton().setCustomId(`GAMEleave-${hostId}`).setLabel('Leave').setStyle('PRIMARY').setDisabled(true)
                        );
                    const newRow2 = new MessageActionRow()
                        .addComponents(
                            new MessageButton().setCustomId('GAMEinprogress').setLabel('Game in Progress').setStyle('SUCCESS').setDisabled(true),
                            new MessageButton().setCustomId(`GAMEend-${hostId}`).setLabel('End Game').setStyle('DANGER')
                        );
                    try {
                        await gameMessage.edit({ components: [newRow, newRow2] });
                    } catch (editError) {
                        logger.error(`Failed to edit game message after starting game ${gameId}: ${editError.message || editError}`);
                    }

                break;
                case "end":
                    if(button.user.id !== hostId){
                        await button.reply({ content: "Only the host can end the game.", ephemeral: true });
                        return;
                    }
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master",{
                            host_id:hostId
                        });
                    } catch(error){
                        logger.error(`Error fetching game master for host ${hostId} on END: ${error.message || error}`);
                        await button.reply({ content: "Could not find game data to end.", ephemeral: true });
                        return;
                    }

                    if(!respGame.game_joining_masters || !respGame.game_joining_masters[0]){
                        await button.reply({ content: "This game session seems to have already ended or is invalid.", ephemeral: true });
                        return;
                    }
                    var gameId = respGame.game_joining_masters[0].game_id;
                    await button.deferUpdate(); // Acknowledge the button click

                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id: gameId
                        });
                    }catch(error){
                        logger.error(`Error fetching players for game ${gameId} on END: ${error.message || error}`);
                        // Proceed to delete master record even if players can't be listed/deleted
                    }

                    if(respPlayersList && respPlayersList.game_joining_players){
                        for(var i = 0; i < respPlayersList.game_joining_players.length; i++){
                            try{
                                var respTemp = await api.get("game_joining_player",{
                                    game_id:gameId,
                                    player_id:respPlayersList.game_joining_players[i].player_id
                                });
                                if (respTemp && respTemp.game_joining_players && respTemp.game_joining_players[0]){
                                    await api.delete("game_joining_player",{
                                        game_player_id:Number(respTemp.game_joining_players[0].game_player_id)
                                    });
                                    logger.info(`Removed player ${respPlayersList.game_joining_players[i].player_id} from game ${gameId} during END operation.`);
                                }
                            }catch(playerDeleteError){
                                logger.error(`Error deleting player ${respPlayersList.game_joining_players[i].player_id} from game ${gameId} on END: ${playerDeleteError.message || playerDeleteError}`);
                            }
                        }
                    }

                    try{
                        var respGameEnd = await api.delete("game_joining_master", {
                            game_id: gameId
                        });
                        if(respGameEnd.ok){ // Assuming .ok is a success flag
                            button.channel.send({ content: `Game ${gameId} has been ended by the host.`});
                            logger.info(`Game ${gameId} ended by host ${hostId}`);
                            // Optionally, edit the original message to reflect the game has ended (e.g., disable all buttons)
                            const gameMessage = button.message;
                            const endedRow = new MessageActionRow()
                                .addComponents(
                                    new MessageButton().setCustomId('GAMEjoin-ended').setLabel('Join').setStyle('PRIMARY').setDisabled(true),
                                    new MessageButton().setCustomId('GAMEleave-ended').setLabel('Leave').setStyle('PRIMARY').setDisabled(true)
                                );
                            const endedRow2 = new MessageActionRow()
                                .addComponents(
                                    new MessageButton().setCustomId('GAMEstart-ended').setLabel('Start').setStyle('SECONDARY').setDisabled(true),
                                    new MessageButton().setCustomId('GAMEend-ended').setLabel('Game Ended').setStyle('DANGER').setDisabled(true)
                                );
                            try {
                                await gameMessage.edit({ content: "This game has ended.", embeds: [], components: [endedRow, endedRow2] });
                            } catch (editError) {
                                logger.error(`Failed to edit game message after ending game ${gameId}: ${editError.message || editError}`);
                            }
                        } else {
                            logger.error(`Failed to delete game master record ${gameId} on END. API Response: ${JSON.stringify(respGameEnd)}`);
                            button.channel.send({ content: "There was an error fully ending the game. Some data might persist."});
                        }
                    }catch(error){
                        logger.error(`Error deleting game master record ${gameId} on END: ${error.message || error}`);
                        button.channel.send({ content: "An error occurred while ending the game."});
                    }
                break;
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
