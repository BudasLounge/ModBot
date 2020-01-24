var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
function onMessageReactionAdd(messageReaction, user) {
    messageReaction.message.channel.send("[Admin] A reaction was added!")
}

async function onUserJoin(member){
    try{
        respServer = await api.get("DiscordServer", {
            server_id: member.guild.id
        });
    }catch(error){
        console.error(error);
    }
    if(respServer.discord_servers[0]){
        member.guild.channels.get(respServer.discord_servers[0].welcome_channel_id).send("<@" + member.id + "> "+respServer.discord_servers[0].welcome_message);
        member.addRole(respServer.discord_servers[0].default_role_id);
    }
}

function register_handlers(event_registry) {
    event_registry.register('messageReactionAdd', onMessageReactionAdd);
    event_registry.register('guildMemberAdd', onUserJoin);
}

module.exports = register_handlers;