var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const Discord = require('discord.js');
//var client = new Discord.Client();
/*function onMessageReactionAdd(messageReaction, user) {
    messageReaction.message.channel.get("650871820538347520").send({ content: "[Admin] A reaction was added!")
}*/

async function onUserJoin(member){
	var respServer;
    try{
        respServer = await api.get("discord_server", {
            server_id: member.guild.id
        });
    }catch(error){
        console.log(error);
    }
    if(respServer.discord_servers[0]){
            member.guild.channels.cache.find(channel => channel.id === respServer.discord_servers[0].welcome_channel_id).send({ content: "Hi! <@" + member.id + "> "+respServer.discord_servers[0].welcome_message});
            member.roles.add(respServer.discord_servers[0].default_role_id);
    }
}


/*async function parseRaw(packet) {
    // We don't want this to run on unrelated packets
    if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;
    console.log(packet);
    // Grab the channel to check the message from
    const channel = client.channels.get(packet.d.channel_id);
    // There's no need to emit if the message is cached, because the event will fire anyway for that
    if (channel.messages.has(packet.d.message_id)) return;
    // Since we have confirmed the message is not cached, let's fetch it
    channel.fetchMessage(packet.d.message_id).then(message => {
        // Emojis can have identifiers of name:id format, so we have to account for that case as well
        const emoji = packet.d.emoji.id ? `${packet.d.emoji.name}:${packet.d.emoji.id}` : packet.d.emoji.name;
        // This gives us the reaction we need to emit the event properly, in top of the message object
        const reaction = message.reactions.get(emoji);
        // Adds the currently reacting user to the reaction's users collection.
        if (reaction) reaction.users.set(packet.d.user_id, client.users.get(packet.d.user_id));
        // Check which type of event it is before emitting
        if (packet.t === 'MESSAGE_REACTION_ADD') {
            client.emit('messageReactionAdd', reaction, client.users.get(packet.d.user_id));
        }
        /*if (packet.t === 'MESSAGE_REACTION_REMOVE') {
            client.emit('messageReactionRemove', reaction, client.users.get(packet.d.user_id));
        }*/
 //   });
//}

function register_handlers(event_registry) {
    //event_registry.register('messageReactionAdd', onMessageReactionAdd);
    event_registry.register('guildMemberAdd', onUserJoin);
    //event_registry.register('raw', parseRaw);
}

module.exports = register_handlers;
