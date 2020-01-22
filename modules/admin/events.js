function onMessageReactionAdd(messageReaction, user) {
    messageReaction.message.channel.send("[Admin] A reaction was added!")
}

function register_handlers(event_registry) {
    event_registry.register('messageReactionAdd', onMessageReactionAdd);
}

module.exports = register_handlers;