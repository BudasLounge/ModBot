var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, StringSelectMenuBuilder, PermissionsBitField, ButtonStyle } = require('discord.js');
//todo: add a way to track how many times a user streams and for how long
async function onButtonClick(button){
    //if (!button.isButton()){return}
        if((button.customId.substr(0,5)==="VOICE")){
        button.customId = button.customId.substr(5)
        switch(button.customId){
        case "bottom":
            logger.info("Gathering all voice timings");
            try{
                var respVoice = await api.get("voice_tracking",{
                    discord_server_id:button.guild.id
                })
            }catch(error){
                logger.error(error);
            }

            logger.info("Starting the additive loop");
            var totalTime = [];
            logger.info(respVoice.voice_trackings.length);
            logger.info(totalTime.length);
            for(var i = 0;i<respVoice.voice_trackings.length;i++){
                if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                    respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
                }
                var flag = false;
                for(var j = 0;j<totalTime.length;j++){
                    if(totalTime[j][0] == respVoice.voice_trackings[i].user_id){
                        //logger\.info\("Adding to existing row\."\)
                        totalTime[j][1] += Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))
                        flag = true;
                        break;
                    }
                }
                if(!flag){
                    logger.info("Creating a new row.")
                    totalTime.push([respVoice.voice_trackings[i].user_id, Math.floor(parseInt(respVoice.voice_trackings[i].disconnect_time) - parseInt(respVoice.voice_trackings[i].connect_time))])
                }
            }
            logger.info("Printing array to a table, will only show up in live console, not logs...")
            console.table(totalTime);
            var output = "";

            totalTime.sort(compareSecondColumnReverse);
            logger.info("Printing array to a table after sorting...")
            console.table(totalTime);
            var output = "";
            var ListEmbed = new EmbedBuilder()
            .setColor("#c586b6")
            .setTitle("Voice Channel Leaderboard (Bottom 10)");
            var count = 10;
            if(totalTime.length<count) {count = totalTime.length;} 
            await button.deferUpdate();
            for(var k = 0;k<count;k++){
                try{
                    const userId = totalTime[k][0];
                    const user = await button.guild.members.fetch(userId);
                    var mention = user.displayName;
                }catch(error){
                    logger.error(error.message);
                }
                var diff = Math.floor(totalTime[k][1]), units = [
                    { d: 60, l: "seconds" },
                    { d: 60, l: "minutes" },
                    { d: 24, l: "hours" },
                    { d: 365, l: "days" }
                ];
            
                var s = '';
                for (var i = 0; i < units.length; ++i) {
                s = (diff % units[i].d) + " " + units[i].l + " " + s;
                diff = Math.floor(diff / units[i].d);
                }
                ListEmbed.addFields({ name: (k+1).toString() + ". " + mention, value: s.toString() });
            }
            

            var timingFilters = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("VOICEnon-muted")
                    .setLabel("Non-muted times only")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId("VOICEmuted")
                    .setLabel("Muted times only")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId("VOICEtop")
                    .setLabel("Top Talkers")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
            );
            var timingFilters2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("VOICE30days")
                    .setLabel("Top - Last 30 Days")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                new ButtonBuilder()
                    .setCustomId("VOICE7days")
                    .setLabel("Top - Last 7 Days")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                    new ButtonBuilder()
                    .setCustomId("VOICEchannel")
                    .setLabel("Top Talkers - By Channel")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(false),
                    new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            );
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
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        logger.info("Printing array to a table after sorting...")
            console.table(totalTime);
        var ListEmbed = new EmbedBuilder()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
            logger.info(mention);
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 365, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addFields({ name: (k+1).toString() + ". " + mention, value: s.toString() });
        
        const duration = Math.max(0, Math.floor(effectiveDisconnectTime - effectiveConnectTime));

        if (duration > 0 && track.user_id) {
            totalTimeByUser.set(track.user_id, (totalTimeByUser.get(track.user_id) || 0) + duration);
        }
    }

    if (totalTimeByUser.size === 0) {
        await button.editReply({ content: "No user voice time data to display after filtering.", embeds: [], components: [] });
        return;
    }

        var timingFilters = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEbottom")
                .setLabel("Bottom Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
    await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
    logger.info("Sent Voice Leaderboard!")
    break;
        case "muted":
            button.deferUpdate();
        logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:"true"
            })
        }catch(error){
            logger.error(error);
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
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new EmbedBuilder()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10 muters)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
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
                .setValue(gameDetails.max_players !== undefined ? String(gameDetails.max_players) : '0')
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
            ListEmbed.addFields({ name: (k+1).toString() + ". " + mention, value: s.toString() });
        }
        

        var timingFilters = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;
    case "non-muted":
        logger.info("Gathering all voice timings");
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:false
            })
        }catch(error){
            logger.error(error);
        }
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            return;
        }
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)
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
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new EmbedBuilder()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10 non-muters)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);

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
            ListEmbed.addFields({ name: (k+1).toString() + ". " + mention, value: s.toString() });
        }
        

        var timingFilters = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;


        case "channel":


            logger.info("Gathering all voice timings");
            /*try{
                var respVoice = await api.get("voice_tracking",{
                    discord_server_id:button.guild.id,
                    selfmute:false
                })
            }catch(error){
                logger.error(error);
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
            }
            logger.info("Printing array to a table, will only show up in live console, not logs...")
            console.table(totalTime);
            var output = "";
    
            totalTime.sort(compareSecondColumn);
            var ListEmbed = new EmbedBuilder()
            .setColor("#c586b6")
            .setTitle("Voice Channel Leaderboard (Top 10 channel times)");
            var count = 10;
            if(totalTime.length<count) {count = totalTime.length;}
            for(var k = 0;k<count;k++){
                var diff = Math.floor(totalTime[k][1]), units = [
                    { d: 60, l: "seconds" },
                    { d: 60, l: "minutes" },
                    { d: 24, l: "hours" },
                    { d: 365, l: "days" }
                ];
                  var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addFields({ name: (k+1).toString() + ". " + totalTime[k][0], value: s.toString(), inline: false });
        }
        var timingFilters = new ActionRowBuilder()
                .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")*/
        try {
            const respVoice = await api.get("voice_tracking", {
              discord_server_id: button.guild.id,
              selfmute: false
            });
          
            if (!respVoice.voice_trackings[0]) {
              await button.channel.send({ content: "There is no data available yet..." });
              return;
            }
          
            const totalTime = new Map();
            const currentTime = Math.floor(new Date().getTime() / 1000);
            await button.deferUpdate();
            for (const voiceTracking of respVoice.voice_trackings) {
              const channelName = button.guild.channels.cache.get(voiceTracking.channel_id);
              if (!channelName) {
                // Skip if the channel doesn't exist
                continue;
              }
              const disconnectTime = parseInt(voiceTracking.disconnect_time) || currentTime;
              //if (!button.guild.members.cache.has(voiceTracking.user_id)) {
              //  logger.error("User not found in the guild. ID: " + voiceTracking.user_id + " Username: " + voiceTracking.username);
              //  continue;
              //}
              let user;
              try{
                //logger.info("Fetching user  " + voiceTracking.user_id + " with username " + voiceTracking.username)
                user = await button.guild.members.fetch(voiceTracking.user_id)
              }catch(error){
                logger.error(error.message +  " ID: " + voiceTracking.user_id+ " Username: " + voiceTracking.username);
                continue;
              }
              const usernameChannel = `${user.displayName}, channel: ${channelName.name}`;
              const connectionTime = Math.floor(disconnectTime - parseInt(voiceTracking.connect_time));
          
              if (totalTime.has(usernameChannel)) {
                totalTime.set(usernameChannel, totalTime.get(usernameChannel) + connectionTime);
              } else {
                totalTime.set(usernameChannel, connectionTime);
              }
            }
          
            console.table([...totalTime]);
          
            const sortedTotalTime = [...totalTime].sort((a, b) => b[1] - a[1]);
          
            const ListEmbed = new EmbedBuilder()
              .setColor("#c586b6")
              .setTitle("Voice Channel Leaderboard (Top 10 channel times)");
          
            const count = Math.min(10, sortedTotalTime.length);
            for (let i = 0; i < count; i++) {
              const [usernameChannel, time] = sortedTotalTime[i];
              let diff = time;
              const units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 365, l: "days" }
              ];
          
              let s = "";
              for (let i = 0; i < units.length; ++i) {
                s = `${diff % units[i].d} ${units[i].l} ${s}`;
                diff = Math.floor(diff / units[i].d);
              }
          
              ListEmbed.addFields({ name: `${i + 1}. ${usernameChannel}`, value: s });
            }
          
            const timingFilters = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false)
            );
          
            const timingFilters2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false)
            );
          
            await button.editReply({ components: [timingFilters, timingFilters2], embeds: [ListEmbed] });
            console.info("Sent Voice Leaderboard!");
          } catch (error) {
            console.error(error);
          }
        break;
       
       
        case "channelUse":
            logger.info("Gathering all voice timings");
        /*try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                selfmute:false
            })
        }catch(error){
            logger.error(error);
        }
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
            return;
        }
        logger.info("Starting the additive loop");
        var totalTime = [];
        logger.info(respVoice.voice_trackings.length);
        logger.info(totalTime.length);
        for(var i = 0;i<respVoice.voice_trackings.length;i++){
            var channelNameUse = button.guild.channels.cache.get(respVoice.voice_trackings[i].channel_id)
            if(parseInt(respVoice.voice_trackings[i].disconnect_time) === 0){
                respVoice.voice_trackings[i].disconnect_time = Math.floor(new Date().getTime() / 1000)

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
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new EmbedBuilder()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top 10 Channels by use)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        for(var k = 0;k<count;k++){
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
            ];

            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;        diff = Math.floor(diff / units[i].d);
        }
        ListEmbed.addFields({ name: (k+1).toString() + ". " + totalTime[k][0], value: s.toString(), inline: false });
    }
    

    var timingFilters = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
        );
        await button.update({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")*/
        try {
            const respVoice = await api.get("voice_tracking", {
              discord_server_id: button.guild.id,
              selfmute: false
            });
          
            if (!respVoice.voice_trackings[0]) {
              await button.channel.send({ content: "There is no data available yet..." });
              return;
            }
          
            const totalTime = new Map();
            const currentTime = Math.floor(new Date().getTime() / 1000);
          
            for (const voiceTracking of respVoice.voice_trackings) {
              let channelNameUse = button.guild.channels.cache.get(voiceTracking.channel_id);
          
              if (!channelNameUse) {
                // Skip if the channel doesn't exist
                continue;
              }
          
              const disconnectTime = parseInt(voiceTracking.disconnect_time) || currentTime;
              const connectionTime = Math.floor(disconnectTime - parseInt(voiceTracking.connect_time));
          
              const channelName = channelNameUse.name;
              if (totalTime.has(channelName)) {
                totalTime.set(channelName, totalTime.get(channelName) + connectionTime);
              } else {
                totalTime.set(channelName, connectionTime);
              }
            }
          
            console.table([...totalTime]);
          
            const sortedTotalTime = [...totalTime].sort((a, b) => b[1] - a[1]);
          
            const ListEmbed = new EmbedBuilder()
              .setColor("#c586b6")
              .setTitle("Voice Channel Leaderboard (Top 10 Channels by use)");
          
            const count = Math.min(10, sortedTotalTime.length);
          
            for (let i = 0; i < count; i++) {
              const [channelName, time] = sortedTotalTime[i];
              let diff = time;
              const units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
              ];
          
              let s = "";
              for (let i = 0; i < units.length; ++i) {
                s = `${diff % units[i].d} ${units[i].l} ${s}`;
                diff = Math.floor(diff / units[i].d);
              }
          
              ListEmbed.addFields({ name: `${i + 1}. ${channelName}`, value: s });
            }
          
            const timingFilters = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false)
            );
          
            const timingFilters2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
              new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
            );
          
            await button.update({ components: [timingFilters, timingFilters2], embeds: [ListEmbed] });
            console.info("Sent Voice Leaderboard!");
          } catch (error) {
            console.error(error);
          }
        break;
        
        
        case "30days":
            logger.info("Gathering all voice timings");
            var today = Math.floor(new Date().getTime() / 1000);
            var startDate = (today - (30*24*60*60));
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                _filter: "disconnect_time > " + startDate
            })
        }catch(error){
            logger.error(error);
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
            gameId: gameId,
            num_teams: parsedNumTeams,
            max_players: parsedMaxPlayers,
            status: 'lobby_configured'
        };

        await localApi.put("game_joining_master", updatePayload);
        logger.info(`[GAME_MODAL_SETUP] Game ${gameId} updated by host ${userId}. New settings: Teams=${parsedNumTeams}, MaxPlayers=${parsedMaxPlayers}, Status=lobby_configured`);

        // Fetch the original game message to update it
        const originalMessage = modalInteraction.message; // This should be the message with the buttons

        if (originalMessage) {
            const gameDetailsForUpdate = await localApi.get("game_joining_master", { game_id: gameId });
            if (gameDetailsForUpdate && gameDetailsForUpdate.game_joining_masters && gameDetailsForUpdate.game_joining_masters[0]) {
                const updatedGameData = gameDetailsForUpdate.game_joining_masters[0];
                const newEmbed = new MessageEmbed(originalMessage.embeds[0]); // Clone existing embed
                
                let teamsConfigured = updatedGameData.status === 'lobby_configured' && updatedGameData.num_teams > 0;
                
                newEmbed.fields = []; // Clear existing fields to re-add them with potentially new info
                newEmbed.addField("Status", updatedGameData.status === 'setup' ? '⚙️ Setup (Waiting for Host)' : (updatedGameData.status === 'lobby_configured' ? '✅ Lobby Configured' : updatedGameData.status), true);
                newEmbed.addField("Teams", teamsConfigured ? `${updatedGameData.num_teams}` : "Not Set", true);
                newEmbed.addField("Players/Team", teamsConfigured ? (updatedGameData.max_players === 0 ? "Unlimited" : `${updatedGameData.max_players}`) : "N/A", true);


                const newComponents = originalMessage.components.map(row => {
                    const newRow = new MessageActionRow();
                    row.components.forEach(comp => {
                        const button = new MessageButton(comp); // Create new button from old one's data
                        if (button.customId.startsWith("GAME_HOST_SETUP_TEAMS-")) {
                            button.setLabel(teamsConfigured ? "Reconfigure Teams" : "Setup Teams");
                        }
                        if (button.customId.startsWith("GAME_HOST_MANAGE_PLAYERS-") || button.customId.startsWith("GAME_HOST_VOICE_CONTROL-")) {
                            button.setDisabled(!teamsConfigured);
                        }
                        newRow.addComponents(button);
                    });
                    return newRow;
                });
                await originalMessage.edit({ embeds: [newEmbed], components: newComponents });
                logger.info(`[GAME_MODAL_SETUP] Original game message for game ${gameId} updated after team setup.`);
            }
        }
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new EmbedBuilder()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top talkers - Last 30 days)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addFields({ name: (k+1).toString() + ". " + mention, value: s.toString() });
        await modalInteraction.editReply({ content: `Game settings updated! Teams: ${parsedNumTeams}, Max Players/Team: ${parsedMaxPlayers === 0 ? "Unlimited" : parsedMaxPlayers}. You can now manage players and voice controls.` });

    } catch (error) {
        logger.error(`[GAME_MODAL_SETUP] Error processing team setup for game ${gameId}: ${error.message || error}`);
        if (!modalInteraction.replied && !modalInteraction.deferred) {
            await modalInteraction.reply({ content: "An error occurred while updating game settings.", ephemeral: true });
        } else {
            await modalInteraction.editReply({ content: "An error occurred while updating game settings." });
        }
    }
}
        var timingFilters = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;


        case "7days":
            logger.info("Gathering all voice timings");
            var today = Math.floor(new Date().getTime() / 1000);
            var startDate = (today - (7*24*60*60));
            logger.info("Start Date: " + startDate);
        try{
            var respVoice = await api.get("voice_tracking",{
                discord_server_id:button.guild.id,
                _filter: "disconnect_time > " + startDate
            });
        }catch(error){
            logger.error(error);
        }
        logger.info(respVoice)
        if(!respVoice.voice_trackings[0]){
            button.channel.send({ content: "There is no data available yet..."}) 
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
        logger.info("Printing array to a table, will only show up in live console, not logs...")
        console.table(totalTime);
        var output = "";

        totalTime.sort(compareSecondColumn);
        var ListEmbed = new EmbedBuilder()
        .setColor("#c586b6")
        .setTitle("Voice Channel Leaderboard (Top talkers - Last 7 days)");
        var count = 10;
        if(totalTime.length<count) {count = totalTime.length;}
        await button.deferUpdate();
        for(var k = 0;k<count;k++){
            try{
                const userId = totalTime[k][0];
                const user = await button.guild.members.fetch(userId);
                var mention = user.displayName;
            }catch(error){
                logger.error(error.message);
            }
            var diff = Math.floor(totalTime[k][1]), units = [
                { d: 60, l: "seconds" },
                { d: 60, l: "minutes" },
                { d: 24, l: "hours" },
                { d: 1000, l: "days" }
            ];
        
            var s = '';
            for (var i = 0; i < units.length; ++i) {
            s = (diff % units[i].d) + " " + units[i].l + " " + s;
            diff = Math.floor(diff / units[i].d);
            }
            ListEmbed.addFields({ name: (k+1).toString() + ". " + mention, value: s.toString() });
        }
        

        var timingFilters = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICEnon-muted")
                .setLabel("Non-muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEmuted")
                .setLabel("Muted times only")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICEtop")
                .setLabel("Top Talkers")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        var timingFilters2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("VOICE30days")
                .setLabel("Top - Last 30 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
            new ButtonBuilder()
                .setCustomId("VOICE7days")
                .setLabel("Top - Last 7 Days")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
                new ButtonBuilder()
                .setCustomId("VOICEchannel")
                .setLabel("Top Talkers - By Channel")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
                new ButtonBuilder()
                .setCustomId("VOICEchannelUse")
                .setLabel("Top Channels by use")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false),
        );
        await button.editReply({components: [timingFilters, timingFilters2], embeds: [ListEmbed]});
        logger.info("Sent Voice Leaderboard!")
        break;
    }
        }else if((button.customId.substr(0,4)==="GAME")){
            button.customId = button.customId.substr(4);
            var operation = button.customId.substr(0,button.customId.indexOf('-'));
            var hostId = button.customId.substr(button.customId.indexOf('-')+1);
            //button.channel.send("Operation: " + operation + ", Host ID: " + hostId);
            switch(operation){
                case "join":
                    await button.deferUpdate();
                    const voiceChannel = button.member.voice.channel;
                    if (!voiceChannel) {
                        button.reply({ content: "You need to be in a voice channel to join a game.", ephemeral: true})
                        return;
                    }
                    logger.info("Adding " + button.member.displayName + " to " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(!respGame.game_joining_masters[0].status === "open"){
                        button.reply({ content: "That game is not currently open...", ephemeral: true}) 
                        return;
                    }
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.member.id
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(respGamePlayer.game_joining_players[0]){
                        button.reply({ content: "You are already in this game...", ephemeral: true})
                        return;
                    }
                    var respGameJoin;
                    try{
                        respGameJoin = await api.post("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.member.id
                        })
                    }catch(error){
                        logger.error(error.message);
                        button.reply({ content: "There was an error adding you to the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    var kickableList = new StringSelectMenuBuilder()
                        .setCustomId('GAMEkick-'+hostId)
                        .setPlaceholder('Select someone to remove');
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        kickableList.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Kick from the game",
                            emoji: '👢',
                        })
                    }
                            
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addFields({ name: "Info about the buttons:", value: "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact" });
                        ListEmbed.addFields({ name: "Current Players:", value: playersList });
                        var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEjoin-'+hostId)
                                .setLabel('Join')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('GAMEleave-'+hostId)
                                .setLabel('Leave')
                                .setStyle(ButtonStyle.Primary),
                        );
                        var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Start')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                        );
                        var row3 = new ActionRowBuilder()
                            .addComponents(kickableList);

                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "leave":
                    await button.deferUpdate();
                    logger.info("Removing " + button.member.displayName + " from " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.member.id
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGamePlayer.game_joining_players[0]){
                        button.reply({ content: "You are not currently in this game...", ephemeral: true})
                        return;
                    }
                    var respGameLeave;
                    try{
                        respGameLeave = await api.delete("game_joining_player", {
                            game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id)
                        })
                    }catch(error){
                        logger.error(error);
                        button.reply({ content: "There was an error removing you from the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }
                    if(playersList === ""){
                        playersList = "No players currently in the game...";
                    }
                    var kickableList = new StringSelectMenuBuilder()
                    .setCustomId('GAMEkick-'+hostId)
                    .setPlaceholder('Select someone to remove');
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        kickableList.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Kick from the game",
                            emoji: '👢',
                        })
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addFields({ name: "Info about the buttons:", value: "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact" });
                        ListEmbed.addFields({ name: "Current Players:", value: playersList });
                        var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEjoin-'+hostId)
                                .setLabel('Join')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('GAMEleave-'+hostId)
                                .setLabel('Leave')
                                .setStyle(ButtonStyle.Primary),
                        );
                        var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Start')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                        );
                        var row3 = new ActionRowBuilder()
                            .addComponents(kickableList);
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "start":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can start the game...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info("Starting " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(!respGame.game_joining_masters[0].status === "open"){
                        button.reply({ content: "This game has already started...", ephemeral: true}) 
                        return;
                    }
                    var respGameStart;
                    try{
                        respGameStart = await api.put("game_joining_master", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            status:"started"
                        })
                    }catch(error){
                        logger.error(error);
                        button.reply({ content: "There was an error starting the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(respPlayersList.game_joining_players.length<2){
                        button.reply({ content: "You need at least 2 players to start the game...", ephemeral: true})
                        return;
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }
                    //button.reply({ content: `The game has been started, new people cannot join!`, ephemeral: true})
                    
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addFields({ name: "Game is starting...", value: "Only the host can interact with the menu now" });
                    ListEmbed.addFields({ name: "Current Players:", value: playersList });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEgamemodes-'+hostId)
                                .setLabel('See gamemodes')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End game')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    
                    button.editReply({ embeds: [ListEmbed], components: [row, row2] })
                    break;
                case "gamemodes":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can start the game...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addFields({ name: "Host is choosing gamemode...", value: "Only the host can interact with the menu now" });
                    ListEmbed.addFields({ name: "Current Players:", value: playersList });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMErandomize-'+hostId)
                                .setLabel('Random Teams')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEcaptains-'+hostId)
                                .setLabel('Captains pick')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End game')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Go back')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    
                    button.editReply({ embeds: [ListEmbed], components: [row, row2] })
                    break;
                case "end":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can end the game...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info("Ending " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }   
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(respGame.game_joining_masters[0].status === "open" || respGame.game_joining_masters[0].status === "started"){
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
                            button.reply({ content: "There was an error ending the game...", ephemeral: true})
                        }
                        var guild = button.guild;
                        var host = await guild.members.fetch(hostId);
                        var ListEmbed = new EmbedBuilder()
                            .setColor("#c586b6")
                            .setTitle(`${host.displayName}'s game has ended.`);
                        button.editReply({ embeds: [ListEmbed], components: []})
                        button.channel.send({ content: `The game has been ended and everyone was removed from the party!`})
                    }
                    break;
                case "reopen":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can re-open the game...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info("Re-opening " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(respGame.game_joining_masters[0].status === "started"){
                        var respGameStart;
                        try{
                            respGameStart = await api.put("game_joining_master", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                status:"open"
                            })
                        }catch(error){
                            logger.error(error);
                            button.reply({ content: "There was an error re-opening the game...", ephemeral: true})
                        }
                        var respPlayersList;
                        try{
                            respPlayersList = await api.get("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                        }
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            var respTemp = await api.put("game_joining_player",{
                                game_player_id:Number(respPlayersList.game_joining_players[i].game_player_id),
                                team:"none",
                                captain:"no"
                            })
                        }
                        const kickableList = new StringSelectMenuBuilder()
                            .setCustomId('GAMEkick-'+hostId)
                            .setPlaceholder('Select someone to remove');
                        var playersList = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                            var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                            kickableList.addOptions({
                                label: player.displayName,
                                value: respPlayersList.game_joining_players[i].player_id,
                                description: "Kick from the game",
                                emoji: '👢',
                            })
                        }
                        var playersList = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        }
                        button.channel.send({ content: `The game has been re-opened, new people can join!`})
                        var guild = button.guild;
                        var host = await guild.members.fetch(hostId);
                        var ListEmbed = new EmbedBuilder()
                            .setColor("#c586b6")
                            .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addFields({ name: "Info about the buttons:", value: "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact" });
                        ListEmbed.addFields({ name: "Current Players:", value: playersList });
                        var row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('GAMEjoin-'+hostId)
                                    .setLabel('Join')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('GAMEleave-'+hostId)
                                    .setLabel('Leave')
                                    .setStyle(ButtonStyle.Primary),
                            );
                        var row2 = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('GAMEstart-'+hostId)
                                    .setLabel('Start')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('GAMEend-'+hostId)
                                    .setLabel('End')
                                    .setStyle(ButtonStyle.Secondary),
                            );
                        var row3 = new ActionRowBuilder()
                            .addComponents(kickableList);
                        button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })
                    }
                    break;
                case "randomize":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the gamemode...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info("Randomizing " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    if(respGame.game_joining_masters[0].status === "started"){
                        var respPlayersList;
                        try{
                            respPlayersList = await api.get("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id)
                            })
                        }catch(error){
                            logger.error(error);
                        }
                        if(respPlayersList.game_joining_players.length<2){
                            button.channel.send({ content: "There are not enough players to randomize teams..."})
                            return;
                        }
                        var playersList = [];
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            playersList.push("<@" + respPlayersList.game_joining_players[i].player_id + ">");
                        }
                        var team2 = [];
                        
                        logger.info("PlayerList: " + playersList)
                        var maxTeamSize = Math.floor(playersList.length/2);
                        for(var i = 0;i<maxTeamSize;i++){
                            var random = Math.floor(Math.random() * playersList.length);
                            team2.push(playersList[random]);
                            playersList.splice(random,1);
                        }
                        logger.info("Team 1: " + playersList);
                        logger.info("Team 2: " + team2);
                        //const voiceChannels = button.guild.channels.cache.filter((channel) => channel.type === 'GUILD_VOICE');
                        const roleNames = ['League of Legends', 'programmer', 'Gamer']; // Replace with the name of your role

                        // Fetch the role by name
                        const roles = roleNames.map(roleName => button.guild.roles.cache.find(r => r.name === roleName));
                        const voiceChannels = button.guild.channels.cache.filter(channel => {
                            // Check if the channel is a voice channel
                            if (channel.type !== 'GUILD_VOICE') return false;
                        
                            // Check if any of the roles has VIEW_CHANNEL permission in the channel
                            return roles.some(role => {
                                if(!role) return false; // Skip if the role is undefined or null
                                return channel.permissionsFor(role).has(PermissionsBitField.Flags.ViewChannel);
                            });

                        });
                        const channelListTeam1 = new StringSelectMenuBuilder()
                            .setCustomId('GAMEchannelTeam1-'+hostId)
                            .setPlaceholder('Select a voice channel to send Team 1 to');
                        voiceChannels.forEach((channel) => {
                            channelListTeam1.addOptions([
                                {
                                label: channel.name,
                                value: channel.id,
                                },
                            ]);
                        });
                        const channelListTeam2 = new StringSelectMenuBuilder()
                            .setCustomId('GAMEchannelTeam2-'+hostId)
                            .setPlaceholder('Select a voice channel to send Team 2 to');
                        voiceChannels.forEach((channel) => {
                            channelListTeam2.addOptions([
                                {
                                label: channel.name,
                                value: channel.id,
                                },
                            ]);
                        });
                        for(var i = 0;i<playersList.length;i++){
                            var respGamePlayer;
                            try{
                                respGamePlayer = await api.get("game_joining_player", {
                                    game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                    player_id:playersList[i].substr(2,playersList[i].length-3)
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                            var respGamePlayerUpdate;
                            try{
                                respGamePlayerUpdate = await api.put("game_joining_player", {
                                    game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id),
                                    team:"1"
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                        }
                        for(var i = 0;i<team2.length;i++){
                            var respGamePlayer;
                            try{
                                respGamePlayer = await api.get("game_joining_player", {
                                    game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                    player_id:team2[i].substr(2,team2[i].length-3)
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                            var respGamePlayerUpdate;
                            try{
                                respGamePlayerUpdate = await api.put("game_joining_player", {
                                    game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id),
                                    team:"2"
                                })
                            }catch(error){
                                logger.error(error.message);
                            }
                        }
                        var guild = button.guild;
                        var host = await guild.members.fetch(hostId);
                        var ListEmbed = new EmbedBuilder()
                            .setColor("#c586b6")
                            .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addFields({ name: "Game is randomized!", value: "Only the host can interact with the menu now" });
                        ListEmbed.addFields({ name: "Team 1:", value: playersList.join("\n") });
                        ListEmbed.addFields({ name: "Team 2:", value: team2.join("\n") });
                        var row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('GAMErandomize-'+hostId)
                                    .setLabel('Randomize Teams')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('GAMEreturn-'+hostId)
                                    .setLabel('Return players to starting channel')
                                    .setStyle(ButtonStyle.Secondary),
                            );
                        var row2 = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('GAMEend-'+hostId)
                                    .setLabel('End')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('GAMEreopen-'+hostId)
                                    .setLabel('Re-open game')
                                    .setStyle(ButtonStyle.Secondary),
                            );
                        var row3 = new ActionRowBuilder()
                            .addComponents(channelListTeam1);
                        var row4 = new ActionRowBuilder()
                            .addComponents(channelListTeam2);
                        button.editReply({ embeds: [ListEmbed], components: [row, row2, row3, row4] })
                    }
                    break;
                case "captains":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the game mode...", ephemeral: true})
                        return;
                    }
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    logger.info("respPlayers exist?: + " + respPlayersList)
                    if(respPlayersList.game_joining_players.length<2){
                        button.channel.send({ content: "There are not enough players to do a captain pick..."})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info(hostId + " chose captain pick");
                    if(!respGame.game_joining_masters[0]){
                        await button.followUp({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!respGame.game_joining_masters[0].status === "started"){
                        await button.followUp({ content: "The game has not started yet...this is definitely an error. Report it to the creator.", ephemeral: true})
                        return;
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var chooseCaptain1 = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain1-'+hostId)
                        .setPlaceholder('Select a player to make into the captain for Team 1');
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        chooseCaptain1.addOptions([
                            {
                                label: player.displayName,
                                value: respPlayersList.game_joining_players[i].player_id,
                                description: "Make Team 1 captain",
                            },
                        ]);
                    };
                    
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addFields({ name: "Choosing Captains!", value: "Only the host can interact with the menu now" });
                    ListEmbed.addFields({ name: "Current Players:", value: playersList });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    var row3 = new ActionRowBuilder()
                        .addComponents(chooseCaptain1);
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "captain1":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the captain...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info("Setting captain 1");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        await button.followUp({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        await button.followUp({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    const captain1 = button.values[0];
                    logger.info("captain1: " + captain1);
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        await button.followUp({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    var newCaptain1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(respPlayersList.game_joining_players[i].player_id === captain1){
                            newCaptain1 = respPlayersList.game_joining_players[i].game_player_id;
                            break;
                        }
                    }
                    logger.info("captain1 " + captain1)
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.put("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:captain1,
                            captain:"yes",
                            game_player_id:parseInt(newCaptain1),
                            team:"1"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    logger.info("respGamePlayer: " + respGamePlayer);
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var chooseCaptain2 = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain2-'+hostId)
                        .setPlaceholder('Select a player to make into the captain for Team 2');
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(respPlayersList.game_joining_players[i].player_id === captain1){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        chooseCaptain2.addOptions([
                            {
                                label: player.displayName,
                                value: respPlayersList.game_joining_players[i].player_id,
                                description: "Make Team 2 captain",
                            },
                        ]);
                    };
                    
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addFields({ name: "Choosing Captains!", value: "Only the host can interact with the menu now" });
                    ListEmbed.addFields({ name: "Current Players:", value: playersList });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    var row3 = new ActionRowBuilder()
                        .addComponents(chooseCaptain2);
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })
                    break;
                case "captain2":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can choose the captain...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    logger.info("Setting captain 2");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        await button.followUp({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    if(!(respGame.game_joining_masters[0].status === "started")){
                        await button.followUp({ content: "The game has not started yet...", ephemeral: true})
                        return;
                    }
                    const captain2 = button.values[0];
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        await button.followUp({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    var newCaptain2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(respPlayersList.game_joining_players[i].player_id === captain2){
                            newCaptain2 = respPlayersList.game_joining_players[i].game_player_id;
                            respPlayersList.game_joining_players[i].team = "2";
                            break;
                        }
                    }
                    logger.info("captain2 " + captain2)
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.put("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:captain2,
                            captain:"yes",
                            game_player_id:parseInt(newCaptain2),
                            team:"2"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }

                    var captain1pick = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain1pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 1');
                        captain1pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain1pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 1",
                            emoji: '1️⃣',
                        })
                    }
                    var captain2pick = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain2pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 2');
                        captain2pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain2pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 2",
                            emoji: '2️⃣',
                        })
                    }

                    var playersListNoTeam = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListNoTeam += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    if(playersListNoTeam === ""){
                        playersListNoTeam = "No players left to pick!"
                    }
                    var playersListTeam1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "1")){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListTeam1 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "2")){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListTeam2 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addFields({ name: "Captains are choosing!", value: "Choose a player from the corresponding drop down to add them to your team!\nGrey buttons are for the host" });
                        ListEmbed.addFields({ name: "No team:", value: playersListNoTeam });
                        ListEmbed.addFields({ name: "Team 1:", value: playersListTeam1 });
                        ListEmbed.addFields({ name: "Team 2:", value: playersListTeam2 });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            captain1pick
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            captain2pick
                        );
                    var row3 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })

                    break;
                case "captain1pick":                    
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    var respCaptain1;
                    try{
                        respCaptain1 = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            team:"1",
                            captain:"yes"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respCaptain1.game_joining_players[0]){
                        button.reply({ content: "Found no captain for team 1. Something broke..."})
                        return;
                    }
                    await button.deferUpdate();
                    if(button.member.id !=respCaptain1.game_joining_players[0].player_id){
                        await button.followUp({ content: "Only the captain for team 1 can choose the player...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting captain 1 pick");

                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        await button.followUp({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    const player1 = button.values[0];
                    logger.info("player1: " + player1);
                    if(player1 === "none"){
                        await button.followUp({ content: "You must select a player...", ephemeral: true})
                        return;
                    }else{
                        var captain1player = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            if(respPlayersList.game_joining_players[i].player_id === player1){
                                captain1player = respPlayersList.game_joining_players[i].game_player_id;
                                respPlayersList.game_joining_players[i].team = "1";
                                break;
                            }
                        }
                        var respCaptain1pick;
                        try{
                            respCaptain1pick = await api.put("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                game_player_id:parseInt(captain1player),
                                team:"1"
                            })
                        }catch(error){
                            logger.error(error.message);
                        }
                    }
                    var captain1pick = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain1pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 1');
                        captain1pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain1pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 1",
                            emoji: '1️⃣',
                        })
                    }
                    var captain2pick = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain2pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 2');
                        captain2pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain2pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 2",
                            emoji: '2️⃣',
                        })
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

                        // Fetch the role by name
                    var roles = roleNames.map(roleName => button.guild.roles.cache.find(r => r.name === roleName));
                    const voiceChannelspick1 = button.guild.channels.cache.filter(channel => {
                        // Check if the channel is a voice channel
                        if (channel.type !== 'GUILD_VOICE') return false;
                    
                        // Check if any of the roles has VIEW_CHANNEL permission in the channel
                        return roles.some(role => {
                            if(!role) return false; // Skip if the role is undefined or null
                            return channel.permissionsFor(role).has(PermissionsBitField.Flags.ViewChannel);
                        });

                    });
                    const channelListTeam1pick1 = new StringSelectMenuBuilder()
                        .setCustomId('GAMEchannelTeam1-'+hostId)
                        .setPlaceholder('Select a voice channel to send Team 1 to');
                    voiceChannelspick1.forEach((channel) => {
                        channelListTeam1pick1.addOptions([
                            {
                            label: channel.name,
                            value: channel.id,
                            },
                        ]);
                    });
                    const channelListTeam2pick1 = new StringSelectMenuBuilder()
                        .setCustomId('GAMEchannelTeam2-'+hostId)
                        .setPlaceholder('Select a voice channel to send Team 2 to');
                    voiceChannelspick1.forEach((channel) => {
                        channelListTeam2pick1.addOptions([
                            {
                            label: channel.name,
                            value: channel.id,
                            },
                        ]);
                    });

                    var playersListNoTeam = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListNoTeam += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    if(playersListNoTeam === ""){
                        playersListNoTeam = "No players left to pick!"
                    }
                    var playersListTeam1 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "1")){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListTeam1 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }
                    var playersListTeam2 = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "2")){
                            continue;
                        }
                        logger.info("Player: " + respPlayersList.game_joining_players[i].player_id + " " + respPlayersList.game_joining_players[i].team)
                        playersListTeam2 += ("<@" + respPlayersList.game_joining_players[i].player_id + ">\n");
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addFields({ name: "Captains are choosing!", value: "Choose a player from the corresponding drop down to add them to your team!\nGrey buttons are for the host" });
                    ListEmbed.addFields({ name: "No team:", value: playersListNoTeam });
                    ListEmbed.addFields({ name: "Team 1:", value: playersListTeam1 });
                    ListEmbed.addFields({ name: "Team 2:", value: playersListTeam2 });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            captain1pick
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            captain2pick
                        );
                    var row3 = new ActionRowBuilder()
                        .addComponents(channelListTeam1pick1);
                    var row4 = new ActionRowBuilder()
                        .addComponents(channelListTeam2pick1);
                    var row5 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3, row4, row5] })
                    break;
                case "captain2pick":
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true})
                        return;
                    }
                    var respCaptain2;
                    try{
                        respCaptain2 = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            team:"2",
                            captain:"yes"
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respCaptain2.game_joining_players[0]){
                        button.reply({ content: "Found no captain for team 2. Something broke..."})
                        return;
                    }
                    await button.deferUpdate();
                    if(button.member.id !=respCaptain2.game_joining_players[0].player_id){
                        await button.followUp({ content: "Only the captain for team 2 can choose the player...", ephemeral: true})
                        return;
                    }
                    logger.info("Setting captain 2 pick");

                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error.message);
                    }
                    if(!respPlayersList.game_joining_players[0]){
                        await button.followUp({ content: "There are no players in the game...", ephemeral: true})
                        return;
                    }
                    const player2 = button.values[0];
                    logger.info("player2: " + player2);
                    if(player2 === "none"){
                        await button.followUp({ content: "You must select a player...", ephemeral: true})
                        return;
                    }else{
                        var captain2player = "";
                        for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                            if(respPlayersList.game_joining_players[i].player_id === player2){
                                captain2player = respPlayersList.game_joining_players[i].game_player_id;
                                respPlayersList.game_joining_players[i].team = "2";
                                break;
                            }
                        }
                        var respCaptain2pick;
                        try{
                            respCaptain2pick = await api.put("game_joining_player", {
                                game_id:parseInt(respGame.game_joining_masters[0].game_id),
                                game_player_id:parseInt(captain2player),
                                team:"2"
                            })
                        }catch(error){
                            logger.error(error.message);
                        }
                    }
                    var captain1pick = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain1pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 1');
                        captain1pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain1pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 1",
                            emoji: '1️⃣',
                        })
                    }
                    var captain2pick = new StringSelectMenuBuilder()
                        .setCustomId('GAMEcaptain2pick-'+hostId)
                        .setPlaceholder('Select someone to add to team 2');
                        captain2pick.addOptions({
                            label: "Blank Placeholder",
                            value: "none",
                            description: "Prevents the dropdown from disappearing",
                        })
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        if(!(respPlayersList.game_joining_players[i].team === "none")){
                            continue;
                        }
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        captain2pick.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Add to team 2",
                            emoji: '2️⃣',
                        })
                    }
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
                        // Fetch the role by name
                    var roles = roleNames.map(roleName => button.guild.roles.cache.find(r => r.name === roleName));
                    const voiceChannelspick2 = button.guild.channels.cache.filter(channel => {
                        // Check if the channel is a voice channel
                        if (channel.type !== 'GUILD_VOICE') return false;
                    
                        // Check if any of the roles has VIEW_CHANNEL permission in the channel
                        return roles.some(role => {
                            if(!role) return false; // Skip if the role is undefined or null
                            return channel.permissionsFor(role).has(PermissionsBitField.Flags.ViewChannel);
                        });

                    });
                    const channelListTeam1pick2 = new StringSelectMenuBuilder()
                        .setCustomId('GAMEchannelTeam1-'+hostId)
                        .setPlaceholder('Select a voice channel to send Team 1 to');
                    voiceChannelspick2.forEach((channel) => {
                        channelListTeam1pick2.addOptions([
                            {
                            label: channel.name,
                            value: channel.id,
                            },
                        ]);
                    });
                    const channelListTeam2pick2 = new StringSelectMenuBuilder()
                        .setCustomId('GAMEchannelTeam2-'+hostId)
                        .setPlaceholder('Select a voice channel to send Team 2 to');
                    voiceChannelspick2.forEach((channel) => {
                        channelListTeam2pick2.addOptions([
                            {
                            label: channel.name,
                            value: channel.id,
                            },
                        ]);
                    });

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                    ListEmbed.addFields({ name: "Captains are choosing!", value: "Choose a player from the corresponding drop down to add them to your team!\nGrey buttons are for the host" });
                    ListEmbed.addFields({ name: "No team:", value: playersListNoTeam });
                    ListEmbed.addFields({ name: "Team 1:", value: playersListTeam1 });
                    ListEmbed.addFields({ name: "Team 2:", value: playersListTeam2 });
                    var row = new ActionRowBuilder()
                        .addComponents(
                            captain1pick
                        );
                    var row2 = new ActionRowBuilder()
                        .addComponents(
                            captain2pick
                        );
                    var row3 = new ActionRowBuilder()
                        .addComponents(channelListTeam1pick2);
                    var row4 = new ActionRowBuilder()
                        .addComponents(channelListTeam2pick2);
                    var row5 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreopen-'+hostId)
                                .setLabel('Re-open game')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEreturn-'+hostId)
                                .setLabel('Return players to starting channel')
                                .setStyle(ButtonStyle.Secondary),
                        );
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3, row4, row5] })
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
                case "kick":
                    if(button.member.id != hostId){
                        button.reply({ content: "Only the host can kick players...", ephemeral: true})
                        return;
                    }
                    await button.deferUpdate();
                    if(button.values[0] === hostId){
                        button.reply({ content: "You cannot kick yourself from your own game...", ephemeral: true})
                        return;
                    }
                    logger.info("Kicking " + button.values[0] + " from " + hostId + "'s game");
                    var respGame;
                    try{
                        respGame = await api.get("game_joining_master", {
                            host_id:hostId
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGame.game_joining_masters[0]){
                        button.reply({ content: "There is no game currently available...", ephemeral: true}) 
                        return;
                    }
                    var respGamePlayer;
                    try{
                        respGamePlayer = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id),
                            player_id:button.values[0]
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    if(!respGamePlayer.game_joining_players[0]){
                        button.reply({ content: "You are not currently in this game...", ephemeral: true})
                        return;
                    }
                    var respGameLeave;
                    try{
                        respGameLeave = await api.delete("game_joining_player", {
                            game_player_id:parseInt(respGamePlayer.game_joining_players[0].game_player_id)
                        })
                    }catch(error){
                        logger.error(error);
                        button.reply({ content: "There was an error removing you from the game...", ephemeral: true})
                    }
                    var respPlayersList;
                    try{
                        respPlayersList = await api.get("game_joining_player", {
                            game_id:parseInt(respGame.game_joining_masters[0].game_id)
                        })
                    }catch(error){
                        logger.error(error);
                    }
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                    }
                    if(playersList === ""){
                        playersList = "No players currently in the game...";
                    }
                    var kickableList = new StringSelectMenuBuilder()
                    .setCustomId('GAMEkick-'+hostId)
                    .setPlaceholder('Select someone to remove');
                    var playersList = "";
                    for(var i = 0;i<respPlayersList.game_joining_players.length;i++){
                        playersList += "<@" + respPlayersList.game_joining_players[i].player_id + ">\n";
                        var player = await button.guild.members.fetch(respPlayersList.game_joining_players[i].player_id);
                        kickableList.addOptions({
                            label: player.displayName,
                            value: respPlayersList.game_joining_players[i].player_id,
                            description: "Kick from the game",
                            emoji: '👢',
                        })
                    }

                    var guild = button.guild;
                    var host = await guild.members.fetch(hostId);
                    var ListEmbed = new EmbedBuilder()
                        .setColor("#c586b6")
                        .setTitle(`${host.displayName}'s game menu.`);
                        ListEmbed.addFields({ name: "Info about the buttons:", value: "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact" });
                        ListEmbed.addFields({ name: "Current Players:", value: playersList });
                        var row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEjoin-'+hostId)
                                .setLabel('Join')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('GAMEleave-'+hostId)
                                .setLabel('Leave')
                                .setStyle(ButtonStyle.Primary),
                        );
                        var row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('GAMEstart-'+hostId)
                                .setLabel('Start')
                                .setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder()
                                .setCustomId('GAMEend-'+hostId)
                                .setLabel('End')
                                .setStyle(ButtonStyle.Secondary),
                        );
                        var row3 = new ActionRowBuilder()
                            .addComponents(kickableList);
                    button.editReply({ embeds: [ListEmbed], components: [row, row2, row3] })
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
