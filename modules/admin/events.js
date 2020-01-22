function onTypingStart(channel, user) {
    channel.send("Whatcha typin' there, " + user.username + "?");
}

function register_handlers(event_registry) {
    console.log("Registering Event Handlers!");
    event_registry.register('typingStart', onTypingStart);
}

module.exports = register_handlers;