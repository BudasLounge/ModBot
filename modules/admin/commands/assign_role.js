module.exports = {
    name: 'give_role',
    description: 'Assigns a specified role to a specified user',
    syntax: 'give_role [@user] [role]',
    num_args: 2,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        var strLength = 0;
		var messageString = "";
		var role = "";
		var counter = 0;
        var member = message.mentions.members.first();
		for(let i=2;i<args.length;i++){
			//Manages current string length of arguments combined
			strLength += args[i].length;
			messageString += args[i];
			//Check to see if a role exists using that begins with the collective messageString
			role = message.guild.roles.cache.find(role => role.name.toLowerCase().includes(messageString));
			if(!role){
				//If role not found then return to string from previous iteration
				messageString = messageString.substring(0, strLength - args[i].length - 1);
				break;
			}
			//Add space
			messageString += " ";
			strLength ++;
		counter++;
		}
        try{
            role = message.guild.roles.cache.find(role => role.name.toLowerCase() === messageString.trim());
            member.roles.add(role.id);
        }
        catch(err){
            this.logger.error(err.message);
            message.channel.send("Role adding failed!");
            return;
        }
        message.channel.send("Role adding success!");
    }
}