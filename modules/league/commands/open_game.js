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
                        if(respGame.game_joining_masters[0].status == "open"){
                            try{
                                respPlayers = await api.post("game_joining_player",{
                                    player_id:message.member.id,
                                    game_id:Number(respGame.game_joining_masters[0].game_id)
                                });
                            } catch(error5){
                                this.logger.error(error5.response);
                            }
                            if(respPlayers.ok){
                                message.channel.send("Succesfully joined the game!");
                            }else{
                                message.channel.send("There was an error joining the game.");
                            }
                        }else{
                            message.channel.send("This game is already in progress and cannot be joined.");
                        }
                    }else{
                        message.channel.send("That user does not have an active game!");
                    }
                }
                break;
            case "start":
                var respGame;
                try{
                    respGame = await api.get("game_joining_master",{
                        host_id:message.member.id
                    });
                } catch(error6){
                    this.logger.error(error6.response);
                }
                if(respGame.game_joining_masters[0]){
                    if(respGame.game_joining_masters[0].status == "open"){
                        respGame = await api.put("game_joining_master",{
                            game_id:Number(respGame.game_joining_masters[0].game_id),
                            status:"started"
                        });
                        if(respGame.ok){
                            message.channel.send("Succesfully started your game!");
                        }
                    }else{
                        message.channel.send("This game is already in progress.");
                    }
                }
                break;
            case "end":
                var respGame;
                var respPlayersList;
                var respPlayers;
                try{
                    respGame = await api.get("game_joining_master",{
                        host_id:message.member.id
                    });
                } catch(error7){
                    this.logger.error(error7.response);
                }
                if(respGame.game_joining_masters[0]){
                    respPlayersList = await api.get("game_joining_player",{
                        _limit: 20,
                        game_id:Number(respGame.game_joining_masters[0].game_id)
                    });
                    this.logger.info("Set to loop "+respPlayersList.game_joining_players.length+" times.");
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        this.logger.info("Loop: "+i);
                        var respTemp = await api.get("game_joining_player",{
                            game_id:Number(respGame.game_joining_masters[0].game_id),
                            player_id:respPlayersList.game_joining_players[i].player_id
                        })
                        respPlayers = await api.delete("game_joining_player",{
                            game_player_id:Number(respTemp.game_joining_players[0].game_player_id)
                        });
                    }
                    respGame = await api.delete("game_joining_master",{
                        game_id:Number(respGame.game_joining_masters[0].game_id)
                    });
                }
            }
        }
};