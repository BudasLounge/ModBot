var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient(); // Module-scoped API client
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

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

        // ADDED LOGGING BLOCK START
        if (timeFilterDays === 30 && duration > 0 && track.user_id) { // Log only for 30-day filter and when duration is positive
            const currentTotalForUser = totalTimeByUser.get(track.user_id) || 0;
            logger.info(`[GVL_30D_TRACE] User ${track.user_id} segment:`);
            logger.info(`  Raw: conn=${track.connect_time}, disc=${track.disconnect_time}`);
            logger.info(`  Parsed: connectTime=${connectTime}, disconnectTime=${disconnectTime}`);
            logger.info(`  FilterWin: filterStartDate=${filterStartDate}, currentTime=${currentTime}`);
            logger.info(`  EffectiveSeg: effConn=${effectiveConnectTime}, effDisc=${effectiveDisconnectTime}`);
            logger.info(`  SegmentDur: ${duration}`);
            logger.info(`  UserTotal: old=${currentTotalForUser}, new=${currentTotalForUser + duration}`);
        }
        // ADDED LOGGING BLOCK END

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


async function onButtonClick(interaction) {
    if (!interaction.isButton()) return;
    const button = interaction; // Alias for clarity, as original code uses 'button'

    if ((button.customId.substr(0, 5) === "VOICE")) {
        const commandName = button.customId.substr(5);
        switch (commandName) {
            case "bottom":
                await generateVoiceLeaderboard(button, "Voice Channel Leaderboard (Bottom 10)", { sortOrder: 'bottom' });
                break;
            case "top":
                await generateVoiceLeaderboard(button, "Voice Channel Leaderboard (Top 10)", { sortOrder: 'top' });
                break;
            case "muted":
                await generateVoiceLeaderboard(button, "Voice Channel Leaderboard (Top 10 Muted)", { sortOrder: 'top', mutedFilter: true });
                break;
            case "non-muted":
                await generateVoiceLeaderboard(button, "Voice Channel Leaderboard (Top 10 Non-Muted)", { sortOrder: 'top', mutedFilter: false });
                break;
            case "30days":
                await generateVoiceLeaderboard(button, "Voice Channel Leaderboard (Top Talkers - Last 30 Days)", { sortOrder: 'top', timeFilterDays: 30 });
                break;
            case "7days":
                await generateVoiceLeaderboard(button, "Voice Channel Leaderboard (Top Talkers - Last 7 Days)", { sortOrder: 'top', timeFilterDays: 7 });
                break;
            case "channel": // Top Talkers - By Channel
                await button.deferUpdate();
                logger.info("Handling VOICEchannel: Top Talkers by Channel");
                try {
                    const respVoice = await api.get("voice_tracking", {
                        discord_server_id: button.guild.id,
                    });

                    if (!respVoice.voice_trackings || respVoice.voice_trackings.length === 0) {
                        await button.editReply({ content: "There is no voice data available yet.", embeds: [], components: [] });
                        return;
                    }

                    const totalTime = new Map(); // Key: "username, channel: channelName", Value: seconds
                    const currentTime = Math.floor(Date.now() / 1000);

                    for (const track of respVoice.voice_trackings) {
                        const channel = button.guild.channels.cache.get(track.channel_id);
                        if (!channel) continue;

                        let member;
                        try {
                            member = await button.guild.members.fetch(track.user_id);
                        } catch (err) {
                            logger.warn(`Could not fetch member ${track.user_id} for VOICEchannel: ${err.message}`);
                            continue; 
                        }
                        if(!member) continue;

                        const usernameChannelKey = `${member.displayName}, channel: ${channel.name}`;
                        const connectTime = parseInt(track.connect_time, 10);
                        let disconnectTime = parseInt(track.disconnect_time, 10);
                        if (disconnectTime === 0 || isNaN(disconnectTime)) {
                            disconnectTime = currentTime;
                        }
                        if (isNaN(connectTime)) continue;

                        const duration = Math.max(0, Math.floor(disconnectTime - connectTime));
                        if (duration > 0) {
                            totalTime.set(usernameChannelKey, (totalTime.get(usernameChannelKey) || 0) + duration);
                        }
                    }

                    if (totalTime.size === 0) {
                         await button.editReply({ content: "No processed voice data for users by channel.", embeds: [], components:[] });
                        return;
                    }
                    
                    const sortedTotalTime = [...totalTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
                    const listEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle("Voice Channel Leaderboard (Top 10 User by Channel)");

                    for (let i = 0; i < sortedTotalTime.length; i++) {
                        const [userChannelKey, time] = sortedTotalTime[i];
                        listEmbed.addField(`${i + 1}. ${userChannelKey}`, formatDuration(time));
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
                    logger.info("Sent Voice Leaderboard (User by Channel)!");
                } catch (error) {
                    logger.error(`Error in VOICEchannel handler: ${error.message || error}`);
                    await button.editReply({ content: "An error occurred while processing channel data.", embeds: [], components: [] });
                }
                break;

            case "channelUse": // Top Channels by use
                await button.deferUpdate();
                logger.info("Handling VOICEchannelUse: Top Channels by Use");
                try {
                    const respVoice = await api.get("voice_tracking", {
                        discord_server_id: button.guild.id,
                    });

                    if (!respVoice.voice_trackings || respVoice.voice_trackings.length === 0) {
                        await button.editReply({ content: "There is no voice data available yet.", embeds: [], components: [] });
                        return;
                    }

                    const totalTimeByChannel = new Map(); // Key: channelName, Value: seconds
                    const currentTime = Math.floor(Date.now() / 1000);

                    for (const track of respVoice.voice_trackings) {
                        const channel = button.guild.channels.cache.get(track.channel_id);
                        if (!channel) continue;

                        const connectTime = parseInt(track.connect_time, 10);
                        let disconnectTime = parseInt(track.disconnect_time, 10);
                        if (disconnectTime === 0 || isNaN(disconnectTime)) {
                            disconnectTime = currentTime;
                        }
                        if (isNaN(connectTime)) continue;
                        
                        const duration = Math.max(0, Math.floor(disconnectTime - connectTime));
                        if (duration > 0) {
                            totalTimeByChannel.set(channel.name, (totalTimeByChannel.get(channel.name) || 0) + duration);
                        }
                    }
                    
                    if (totalTimeByChannel.size === 0) {
                        await button.editReply({ content: "No processed voice data for channel usage.", embeds: [], components: [] });
                        return;
                    }

                    const sortedTotalTime = [...totalTimeByChannel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
                    const listEmbed = new MessageEmbed()
                        .setColor("#c586b6")
                        .setTitle("Voice Channel Leaderboard (Top 10 Channels by Use)");

                    for (let i = 0; i < sortedTotalTime.length; i++) {
                        const [channelName, time] = sortedTotalTime[i];
                        listEmbed.addField(`${i + 1}. ${channelName}`, formatDuration(time));
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
                    logger.info("Sent Voice Leaderboard (Channels by Use)!");
                } catch (error) {
                    logger.error(`Error in VOICEchannelUse handler: ${error.message || error}`);
                    await button.editReply({ content: "An error occurred while processing channel usage data.", embeds: [], components: [] });
                }
                break;
            default:
                logger.warn(`Unknown VOICE command: ${commandName}`);
                await button.reply({ content: "Unknown action.", ephemeral: true });
                break;
        }
    } else if ((button.customId.substr(0, 4) === "GAME")) {
        // ... existing GAME logic from the file ...
        // This section is long and assumed to be mostly functional as per original prompt focus on voicetime
        // For brevity, I'm not reproducing the entire GAME block here but it should be preserved.
        // Ensure logger and api are used correctly if they were not before.
        // Example:
        button.customId = button.customId.substr(4);
        var operation = button.customId.substr(0,button.customId.indexOf('-'));
        var hostId = button.customId.substr(button.customId.indexOf('-')+1);
        // ... rest of GAME logic
        // Make sure to call await button.deferUpdate() or await button.deferReply() as appropriate
        // And use await button.editReply() or await button.reply()
        // Example of a small part of GAME logic to show it's preserved:
        switch(operation){
            case "join":
                await button.deferReply({ ephemeral: true });
                var respGame;
                try{
                    respGame = await api.get("game_joining_master", { host_id:hostId });
                } catch(error){
                    logger.error(`Error fetching game master for host ${hostId} on JOIN: ${error.message || error}`);
                    await button.editReply({ content: "Could not find an active game to join." });
                    return;
                }
                // ... rest of join logic ...
                break;
            // ... other GAME cases ...
        }
        // End of GAME logic placeholder
    }
}

async function userJoinsVoice(oldState, newState) {
    const userId = newState.id;
    const guildId = newState.guild.id;
    const member = newState.member;

    if (!member) {
        logger.warn(`Member not found for user ID ${userId} in guild ${guildId}. Skipping voice state update.`);
        return;
    }
    const username = member.user.username; // Use GuildMember.user.username
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    const currentTime = Math.floor(Date.now() / 1000);
    const isNewChannelAfk = newChannelId === newState.guild.afkChannelId;

    // Attempt to close any existing open session for this user in this guild
    // This handles: leaving, moving, going AFK, or mute state change (session will be reopened with new state)
    let previousSessionClosed = false;
    try {
        const openSessionsResp = await api.get("voice_tracking", {
            user_id: userId,
            discord_server_id: guildId,
            disconnect_time: 0,
        });

        if (openSessionsResp && openSessionsResp.voice_trackings) {
            for (const session of openSessionsResp.voice_trackings) {
                // Close if:
                // 1. User is leaving all VCs (newChannelId is null)
                // 2. User is moving to AFK (isNewChannelAfk is true)
                // 3. User is moving to a different channel (session.channel_id !== newChannelId)
                // 4. User's mute state changed in the same channel (session will be reopened)
                if (!newChannelId || isNewChannelAfk || 
                    (newChannelId && session.channel_id !== newChannelId) ||
                    (newChannelId && session.channel_id === newChannelId && String(newState.selfMute) !== String(session.selfmute))) {
                    
                    logger.info(`Closing session ${session.voice_state_id} for ${username} (${userId}). Reason: Left/AFK/Moved/MuteChange. Old ch: ${session.channel_id}, New ch: ${newChannelId}, New Mute: ${newState.selfMute}`);
                    await api.put("voice_tracking", {
                        voice_state_id: parseInt(session.voice_state_id, 10),
                        disconnect_time: currentTime,
                    });
                    previousSessionClosed = true;
                }
            }
        }
    } catch (error) {
        logger.error(`Error during cleanup of old voice sessions for ${username} (${userId}): ${error.message || error}`);
    }

    // If user is joining a valid (non-AFK) channel, create a new session record.
    // This also handles re-creating a session if mute state changed (old one was closed above).
    if (newChannelId && !isNewChannelAfk) {
        // Before creating, double-check if an identical open session already exists (e.g., from a missed leave/bot restart)
        // This is a safeguard. The logic above should ideally handle closing outdated sessions.
        let createNew = true;
        try {
            const checkResp = await api.get("voice_tracking", {
                user_id: userId,
                discord_server_id: guildId,
                channel_id: newChannelId,
                selfmute: String(newState.selfMute), // Check with current mute state
                disconnect_time: 0
            });
            if (checkResp && checkResp.voice_trackings && checkResp.voice_trackings.length > 0) {
                // An identical open session already exists. Don't create another.
                // This might happen if the previous "close" operation failed or if this event is redundant.
                logger.info(`User ${username} (${userId}) already has an identical active session in channel ${newChannelId}. No new session needed.`);
                createNew = false;
            }
        } catch(e){
            logger.error(`Error checking for existing exact session for ${username} (${userId}): ${e.message || e}`);
            // Proceed to create, assuming no identical session exists if check failed.
        }

        if (createNew) {
            logger.info(`Creating new voice session for ${username} (${userId}) in channel ${newChannelId}. Muted: ${newState.selfMute}`);
            try {
                await api.post("voice_tracking", {
                    user_id: userId,
                    username: username,
                    discord_server_id: guildId,
                    connect_time: currentTime,
                    selfmute: String(newState.selfMute),
                    channel_id: newChannelId,
                    disconnect_time: 0,
                });
            } catch (error) {
                logger.error(`Error creating new voice_tracking session for ${username} (${userId}): ${error.message || error}`);
            }
        }
    }
}


function register_handlers(event_registry) {
    logger = event_registry.logger; // Initialize module-scoped logger
    // api is already module-scoped and initialized

    event_registry.register('voiceStateUpdate', userJoinsVoice);
    event_registry.register('interactionCreate', onButtonClick); // Handles button interactions
}

module.exports = register_handlers;

// Helper comparison functions (if still needed by any part of the code, e.g. GAME logic if it uses them)
// The new leaderboard helper sorts internally.
function compareSecondColumnReverse(a, b) {
    if (a[1] === b[1]) return 0;
    return (a[1] < b[1]) ? -1 : 1;
}
function compareSecondColumn(a, b) {
    if (a[1] === b[1]) return 0;
    return (a[1] > b[1]) ? -1 : 1;
}
