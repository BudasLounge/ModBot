module.exports = {
    name: 'game',
    description: 'Various ways to interact with games',
    syntax: 'game',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        var api = extra.api;
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            await message.channel.send({ content: "You need to be in a voice channel to use this command."});
            return;
        }
        var voiceChannelId = voiceChannel.id;
        var respGame;
                try{
                    respGame = await api.get("game_joining_master",{
                        host_id:message.member.id
                    });
                } catch(error){
                    this.logger.error(error.message);
                }
                if(respGame.game_joining_masters[0]){
                    var respPlayersList;
                        try{
                            respPlayersList = await api.get("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                        }
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            var respTemp = await api.get("game_joining_player",{
                                game_id:Number(respGame.game_joining_masters[0].game_id),
                                player_id:respPlayersList.game_joining_players[i].player_id
                            })
                            respPlayers = await api.delete("game_joining_player",{
                                game_player_id:Number(respTemp.game_joining_players[0].game_player_id)
                            });
                        }
                    var respGameEnd;
                        try{
                            respGameEnd = await api.delete("game_joining_master", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                            await message.channel.send({ content: "There was an error ending the game..."}); // Corrected to message.channel.send
                        }
                        await message.channel.send({ content: `Found open game, ending it and creating a new one!`});
                }
                try{
                    respGame = await api.post("game_joining_master",{
                        host_id:message.member.id,
                        starting_channel_id:voiceChannelId
                    });
                } catch(error2){
                    this.logger.error(error2.message);
                }
                if(!respGame.ok){
                    await message.channel.send({ content: "Game creation failed..."});
                }else{
                    await message.channel.send({ content: "Created a game! Let me pull up the menu for you..."});
                }                const ListEmbed = new EmbedBuilder()
                .setColor("#c586b6")
                .setTitle(`${message.member.displayName}'s game menu.`);
                ListEmbed.addFields({ name: "Info about the buttons:", value: "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact", inline: false });
                const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('GAMEjoin-'+message.member.id)
                        .setLabel('Join')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('GAMEleave-'+message.member.id)
                        .setLabel('Leave')
                        .setStyle(ButtonStyle.Primary),
                );
                const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('GAMEstart-'+message.member.id)
                        .setLabel('Start')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('GAMEend-'+message.member.id)
                        .setLabel('End')
                        .setStyle(ButtonStyle.Secondary),
                );
                this.logger.info("Sending game menu");
                try{
                    await message.channel.send({embeds: [ListEmbed], components: [row, row2] });
                }catch(err){
                    this.logger.error(err);
                }
        }
};