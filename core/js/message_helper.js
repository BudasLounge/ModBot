var fs = require('fs');

class MessageHelper {
    constructor(message, path) {
        this.message = message;
        this.path = path;
    }

    send(text) {
        var config = JSON.parse(fs.readFileSync(this.path + '/modbot.json'));

        if(text.length <= config.max_message_length) {
            this.message.channel.send(text);
            return;
        }

        var sub = text.substr(0, config.max_message_length);
        if(sub.lastIndexOf('\n') != -1) {
            sub = sub.substr(0, sub.lastIndexOf('\n'));
        }
        this.message.channel.send(text.substr(0, config.max_message_length));
        var position = config.max_message_length;

        var self = this;
        setTimeout(function (text, position, max_message_length) { self.send_extra(text, position, max_message_length) }, 1000, text, position, config.max_message_length);
    }

    send_extra(text, position, max_message_length) {
        this.message.channel.send(text.substr(position, max_message_length));
        position += max_message_length;

        if(position <= text.length) {
            var self = this;
            setTimeout(function (text2, position2, max_message_length2) { self.send_extra(text2, position2, max_message_length2) }, 1000, text, position, max_message_length);
        }
    }
}

module.exports = MessageHelper;