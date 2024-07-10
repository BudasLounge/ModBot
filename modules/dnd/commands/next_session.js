const schedule = require('node-schedule');

module.exports = {
    name: 'next_session',
    description: 'Assigns a date to the next session and then sets the header of the scheduling channel',
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
            await message.reply('Failed to fetch campaign data.');
            return;
        }

        if (!respDndSession.dnd_campaigns[0]) {
            await message.reply('No DnD campaigns were found linked to this channel. Please set up a scheduling channel to use this command.');
            return;
        }

        const campaign = respDndSession.dnd_campaigns[0];

        if (campaign.dm_role_id === "") {
            await message.reply('This command requires a DM role but no main DM role has been selected for this category.');
            return;
        }

        if (!message.member.roles.cache.has(campaign.dm_role_id)) {
            await message.reply('You do not have permission to use this command.');
            return;
        }

        let dateTime, unixTimeStamp, time;

        if (!args[1]) {
            if (campaign.next_session) {
                unixTimeStamp = Math.floor(new Date(campaign.next_session).getTime() / 1000);
                await message.channel.send({ content: `<@&${campaign.role_id}>, the session starts <t:${unixTimeStamp}:R>` });
                return;
            } else {
                await message.channel.send({ content: "Please enter a datetime stamp for this command!\nYYYY-MM-DD HH:MM:SS time stamp" });
                return;
            }
        }

        if (!args[2]) {
            const lastDate = Math.floor(new Date(campaign.next_session).getTime() / 1000);
            const newDate = lastDate + (args[1] * 86400);
            const newDateStamp = new Date(newDate * 1000);
            time = `${newDateStamp.getFullYear()}-${String(newDateStamp.getMonth() + 1).padStart(2, '0')}-${String(newDateStamp.getDate()).padStart(2, '0')} ${String(newDateStamp.getHours()).padStart(2, '0')}:${String(newDateStamp.getMinutes()).padStart(2, '0')}:${String(newDateStamp.getSeconds()).padStart(2, '0')}`;

            dateTime = `${time}`;
            unixTimeStamp = Math.floor(new Date(dateTime).getTime() / 1000);
            time = newDateStamp.toISOString();

        } else {
            dateTime = `${args[1]} ${args[2]}`;
            const localDate = new Date(dateTime);

            if (isNaN(localDate.getTime())) {
                await message.reply('Invalid date format. Please use YYYY-MM-DD HH:MM:SS.');
                return;
            }

            unixTimeStamp = Math.floor(localDate.getTime() / 1000);
            time = localDate.toISOString();
        }

        try {
            await api.put("dnd_campaign", {
                campaign_id: parseInt(campaign.campaign_id),
                next_session: time
            });
        } catch (err) {
            logger.error(`Error updating campaign data: ${err.message}`);
            await message.reply('Failed to update campaign data.');
            return;
        }

        await message.channel.setTopic(`Next Session: <t:${unixTimeStamp}:R>`);

        // Calculate the job's execution time (subtracting 24 hours)
        const executionTime = new Date(unixTimeStamp * 1000);
        executionTime.setDate(executionTime.getDate() - 1);

        const now = new Date();
        const delay = executionTime - now;

        if (delay <= 0) {
            logger.error(`Failed to schedule job due to negative delay.`);
            await message.reply(`Failed to schedule job due to negative delay.`);
            return;
        }

        const jobName = `${campaign.module}-COMMAND`;
        logger.info(`Attempting to schedule job ${jobName} for ${executionTime.toISOString()}`);

        // Cancel any existing job with the same name
        if (schedule.scheduledJobs[jobName]) {
            logger.info(`Existing job details before cancellation: ${JSON.stringify(schedule.scheduledJobs[jobName], null, 2)}`);
            logger.info(`Cancelling existing job with name ${jobName}`);
            schedule.cancelJob(jobName);
        }

        try {
            const job = schedule.scheduleJob(jobName, executionTime, function() {
                logger.info(`Job ${jobName} executed.`);
            });

            if (job) {
                logger.info(`Scheduled job ${jobName} for ${executionTime.toISOString()}`);
                await message.reply(`Job ${jobName} scheduled successfully for ${executionTime.toISOString()}.`);
            } else {
                logger.error(`Failed to schedule job ${jobName}`);
                await message.reply(`Failed to schedule job ${jobName}.`);
            }
        } catch (err) {
            logger.error(`Exception occurred while scheduling job: ${err.message}`);
            logger.error(`Exception details: ${err.stack}`);
            await message.reply('An error occurred while scheduling the job.');
        }
    }
};
