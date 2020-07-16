module.exports = {
    name: 'start_campaign',
    description: 'Used to open a new campaign',
    syntax: 'start_campaign',
    num_args: 0,
    args_to_lower: true,
    async execute(message, args, api) {
        console.log(">>start_campaign");
        message.channel.send("<@" + message.member.id + "> "+"please fill out the information!");
        const Discord = require(`discord.js`);

        let Author = message.author;
        let Authorid = Author.id; //You will need this in the future

        var module = "";
        var start_date = "";
        var category_id = "";
        var schedule_type = "";

        const filter1 = response1 => {
        return response1.author.id === Authorid;
        }
        message.channel.send("What is the module you are using?").then(() => {
        message.channel.awaitMessages(filter1, { max: 1 })
        .then(collected1 => {
            
        const response1 = collected1.first();
            module = response1.content;

        const filter2 = response2 => {
        return response2.author.id === Authorid;
        }
        message.channel.send("What is the start date? (Format YYYY-MM-DD)");
        message.channel.awaitMessages(filter2, { max: 1 })
        .then(collected2 => {
            
        const response2 = collected2.first();
        start_date = response2.content;

        const filter3 = response3 => {
        return response3.author.id === Authorid;
        }
        message.channel.send("How many days in between sessions? (enter only the numeric value)");
        message.channel.awaitMessages(filter3, { max: 1 })
        .then(collected3 => {
            
        const response3 = collected3.first();
            schedule_type = response3.content;

        });
        });
        });
    });
            message.channel.send("Here is what you entered:\n" + module + "\n" + start_date + "\n" + schedule_type);
            console.log("<<start_campaign");
        }
};
