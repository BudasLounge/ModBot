var fs = require('fs');

class MessageHelper {
    constructor(message, path) {
        this.message = message;
        this.path = path;
    }

    split_embed(embedIn) {
        var config = JSON.parse(fs.readFileSync(this.path + '/modbot.json'));

        var descriptions = [];
        var text = embedIn.description;
        var lines = text.split("\n");
        var currentDesc = "";
        for(var line of lines) {
            if(currentDesc.length + line.length + 1 <= config.max_message_length) {
                currentDesc += line + "\n";
            } else if(currentDesc.length <= 0) {
                descriptions.push(currentDesc);
                currentDesc = "";
            }
        }

        if(currentDesc.length > 0) {
            descriptions.push(currentDesc);
        }

        var embeds = [];
        for(var description of descriptions) {
            var new_embed = JSON.parse(JSON.stringify(embedIn));
            new_embed.setDescription(description);
            embeds.push(new_embed);
        }

        return embeds;
    }
}

module.exports = MessageHelper;