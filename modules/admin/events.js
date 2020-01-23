function onMessageReactionAdd(messageReaction, user) {
    messageReaction.message.channel.send("[Admin] A reaction was added!")
}

function onUserJoin(){

}

function register_handlers(event_registry) {
    event_registry.register('messageReactionAdd', onMessageReactionAdd);
    event_registry.register('guildMemberAdd', onUserJoin);
}

module.exports = register_handlers;