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
                if(respGame.game_joining_masters[0]){
                    message.channel.send("You already have a live game! Close it out with /game end");
                }else{
                    this.logger.info(respGame[0]);
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
            case "join":
                if(!args[2]){
                    message.channel.send("Make sure to @ the host of the game you are joining when running this command.");
                }else{
                    var respGame;
                    var respPlayers;
                    var hostID = message.mentions.users.first().id;
                    try{
                        respGame = await api.get("game_joining_master",{
                            host_id:hostID
                        });
                    } catch(error4){
                        this.logger.error(error4.response);
                    }
                    if(respGame.game_joining_masters[0]){
                        try{
                            respPlayers = await api.post("game_joining_player",{
                                player_id:message.member.id,
                                game_id:respGame.game_joining_masters[0].game_id
                            });
                        } catch(error5){
                            this.logger.error(error5.response);
                        }
                        if(respPlayers.ok){
                            message.channel.send("Succesfully joined the game!");
                        }else{
                            message.channel.send("There was an error joining the game.");
                        }
                    }
                }
                break;
            }
        }
};