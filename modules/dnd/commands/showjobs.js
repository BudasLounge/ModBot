const schedule = require('node-schedule');

module.exports = {
    name: 'showjobs',
    description: 'Show any scheduled jobs',
    syntax: 'showjobs',
    num_args: 0, // minimum amount of arguments to accept
    args_to_lower: false, // if the arguments should be lower case
    needs_api: true, // if this command needs access to the API
    has_state: false, // if this command uses the state engine
    options: [],
    async execute(message, args, extra) {
        const jobs = schedule.scheduledJobs;
        const jobNames = Object.keys(jobs);

        if (jobNames.length === 0) {
            await message.reply('No scheduled jobs.');
            return;
        }

        let jobList = 'All scheduled jobs:\n';
        jobNames.forEach(name => {
            const job = jobs[name];
            const nextInvocation = job.nextInvocation();
            jobList += `Job Name: ${name}, Next Invocation: ${nextInvocation ? nextInvocation.toString() : 'No next invocation'}\n`;
        });

        await message.reply(jobList);
    }
};