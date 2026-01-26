var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient(); // Module-scoped API client
const {
    ActionRowBuilder,
    ButtonBuilder,
    ModalBuilder,
    TextInputBuilder,
    EmbedBuilder,
    ButtonStyle,
    TextInputStyle,
    ChannelType,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    PermissionFlagsBits
} = require('discord.js');

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
    const { timeFilterDays, mutedFilter, sortOrder, groupBy, filterUser, aloneTime } = options; // sortOrder: 'top' or 'bottom', groupBy: 'user' or 'channel'
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
    if (filterUser) {
        apiParams.user_id = filterUser;
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

    const totalTimeMap = new Map(); // Map<key, total_seconds>

    if (aloneTime) {
        const sessionsByChannel = new Map();
        for (const track of voiceTrackings) {
            let connectTime = parseInt(track.connect_time, 10);
            let disconnectTime = parseInt(track.disconnect_time, 10);

            if (isNaN(connectTime)) continue;
            if (disconnectTime === 0 || isNaN(disconnectTime)) disconnectTime = currentTime;

            let effectiveConnectTime = connectTime;
            let effectiveDisconnectTime = disconnectTime;

            if (filterStartDate) {
                effectiveConnectTime = Math.max(connectTime, filterStartDate);
                if (effectiveDisconnectTime <= filterStartDate || effectiveConnectTime >= effectiveDisconnectTime) {
                    continue;
                }
            }

            if (!sessionsByChannel.has(track.channel_id)) sessionsByChannel.set(track.channel_id, []);
            sessionsByChannel.get(track.channel_id).push({ user_id: track.user_id, start: effectiveConnectTime, end: effectiveDisconnectTime });
        }

        for (const [channelId, sessions] of sessionsByChannel) {
            const events = [];
            for (const s of sessions) {
                events.push({ time: s.start, type: 'join', user_id: s.user_id });
                events.push({ time: s.end, type: 'leave', user_id: s.user_id });
            }
            events.sort((a, b) => a.time - b.time);

            let activeUsers = new Set();
            let lastTime = events.length > 0 ? events[0].time : 0;

            for (const event of events) {
                const duration = event.time - lastTime;
                if (duration > 0 && activeUsers.size === 1) {
                    const userId = activeUsers.values().next().value;
                    totalTimeMap.set(userId, (totalTimeMap.get(userId) || 0) + duration);
                }

                if (event.type === 'join') {
                    activeUsers.add(event.user_id);
                } else {
                    activeUsers.delete(event.user_id);
                }
                lastTime = event.time;
            }
        }
    } else {
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

            if (duration > 0) {
                const key = groupBy === 'channel' ? track.channel_id : track.user_id;
                if (key) {
                    totalTimeMap.set(key, (totalTimeMap.get(key) || 0) + duration);
                }
            }
        }
    }

    if (totalTimeMap.size === 0) {
        await button.editReply({ content: "No voice time data to display after filtering.", embeds: [], components: [] });
        return;
    }

    let sortedEntries = [...totalTimeMap.entries()];
    if (sortOrder === 'top') {
        sortedEntries.sort((a, b) => b[1] - a[1]);
    } else { // 'bottom'
        sortedEntries.sort((a, b) => a[1] - b[1]);
    }
    sortedEntries = sortedEntries.slice(0, 10);

    const listEmbed = new EmbedBuilder().setColor("#c586b6").setTitle(title);

    if (sortedEntries.length === 0) {
        listEmbed.setDescription("No data to display on the leaderboard for these filters.");
    } else {
        for (let i = 0; i < sortedEntries.length; i++) {
            const [key, totalSeconds] = sortedEntries[i];
            let displayName = `ID: ${key}`;

            if (groupBy === 'channel') {
                const channel = button.guild.channels.cache.get(key);
                if (channel) displayName = channel.name;
                else displayName = `Channel ID: ${key}`;
            } else {
                try {
                    const member = await button.guild.members.fetch(key);
                    if (member) displayName = member.displayName;
                    else displayName = `User ID: ${key}`;
                } catch (err) {
                    logger.warn(`Could not fetch member ${key} for ${title} leaderboard: ${err.message}`);
                }
            }
            listEmbed.addFields({ name: `${i + 1}. ${displayName}`, value: formatDuration(totalSeconds) });
        }
    }

    const updatedComponents = button.message.components.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(comp => {
            const newComp = ButtonBuilder.from(comp);
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

    logger.info(`[GAME_BTN] Processing action '${actionKey}' for game ${gameId}. Host: ${userId}. Game Details: Status='${gameDetails.status}', NumTeams='${gameDetails.num_teams}', MaxPlayers='${gameDetails.max_players}'`);

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
            const modal = new ModalBuilder()
                .setCustomId(`GAME_MODAL_SETUP_TEAMS-${gameIdString}`)
                .setTitle(`Team Setup for Game ID: ${gameIdString}`);

            const numTeamsInput = new TextInputBuilder()
                .setCustomId('numTeams')
                .setLabel("Number of Teams (2-4)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("Enter 2, 3, or 4");

            const playersPerTeamInput = new TextInputBuilder()
                .setCustomId('playersPerTeam')
                .setLabel("Max Players Per Team (0 for unlimited)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(gameDetails.max_players !== undefined ? String(gameDetails.max_players) : '0')
                .setPlaceholder("Enter a number >= 0");

            const pickingModeInput = new TextInputBuilder()
                .setCustomId('pickingMode')
                .setLabel("Picking Mode: 'turns' or 'freeforall'")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue('turns')
                .setPlaceholder("turns = alternating, freeforall = any captain");

            const currentNumTeams = gameDetails.num_teams !== undefined ? String(gameDetails.num_teams) : '2';
            if (currentNumTeams !== '0') {
                numTeamsInput.setValue(currentNumTeams);
            }

            modal.addComponents(
                new ActionRowBuilder().addComponents(numTeamsInput),
                new ActionRowBuilder().addComponents(playersPerTeamInput),
                new ActionRowBuilder().addComponents(pickingModeInput)
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

                const embed = new EmbedBuilder()
                    .setTitle(`Manage Players for Game ${gameId}`)
                    .setColor("#c586b6")
                    .setDescription("Assign players to teams. This is a basic interface.");

                let unassignedPlayersDescription = "**Unassigned Players:**\n";
                const unassignedPlayers = [];
                const teamPlayers = new Array(gameDetails.num_teams).fill(null).map(() => []);

                for (const player of playersInLobby) {
                    const member = await buttonInteraction.guild.members.fetch(player.player_id).catch(() => null);
                    const playerName = member ? member.displayName : `User ID: ${player.player_id}`;
                    const playerTeam = parseInt(player.team, 10);
                    if (!isNaN(playerTeam) && playerTeam > 0 && playerTeam <= gameDetails.num_teams) {
                        teamPlayers[playerTeam - 1].push(playerName);
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
                    const assignPlayerRow = new ActionRowBuilder();
                    assignPlayerRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`GAME_HOST_ASSIGN_PLAYER_MODAL-${gameIdString}`)
                            .setLabel('Assign/Move Player')
                            .setStyle(ButtonStyle.Primary)
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

            const voiceControlRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`GAME_HOST_VOICE_PULL_ALL-${gameIdString}`)
                        .setLabel("Pull All to Start VC")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`GAME_HOST_VOICE_DEPLOY_TEAMS-${gameIdString}`)
                        .setLabel(deployButtonLabel)
                        .setStyle(ButtonStyle.Success)
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

            const assignModal = new ModalBuilder()
                .setCustomId(`GAME_MODAL_SUBMIT_ASSIGN_PLAYER-${gameIdString}`)
                .setTitle(`Assign Player - Game ${gameId}`);

            const playerInput = new TextInputBuilder()
                .setCustomId('playerToAssign')
                .setLabel("User ID or @Mention of Player")
                .setPlaceholder("Enter User ID or mention the player")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const teamInput = new TextInputBuilder()
                .setCustomId('teamIdToAssign')
                .setLabel(`Team Number (1-${gameDetails.num_teams}, or 0 to unassign)`)
                .setPlaceholder(`Enter a team number, or 0`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const playerActionRow = new ActionRowBuilder().addComponents(playerInput);
            const teamActionRow = new ActionRowBuilder().addComponents(teamInput);
            assignModal.addComponents(playerActionRow, teamActionRow);

            await buttonInteraction.showModal(assignModal);
            logger.info(`[GAME_BTN] Host ${userId} opened assign player modal for game ${gameId}`);
            break;

        case "HOST_VOICE_DEPLOY_TEAMS":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can do this.", ephemeral: true });
                return;
            }
            await buttonInteraction.deferReply({ ephemeral: true });

            if (gameDetails.status !== 'lobby_configured' || !gameDetails.num_teams || gameDetails.num_teams === 0) {
                await buttonInteraction.editReply({ content: "Teams must be configured and players assigned before deploying to voice channels." });
                return;
            }

            try {
                const playersResp = await localApi.get("game_joining_player", { game_id: gameId, _filter: "team IS NOT NULL AND team > 0", _limit: 100 });
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
                    const voiceChannel = buttonInteraction.guild.channels.cache.find(ch => ch.name === channelName && ch.type === ChannelType.GuildVoice);
                    if (voiceChannel) {
                        teamVoiceChannelIds[i - 1] = voiceChannel.id;
                    } else {
                        channelsNotFound.add(channelName);
                        teamVoiceChannelIds[i - 1] = null; // Mark as not found
                    }
                }

                if (channelsNotFound.size > 0) {
                    await buttonInteraction.editReply({ content: `Could not find voice channels for: ${[...channelsNotFound].join(', ')}. Please create them or configure them.` });
                    return;
                }

                for (const player of playersToMove) {
                    const playerTeam = parseInt(player.team, 10);
                    if (isNaN(playerTeam) || playerTeam <= 0 || playerTeam > gameDetails.num_teams) {
                        logger.warn(`[GAME_VOICE_DEPLOY] Player ${player.player_id} has invalid team ${player.team}`);
                        failedCount++;
                        continue;
                    }
                    const targetChannelId = teamVoiceChannelIds[playerTeam - 1];
                    if (!targetChannelId) {
                        logger.warn(`[GAME_VOICE_DEPLOY] No channel configured for Team ${playerTeam} for player ${player.player_id}`);
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
                        } else if (member && !member.voice.channelId) {
                            logger.info(`[GAME_VOICE_DEPLOY] Player ${player.player_id} not in a voice channel.`);
                            failedCount++;
                        }
                    } catch (moveError) {
                        failedCount++;
                        logger.warn(`[GAME_VOICE_DEPLOY] Failed to move player ${player.player_id} to channel for Team ${playerTeam}: ${moveError.message}`);
                    }
                }
                await buttonInteraction.editReply({ content: `Attempted to move players to team channels. Moved: ${movedCount}, Failed/Skipped: ${failedCount}.` });
                logger.info(`[GAME_VOICE_DEPLOY] Host ${userId} deployed teams for game ${gameId}. Moved: ${movedCount}, Failed: ${failedCount}`);
            } catch (error) {
                logger.error(`[GAME_VOICE_DEPLOY] Error deploying teams for game ${gameId}: ${error.message || error}`);
                await buttonInteraction.editReply({ content: "An error occurred while trying to move players to team channels." });
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

                const endedEmbed = new EmbedBuilder()
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

        case "HOST_SET_CAPTAINS":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can set captains.", ephemeral: true });
                return;
            }
            if (gameDetails.status === 'setup' || !gameDetails.num_teams || gameDetails.num_teams === 0) {
                await buttonInteraction.reply({ content: "Teams need to be configured first before setting captains.", ephemeral: true });
                return;
            }

            // Use UserSelectMenu for better UX - one menu per team
            const captainSelectRows = [];
            for (let i = 1; i <= Math.min(gameDetails.num_teams, 4); i++) {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`GAME_SELECT_CAPTAIN-${gameIdString}-${i}`)
                    .setPlaceholder(`Select Captain for Team ${i}`)
                    .setMinValues(1)
                    .setMaxValues(1);
                captainSelectRows.push(new ActionRowBuilder().addComponents(userSelect));
            }

            // Add confirm button
            const confirmRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`GAME_CONFIRM_CAPTAINS-${gameIdString}`)
                        .setLabel('✅ Confirm Captains')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true), // Enabled after all captains selected
                    new ButtonBuilder()
                        .setCustomId(`GAME_CANCEL_CAPTAINS-${gameIdString}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await buttonInteraction.reply({
                content: `**Select Captains for Game ${gameId}**\n\nUse the dropdown menus below to select a captain for each team. Once all teams have captains, click Confirm.`,
                components: [...captainSelectRows, confirmRow],
                ephemeral: true
            });
            logger.info(`[GAME_BTN] Host ${userId} opened captain selection for game ${gameId}`);
            break;

        case "HOST_START_PICKING":
            if (!isHost) {
                await buttonInteraction.reply({ content: "Only the host can start the draft.", ephemeral: true });
                return;
            }
            try {
                await buttonInteraction.deferReply({ ephemeral: true });

                // Check if captains are set for all teams
                const captainsResp = await localApi.get("game_joining_player", {
                    game_id: gameId,
                    captain: 'true',
                    _limit: 10
                });
                const captains = captainsResp.game_joining_players || [];

                if (captains.length < gameDetails.num_teams) {
                    await buttonInteraction.editReply({ content: `Not all teams have captains. You have ${captains.length} captains but ${gameDetails.num_teams} teams. Please set all captains first.` });
                    return;
                }

                // Create temporary voice channels for each team
                const createdChannels = [];
                const guild = buttonInteraction.guild;
                const hostVoiceChannel = guild.members.cache.get(userId)?.voice?.channel;
                const parentCategory = hostVoiceChannel?.parent || null;
                const userLimit = gameDetails.max_players > 0 ? gameDetails.max_players : 10; // Default to 10 if unlimited

                for (let i = 1; i <= gameDetails.num_teams; i++) {
                    try {
                        const channelName = `Game ${gameId} - Team ${i}`;
                        // Check if channel already exists
                        let existingChannel = guild.channels.cache.find(ch => ch.name === channelName && ch.type === ChannelType.GuildVoice);

                        if (!existingChannel) {
                            const newChannel = await guild.channels.create({
                                name: channelName,
                                type: ChannelType.GuildVoice,
                                parent: parentCategory,
                                userLimit: userLimit,
                                reason: `Temporary team channel for Game ${gameId}`
                            });
                            createdChannels.push(newChannel);
                            logger.info(`[GAME_START] Created voice channel '${channelName}' for game ${gameId}`);
                        } else {
                            createdChannels.push(existingChannel);
                            logger.info(`[GAME_START] Using existing voice channel '${channelName}' for game ${gameId}`);
                        }
                    } catch (channelError) {
                        logger.error(`[GAME_START] Failed to create channel for Team ${i}: ${channelError.message}`);
                    }
                }

                // Update game status to 'picking' and set current_turn to 1
                await localApi.put("game_joining_master", {
                    game_id: gameId,
                    status: 'picking',
                    current_turn: 1
                });

                // Get unassigned players (exclude captains who are already on teams)
                const unassignedResp = await localApi.get("game_joining_player", {
                    game_id: gameId,
                    _filter: "(team IS NULL OR team = '' OR team = '0') AND (captain IS NULL OR captain != 'true')",
                    _limit: 100
                });
                const unassignedPlayers = unassignedResp.game_joining_players || [];

                const team1Captain = captains.find(c => parseInt(c.team, 10) === 1);
                let captainMention = team1Captain ? `<@${team1Captain.player_id}>` : "Team 1 Captain";

                // Check picking mode
                const isFreeForAll = gameDetails.game === 'freeforall';
                const modeText = isFreeForAll ? "**Mode: Free-for-All** - Any captain can pick anytime!" : "**Mode: Turn-Based** - Captains alternate picks.";
                const turnText = isFreeForAll ? "Any captain can pick!" : `It's ${captainMention}'s turn to pick.`;

                await buttonInteraction.editReply({
                    content: `🎯 **Draft Started!**\n\n${modeText}\n\n${turnText}\n${unassignedPlayers.length} players available.\n\n${createdChannels.length > 0 ? `Created ${createdChannels.length} temporary voice channels.` : ''}`
                });

                // Update the original message to enable captain pick button
                const originalMessage = buttonInteraction.message;
                if (originalMessage) {
                    const pickingModeDisplay = isFreeForAll ? '🔥 Free-for-All' : '🔄 Turn-Based (Team 1)';
                    const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                        .setDescription(`**DRAFT IN PROGRESS**\n\nPicking: ${pickingModeDisplay}\nPlayers Available: ${unassignedPlayers.length}`);

                    const newComponents = originalMessage.components.map(apiActionRow => {
                        const newRow = new ActionRowBuilder();
                        apiActionRow.components.forEach(apiButton => {
                            const buttonBuilder = ButtonBuilder.from(apiButton);
                            // Enable captain pick button
                            if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_CAPTAIN_PICK-`)) {
                                buttonBuilder.setDisabled(false);
                            }
                            // Disable start draft button
                            if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_START_PICKING-`)) {
                                buttonBuilder.setDisabled(true);
                            }
                            newRow.addComponents(buttonBuilder);
                        });
                        return newRow;
                    });
                    await originalMessage.edit({ embeds: [newEmbed], components: newComponents });
                }

                logger.info(`[GAME_BTN] Host ${userId} started draft for game ${gameId}. Created ${createdChannels.length} team channels.`);
            } catch (error) {
                logger.error(`[GAME_BTN] Error starting draft for game ${gameId}: ${error.message || error}`);
                await buttonInteraction.editReply({ content: "Error starting the draft. Please check logs." });
            }
            break;

        case "CAPTAIN_PICK":
            try {
                // Check if this user is a captain
                const playerCheckResp = await localApi.get("game_joining_player", {
                    game_id: gameId,
                    player_id: userId,
                    _limit: 1
                });
                const playerRecord = playerCheckResp.game_joining_players?.[0];

                if (!playerRecord || playerRecord.captain !== 'true') {
                    await buttonInteraction.reply({ content: "Only team captains can pick players.", ephemeral: true });
                    return;
                }

                const playerTeam = parseInt(playerRecord.team, 10);

                // Check picking mode - only enforce turns in turn-based mode
                const isFreeForAll = gameDetails.game === 'freeforall';
                if (!isFreeForAll) {
                    const currentTurn = parseInt(gameDetails.current_turn, 10) || 1;
                    if (playerTeam !== currentTurn) {
                        await buttonInteraction.reply({ content: `It's not your turn! Currently Team ${currentTurn}'s turn to pick.`, ephemeral: true });
                        return;
                    }
                }

                // Show modal to pick a player
                const pickModal = new ModalBuilder()
                    .setCustomId(`GAME_MODAL_CAPTAIN_PICK-${gameIdString}`)
                    .setTitle(`Pick a Player - Team ${playerTeam}`);

                const playerPickInput = new TextInputBuilder()
                    .setCustomId('player_to_pick')
                    .setLabel("Enter User ID or @mention of player")
                    .setPlaceholder("User ID or @mention")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                pickModal.addComponents(new ActionRowBuilder().addComponents(playerPickInput));
                await buttonInteraction.showModal(pickModal);
                logger.info(`[GAME_BTN] Captain ${userId} (Team ${playerTeam}) opened pick modal for game ${gameId} (mode: ${isFreeForAll ? 'freeforall' : 'turns'})`);
            } catch (error) {
                logger.error(`[GAME_BTN] Error in CAPTAIN_PICK for game ${gameId}: ${error.message || error}`);
                await buttonInteraction.reply({ content: "Error opening pick interface.", ephemeral: true });
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
    const gameId = Number(gameIdString);
    if (isNaN(gameId)) {
        logger.warn(`[GAME_MODAL_SETUP] Invalid gameId (not a number): ${gameIdString}`);
        await modalInteraction.reply({ content: "Invalid game ID in modal submission.", ephemeral: true });
        return;
    }
    const userId = modalInteraction.user.id;

    try {
        await modalInteraction.deferReply({ ephemeral: true });

        const gameMasterResp = await localApi.get("game_joining_master", { game_id: gameId, _limit: 1 });
        if (!gameMasterResp || !gameMasterResp.game_joining_masters || !gameMasterResp.game_joining_masters[0]) {
            await modalInteraction.editReply({ content: "Original game not found. Cannot update settings." });
            return;
        }
        const gameMasterDetails = gameMasterResp.game_joining_masters[0];

        if (gameMasterDetails.host_id !== userId) {
            await modalInteraction.editReply({ content: "Only the host can modify game settings." });
            return;
        }

        const numTeams = modalInteraction.fields.getTextInputValue('numTeams');
        const maxPlayers = modalInteraction.fields.getTextInputValue('playersPerTeam'); // Field ID is 'playersPerTeam'

        const parsedNumTeams = parseInt(numTeams, 10);
        const parsedMaxPlayers = parseInt(maxPlayers, 10);

        if (isNaN(parsedNumTeams) || parsedNumTeams <= 1) {
            await modalInteraction.editReply({ content: "Number of teams must be a number greater than 1." });
            return;
        }
        if (isNaN(parsedMaxPlayers) || parsedMaxPlayers < 0) {
            await modalInteraction.editReply({ content: "Max players per team must be a number (0 for unlimited)." });
            return;
        }

        const updatePayload = {
            game_id: gameId,
            num_teams: parsedNumTeams,
            max_players: parsedMaxPlayers,
            status: 'lobby_configured'
        };

        // Get picking mode (store in 'game' column - repurposed for mode)
        let pickingMode = 'turns';
        try {
            const pickingModeInput = modalInteraction.fields.getTextInputValue('pickingMode');
            if (pickingModeInput && (pickingModeInput.toLowerCase() === 'freeforall' || pickingModeInput.toLowerCase() === 'free')) {
                pickingMode = 'freeforall';
            }
        } catch (e) {
            // pickingMode field might not exist in older modals, default to 'turns'
        }
        updatePayload.game = pickingMode;

        await localApi.put("game_joining_master", updatePayload);
        logger.info(`[GAME_MODAL_SETUP] Game ${gameId} updated by host ${userId}. New settings: Teams=${parsedNumTeams}, MaxPlayers=${parsedMaxPlayers}, Mode=${pickingMode}, Status=lobby_configured`);

        // Fetch the original game message to update it
        const originalMessage = modalInteraction.message; // This should be the message with the buttons

        if (originalMessage) {
            const gameDetailsForUpdate = await localApi.get("game_joining_master", { game_id: gameId });
            if (gameDetailsForUpdate && gameDetailsForUpdate.game_joining_masters && gameDetailsForUpdate.game_joining_masters[0]) {
                const updatedGameData = gameDetailsForUpdate.game_joining_masters[0];
                const newEmbed = EmbedBuilder.from(originalMessage.embeds[0]);

                let teamsConfigured = updatedGameData.status === 'lobby_configured' && updatedGameData.num_teams > 0;
                const modeDisplay = updatedGameData.game === 'freeforall' ? '🔥 Free-for-All' : '🔄 Turn-Based';

                newEmbed.setFields(
                    { name: "Status", value: updatedGameData.status === 'setup' ? '⚙️ Setup (Waiting for Host)' : (updatedGameData.status === 'lobby_configured' ? '✅ Lobby Configured' : updatedGameData.status), inline: true },
                    { name: "Teams", value: teamsConfigured ? `${updatedGameData.num_teams}` : "Not Set", inline: true },
                    { name: "Players/Team", value: teamsConfigured ? (updatedGameData.max_players === 0 ? "Unlimited" : `${updatedGameData.max_players}`) : "N/A", inline: true },
                    { name: "Draft Mode", value: modeDisplay, inline: true }
                );

                const newComponents = originalMessage.components.map(apiActionRow => {
                    const newRow = new ActionRowBuilder();
                    apiActionRow.components.forEach(apiButton => {
                        const buttonBuilder = ButtonBuilder.from(apiButton);

                        // Update button states based on 'teamsConfigured'
                        if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_SETUP_TEAMS-${gameIdString}`)) {
                            buttonBuilder.setDisabled(teamsConfigured);
                        }
                        if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_SET_CAPTAINS-${gameIdString}`)) {
                            buttonBuilder.setDisabled(!teamsConfigured);
                        }
                        if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_MANAGE_PLAYERS-${gameIdString}`)) {
                            buttonBuilder.setDisabled(!teamsConfigured);
                        }
                        if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_VOICE_CONTROL-${gameIdString}`)) {
                            buttonBuilder.setDisabled(!teamsConfigured);
                        }
                        newRow.addComponents(buttonBuilder);
                    });
                    return newRow;
                });
                await originalMessage.edit({ embeds: [newEmbed], components: newComponents });
                logger.info(`[GAME_MODAL_SETUP] Original game message for game ${gameId} updated after team setup.`);
            }
        }
        const modeText = pickingMode === 'freeforall' ? 'Free-for-All (any captain can pick anytime)' : 'Turn-Based (captains alternate)';
        await modalInteraction.editReply({ content: `Game settings updated!\n• Teams: ${parsedNumTeams}\n• Max Players/Team: ${parsedMaxPlayers === 0 ? "Unlimited" : parsedMaxPlayers}\n• Draft Mode: ${modeText}\n\nYou can now set captains!` });

    } catch (error) {
        logger.error(`[GAME_MODAL_SETUP] Error processing team setup for game ${gameId}: ${error.message || error}`);
        if (!modalInteraction.replied && !modalInteraction.deferred) {
            await modalInteraction.reply({ content: "An error occurred while updating game settings.", ephemeral: true });
        } else {
            await modalInteraction.editReply({ content: "An error occurred while updating game settings." });
        }
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
            team: String(teamIdToAssignTo)
        });

        logger.info(`[GAME_ASSIGN_MODAL] Host ${hostId} assigned player ${playerIdToAssign} (gp_id: ${gamePlayerId}) to team ${teamIdToAssignTo} in game ${gameId}.`);
        await modalInteraction.editReply({ content: `Successfully assigned player to Team ${teamIdToAssignTo}. Click 'Manage Players' again to see updates.` });

    } catch (error) {
        logger.error(`[GAME_ASSIGN_MODAL] Error assigning player in game ${gameId}: ${error.message || error}`);
        await modalInteraction.editReply({ content: "An error occurred while assigning the player." });
    }
}

// Handler for setting team captains
async function handleSetCaptainsModal(modalInteraction, logger, localApi) {
    const customId = modalInteraction.customId;
    const gameIdString = customId.split('-')[1];
    const gameId = Number(gameIdString);
    const hostId = modalInteraction.user.id;

    try {
        await modalInteraction.deferReply({ ephemeral: true });

        // Verify host and get game details
        const gameResp = await localApi.get("game_joining_master", { game_id: gameId });
        if (!gameResp || !gameResp.game_joining_masters || !gameResp.game_joining_masters[0]) {
            await modalInteraction.editReply({ content: "Game not found." });
            return;
        }
        const gameDetails = gameResp.game_joining_masters[0];

        if (gameDetails.host_id !== hostId) {
            await modalInteraction.editReply({ content: "Only the host can set captains." });
            return;
        }

        const captainsSet = [];
        const errors = [];

        for (let i = 1; i <= gameDetails.num_teams; i++) {
            const captainInput = modalInteraction.fields.getTextInputValue(`captain_team_${i}`);
            if (!captainInput) continue;

            // Extract user ID from mention or raw ID
            let captainId = captainInput.replace(/[<@!>]/g, '').trim();

            // Check if player is in the game
            const playerResp = await localApi.get("game_joining_player", {
                game_id: gameId,
                player_id: captainId,
                _limit: 1
            });

            if (!playerResp || !playerResp.game_joining_players || !playerResp.game_joining_players[0]) {
                // Player not in lobby, add them
                try {
                    await localApi.post("game_joining_player", {
                        game_id: gameId,
                        player_id: captainId,
                        team: String(i),
                        captain: 'true'
                    });
                    captainsSet.push(`Team ${i}: <@${captainId}> (added to lobby)`);
                } catch (addError) {
                    errors.push(`Team ${i}: Failed to add <@${captainId}> - ${addError.message}`);
                }
            } else {
                // Update existing player to be captain
                const gamePlayerId = playerResp.game_joining_players[0].game_player_id;
                try {
                    await localApi.put("game_joining_player", {
                        game_player_id: Number(gamePlayerId),
                        team: String(i),
                        captain: 'true'
                    });
                    captainsSet.push(`Team ${i}: <@${captainId}>`);
                } catch (updateError) {
                    errors.push(`Team ${i}: Failed to update <@${captainId}> - ${updateError.message}`);
                }
            }
        }

        let response = "**Captains Set:**\n" + captainsSet.join("\n");
        if (errors.length > 0) {
            response += "\n\n**Errors:**\n" + errors.join("\n");
        }

        // Enable the "Start Draft" button on the original message
        const originalMessage = modalInteraction.message;
        if (originalMessage && errors.length === 0) {
            const newComponents = originalMessage.components.map(apiActionRow => {
                const newRow = new ActionRowBuilder();
                apiActionRow.components.forEach(apiButton => {
                    const buttonBuilder = ButtonBuilder.from(apiButton);
                    // Enable start picking button
                    if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_START_PICKING-`)) {
                        buttonBuilder.setDisabled(false);
                    }
                    // Disable set captains button (already done)
                    if (buttonBuilder.data.custom_id && buttonBuilder.data.custom_id.startsWith(`GAME_HOST_SET_CAPTAINS-`)) {
                        buttonBuilder.setDisabled(true);
                    }
                    newRow.addComponents(buttonBuilder);
                });
                return newRow;
            });
            await originalMessage.edit({ components: newComponents });
        }

        await modalInteraction.editReply({ content: response });
        logger.info(`[GAME_SET_CAPTAINS] Host ${hostId} set captains for game ${gameId}: ${captainsSet.join(', ')}`);

    } catch (error) {
        logger.error(`[GAME_SET_CAPTAINS] Error setting captains for game ${gameId}: ${error.message || error}`);
        await modalInteraction.editReply({ content: "An error occurred while setting captains." });
    }
}

// Handler for captain picking a player
async function handleCaptainPickModal(modalInteraction, logger, localApi) {
    const customId = modalInteraction.customId;
    const gameIdString = customId.split('-')[1];
    const gameId = Number(gameIdString);
    const captainId = modalInteraction.user.id;

    try {
        await modalInteraction.deferReply({ ephemeral: true });

        // Get game details
        const gameResp = await localApi.get("game_joining_master", { game_id: gameId });
        if (!gameResp || !gameResp.game_joining_masters || !gameResp.game_joining_masters[0]) {
            await modalInteraction.editReply({ content: "Game not found." });
            return;
        }
        const gameDetails = gameResp.game_joining_masters[0];

        // Verify captain
        const captainResp = await localApi.get("game_joining_player", {
            game_id: gameId,
            player_id: captainId,
            _limit: 1
        });
        const captainRecord = captainResp.game_joining_players?.[0];

        if (!captainRecord || captainRecord.captain !== 'true') {
            await modalInteraction.editReply({ content: "You are not a captain." });
            return;
        }

        const currentTurn = parseInt(gameDetails.current_turn, 10) || 1;
        const captainTeam = parseInt(captainRecord.team, 10);

        // Check picking mode - only enforce turns in turn-based mode
        const isFreeForAll = gameDetails.game === 'freeforall';
        if (!isFreeForAll && captainTeam !== currentTurn) {
            await modalInteraction.editReply({ content: `It's not your turn! Currently Team ${currentTurn}'s turn.` });
            return;
        }

        // Get the player to pick
        const playerInput = modalInteraction.fields.getTextInputValue('player_to_pick');
        const pickedPlayerId = playerInput.replace(/[<@!>]/g, '').trim();

        // Find the player in the game (must be unassigned)
        const playerResp = await localApi.get("game_joining_player", {
            game_id: gameId,
            player_id: pickedPlayerId,
            _limit: 1
        });

        if (!playerResp || !playerResp.game_joining_players || !playerResp.game_joining_players[0]) {
            await modalInteraction.editReply({ content: `Player <@${pickedPlayerId}> is not in the game lobby.` });
            return;
        }

        const playerRecord = playerResp.game_joining_players[0];
        const playerTeam = parseInt(playerRecord.team, 10);

        if (!isNaN(playerTeam) && playerTeam > 0) {
            await modalInteraction.editReply({ content: `<@${pickedPlayerId}> is already on Team ${playerTeam}!` });
            return;
        }

        // Assign player to captain's team
        await localApi.put("game_joining_player", {
            game_player_id: Number(playerRecord.game_player_id),
            team: String(captainTeam)
        });

        // Move player to team voice channel (try both naming conventions)
        const guild = modalInteraction.guild;
        const newChannelName = `Game ${gameId} - Team ${captainTeam}`;
        const legacyChannelName = `Team ${captainTeam}`;
        let voiceChannel = guild.channels.cache.find(ch => ch.name === newChannelName && ch.type === ChannelType.GuildVoice);
        if (!voiceChannel) {
            voiceChannel = guild.channels.cache.find(ch => ch.name === legacyChannelName && ch.type === ChannelType.GuildVoice);
        }

        let moveMessage = "";
        if (voiceChannel) {
            try {
                const member = await guild.members.fetch(pickedPlayerId);
                if (member && member.voice && member.voice.channelId) {
                    await member.voice.setChannel(voiceChannel.id);
                    moveMessage = ` and moved to ${voiceChannel.name}`;
                } else {
                    moveMessage = " (not in voice, couldn't move)";
                }
            } catch (moveError) {
                logger.warn(`[CAPTAIN_PICK] Failed to move ${pickedPlayerId}: ${moveError.message}`);
                moveMessage = " (failed to move to voice)";
            }
        } else {
            moveMessage = " (no team voice channel found)";
        }

        // Advance turn to next team (only in turn-based mode)
        let nextTurn = currentTurn;
        if (!isFreeForAll) {
            nextTurn = (currentTurn % gameDetails.num_teams) + 1;
            await localApi.put("game_joining_master", {
                game_id: gameId,
                current_turn: nextTurn
            });
        }

        // Check if there are still unassigned players
        const unassignedResp = await localApi.get("game_joining_player", {
            game_id: gameId,
            _filter: "(team IS NULL OR team = '' OR team = '0') AND (captain IS NULL OR captain != 'true')",
            _limit: 100
        });
        const remainingUnassigned = unassignedResp.game_joining_players || [];

        // Update the original message
        const originalMessage = modalInteraction.message;
        if (originalMessage) {
            let description;
            if (remainingUnassigned.length === 0) {
                description = `**DRAFT COMPLETE!**\n\nAll players have been assigned to teams.`;
            } else if (isFreeForAll) {
                description = `**DRAFT IN PROGRESS**\n\nPicking: 🔥 Free-for-All\nPlayers Available: ${remainingUnassigned.length}`;
            } else {
                description = `**DRAFT IN PROGRESS**\n\nPicking: 🔄 Turn-Based (Team ${nextTurn})\nPlayers Available: ${remainingUnassigned.length}`;
            }

            const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                .setDescription(description);

            await originalMessage.edit({ embeds: [newEmbed] });
        }

        // Notify next captain (only in turn-based mode)
        let nextTurnMsg = "";
        if (!isFreeForAll && remainingUnassigned.length > 0) {
            const nextCaptainResp = await localApi.get("game_joining_player", {
                game_id: gameId,
                captain: 'true',
                _limit: 10
            });
            const nextCaptain = (nextCaptainResp.game_joining_players || []).find(c => parseInt(c.team, 10) === nextTurn);
            if (nextCaptain) {
                nextTurnMsg = `\n\nNext up: <@${nextCaptain.player_id}> (Team ${nextTurn})`;
            }
        }

        await modalInteraction.editReply({
            content: `✅ You picked <@${pickedPlayerId}> for Team ${captainTeam}${moveMessage}!${nextTurnMsg}`
        });

        logger.info(`[CAPTAIN_PICK] Captain ${captainId} picked ${pickedPlayerId} for Team ${captainTeam} in game ${gameId} (mode: ${isFreeForAll ? 'freeforall' : 'turns'})`);

    } catch (error) {
        logger.error(`[CAPTAIN_PICK] Error in captain pick for game ${gameId}: ${error.message || error}`);
        await modalInteraction.editReply({ content: "An error occurred while picking the player." });
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

        } else if (buttonInteraction.customId.startsWith("VOICE_CLEANUP_CANCEL_")) { // MODIFIED: button -> buttonInteraction
            await buttonInteraction.deferUpdate(); // MODIFIED: button -> buttonInteraction
            logger.info(`[BTN_CLEANUP_CANCEL] Voice data cleanup cancelled for guild ${guildId}`);
            await buttonInteraction.editReply({ content: "Voice data cleanup has been cancelled.", components: [] }); // MODIFIED: button -> buttonInteraction
            return;

        } else if (buttonInteraction.customId.startsWith("VOICE_FIX_ALL_")) { // MODIFIED: button -> buttonInteraction
            await buttonInteraction.deferUpdate(); // MODIFIED: button -> buttonInteraction
            const targetGuildId = buttonInteraction.customId.split('_').pop(); // MODIFIED: button -> buttonInteraction
            if (targetGuildId !== guildId) {
                logger.warn(`[BTN_FIX_ALL] Guild ID mismatch: button.customId=${buttonInteraction.customId}, interaction.guild.id=${guildId}`); // MODIFIED: button -> buttonInteraction
                await buttonInteraction.editReply({ content: "Error: Guild ID mismatch. Cannot perform fix.", components: [] }); // MODIFIED: button -> buttonInteraction
                return;
            }
            logger.info(`[BTN_FIX_ALL] Attempting to fix ghost sessions for guild ${targetGuildId}`);
            try {
                const activeSessionsResp = await api.get("voice_tracking", {
                    discord_server_id: targetGuildId,
                    disconnect_time: 0,
                    _limit: 500 // Fetch a large number to ensure all active sessions are retrieved
                });

                if (!activeSessionsResp || !activeSessionsResp.voice_trackings || activeSessionsResp.voice_trackings.length === 0) {
                    await buttonInteraction.editReply({ content: "No active voice sessions found to diagnose or fix.", components: [] }); // MODIFIED: button -> buttonInteraction
                    return;
                }

                const sessionsByUser = new Map();
                for (const session of activeSessionsResp.voice_trackings) {
                    if (!sessionsByUser.has(session.user_id)) {
                        sessionsByUser.set(session.user_id, []);
                    }
                    sessionsByUser.get(session.user_id).push(session);
                }

                let fixedSessionsCount = 0;
                let usersAffectedCount = 0;
                // const currentTime = Math.floor(Date.now() / 1000); // Not used in this branch

                for (const [userId, sessions] of sessionsByUser.entries()) {
                    if (sessions.length > 1) {
                        usersAffectedCount++;
                        // Sort sessions by connect_time descending (most recent first)
                        sessions.sort((a, b) => parseInt(b.connect_time, 10) - parseInt(a.connect_time, 10));

                        const sessionToKeep = sessions[0]; // Keep the most recent one
                        logger.info(`[BTN_FIX_ALL] User ${userId} has ${sessions.length} active sessions. Keeping ${sessionToKeep.voice_state_id} (connected at ${sessionToKeep.connect_time}).`);

                        for (let i = 1; i < sessions.length; i++) {
                            const sessionToClose = sessions[i];
                            const originalConnectTime = parseInt(sessionToClose.connect_time, 10);

                            if (isNaN(originalConnectTime)) { // ADDED: Check for NaN
                                logger.warn(`[BTN_FIX_ALL] Ghost session ${sessionToClose.voice_state_id} for user ${userId} has invalid connect_time: ${sessionToClose.connect_time}. Skipping.`);
                                continue;
                            }

                            const newDisconnectTime = originalConnectTime + 3600; // Add 1 hour

                            logger.info(`[BTN_FIX_ALL] Closing ghost session ${sessionToClose.voice_state_id} for user ${userId} (connected at ${originalConnectTime}). Setting disconnect_time to ${newDisconnectTime}.`);
                            try {
                                await api.put(`voice_tracking`, { // MODIFIED: Simplified payload
                                    voice_state_id: parseInt(sessionToClose.voice_state_id, 10),
                                    disconnect_time: newDisconnectTime,
                                });
                                fixedSessionsCount++;
                            } catch (putError) {
                                logger.error(`[BTN_FIX_ALL] Error PUTTING session ${sessionToClose.voice_state_id} for user ${userId}: ${putError.message || putError}`);
                            }
                        }
                    }
                }

                if (fixedSessionsCount > 0) {
                    await buttonInteraction.editReply({ content: `Attempted to fix ${fixedSessionsCount} ghost session(s) for ${usersAffectedCount} user(s). Please run the diagnose command again to verify.`, components: [] }); // MODIFIED: button -> buttonInteraction
                } else if (usersAffectedCount > 0 && fixedSessionsCount === 0) {
                    await buttonInteraction.editReply({ content: `Found ${usersAffectedCount} user(s) with multiple sessions, but no sessions were fixed. This might indicate an issue with the patching process or the sessions were already fixed. Check logs.`, components: [] }); // MODIFIED: button -> buttonInteraction
                } else {
                    await buttonInteraction.editReply({ content: "No users with multiple active sessions found. Everything seems to be in order.", components: [] }); // MODIFIED: button -> buttonInteraction
                }

            } catch (error) {
                logger.error(`[BTN_FIX_ALL] Error fixing ghost sessions for guild ${targetGuildId}: ${error.message || error}`);
                await buttonInteraction.editReply({ content: "An error occurred while trying to fix ghost sessions. Please check the logs.", components: [] }); // MODIFIED: button -> buttonInteraction
            }
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
                case "channel":
                    await generateVoiceLeaderboard(buttonInteraction, 'Your Top Channels', { sortOrder: 'top', groupBy: 'channel', filterUser: buttonInteraction.user.id });
                    break;
                case "channelUse":
                    await generateVoiceLeaderboard(buttonInteraction, 'Most Used Channels (All Time)', { sortOrder: 'top', groupBy: 'channel' });
                    break;
                case "lonely":
                    await generateVoiceLeaderboard(buttonInteraction, 'Top Lonely Users (All Time)', { sortOrder: 'top', aloneTime: true });
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
        } else if (modalInteraction.customId.startsWith("GAME_MODAL_SUBMIT_ASSIGN_PLAYER-")) {
            await handleAssignPlayerModal(modalInteraction, logger, api);
        } else if (modalInteraction.customId.startsWith("GAME_MODAL_SET_CAPTAINS-")) {
            await handleSetCaptainsModal(modalInteraction, logger, api);
        } else if (modalInteraction.customId.startsWith("GAME_MODAL_CAPTAIN_PICK-")) {
            await handleCaptainPickModal(modalInteraction, logger, api);
        }
    } else if (interaction.isUserSelectMenu()) {
        // Handle captain selection dropdowns
        const selectInteraction = interaction;
        if (selectInteraction.customId.startsWith("GAME_SELECT_CAPTAIN-")) {
            const parts = selectInteraction.customId.split('-');
            const gameIdString = parts[1];
            const teamNumber = parseInt(parts[2], 10);
            const selectedUserId = selectInteraction.values[0];

            // Store selection in the message content as a hidden tracker
            // We'll parse this when user clicks Confirm
            const currentContent = selectInteraction.message.content;

            // Update content to track selections
            let selections = {};
            const selectionMatch = currentContent.match(/\[SELECTIONS:(.*?)\]/);
            if (selectionMatch) {
                try {
                    selections = JSON.parse(selectionMatch[1]);
                } catch (e) { }
            }
            selections[`team${teamNumber}`] = selectedUserId;

            // Get game details to know total teams
            const gameResp = await api.get("game_joining_master", { game_id: Number(gameIdString) });
            const numTeams = gameResp?.game_joining_masters?.[0]?.num_teams || 2;

            // Count how many teams have captains selected
            const selectedCount = Object.keys(selections).length;
            const allSelected = selectedCount >= numTeams;

            // Build display text
            let displayText = `**Select Captains for Game ${gameIdString}**\n\n`;
            for (let i = 1; i <= numTeams; i++) {
                const captainId = selections[`team${i}`];
                displayText += `Team ${i}: ${captainId ? `<@${captainId}> ✅` : '(not selected)'}\n`;
            }
            displayText += `\n[SELECTIONS:${JSON.stringify(selections)}]`;

            // Update confirm button state
            const newComponents = selectInteraction.message.components.map(row => {
                const newRow = new ActionRowBuilder();
                row.components.forEach(comp => {
                    if (comp.type === 2) { // Button
                        const btn = ButtonBuilder.from(comp);
                        if (btn.data.custom_id?.startsWith('GAME_CONFIRM_CAPTAINS-')) {
                            btn.setDisabled(!allSelected);
                        }
                        newRow.addComponents(btn);
                    } else if (comp.type === 5) { // UserSelect
                        const select = UserSelectMenuBuilder.from(comp);
                        // Show current selection
                        const teamNum = parseInt(select.data.custom_id.split('-')[2], 10);
                        if (selections[`team${teamNum}`]) {
                            select.setPlaceholder(`Team ${teamNum}: Selected ✅`);
                        }
                        newRow.addComponents(select);
                    }
                });
                return newRow;
            });

            await selectInteraction.update({ content: displayText, components: newComponents });
        }
    } else if (interaction.isButton()) {
        // Check for confirm/cancel captains buttons that might come in as separate interaction
        const btn = interaction;
        if (btn.customId.startsWith("GAME_CONFIRM_CAPTAINS-")) {
            const gameIdString = btn.customId.split('-')[1];
            const gameId = Number(gameIdString);

            await btn.deferUpdate();

            // Parse selections from message content
            const content = btn.message.content;
            const selectionMatch = content.match(/\[SELECTIONS:(.*?)\]/);
            if (!selectionMatch) {
                await btn.followUp({ content: "Error: Could not find captain selections.", ephemeral: true });
                return;
            }

            let selections;
            try {
                selections = JSON.parse(selectionMatch[1]);
            } catch (e) {
                await btn.followUp({ content: "Error parsing captain selections.", ephemeral: true });
                return;
            }

            // Get game details
            const gameResp = await api.get("game_joining_master", { game_id: gameId });
            if (!gameResp?.game_joining_masters?.[0]) {
                await btn.followUp({ content: "Game not found.", ephemeral: true });
                return;
            }
            const gameDetails = gameResp.game_joining_masters[0];

            // Save captains to database
            const captainsSet = [];
            for (let i = 1; i <= gameDetails.num_teams; i++) {
                const captainId = selections[`team${i}`];
                if (!captainId) continue;

                // Check if player exists in game
                const playerResp = await api.get("game_joining_player", {
                    game_id: gameId,
                    player_id: captainId,
                    _limit: 1
                });

                if (playerResp?.game_joining_players?.[0]) {
                    // Update existing player
                    await api.put("game_joining_player", {
                        game_player_id: Number(playerResp.game_joining_players[0].game_player_id),
                        team: String(i),
                        captain: 'true'
                    });
                } else {
                    // Add new player as captain
                    await api.post("game_joining_player", {
                        game_id: gameId,
                        player_id: captainId,
                        team: String(i),
                        captain: 'true'
                    });
                }
                captainsSet.push(`Team ${i}: <@${captainId}>`);
            }

            // Update message to show success
            await btn.editReply({
                content: `✅ **Captains Set Successfully!**\n\n${captainsSet.join('\n')}\n\nYou can now click **Start Draft** to begin picking players!`,
                components: []
            });

            // Enable Start Draft button on original game message
            try {
                const channel = btn.channel;
                // Try to find and update the game message (this might not work if we don't have the message)
                // The host will need to click Start Draft from the main game menu
            } catch (e) {
                logger.warn(`[CONFIRM_CAPTAINS] Could not update game message: ${e.message}`);
            }

            logger.info(`[CONFIRM_CAPTAINS] Captains set for game ${gameId}: ${captainsSet.join(', ')}`);
        } else if (btn.customId.startsWith("GAME_CANCEL_CAPTAINS-")) {
            await btn.update({ content: "Captain selection cancelled.", components: [] });
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
