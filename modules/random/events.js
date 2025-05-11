var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient(); // Module-scoped API client
const { MessageActionRow, MessageButton, MessageEmbed, Modal, TextInputComponent } = require('discord.js'); // Added Modal, TextInputComponent

// Module-scoped logger, initialized in register_handlers
var logger;

// Helper function to format seconds into a human-readable string
function formatDuration(totalSeconds) {
    if (totalSeconds <= 0) return "0 seconds";

    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    totalSeconds %= (24 * 60 * 60);
    const hours = Math.floor(totalSeconds / (60 * 60));
    totalSeconds %= (60 * 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60); // Ensure seconds is an integer

    const parts = [];
    if (days > 0) parts.push(days + " " + (days === 1 ? "day" : "days"));
    if (hours > 0) parts.push(hours + " " + (hours === 1 ? "hour" : "hours"));
    if (minutes > 0) parts.push(minutes + " " + (minutes === 1 ? "minute" : "minutes"));
    if (seconds > 0) parts.push(seconds + " " + (seconds === 1 ? "second" : "seconds"));
    
    if (parts.length === 0) { // This case handles input like 0.5 seconds becoming 0 seconds after floor
        return "0 seconds";
    }
    return parts.join(" ");
}

// Helper function for generating standard voice leaderboards
async function generateVoiceLeaderboard(button, title, options) {
    await button.deferUpdate();
    const { timeFilterDays, mutedFilter, sortOrder } = options; // sortOrder: 'top' or 'bottom'
    const guildId = button.guild.id;
    const currentTime = Math.floor(Date.now() / 1000);

    let apiParams = { discord_server_id: guildId };
    let filterStartDate = null;

    if (timeFilterDays) {
        filterStartDate = currentTime - (timeFilterDays * 24 * 60 * 60);
        apiParams._filter = `disconnect_time > ${filterStartDate} OR disconnect_time = 0`;
    }
    if (mutedFilter !== null && mutedFilter !== undefined) {
        apiParams.selfmute = String(mutedFilter);
    }

    let voiceTrackings;
    try {
        const resp = await api.get("voice_tracking", apiParams);
        voiceTrackings = resp.voice_trackings || [];
    } catch (error) {
        logger.error(`API error fetching voice_tracking for ${title}: ${error.message || error}`);
        await button.editReply({ content: "Error fetching voice data.", embeds: [], components: [] });
        return;
    }

    if (voiceTrackings.length === 0) {
        await button.editReply({ content: "No data available for the selected filters.", embeds: [], components: [] });
        return;
    }

    const totalTimeByUser = new Map(); // Map<user_id, total_seconds>

    for (const track of voiceTrackings) {
        let connectTime = parseInt(track.connect_time, 10);
        let disconnectTime = parseInt(track.disconnect_time, 10);

        if (isNaN(connectTime)) {
            logger.warn(`Skipping track with invalid connect_time: ${JSON.stringify(track)}`);
            continue;
        }
        if (disconnectTime === 0 || isNaN(disconnectTime)) {
            disconnectTime = currentTime;
        }

        let effectiveConnectTime = connectTime;
        let effectiveDisconnectTime = disconnectTime;

        if (filterStartDate) {
            effectiveConnectTime = Math.max(connectTime, filterStartDate);
            if (effectiveDisconnectTime <= filterStartDate || effectiveConnectTime >= effectiveDisconnectTime) {
                continue;
            }
        }
        
        const duration = Math.max(0, Math.floor(effectiveDisconnectTime - effectiveConnectTime));

        if (duration > 0 && track.user_id) {
            totalTimeByUser.set(track.user_id, (totalTimeByUser.get(track.user_id) || 0) + duration);
        }
    }

    if (totalTimeByUser.size === 0) {
        await button.editReply({ content: "No user voice time data to display after filtering.", embeds: [], components: [] });
        return;
    }

    let sortedUsers = [...totalTimeByUser.entries()];
    if (sortOrder === 'top') {
        sortedUsers.sort((a, b) => b[1] - a[1]);
    } else { // 'bottom'
        sortedUsers.sort((a, b) => a[1] - b[1]);
    }
    sortedUsers = sortedUsers.slice(0, 10);

    const listEmbed = new MessageEmbed().setColor("#c586b6").setTitle(title);

    if (sortedUsers.length === 0) {
        listEmbed.setDescription("No users to display on the leaderboard for these filters.");
    } else {
        for (let i = 0; i < sortedUsers.length; i++) {
            const [userId, totalSeconds] = sortedUsers[i];
            let userName = `User ID: ${userId}`;
            try {
                const member = await button.guild.members.fetch(userId);
                if (member) userName = member.displayName;
            } catch (err) {
                logger.warn(`Could not fetch member ${userId} for ${title} leaderboard: ${err.message}`);
            }
            listEmbed.addField(`${i + 1}. ${userName}`, formatDuration(totalSeconds));
        }
    }
    
    const updatedComponents = button.message.components.map(row => {
        const newRow = new MessageActionRow();
        row.components.forEach(comp => {
            const newComp = new MessageButton(comp);
            newComp.setDisabled(comp.customId === button.customId);
            newRow.addComponents(newComp);
        });
        return newRow;
    });

    await button.editReply({ embeds: [listEmbed], components: updatedComponents });
    logger.info(`Sent Voice Leaderboard: ${title}`);
}

// NEW: Handler for GAME_ button interactions
async function handleGameButton(buttonInteraction, logger, localApi) {
    const customId = buttonInteraction.customId;
    const parts = customId.split('-'); 
    if (parts.length < 2) {
        logger.warn(`[GAME_BTN] Invalid customId format: ${customId}`);
        await buttonInteraction.reply({ content: "Invalid button action.", ephemeral: true });
        return;
    }

    const fullAction = parts[0]; 
    const gameIdString = parts[1]; // gameId is a string initially    
    const gameId = Number(gameIdString); // Convert to number
    if (isNaN(gameId)) {
        logger.warn(`[GAME_BTN] Invalid gameId (not a number): ${gameIdString}`);
        await buttonInteraction.reply({ content: "Invalid game ID in button.", ephemeral: true });
        return;
    }
    const userId = buttonInteraction.user.id;

    const actionPrefix = "GAME_";
    if (!fullAction.startsWith(actionPrefix)) {
        logger.warn(`[GAME_BTN] Invalid action prefix: ${fullAction}`);
        await buttonInteraction.reply({ content: "Invalid button action.", ephemeral: true });
        return;
    }
    const actionKey = fullAction.substring(actionPrefix.length);

    let gameDetails;
    try {
        const resp = await localApi.get("game_joining_master", { game_id: gameId });
        if (resp && resp.game_joining_masters && resp.game_joining_masters[0]) {
            gameDetails = resp.game_joining_masters[0];
        } else {
            logger.warn(`[GAME_BTN] Game not found: ${gameId} for action ${actionKey}. Button message will be updated.`);
            await buttonInteraction.update({ content: "This game session no longer exists or could not be found.", embeds: [], components: [] });
            return;
        }
    } catch (error) {
        logger.error(`[GAME_BTN] API error fetching game ${gameId}: ${error.message || error}`);
        await buttonInteraction.reply({ content: "Error fetching game details. Please try again.", ephemeral: true });
        return;
    }

    logger.info(`[GAME_BTN] Processing action '${actionKey}' for game ${gameId}. Host: ${userId}. Game Details: Status='${gameDetails.status}', NumTeams='${gameDetails.num_teams}', MaxPlayers='${gameDetails.max_players_per_team}'`);

    const isHost = (gameDetails.host_id === userId);

    switch (actionKey) {
        case "JOIN":
            try {
                await buttonInteraction.deferReply({ ephemeral: true });
                const currentLobbyState = await localApi.get("game_joining_master", { game_id: gameId });
                if (!currentLobbyState || !currentLobbyState.game_joining_masters || !currentLobbyState.game_joining_masters[0]) {
                    await buttonInteraction.editReply({ content: "Game not found." });
                    return;
                }
                const freshGameDetails = currentLobbyState.game_joining_masters[0];

                if (freshGameDetails.status !== 'setup' && freshGameDetails.status !== 'lobby_configured') {
                    await buttonInteraction.editReply({ content: "This game is not currently accepting new players." });
                    return;
                }

                await localApi.post("game_joining_player", { game_id: gameId, player_id: userId });
                await buttonInteraction.editReply({ content: `You have joined game ${gameId}!` });
                logger.info(`[GAME_BTN] Player ${userId} joined game ${gameId}`);
            } catch (error) {
                logger.error(`[GAME_BTN] Error joining game ${gameId} for ${userId}: ${error.message || error}`);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    await buttonInteraction.reply({ content: "Could not join the game due to an error.", ephemeral: true });
                } else {
                    await buttonInteraction.editReply({ content: "Could not join the game due to an error." });
                }
            }
            break;

        case "LEAVE":
            try {
                await buttonInteraction.deferReply({ ephemeral: true });
                const playerResp = await localApi.get("game_joining_player", { game_id: gameId, player_id: userId, _limit: 1 });
                if (playerResp && playerResp.game_joining_players && playerResp.game_joining_players[0]) {
                    const gamePlayerId = playerResp.game_joining_players[0].game_player_id;
                    await localApi.delete("game_joining_player", { game_player_id: Number(gamePlayerId) });
                    await buttonInteraction.editReply({ content: `You have left game ${gameId}.` });
                    logger.info(`[GAME_BTN] Player ${userId} left game ${gameId}`);
                } else {
                    await buttonInteraction.editReply({ content: "You are not currently in this game or could not be removed." });
                }
            } catch (error) {
                logger.error(`[GAME_BTN] Error leaving game ${gameId} for ${userId}: ${error.message || error}`);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    await buttonInteraction.reply({ content: "Could not leave the game due to an error.", ephemeral: true });
                } else {
                    await buttonInteraction.editReply({ content: "Could not leave the game due to an error." });
                }
            }
            break;

        case "HOST_SETUP_TEAMS":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can set up teams.", ephemeral: true });
                return;
            }
            const modal = new Modal()
                .setCustomId(`GAME_MODAL_SETUP_TEAMS-${gameIdString}`)
                .setTitle(`Team Setup for Game ID: ${gameIdString}`);
            
            const numTeamsInput = new TextInputComponent()
                .setCustomId('numTeams')
                .setLabel("Number of Teams (e.g., 2, 3)")
                .setStyle('SHORT')
                .setRequired(true)
                .setPlaceholder("Enter a number > 1");

            const playersPerTeamInput = new TextInputComponent()
                .setCustomId('playersPerTeam')
                .setLabel("Max Players Per Team (0 for unlimited)")
                .setStyle('SHORT')
                .setRequired(true)
                .setValue(gameDetails.max_players_per_team !== undefined ? String(gameDetails.max_players_per_team) : '0')
                .setPlaceholder("Enter a number >= 0");
            
            const currentNumTeams = gameDetails.num_teams !== undefined ? String(gameDetails.num_teams) : '2';
            if (currentNumTeams !== '0') {
                 numTeamsInput.setValue(currentNumTeams);
            }

            modal.addComponents(
                new MessageActionRow().addComponents(numTeamsInput),
                new MessageActionRow().addComponents(playersPerTeamInput)
            );
            await buttonInteraction.showModal(modal);
            logger.info(`[GAME_BTN] Host ${userId} initiated team setup for game ${gameId}`);
            break;

        case "HOST_MANAGE_PLAYERS":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can manage players.", ephemeral: true });
                return;
            }
            // Add this log:
            logger.info(`[GAME_BTN_MANAGE_PLAYERS] Game ${gameId} details on entry: Status='${gameDetails.status}', NumTeams=${gameDetails.num_teams}`);

            if (gameDetails.status === 'setup' || !gameDetails.num_teams || gameDetails.num_teams === 0) {
                 await buttonInteraction.reply({ content: "Teams need to be configured first. Use 'Setup Teams' / 'Reconfigure Teams'.", ephemeral: true });
                 return;
            }
            try {
                await buttonInteraction.deferReply({ ephemeral: true });
                const playersResp = await localApi.get("game_joining_player", { game_id: gameId, _limit: 100 });
                const playersInLobby = playersResp.game_joining_players || [];

                if (playersInLobby.length === 0) {
                    await buttonInteraction.editReply({ content: "No players currently in the lobby to manage.", components: [] });
                    return;
                }

                const embed = new MessageEmbed()
                    .setTitle(`Manage Players for Game ${gameId}`)
                    .setColor("#c586b6")
                    .setDescription("Assign players to teams. This is a basic interface.");

                let unassignedPlayersDescription = "**Unassigned Players:**\n";
                const unassignedPlayers = [];
                const teamPlayers = new Array(gameDetails.num_teams).fill(null).map(() => []);

                for (const player of playersInLobby) {
                    const member = await buttonInteraction.guild.members.fetch(player.player_id).catch(() => null);
                    const playerName = member ? member.displayName : `User ID: ${player.player_id}`;
                    if (player.team_id && player.team_id > 0 && player.team_id <= gameDetails.num_teams) {
                        teamPlayers[player.team_id - 1].push(playerName);
                    } else {
                        unassignedPlayers.push({ id: player.player_id, name: playerName, game_player_id: player.game_player_id });
                        unassignedPlayersDescription += `${playerName}\n`;
                    }
                }
                if (unassignedPlayers.length === 0) {
                    unassignedPlayersDescription = "**All players are currently assigned to a team.**\n";
                }
                embed.addField("Lobby Status", unassignedPlayersDescription);

                for (let i = 0; i < gameDetails.num_teams; i++) {
                    let teamDescription = `**Team ${i + 1} Players:**\n`;
                    if (teamPlayers[i].length > 0) {
                        teamPlayers[i].forEach(name => teamDescription += `${name}\n`);
                    } else {
                        teamDescription += "No players assigned yet.\n";
                    }
                    embed.addField(`Team ${i + 1}`, teamDescription, true);
                }

                const components = [];
                if (unassignedPlayers.length > 0 || playersInLobby.length > 0) {
                    const assignPlayerRow = new MessageActionRow();
                    assignPlayerRow.addComponents(
                        new MessageButton()
                            .setCustomId(`GAME_HOST_ASSIGN_PLAYER_MODAL-${gameIdString}`)
                            .setLabel('Assign/Move Player')
                            .setStyle('PRIMARY')
                    );
                    components.push(assignPlayerRow);
                }

                await buttonInteraction.editReply({ embeds: [embed], components: components.length > 0 ? components : [] });
                logger.info(`[GAME_BTN] Host ${userId} accessed manage players for game ${gameId}`);

            } catch (error) {
                logger.error(`[GAME_BTN] Error managing players for game ${gameId}: ${error.message || error}`);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    await buttonInteraction.reply({ content: "Error loading player management.", ephemeral: true });
                } else {
                    await buttonInteraction.editReply({ content: "Error loading player management." });
                }
            }
            break;

        case "HOST_VOICE_CONTROL":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can control voice channels.", ephemeral: true });
                return;
            }

            const deployDisabled = gameDetails.status !== 'lobby_configured' || !gameDetails.num_teams || gameDetails.num_teams === 0;
            let deployButtonLabel = "Move Teams to VCs";
            if (deployDisabled) {
                deployButtonLabel += " (Setup Teams First)";
            }
            
            const voiceControlRow = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId(`GAME_HOST_VOICE_PULL_ALL-${gameIdString}`)
                        .setLabel("Pull All to Start VC")
                        .setStyle("SECONDARY"),
                    new MessageButton()
                        .setCustomId(`GAME_HOST_VOICE_DEPLOY_TEAMS-${gameIdString}`)
                        .setLabel(deployButtonLabel)
                        .setStyle("SUCCESS")
                        .setDisabled(deployDisabled)
                );
            
            await buttonInteraction.reply({
                content: `Voice Controls for Game ${gameId}:`,
                components: [voiceControlRow],
                ephemeral: true
            });
            logger.info(`[GAME_BTN] Host ${userId} accessed voice controls for game ${gameId}`);
            break;

        case "HOST_ASSIGN_PLAYER_MODAL":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can assign players.", ephemeral: true });
                return;
            }
            if (gameDetails.status === 'setup' || !gameDetails.num_teams || gameDetails.num_teams === 0) {
                await buttonInteraction.reply({ content: "Teams need to be configured first before assigning players. Use 'Setup Teams'.", ephemeral: true });
                return;
            }

            const assignModal = new Modal()
                .setCustomId(`GAME_MODAL_SUBMIT_ASSIGN_PLAYER-${gameIdString}`)
                .setTitle(`Assign Player - Game ${gameId}`);

            const playerInput = new TextInputComponent()
                .setCustomId('playerToAssign')
                .setLabel("User ID or @Mention of Player")
                .setPlaceholder("Enter User ID or mention the player")
                .setStyle('SHORT')
                .setRequired(true);

            const teamInput = new TextInputComponent()
                .setCustomId('teamIdToAssign')
                .setLabel(`Team Number (1-${gameDetails.num_teams}, or 0 to unassign)`)
                .setPlaceholder(`Enter a team number, or 0`)
                .setStyle('SHORT')
                .setRequired(true);
            
            assignModal.addComponents(
                new MessageActionRow().addComponents(playerInput),
                new MessageActionRow().addComponents(teamInput)
            );

            await buttonInteraction.showModal(assignModal);
            logger.info(`[GAME_BTN] Host ${userId} opened assign player modal for game ${gameId}`);
            break;

        case "HOST_VOICE_DEPLOY_TEAMS":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can do this.", ephemeral: true });
                return;
            }
            await buttonInteraction.deferReply({ephemeral: true});

            if (gameDetails.status !== 'lobby_configured' || !gameDetails.num_teams || gameDetails.num_teams === 0) {
                await buttonInteraction.editReply({ content: "Teams must be configured and players assigned before deploying to voice channels." });
                return;
            }

            try {
                const playersResp = await localApi.get("game_joining_player", { game_id: gameId, _filter: "team_id IS NOT NULL AND team_id > 0", _limit: 100 });
                const playersToMove = playersResp.game_joining_players || [];

                if (playersToMove.length === 0) {
                    await buttonInteraction.editReply({ content: "No players assigned to teams to move." });
                    return;
                }

                let movedCount = 0;
                let failedCount = 0;
                let channelsNotFound = new Set();

                const teamVoiceChannelIds = []; 
                for (let i = 1; i <= gameDetails.num_teams; i++) {
                    const channelName = `Team ${i}`;
                    const voiceChannel = buttonInteraction.guild.channels.cache.find(ch => ch.name === channelName && ch.type === 'GUILD_VOICE');
                    if (voiceChannel) {
                        teamVoiceChannelIds[i-1] = voiceChannel.id;
                    } else {
                        channelsNotFound.add(channelName);
                        teamVoiceChannelIds[i-1] = null; // Mark as not found
                    }
                }

                if (channelsNotFound.size > 0) {
                    await buttonInteraction.editReply({ content: `Could not find voice channels for: ${[...channelsNotFound].join(', ')}. Please create them or configure them.` });
                    return;
                }

                for (const player of playersToMove) {
                    if (!player.team_id || player.team_id <= 0 || player.team_id > gameDetails.num_teams) {
                        logger.warn(`[GAME_VOICE_DEPLOY] Player ${player.player_id} has invalid team_id ${player.team_id}`);
                        failedCount++;
                        continue;
                    }
                    const targetChannelId = teamVoiceChannelIds[player.team_id - 1];
                    if (!targetChannelId) {
                        logger.warn(`[GAME_VOICE_DEPLOY] No channel configured for Team ${player.team_id} for player ${player.player_id}`);
                        failedCount++; 
                        continue;
                    }

                    try {
                        const member = await buttonInteraction.guild.members.fetch(player.player_id);
                        if (member && member.voice && member.voice.channelId && member.voice.channelId !== targetChannelId) {
                            await member.voice.setChannel(targetChannelId);
                            movedCount++;
                        } else if (member && member.voice && member.voice.channelId === targetChannelId) {
                            movedCount++; 
                        } else if (member && !member.voice.channelId){
                            logger.info(`[GAME_VOICE_DEPLOY] Player ${player.player_id} not in a voice channel.`);
                            failedCount++;
                        }
                    } catch (moveError) {
                        failedCount++;
                        logger.warn(`[GAME_VOICE_DEPLOY] Failed to move player ${player.player_id} to channel for Team ${player.team_id}: ${moveError.message}`);
                    }
                }
                await buttonInteraction.editReply({ content: `Attempted to move players to team channels. Moved: ${movedCount}, Failed/Skipped: ${failedCount}.`});
                logger.info(`[GAME_VOICE_DEPLOY] Host ${userId} deployed teams for game ${gameId}. Moved: ${movedCount}, Failed: ${failedCount}`);
            } catch (error) {
                logger.error(`[GAME_VOICE_DEPLOY] Error deploying teams for game ${gameId}: ${error.message || error}`);
                await buttonInteraction.editReply({ content: "An error occurred while trying to move players to team channels."});
            }
            break;

        case "HOST_END":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can end the game.", ephemeral: true });
                return;
            }
            try {
                await buttonInteraction.deferUpdate();
                const playersListResp = await localApi.get("game_joining_player", {
                    game_id: gameId,
                    _limit: 500
                });

                let deletedPlayersCount = 0;
                if (playersListResp && playersListResp.game_joining_players) {
                    for (const player of playersListResp.game_joining_players) {
                        try {
                            if (player.game_player_id) {
                                await localApi.delete("game_joining_player", {
                                    game_player_id: Number(player.game_player_id)
                                });
                                deletedPlayersCount++;
                            }
                        } catch (playerDeleteError) {
                            logger.error(`[GAME_BTN_END] Failed to delete player ${player.player_id} (game_player_id: ${player.game_player_id}) from game ${gameId}: ${playerDeleteError.message || playerDeleteError}`);
                        }
                    }
                }
                logger.info(`[GAME_BTN_END] Deleted ${deletedPlayersCount} players from game ${gameId}.`);

                await localApi.delete("game_joining_master", { game_id: Number(gameId) });
                logger.info(`[GAME_BTN_END] Deleted game master record for game ${gameId}.`);

                const endedEmbed = new MessageEmbed()
                    .setColor("#c586b6")
                    .setTitle(`Game ID: ${gameId} - Ended`)
                    .setDescription(`This game session was ended by the host (${buttonInteraction.user.tag}).`)
                    .setTimestamp();
                await buttonInteraction.editReply({ content: `Game ${gameId} has been ended.`, embeds: [endedEmbed], components: [] });
                logger.info(`[GAME_BTN] Host ${userId} ended game ${gameId}. Players deleted: ${deletedPlayersCount}.`);

            } catch (error) {
                logger.error(`[GAME_BTN_END] Error ending game ${gameId} for host ${userId}: ${error.message || error}`);
                await buttonInteraction.editReply({ content: "An error occurred while trying to end the game. Some cleanup may have failed. Please check logs.", components: [] });
            }
            break;

        default:
            logger.warn(`[GAME_BTN] Unknown game actionKey: ${actionKey} for game ${gameId}`);
            await buttonInteraction.reply({ content: "Unknown game action.", ephemeral: true });
    }
}

// NEW: Handler for GAME_MODAL_SETUP_TEAMS modal submission
async function handleGameSetupTeamsModal(modalInteraction, logger, localApi) {
    const customId = modalInteraction.customId;
    const gameIdString = customId.split('-')[1];
    const gameId = Number(gameIdString); // Convert to number
    if (isNaN(gameId)) {
        logger.warn(`[GAME_MODAL] Invalid gameId (not a number): ${gameIdString}`);
        await modalInteraction.followUp({ content: "Invalid game ID in modal.", ephemeral: true });
        return;
    }
    const userId = modalInteraction.user.id;

    try {
        await modalInteraction.deferUpdate();

        const numTeamsStr = modalInteraction.fields.getTextInputValue('numTeams');
        const playersPerTeamStr = modalInteraction.fields.getTextInputValue('playersPerTeam');

        const numTeams = parseInt(numTeamsStr, 10);
        const playersPerTeam = parseInt(playersPerTeamStr, 10);

        if (isNaN(numTeams) || numTeams <= 0) {
            await modalInteraction.followUp({ content: "Invalid number of teams. Must be a number greater than 0.", ephemeral: true });
            return;
        }
        if (isNaN(playersPerTeam) || playersPerTeam < 0) {
            await modalInteraction.followUp({ content: "Invalid max players per team. Must be a number (0 for unlimited).", ephemeral: true });
            return;
        }

        const gameResp = await localApi.get("game_joining_master", { game_id: gameId });
        if (!gameResp || !gameResp.game_joining_masters || !gameResp.game_joining_masters[0]) {
            logger.warn(`[GAME_MODAL] Game ${gameId} not found during modal submission.`);
            await modalInteraction.followUp({ content: "Game not found. Cannot update team settings.", ephemeral: true});
            return;
        }
        const gameDetails = gameResp.game_joining_masters[0];

        if (gameDetails.host_id !== userId) {
            logger.warn(`[GAME_MODAL] Non-host ${userId} tried to submit team setup for game ${gameId}`);
            await modalInteraction.followUp({ content: "You are not the host of this game.", ephemeral: true });
            return;
        }

        await localApi.put("game_joining_master", { 
            game_id: gameId,
            num_teams: numTeams,
            max_players_per_team: playersPerTeam,
            status: 'lobby_configured'
        });
        logger.info(`[GAME_MODAL] Host ${userId} configured teams for game ${gameId}: ${numTeams} teams, ${playersPerTeam} players/team.`);

        const originalMessage = modalInteraction.message;
        if (originalMessage) {
            const updatedEmbed = new MessageEmbed(originalMessage.embeds[0])
                .spliceFields(1, 1, { name: "Host Actions", value: `Teams: ${numTeams}, Max Players/Team: ${playersPerTeam === 0 ? 'Unlimited' : playersPerTeam}. Use 'Manage Players' to assign.`})
                .setFooter({ text: "Team setup complete. 'Manage Players' is now available."});
            
            const currentComponents = originalMessage.components.map(row => new MessageActionRow(row));

            currentComponents.forEach(row => {
                row.components.forEach(comp => {
                    if (comp.customId === `GAME_HOST_MANAGE_PLAYERS-${gameIdString}`) {
                        comp.setDisabled(false);
                    }
                    if (comp.customId === `GAME_HOST_SETUP_TEAMS-${gameIdString}`) {
                        comp.setLabel('Reconfigure Teams');
                    }
                    if (comp.customId === `GAME_HOST_VOICE_CONTROL-${gameIdString}`) {
                        comp.setDisabled(false);
                    }
                });
            });
            await originalMessage.edit({ embeds: [updatedEmbed], components: currentComponents });
        }

    } catch (error) {
        logger.error(`[GAME_MODAL] Error processing team setup for game ${gameId} by ${userId}: ${error.message || error}`);
        await modalInteraction.followUp({ content: "An error occurred while setting up teams. Please try again.", ephemeral: true });
    }
}

// NEW: Placeholder for Assign Player Modal Handler
async function handleAssignPlayerModal(modalInteraction, logger, localApi) {
    const customId = modalInteraction.customId; // GAME_MODAL_SUBMIT_ASSIGN_PLAYER-<gameId>
    const gameIdString = customId.split('-')[1];
    const gameId = Number(gameIdString);
    const hostId = modalInteraction.user.id;

    try {
        await modalInteraction.deferReply({ ephemeral: true });

        const playerIdToAssign = modalInteraction.fields.getTextInputValue('playerToAssign');
        const teamIdToAssignTo = parseInt(modalInteraction.fields.getTextInputValue('teamIdToAssign'), 10);

        if (!playerIdToAssign || isNaN(teamIdToAssignTo) || teamIdToAssignTo <= 0) {
            await modalInteraction.editReply({ content: "Invalid player ID or team ID provided." });
            return;
        }

        const gameResp = await localApi.get("game_joining_master", { game_id: gameId });
        if (!gameResp || !gameResp.game_joining_masters || !gameResp.game_joining_masters[0] || gameResp.game_joining_masters[0].host_id !== hostId) {
            await modalInteraction.editReply({ content: "You are not authorized to perform this action or game not found." });
            return;
        }
        const gameDetails = gameResp.game_joining_masters[0];
        if (teamIdToAssignTo > gameDetails.num_teams) {
             await modalInteraction.editReply({ content: `Invalid Team ID. This game only has ${gameDetails.num_teams} teams.` });
            return;
        }

        const playerResp = await localApi.get("game_joining_player", { game_id: gameId, player_id: playerIdToAssign, _limit: 1 });
        if (!playerResp || !playerResp.game_joining_players || !playerResp.game_joining_players[0]) {
            await modalInteraction.editReply({ content: `Player ${playerIdToAssign} not found in this game lobby.` });
            return;
        }
        const gamePlayerId = playerResp.game_joining_players[0].game_player_id;

        await localApi.put("game_joining_player", { 
            game_player_id: Number(gamePlayerId),
            team_id: teamIdToAssignTo
        });

        logger.info(`[GAME_ASSIGN_MODAL] Host ${hostId} assigned player ${playerIdToAssign} (gp_id: ${gamePlayerId}) to team ${teamIdToAssignTo} in game ${gameId}.`);
        await modalInteraction.editReply({ content: `Successfully assigned player to Team ${teamIdToAssignTo}. Click 'Manage Players' again to see updates.` });

    } catch (error) {
        logger.error(`[GAME_ASSIGN_MODAL] Error assigning player in game ${gameId}: ${error.message || error}`);
        await modalInteraction.editReply({ content: "An error occurred while assigning the player." });
    }
}

// Modified to handle different interaction types (buttons, modals)
async function onInteractionCreate(interaction) {
    if (interaction.isButton()) {
        const buttonInteraction = interaction;
        const guildId = buttonInteraction.guild ? buttonInteraction.guild.id : null; 

        if (buttonInteraction.customId.startsWith("VOICE_CLEANUP_CONFIRM_")) {
            await buttonInteraction.deferUpdate();
            const targetGuildId = buttonInteraction.customId.split('_').pop();
            if (targetGuildId !== guildId) {
                logger.warn(`[BTN_CLEANUP_CONFIRM] Guild ID mismatch: button.customId=${buttonInteraction.customId}, interaction.guild.id=${guildId}`);
                await buttonInteraction.editReply({ content: "Error: Guild ID mismatch. Cannot perform cleanup.", components: [] });
                return;
            }
            try {
                logger.info(`[BTN_CLEANUP_CONFIRM] Attempting to delete all voice data for guild ${targetGuildId}. Fetching records...`);
                
                const recordsToDeleteResp = await api.get("voice_tracking", {
                    discord_server_id: targetGuildId,
                    _limit: 10000000
                });

                const records = recordsToDeleteResp.voice_trackings || [];
                const recordsWithId = records.filter(session => session.voice_state_id);
                const recordsWithoutIdCount = records.length - recordsWithId.length;

                logger.info(`[BTN_CLEANUP_CONFIRM] Found ${records.length} total voice tracking records for guild ${targetGuildId}.`);
                logger.info(`[BTN_CLEANUP_CONFIRM] ${recordsWithId.length} records have a voice_state_id and will be targeted for deletion.`);
                if (recordsWithoutIdCount > 0) { logger.warn(`[BTN_CLEANUP_CONFIRM] ${recordsWithoutIdCount} records are missing a voice_state_id and cannot be deleted by this process.`); }

                if (recordsWithId.length === 0) {
                    let noRecordsMessage = `No voice session records with an ID found to delete for guild ${targetGuildId}.`;
                    if (recordsWithoutIdCount > 0) noRecordsMessage += ` ${recordsWithoutIdCount} records were found without an ID.`;
                    await buttonInteraction.editReply({ content: noRecordsMessage, components: [] });
                    return;
                }
                await buttonInteraction.editReply({ content: `Found ${recordsWithId.length} voice session record(s) for guild ${targetGuildId}. Attempting to delete them in batches... (this may take a moment)`, components: [] });

                let deletedCount = 0;
                let failedCount = 0;
                const chunkSize = 100; 

                for (let i = 0; i < recordsWithId.length; i += chunkSize) {
                    const chunk = recordsWithId.slice(i, i + chunkSize);
                    for (const record of chunk) {
                        try {
                            await api.delete("voice_tracking", { voice_state_id: record.voice_state_id });
                            deletedCount++;
                        } catch (delError) {
                            failedCount++;
                            logger.error(`[BTN_CLEANUP_CONFIRM] Failed to delete voice_state_id ${record.voice_state_id}: ${delError.message || delError}`);
                        }
                    }
                }
                let replyMessage = `Voice data cleanup for guild ${targetGuildId} process finished. `;
                if (deletedCount > 0) replyMessage += `Successfully deleted ${deletedCount} record(s). `;
                if (failedCount > 0) replyMessage += `${failedCount} record(s) failed to delete. `;
                if (deletedCount === 0 && failedCount === 0 && recordsWithId.length > 0) replyMessage += "No records were deleted, though some were targeted. This might indicate an issue. ";
                if (recordsWithoutIdCount > 0) replyMessage += `${recordsWithoutIdCount} record(s) were skipped as they lacked an ID. `;
                if (deletedCount === 0 && failedCount === 0 && recordsWithId.length === 0 && recordsWithoutIdCount === 0) replyMessage = "No voice data found to cleanup. ";
                replyMessage += "Please check logs for more details if needed.";

                logger.info(`[BTN_CLEANUP_CONFIRM] ${replyMessage}`);
                await buttonInteraction.editReply({ content: replyMessage, components: [] });

            } catch (error) {
                logger.error(`[BTN_CLEANUP_CONFIRM] API error during voice data cleanup for guild ${targetGuildId}: ${error.message || error}`);
                let errorMessage = "An error occurred while trying to delete voice data. ";
                if (error.response && error.response.data && typeof error.response.data === 'string') {
                    errorMessage += `API Response: ${error.response.data.substring(0, 1000)}. `;
                } else if (error.response && error.response.data) {
                     errorMessage += "Check logs for API response details. ";
                }
                errorMessage += "Please check the logs.";
                await buttonInteraction.editReply({ content: errorMessage, components: [] });
            }
            return;

        } else if (buttonInteraction.customId.startsWith("VOICE_CLEANUP_CANCEL_")) {
            await buttonInteraction.deferUpdate();
            logger.info(`[BTN_CLEANUP_CANCEL] Voice data cleanup cancelled for guild ${guildId}`);
            await buttonInteraction.editReply({ content: "Voice data cleanup has been cancelled.", components: [] });
            return;

        } else if (buttonInteraction.customId.startsWith("VOICE_FIX_ALL_")) {
            logger.warn(`[BTN_FIX_ALL] VOICE_FIX_ALL button pressed by ${buttonInteraction.user.tag} in guild ${guildId} - Not Implemented.`);
            await buttonInteraction.reply({ content: "This feature is not yet implemented.", ephemeral: true});
            return;

        } else if (buttonInteraction.customId.startsWith("GAME_")) {
            await handleGameButton(buttonInteraction, logger, api);
            return;

        } else if (buttonInteraction.customId.startsWith("VOICE")) {
            const commandName = buttonInteraction.customId.substring("VOICE".length);
            switch (commandName) {
                case "bottom":
                    await generateVoiceLeaderboard(buttonInteraction, 'Least Voice Users (All Time)', { sortOrder: 'bottom' });
                    break;
                case "top":
                    await generateVoiceLeaderboard(buttonInteraction, 'Top Voice Users (All Time)', { sortOrder: 'top' });
                    break;
                case "muted":
                    await generateVoiceLeaderboard(buttonInteraction, 'Top Muted Voice Users (All Time)', { mutedFilter: true, sortOrder: 'top' });
                    break;
                case "non-muted":
                    await generateVoiceLeaderboard(buttonInteraction, 'Top Non-Muted Voice Users (All Time)', { mutedFilter: false, sortOrder: 'top' });
                    break;
                case "30days":
                    await generateVoiceLeaderboard(buttonInteraction, 'Top Voice Users (Last 30 Days)', { timeFilterDays: 30, sortOrder: 'top' });
                    break;
                case "7days":
                    await generateVoiceLeaderboard(buttonInteraction, 'Top Voice Users (Last 7 Days)', { timeFilterDays: 7, sortOrder: 'top' });
                    break;
                default:
                    logger.warn(`Unknown VOICE leaderboard command: ${commandName}`);
                    if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                        await buttonInteraction.reply({ content: "Unknown voice leaderboard action.", ephemeral: true });
                    }
                    break;
            }
            return;
        }

    } else if (interaction.isModalSubmit()) {
        const modalInteraction = interaction;
        if (modalInteraction.customId.startsWith("GAME_MODAL_SETUP_TEAMS-")) {
            await handleGameSetupTeamsModal(modalInteraction, logger, api);
        } else if (modalInteraction.customId.startsWith("GAME_MODAL_ASSIGN_PLAYER-")) {
            await handleAssignPlayerModal(modalInteraction, logger, api);
        }
    }
}

async function userJoinsVoice(oldState, newState) {
    const userId = newState.id;
    const guildId = newState.guild.id;
    const member = newState.member;

    if (!member) {
        logger.warn(`[VSU] Member not found for user ID ${userId} in guild ${guildId}. Skipping voice state update.`);
        return;
    }
    const username = member.user.username;
    const newChannelId = newState.channelId;
    const currentTime = Math.floor(Date.now() / 1000);
    const isNewChannelAfk = newChannelId === newState.guild.afkChannelId;
    const newMuteState = String(newState.selfMute);

    let sessionToPotentiallyKeepId = null;

    try {
        const openSessionsResp = await api.get("voice_tracking", {
            user_id: userId,
            discord_server_id: guildId,
            disconnect_time: 0,
        });

        if (openSessionsResp && openSessionsResp.voice_trackings && openSessionsResp.voice_trackings.length > 0) {
            if (newChannelId && !isNewChannelAfk) {
                for (const session of openSessionsResp.voice_trackings) {
                    if (session.channel_id === newChannelId && String(session.selfmute) === newMuteState) {
                        sessionToPotentiallyKeepId = session.voice_state_id;
                        logger.info(`[VSU] Identified session ${session.voice_state_id} for ${username} (${userId}) in ch ${newChannelId} (mute: ${newMuteState}) as potentially current.`);
                        break;
                    }
                }
            }

            for (const session of openSessionsResp.voice_trackings) {
                let closeReason = null;

                if (session.voice_state_id === sessionToPotentiallyKeepId) {
                    logger.info(`[VSU] Session ${session.voice_state_id} for ${username} (${userId}) matches new state, will not be closed by this pass.`);
                    continue;
                }

                if (!newChannelId || isNewChannelAfk) {
                    closeReason = "User left all voice channels or went AFK";
                } else {
                    closeReason = `User in new state (ch: ${newChannelId}, mute: ${newMuteState}), this session (id: ${session.voice_state_id}, ch: ${session.channel_id}, mute: ${session.selfmute}) is outdated/duplicate.`;
                }
                
                if (closeReason) {
                    const originalConnectTime = parseInt(session.connect_time, 10);
                    let calculatedDisconnectTime = currentTime;

                    if (!isNaN(originalConnectTime)) {
                        const oneHourAfterConnect = originalConnectTime + 3600;
                        calculatedDisconnectTime = Math.min(oneHourAfterConnect, currentTime);
                    } else {
                        logger.warn(`[VSU] Session ${session.voice_state_id} for user ${userId} had an invalid connect_time: ${session.connect_time}. Using current time for disconnect.`);
                    }
                    
                    logger.info(`[VSU] Closing session ${session.voice_state_id} for ${username} (${userId}). Reason: ${closeReason}. Setting disconnect_time to ${calculatedDisconnectTime}.`);
                    await api.put("voice_tracking", {
                        voice_state_id: parseInt(session.voice_state_id, 10),
                        disconnect_time: calculatedDisconnectTime,
                    });
                }
            }
        }
    } catch (error) {
        logger.error(`[VSU] Error during cleanup/processing of old voice sessions for ${username} (${userId}): ${error.message || error}`);
    }

    if (newChannelId && !isNewChannelAfk) {
        if (sessionToPotentiallyKeepId) {
            logger.info(`[VSU] User ${username} (${userId}) already has an active session ${sessionToPotentiallyKeepId} matching new state in ch ${newChannelId}. No new session needed.`);
        } else {
            logger.info(`[VSU] Creating new voice session for ${username} (${userId}) in channel ${newChannelId}. Muted: ${newMuteState}`);
            try {
                await api.post("voice_tracking", {
                    user_id: userId,
                    username: username,
                    discord_server_id: guildId,
                    connect_time: currentTime,
                    selfmute: newMuteState,
                    channel_id: newChannelId,
                    disconnect_time: 0,
                });
            } catch (error) {
                logger.error(`[VSU] Error creating new voice_tracking session for ${username} (${userId}): ${error.message || error}`);
            }
        }
    }
}

function register_handlers(event_registry) {
    logger = event_registry.logger;

    event_registry.register('voiceStateUpdate', userJoinsVoice);
    event_registry.register('interactionCreate', onInteractionCreate);
}

module.exports = register_handlers;
