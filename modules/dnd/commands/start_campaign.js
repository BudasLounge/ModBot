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
        var role_name = "";
        var category_id = "";
        var schedule_type = "";
        var category_name = "";
        var text_amount = "";
        var voice_amount = "";

        const filter1 = response1 => {
            return response1.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"What is the module you are using?").then(() => {
        message.channel.awaitMessages(filter1, { max: 1 })
        .then(collected1 => {
            const response1 = collected1.first();
            module = response1.content;

        const filter2 = response2 => {
            return response2.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"What is the start date? (Format YYYY-MM-DD)").then(() => {
        message.channel.awaitMessages(filter2, { max: 1 })
        .then(collected2 => {  
            const response2 = collected2.first();
            start_date = response2.content;

        const filter3 = response3 => {
            return response3.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"How many days in between sessions? (enter only the numeric value)").then(() => {
        message.channel.awaitMessages(filter3, { max: 1 })
        .then(collected3 => {
            const response3 = collected3.first();
            schedule_type = response3.content;
           
        const filter4 = response4 => {
            return response4.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"What is the name of the role for your players?").then(() => {
        message.channel.awaitMessages(filter4, { max: 1 })
        .then(collected4 => {
            const response4 = collected4.first();
            role_name = response4.content;
            
        const filter5 = response5 => {
            return response5.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"What is the name you want your folder to be?").then(() => {
        message.channel.awaitMessages(filter5, { max: 1 })
        .then(collected5 => {
            const response5 = collected5.first();
            category_name = response5.content;

        const filter6 = response6 => {
            return response5.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"How many text channels do you need?").then(() => {
        message.channel.awaitMessages(filter6, { max: 1 })
        .then(collected6 => {
            const response6 = collected6.first();
            text_amount = response6.content;

        const filter7 = response7 => {
            return response7.author.id === Authorid;
        }
        message.channel.send("<@" + message.member.id + "> "+"How many voice channels do you need?").then(() => {
        message.channel.awaitMessages(filter7, { max: 1 })
        .then(collected7 => {
            const response7 = collected7.first();
            voice_amount = response7.content;
            

        message.member.guild.createChannel(category_name, "category");
            message.channel.send("<@" + message.member.id + "> "+"Here is what you entered:\n" + module + "\n" + start_date + "\n" + schedule_type + "\n" + role_name + "\n" + category_name + "\n" + text_amount + "\n" + voice_amount);
        });
        });
        });
        });
        });
        });
        });
    });
    });
    });
    });
    });
    });
    });
            console.log("<<start_campaign");
        }
};
