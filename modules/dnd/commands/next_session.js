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
            await message.reply('Please enter a datetime stamp for this command!\nYYYY-MM-DD HH:MM:SS timestamp');
            return;
        }

        if (!args[2]) {
            await message.reply('Please enter both date and time for this command!\nYYYY-MM-DD HH:MM:SS timestamp');
            return;
        }

        dateTime = `${args[1]} ${args[2]}`;
        unixTimeStamp = Math.floor(new Date(dateTime).getTime() / 1000);
        time = dateTime;

        if (isNaN(unixTimeStamp)) {
            await message.reply('Invalid date format. Please use YYYY-MM-DD HH:MM:SS.');
            return;
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

        const dateTimestamp = new Date(unixTimeStamp * 1000 - 24 * 60 * 60 * 1000); // Subtracting 24 hours

        if (isNaN(dateTimestamp.getTime())) {
            logger.error(`Invalid dateTimestamp: ${dateTimestamp}`);
            await message.reply('Failed to schedule job due to invalid date.');
            return;
        }

        const jobName = `${campaign.module}-COMMAND`;
        logger.info(`Attempting to schedule job ${jobName} for ${dateTimestamp.toISOString()}`);

        // Cancel any existing job with the same name
        if (schedule.scheduledJobs[jobName]) {
            logger.info(`Existing job details before cancellation: ${JSON.stringify(schedule.scheduledJobs[jobName], null, 2)}`);
            logger.info(`Cancelling existing job with name ${jobName}`);
            schedule.cancelJob(jobName);
        }

        try {
            const delay = dateTimestamp.getTime() - Date.now();

            if (delay > 0) {
                setTimeout(async function() {
                    logger.info(`Job ${jobName} executed.`);
                    try {
                        const guild = await message.client.guilds.fetch('650865972051312673');
                        if (!guild) {
                            logger.error(`Guild not found for ID 650865972051312673`);
                            return;
                        }
                        const channel = await guild.channels.resolve(campaign.schedule_channel);
                        if (channel) {
                            const unixTimeStamp = Math.floor(new Date(campaign.next_session).getTime() / 1000);
                            await channel.send(`<@&${campaign.role_id}>, the session starts <t:${unixTimeStamp}:R>`);
                        } else {
                            logger.error(`Channel not found for ID ${campaign.schedule_channel} in guild ${guild.id}`);
                        }
                    } catch (err) {
                        logger.error(`Error sending message for session: ${err.message}`);
                    }
                }, delay);
                logger.info(`Scheduled job ${jobName} for ${dateTimestamp.toISOString()}`);
                await message.reply(`Job ${jobName} scheduled successfully for ${dateTimestamp.toISOString()}.`);
            } else {
                logger.error(`Failed to schedule job ${jobName} due to negative delay.`);
                await message.reply(`Failed to schedule job ${jobName} due to negative delay.`);
            }
        } catch (err) {
            logger.error(`Exception occurred while scheduling job: ${err.message}`);
            logger.error(`Exception details: ${err.stack}`);
            await message.reply('An error occurred while scheduling the job.');
        }
    }
};
