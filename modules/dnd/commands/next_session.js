const schedule = require('node-schedule');
const { format } = require('date-fns'); // Importing date-fns for date formatting

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
            await message.reply('❌ Failed to fetch campaign data.');
            return;
        }

        if (!respDndSession.dnd_campaigns[0]) {
            await message.reply('❌ No DnD campaigns were found linked to this channel. Please set up a scheduling channel to use this command.');
            return;
        }

        const campaign = respDndSession.dnd_campaigns[0];

        if (campaign.dm_role_id === "") {
            await message.reply('❌ This command requires a DM role but no main DM role has been selected for this category.');
            return;
        }

        if (!message.member.roles.cache.has(campaign.dm_role_id)) {
            await message.reply('❌ You do not have permission to use this command.');
            return;
        }

        let dateTime, unixTimeStamp, time;

        if (!args[1]) {
            if (campaign.next_session) {
                unixTimeStamp = Math.floor(new Date(campaign.next_session).getTime() / 1000);
                await message.channel.send({ content: `⏳ The next session starts <t:${unixTimeStamp}:R> <@&${campaign.role_id}>.` });
                return;
            } else {
                await message.channel.send({ content: "❌ Please enter a datetime stamp for this command!\n`YYYY-MM-DD HH:MM:SS`" });
                return;
            }
        }

        const now = new Date();

        if (!args[2]) {
            if (!campaign.next_session) {
                await message.reply('❌ No existing session found to calculate the new date.');
                return;
            }

            const lastSessionDate = new Date(campaign.next_session);
            const daysToAdd = parseInt(args[1], 10);

            if (isNaN(daysToAdd)) {
                await message.reply('❌ Invalid number of days.');
                return;
            }

            const newDate = new Date(lastSessionDate);
            newDate.setDate(newDate.getDate() + daysToAdd);

            if (newDate <= now) {
                await message.reply('⚠️ Please schedule the session at least 24 hours in advance.');
                return;
            }

            dateTime = newDate;
            unixTimeStamp = Math.floor(newDate.getTime() / 1000);
            time = format(newDate, 'yyyy-MM-dd HH:mm:ss'); // Correctly formatted time

        } else {
            dateTime = `${args[1]} ${args[2]}`;
            const localDate = new Date(dateTime);

            if (isNaN(localDate.getTime())) {
                await message.reply('❌ Invalid date format. Please use `YYYY-MM-DD HH:MM:SS`.');
                return;
            }

            if (localDate <= now) {
                await message.reply('⚠️ Please schedule the session at least 24 hours in advance.');
                return;
            }

            unixTimeStamp = Math.floor(localDate.getTime() / 1000);
            time = format(localDate, 'yyyy-MM-dd HH:mm:ss'); // Correctly formatted time
        }

        try {
            const respPut = await api.put("dnd_campaign", {
                campaign_id: parseInt(campaign.campaign_id),
                next_session: time
            });

            if (!respPut) {
                throw new Error('API response was undefined');
            }

            this.logger.info(`Updated campaign data: ${JSON.stringify(respPut)}`);
        } catch (err) {
            logger.error(`Error updating campaign data: ${err.message}`);
            await message.reply('❌ Failed to update campaign data.');
            return;
        }

        await message.channel.setTopic(`📅 Next Session: <t:${unixTimeStamp}:R>`);

        const jobName = `${campaign.module}-COMMAND`;
        const reminderTime = new Date(unixTimeStamp * 1000 - 24 * 60 * 60 * 1000); // 24 hours before session

        logger.info(`Attempting to schedule job ${jobName} for ${reminderTime.toISOString()}`);

        // Cancel any existing job with the same name
        if (schedule.scheduledJobs[jobName]) {
            logger.info(`Cancelling existing job with name ${jobName}`);
            schedule.cancelJob(jobName);
        }

        try {
            const job = schedule.scheduleJob(jobName, reminderTime, async function() {
                logger.info(`Job ${jobName} executed.`);
                try {
                    const guild = await message.client.guilds.fetch(message.guild.id);
                    if (!guild) {
                        logger.error(`Guild not found for ID ${message.guild.id}`);
                        return;
                    }
                    const channel = await guild.channels.resolve(campaign.schedule_channel);
                    if (channel) {
                        await channel.send(`<@&${campaign.role_id}>, the session starts <t:${unixTimeStamp}:R>.`);
                    } else {
                        logger.error(`Channel not found for ID ${campaign.schedule_channel} in guild ${guild.id}`);
                    }
                } catch (err) {
                    logger.error(`Error sending message for session: ${err.message}`);
                }
            });

            if (job) {
                logger.info(`Scheduled job ${jobName} for ${reminderTime.toISOString()}`);
                await message.reply(`✅ Session scheduled successfully! You will be reminded 24 hours before the session.`);
            } else {
                logger.error(`Failed to schedule job ${jobName}`);
                await message.reply(`❌ Failed to schedule job \`${jobName}\`.`);
            }
        } catch (err) {
            logger.error(`Exception occurred while scheduling job: ${err.message}`);
            logger.error(`Exception details: ${err.stack}`);
            await message.reply('❌ An error occurred while scheduling the job.');
        }
    }
};
