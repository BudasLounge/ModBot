module.exports = {
    name: 'game',
    description: 'Various ways to interact with games',
    syntax: 'game [help/open/join/start/end] Also various option flags.',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const Discord = require("discord.js");

        switch(args[1]){
            case "open":
                var respGame;
                try{
                    respGame = await api.get("game_joining_master",{
                        host_id:message.member.id
                    });
                } catch(error){
                    this.logger.error(error.response);
                }
                if(respGame[0]){
                    message.channel.send("You already have a live game! Close it out with /game end");
                }else{
                    message.channel.send(respGame[0]);
                    try{
                        respGame = await api.post("game_joining_master",{
                            host_id:message.member.id
                        });
                    } catch(error2){
                        this.logger.error(error2.response);
                    }
                    if(respGame.ok){
                        message.channel.send("Created a game! Others can now join with /game join @host");
                    }
                }
            break;
                }
        }
};