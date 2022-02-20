module.exports = {
    name: 'next_session',
    description: 'assigns a date to the next session and then set the header of the scheduling channel',
    syntax: 'next_session [YYYY-MM-DD] [HH:MM:SS]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        if(!args[1] || !args[2]){
            message.channel.send({ content: "Please enter a datetime stamp for this command!\nYYYY-MM-DD HH:MM:SS time stamp"});
            return
        }
        var api = extra.api;
        var respDndSession = "";
        try{
            respDndSession = await api.get("dnd_campaign",{
                schedule_channel:message.channel.id
            });
        }catch(err){
            this.logger.error(err.message);
        }
        this.logger.info("This is the info: " + respDndSession);
        if(respDndSession.dnd_campaigns[0]){
            if(respDndSession.dnd_campaigns[0].dm_role_id === ""){
                message.channel.send({ content: "This command requires an admin role but no main admin role has been selected for this server."});
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

        var dateTime = args[1] + " " + args[2];
        var unixTimeStamp = Math.floor(new Date(dateTime).getTime()/1000);
        message.channel.setTopic("Next Session: <t:" + unixTimeStamp.toString() + ":R>" );
    }
}