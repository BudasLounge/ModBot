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
            message.channel.send({ content: `Found an open game you were hosting (ID: ${oldGameId}). I'll end it before creating a new one.` });

            var respPlayersList;
            try {
                respPlayersList = await api.get("game_joining_player", {
                    game_id: oldGameId,
                    _limit: 500 // Fetch up to 500 players
                });
            } catch (error) {
                this.logger.error(`Failed to get player list for old game ${oldGameId}: ${error.message || error}`);
            }

            if (respPlayersList && respPlayersList.game_joining_players) {
                for (var i = 0; i < respPlayersList.game_joining_players.length; i++) {
                    try {
                        // The GET to fetch individual player before delete is redundant if game_player_id is in respPlayersList
                        // Assuming game_player_id is available directly from the list
                        const playerToDelete = respPlayersList.game_joining_players[i];
                        if (playerToDelete.game_player_id) {
                            await api.delete("game_joining_player", {
                                game_player_id: Number(playerToDelete.game_player_id)
                            });
                        } else {
                            // Fallback if game_player_id is not directly in the list item (should be though)
                            var respTemp = await api.get("game_joining_player", {
                                game_id: oldGameId,
                                player_id: playerToDelete.player_id
                            });
                            if (respTemp && respTemp.game_joining_players && respTemp.game_joining_players[0]) {
                                await api.delete("game_joining_player", {
                                    game_player_id: Number(respTemp.game_joining_players[0].game_player_id)
                                });
                            }
                        }
                    } catch (playerDeleteError) {
                        this.logger.error(`Failed to delete player ${respPlayersList.game_joining_players[i].player_id} from old game ${oldGameId}: ${playerDeleteError.message || playerDeleteError}`);
                    }
                }
            }

            try {
                // Assuming API allows deleting master record by game_id
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
            const newGameData = {
                host_id: String(message.member.id),
                starting_channel_id: String(voiceChannelId),
                status: 'setup', // Initial status: 'setup', 'lobby_configured', 'running', 'ended'
                num_teams: 0,
                max_players: 0 // Default to 0 (unlimited), host needs to configure
            };

            this.logger.info(`Attempting to create game with data: ${JSON.stringify(newGameData)}`);

            newGameResponse = await api.post("game_joining_master", newGameData);
        } catch (error) {
            this.logger.error(`Game creation API call failed: ${error.message || error}`);
            message.channel.send({ content: "Sorry, I couldn't create the game due to an API error." });
            return;
        }

        // Assuming API response for POST is { game_joining_master: { game_id: 'xxx', ... } } or similar
        if (!newGameResponse || !newGameResponse.game_joining_master || !newGameResponse.game_joining_master.game_id) {
            this.logger.error(`Game creation failed or API response malformed: ${JSON.stringify(newGameResponse)}`);
            message.channel.send({ content: "Game creation failed. Please check logs or try again." });
            return;
        }
        const newGameId = newGameResponse.game_joining_master.game_id;

        message.channel.send({ content: `Created a new game (ID: ${newGameId})! Configure it using the menu below.` });
        const gameMenuEmbed = new EmbedBuilder()
            .setColor("#c586b6")
            .setTitle(`Game Menu for ${message.member.displayName}'s Game (ID: ${newGameId})`)
            .setDescription("Use the buttons below to manage your game.")
            .addFields(
                { name: "Player Actions", value: "Players can join or leave the game lobby." },
                { name: "Host Actions", value: "As the host, you can configure teams, manage players, control voice channels, and end the game." }
            )
            .setFooter({ text: "Some host actions are disabled until prerequisites are met (e.g., team setup)." });

        const playerActionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`GAME_JOIN-${newGameId}`)
                    .setLabel('Join Game Lobby')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`GAME_LEAVE-${newGameId}`)
                    .setLabel('Leave Game Lobby')
                    .setStyle(ButtonStyle.Danger),
            );

        const hostSetupRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`GAME_HOST_SETUP_TEAMS-${newGameId}`)
                    .setLabel('Setup Teams')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`GAME_HOST_SET_CAPTAINS-${newGameId}`)
                    .setLabel('Set Captains')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true), // Disabled until teams are configured
                new ButtonBuilder()
                    .setCustomId(`GAME_HOST_MANAGE_PLAYERS-${newGameId}`)
                    .setLabel('Manage Players')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true), // Disabled until teams are configured
            );

        const hostControlRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`GAME_HOST_VOICE_CONTROL-${newGameId}`)
                    .setLabel('Voice Controls')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`GAME_HOST_START_PICKING-${newGameId}`)
                    .setLabel('Start Draft')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true), // Disabled until captains are set
                new ButtonBuilder()
                    .setCustomId(`GAME_HOST_END-${newGameId}`)
                    .setLabel('End Game')
                    .setStyle(ButtonStyle.Danger),
            );

        const captainActionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`GAME_CAPTAIN_PICK-${newGameId}`)
                    .setLabel('🎯 Pick a Player')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true), // Disabled until it's a captain's turn
            );

        message.channel.send({ embeds: [gameMenuEmbed], components: [playerActionRow, hostSetupRow, hostControlRow, captainActionRow] });
    }
};