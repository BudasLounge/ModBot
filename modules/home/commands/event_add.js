module.exports = {
    name: 'event',
    description: 'Create an event message and add it to the DB',
    syntax: 'event [date] [time] [what is the event]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    options: [
        { name: 'date',        description: 'Event date (e.g. 2026-06-15)',  type: 'STRING', required: false },
        { name: 'time',        description: 'Event time (e.g. 18:00)',       type: 'STRING', required: false },
        { name: 'description', description: 'What is the event?',           type: 'STRING', required: false },
    ],
    async execute(message, args, extra) {
        
    }
}