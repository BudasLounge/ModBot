module.exports = {
    name: 'next_session',
    description: 'assigns a date to the next session and then set the header of the scheduling channel',
    syntax: 'next_session [YYYY-MM-DD] [HH:MM:SS]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const schedule = require('node-schedule');
        var api = extra.api;
        var respDndSession = "";
        try{
            respDndSession = await api.get("dnd_campaign",{
                schedule_channel:message.channel.id
            });
        }catch(err){
            this.logger.error(err.message);
        }

        if(respDndSession.dnd_campaigns[0]){
            if(respDndSession.dnd_campaigns[0].dm_role_id === ""){
                message.channel.send({ content: "This command requires an DM role but no main DM role has been selected for this category."});
                return;
            }
            else if(!message.member.roles.cache.has(respDndSession.dnd_campaigns[0].dm_role_id)){
                message.channel.send({ content: "You do not have permission to use this command."});
                return;
            }
        }else{
            message.channel.send({ content: "No DnD campaigns were found linked to this channel. Please set up a scheduling channel to use this command."});
            return;
        }

        if(!args[1]){
            if(respDndSession.dnd_campaigns[0]){
                if(respDndSession.dnd_campaigns[0].next_session){
                    var unixTimeStamp = Math.floor(new Date(respDndSession.dnd_campaigns[0].next_session).getTime()/1000);
                    message.channel.send({content: "<@&"+respDndSession.dnd_campaigns[0].role_id.toString()+">, the session starts <t:" + unixTimeStamp.toString() + ":R>"});
                }else{
                    message.channel.send({ content: "Please enter a datetime stamp for this command!\nYYYY-MM-DD HH:MM:SS time stamp"});
                }
                return;
            }
        }
        if(!args[2]){
            var respLastSession = "";
            try{
                respLastSession = await api.get("dnd_campaign",{
                    campaign_id:parseInt(respDndSession.dnd_campaigns[0].campaign_id)
                })
            }catch(err3){
                this.logger.error(err3.message);
            }
            var lastDate = Math.floor(new Date(respLastSession.dnd_campaigns[0].next_session).getTime()/1000);
            var newDate = lastDate + (args[1]*86400);
            this.logger.info(newDate.toString())
            var newDateStamp = new Date(newDate*1000)
            var year = newDateStamp.getFullYear();
            var month = newDateStamp.getMonth()+1;
            if(month<10){
                month = "0"+month.toString()
            }
            var date = newDateStamp.getDate();
            if(date<10){
                date = "0"+date.toString()
            }
            var hour = newDateStamp.getHours();
            var min = newDateStamp.getMinutes();
            var sec = newDateStamp.getSeconds();
            if(sec<10){
                sec="0"+sec.toString()
            }
            var time = year + '-' + month + '-' + date + ' ' + hour + ':' + min + ':' + sec ;
            this.logger.info(time)
            var respNextSession = "";
            try{
                respNextSession = await api.put("dnd_campaign",{
                    campaign_id:parseInt(respDndSession.dnd_campaigns[0].campaign_id),
                    next_session:time
                })
            }catch(err4){
                this.logger.error(err4.message);
            }
            await message.channel.setTopic("Next Session: <t:" + newDate.toString() + ":R>" );
        }else{
            try{
                this.logger.info("Setting date time, scheduling message, and setting channel topic")
                var dateTime = args[1] + " " + args[2];
                var unixTimeStamp = Math.floor(new Date(dateTime).getTime()/1000);
                var respNextSession = "";
                try{
                    respNextSession = await api.put("dnd_campaign",{
                        campaign_id:parseInt(respDndSession.dnd_campaigns[0].campaign_id),
                        next_session:dateTime
                    })
                }catch(err2){
                    this.logger.error(err2.message);
                }
                await message.channel.setTopic("Next Session: <t:" + unixTimeStamp.toString() + ":R>" );


                const existingJob = schedule.scheduledJobs[respDndSession.dnd_campaigns[0].module];
                if (existingJob) {
                    existingJob.cancel();
                }
                const existingJobCommand = schedule.scheduledJobs[respDndSession.dnd_campaigns[0].module+"-COMMAND"];
                if (existingJobCommand) {
                    existingJobCommand.cancel();
                }
                logger.info(`Scheduling message for session ${respDndSession.dnd_campaigns[0].module} via COMMAND`);

                // Parse the date-time string into a JavaScript Date object
                const dateTimestamp = new Date(respDndSession.dnd_campaigns[0].next_session);
                // Schedule the job
                await schedule.scheduleJob(respDndSession.dnd_campaigns[0].module+"-COMMAND", dateTimestamp, async function() {
                    try{
                        logger.info(`Sending message for session ${respDndSession.dnd_campaigns[0].module}`);
                        const guild = await global.client.guilds.fetch('650865972051312673');
                            if (!guild) {
                                logger.error(`Guild not found for ID 650865972051312673`);
                                return;
                            }
                        const channel = await guild.channels.resolve(respDndSession.dnd_campaigns[0].schedule_channel);
                        if (channel) {
                            var unixTimeStamp = Math.floor(new Date(session.next_session).getTime()/1000);
                            channel.send({content: "<@&"+session.role_id.toString()+">, the session starts <t:" + unixTimeStamp.toString() + ":R>"});
                        }else {
                            logger.error(`Channel not found for ID ${respDndSession.dnd_campaigns[0].schedule_channel} in guild ${guild.id}`);
                        }
                    }catch(err){
                        logger.error(err.message);
                    }
                });
                const scheduledJobs = schedule.scheduledJobs;
                logger.info('All scheduled jobs:', scheduledJobs);
            }catch(err){
                this.logger.error(err.message);
            }
        }
    }
}