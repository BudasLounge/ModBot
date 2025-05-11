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
        const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            message.channel.send({ content: "You need to be in a voice channel to use this command." });
            return;
        }
        var voiceChannelId = voiceChannel.id;

        var respGame;
        // Check for and clean up existing game hosted by this user
        try {
            respGame = await api.get("game_joining_master", {
                host_id: message.member.id
            });
        } catch (error) {
            this.logger.error(`Failed to check for existing games for host ${message.member.id}: ${error.message || error}`);
            // Not necessarily a fatal error for creating a new game, so we can proceed.
        }

        if (respGame && respGame.game_joining_masters && respGame.game_joining_masters[0]) {
            const oldGameId = parseInt(respGame.game_joining_masters[0].game_id);
            message.channel.send({ content: `Found an open game you were hosting. I'll end it before creating a new one.` });

            var respPlayersList;
            try {
                respPlayersList = await api.get("game_joining_player", {
                    game_id: oldGameId
                });
            } catch (error) {
                this.logger.error(`Failed to get player list for old game ${oldGameId}: ${error.message || error}`);
            }

            if (respPlayersList && respPlayersList.game_joining_players) {
                for (var i = 0; i < respPlayersList.game_joining_players.length; i++) {
                    try {
                        var respTemp = await api.get("game_joining_player", {
                            game_id: oldGameId,
                            player_id: respPlayersList.game_joining_players[i].player_id
                        });
                        if (respTemp && respTemp.game_joining_players && respTemp.game_joining_players[0]) {
                            await api.delete("game_joining_player", {
                                game_player_id: Number(respTemp.game_joining_players[0].game_player_id)
                            });
                        }
                    } catch (playerDeleteError) {
                        this.logger.error(`Failed to delete player ${respPlayersList.game_joining_players[i].player_id} from old game ${oldGameId}: ${playerDeleteError.message || playerDeleteError}`);
                    }
                }
            }

            try {
                await api.delete("game_joining_master", {
                    game_id: oldGameId
                });
            } catch (error) {
                this.logger.error(`Failed to delete old game master record ${oldGameId}: ${error.message || error}`);
                message.channel.send({ content: "There was an error cleaning up your previous game session. I'll still try to create a new one." });
            }
        }

        // Create new game
        var newGameResponse;
        try {
            newGameResponse = await api.post("game_joining_master", {
                host_id: message.member.id,
                starting_channel_id: voiceChannelId
            });
        } catch (error) {
            this.logger.error(`Game creation API call failed: ${error.message || error}`);
            message.channel.send({ content: "Sorry, I couldn't create the game due to an API error." });
            return;
        }

        if (!newGameResponse || !newGameResponse.ok) { // Assuming .ok is a boolean success flag from the API
            this.logger.error(`Game creation failed. API response: ${JSON.stringify(newGameResponse)}`);
            message.channel.send({ content: "Game creation failed. Please try again." });
            return;
        }

        message.channel.send({ content: "Created a game! Let me pull up the menu for you..." });
        const ListEmbed = new MessageEmbed()
            .setColor("#c586b6")
            .setTitle(`${message.member.displayName}'s game menu.`);
        ListEmbed.addField("Info about the buttons:", "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact");

        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`GAMEjoin-${message.member.id}`)
                    .setLabel('Join')
                    .setStyle('PRIMARY'),
                new MessageButton()
                    .setCustomId(`GAMEleave-${message.member.id}`)
                    .setLabel('Leave')
                    .setStyle('PRIMARY'),
            );
        const row2 = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(`GAMEstart-${message.member.id}`)
                    .setLabel('Start')
                    .setStyle('SECONDARY'),
                new MessageButton()
                    .setCustomId(`GAMEend-${message.member.id}`)
                    .setLabel('End')
                    .setStyle('SECONDARY'),
            );
        message.channel.send({ embeds: [ListEmbed], components: [row, row2] });
    }
};