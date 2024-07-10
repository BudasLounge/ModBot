const schedule = require('node-schedule');

module.exports = {
    name: 'next_session',
    description: 'Assigns a date to the next session and then set the header of the scheduling channel',
    syntax: 'next_session [YYYY-MM-DD] [HH:MM:SS]',
    num_args: 0,
    args_to_lower: false,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        const api = extra.api;
        const logger = this.logger;
        let respDndSession = "";

        try {
            respDndSession = await api.get("dnd_campaign", {
                schedule_channel: message.channel.id
            });
        } catch (err) {
            logger.error(`Error fetching campaign data: ${err.message}`);
            return;
        }

        if (respDndSession.dnd_campaigns[0]) {
            if (respDndSession.dnd_campaigns[0].dm_role_id === "") {
                await message.channel.send({ content: "This command requires a DM role but no main DM role has been selected for this category." });
                return;
            } else if (!message.member.roles.cache.has(respDndSession.dnd_campaigns[0].dm_role_id)) {
                await message.channel.send({ content: "You do not have permission to use this command." });
                return;
            }
        } else {
            await message.channel.send({ content: "No DnD campaigns were found linked to this channel. Please set up a scheduling channel to use this command." });
            return;
        }

        let dateTime, unixTimeStamp, newDateStamp, time;
        if (!args[1]) {
            if (respDndSession.dnd_campaigns[0] && respDndSession.dnd_campaigns[0].next_session) {
                unixTimeStamp = Math.floor(new Date(respDndSession.dnd_campaigns[0].next_session).getTime() / 1000);
                await message.channel.send({ content: `<@&${respDndSession.dnd_campaigns[0].role_id}>, the session starts <t:${unixTimeStamp}:R>` });
                return;
            } else {
                await message.channel.send({ content: "Please enter a datetime stamp for this command!\nYYYY-MM-DD HH:MM:SS time stamp" });
                return;
            }
        }

        if (!args[2]) {
            const lastDate = Math.floor(new Date(respDndSession.dnd_campaigns[0].next_session).getTime() / 1000);
            const newDate = lastDate + (args[1] * 86400);
            newDateStamp = new Date(newDate * 1000);
            time = `${newDateStamp.getFullYear()}-${String(newDateStamp.getMonth() + 1).padStart(2, '0')}-${String(newDateStamp.getDate()).padStart(2, '0')} ${String(newDateStamp.getHours()).padStart(2, '0')}:${String(newDateStamp.getMinutes()).padStart(2, '0')}:${String(newDateStamp.getSeconds()).padStart(2, '0')}`;
        } else {
            dateTime = `${args[1]} ${args[2]}`;
            unixTimeStamp = Math.floor(new Date(dateTime).getTime() / 1000);
            time = dateTime;
        }

        try {
            await api.put("dnd_campaign", {
                campaign_id: parseInt(respDndSession.dnd_campaigns[0].campaign_id),
                next_session: time
            });
        } catch (err) {
            logger.error(`Error updating campaign data: ${err.message}`);
            return;
        }

        await message.channel.setTopic(`Next Session: <t:${unixTimeStamp}:R>`);

        // Schedule the job
        const dateTimestamp = new Date(new Date(time).getTime() - 24 * 60 * 60 * 1000); // Subtracting 24 hours

        if (isNaN(dateTimestamp.getTime())) {
            logger.error(`Invalid dateTimestamp: ${dateTimestamp}`);
            await message.channel.send({ content: "Failed to schedule job due to invalid date." });
            return;
        }

        try {
            const jobName = `${respDndSession.dnd_campaigns[0].module}-COMMAND`;
            logger.info(`Attempting to schedule job ${jobName} for ${dateTimestamp.toISOString()}`);

            // Cancel any existing job with the same name
            if (schedule.scheduledJobs[jobName]) {
                logger.info(`Existing job details before cancellation: ${JSON.stringify(schedule.scheduledJobs[jobName], null, 2)}`);
                logger.info(`Cancelling existing job with name ${jobName}`);
                schedule.cancelJob(jobName);
            }

            const job = schedule.scheduleJob(jobName, dateTimestamp, async function() {
                try {
                    logger.info(`Sending message for session ${respDndSession.dnd_campaigns[0].module}`);
                    const guild = await message.client.guilds.fetch('650865972051312673');
                    if (!guild) {
                        logger.error(`Guild not found for ID 650865972051312673`);
                        return;
                    }
                    const channel = await guild.channels.resolve(respDndSession.dnd_campaigns[0].schedule_channel);
                    if (channel) {
                        const unixTimeStamp = Math.floor(new Date(respDndSession.dnd_campaigns[0].next_session).getTime() / 1000);
                        await channel.send({ content: `<@&${respDndSession.dnd_campaigns[0].role_id}>, the session starts <t:${unixTimeStamp}:R>` });
                    } else {
                        logger.error(`Channel not found for ID ${respDndSession.dnd_campaigns[0].schedule_channel} in guild ${guild.id}`);
                    }
                } catch (err) {
                    logger.error(`Error sending message for session: ${err.message}`);
                }
            });

            if (job) {
                logger.info(`Scheduled job ${jobName} for ${dateTimestamp.toISOString()}`);
                logger.info(`Job details: ${JSON.stringify(job, null, 2)}`);
            } else {
                logger.error(`Failed to schedule job ${jobName}`);
                await message.channel.send({ content: `Failed to schedule job ${jobName}.` });
            }
        } catch (err) {
            logger.error(`Exception occurred while scheduling job: ${err.message}`);
            logger.error(`Exception details: ${err.stack}`);
        }
    }
};
