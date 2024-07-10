module.exports = {
    name: 'showjobs',
    description: 'Show any scheduled jobs',
    syntax: 'showjobs',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const schedule = require('node-schedule');
        const scheduledJobs = schedule.scheduledJobs;
        await message.reply('All scheduled jobs:', schedule);
    }
}