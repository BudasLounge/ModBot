module.exports = {
    name: 'voicetime',
    description: 'Prints a leaderboard of voice activity or manages voice time data.',
    syntax: 'voicetime [cleanup | diagnose]',
    num_args: 0, 
    args_to_lower: true, 
    needs_api: true,
    has_state: false,
    async execute(message, args, extra) {
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const api = extra.api;
        const subCommand = args[1]; // Already lowercased by args_to_lower: true

        if (subCommand === 'cleanup') {
            this.logger.info(`[voicetime cleanup] User ${message.author.tag} initiated cleanup request for guild ${message.guild.id}`);
            const confirmId = `VOICE_CLEANUP_CONFIRM_${message.guild.id}`;
            const cancelId = `VOICE_CLEANUP_CANCEL_${message.guild.id}`;
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(confirmId)
                        .setLabel('Confirm: Delete ALL Voice Data')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(cancelId)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await message.reply({
                content: '⚠️ **Warning!** You are about to delete ALL voice time tracking data for this server. This action is irreversible.\nAre you sure you want to proceed?',
                components: [row],
                ephemeral: true 
            });
            return;

        } else if (subCommand === 'diagnose') {
            this.logger.info(`[voicetime diagnose] User ${message.author.tag} initiated diagnosis for guild ${message.guild.id}`);
            const reply = await message.reply({ content: "Diagnosing ghost sessions... please wait.", ephemeral: true });

            let voiceTrackings;
            try {
                const respVoice = await api.get("voice_tracking", {
                    discord_server_id: message.guild.id,
                    disconnect_time: 0 // Only fetch active sessions
                });
                voiceTrackings = respVoice && respVoice.voice_trackings ? respVoice.voice_trackings : [];
            } catch (error) {
                this.logger.error(`[voicetime diagnose] Failed to fetch voice_tracking data: ${error}`);
                await reply.edit({ content: "An error occurred while fetching voice data for diagnosis." });
                return;
            }

            if (voiceTrackings.length === 0) {
                await reply.edit({ content: "No active voice sessions found to diagnose." });
                return;
            }

            const userActiveSessionCounts = new Map();
            for (const track of voiceTrackings) {
                if (track.user_id) {
                    userActiveSessionCounts.set(track.user_id, (userActiveSessionCounts.get(track.user_id) || 0) + 1);
                }
            }

            const ghostSessionUsers = [];
            for (const [userId, count] of userActiveSessionCounts) {
                if (count > 1) {
                    ghostSessionUsers.push({ userId, count });
                }
            }

            if (ghostSessionUsers.length === 0) {
                await reply.edit({ content: "✅ No ghost sessions found. All users have at most one active session." });
                return;
            }

            let report = `Found users with multiple active ('ghost') sessions:\n`;
            for (const userEntry of ghostSessionUsers) {
                let memberDisplay = `User ID: ${userEntry.userId}`;
                try {
                    const member = await message.guild.members.fetch(userEntry.userId);
                    if (member) memberDisplay = `${member.user.tag} (${userEntry.userId})`;
                } catch { /* ignore, use ID */ }
                report += `- ${memberDisplay} has ${userEntry.count} active sessions.\n`;
            }
            if (report.length > 1900) report = report.substring(0, 1900) + "... (list truncated)";

            const fixAllId = `VOICE_FIX_ALL_${message.guild.id}`;
            const components = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(fixAllId)
                        .setLabel('Attempt to Fix All Listed Ghost Sessions')
                        .setStyle(ButtonStyle.Danger)
                )
            ];
            
            await reply.edit({ content: report, components });
            return;

        } else {
            // Original leaderboard logic
            this.logger.info(`[voicetime] Initial leaderboard request by ${message.author.tag} for guild ${message.guild.id}`);
            let respVoice;
            try {
                respVoice = await api.get("voice_tracking", {
                    discord_server_id: message.guild.id,
                });
            } catch (error) {
                this.logger.error(`[voicetime] Failed to fetch voice_tracking data: ${error}`);
                message.channel.send({ content: "An error occurred while fetching voice data." });
                return;
            }

            const voiceTrackings = respVoice && respVoice.voice_trackings ? respVoice.voice_trackings : [];

            if (voiceTrackings.length === 0) {
                message.channel.send({ content: "There is no voice tracking data available yet." });
                return;
            }

            const totalTime = new Map(); 
            const currentTime = Math.floor(new Date().getTime() / 1000);

            for (const track of voiceTrackings) {
                const { user_id, connect_time, disconnect_time } = track;
                const connectTime = parseInt(connect_time, 10);
                const rawDisconnectTime = parseInt(disconnect_time, 10);
                
                if (isNaN(connectTime)) {
                    this.logger.warn(`[voicetime] Invalid connect_time for track: ${JSON.stringify(track)}`);
                    continue;
                }

                const effectiveDisconnectTime = (rawDisconnectTime === 0 || isNaN(rawDisconnectTime)) ? currentTime : rawDisconnectTime;
                const duration = Math.max(0, Math.floor(effectiveDisconnectTime - connectTime));

                if (user_id) {
                    totalTime.set(user_id, (totalTime.get(user_id) || 0) + duration);
                } else {
                    this.logger.warn(`[voicetime] Voice tracking entry missing user_id: ${JSON.stringify(track)}`);
                }
            }
            
            if (totalTime.size === 0) {
                this.logger.info("[voicetime] No valid user voice time data to display after processing.");
                message.channel.send({ content: "No voice time data could be processed for users." });
                return;
            }

            const firstValidTrack = voiceTrackings.find(track => track.connect_time && !isNaN(parseInt(track.connect_time, 10)));
            const startDate = firstValidTrack ? new Date(parseInt(firstValidTrack.connect_time, 10) * 1000) : new Date();
            const formattedDate = startDate.toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
            });

            const sortedTotalTime = [...totalTime.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            const listEmbed = new EmbedBuilder()
                .setColor("#c586b6")
                .setTitle(`Voice Channel Leaderboard (Top 10) (Since: ${formattedDate})`);

            if (sortedTotalTime.length === 0) {
                listEmbed.setDescription("No users to display on the leaderboard.");
            } else {
                for (let i = 0; i < sortedTotalTime.length; i++) {
                    const [userId, duration] = sortedTotalTime[i];
                    let mention = `User ID: ${userId}`;
                    try {
                        const member = await message.guild.members.fetch(userId);
                        if (member) mention = member.displayName;
                    } catch (error) {
                        // this.logger.error(`[voicetime] Failed to fetch member for user ID ${userId}: ${error.message}. Using ID as fallback.`);
                    }
                    listEmbed.addFields({ name: `${i + 1}. ${mention}`, value: this.formatDuration(duration) });
                }
            }

            const timingFilters = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("VOICEnon-muted").setLabel("Non-muted times only").setStyle(ButtonStyle.Primary).setDisabled(false),
                    new ButtonBuilder().setCustomId("VOICEmuted").setLabel("Muted times only").setStyle(ButtonStyle.Primary).setDisabled(false),
                    new ButtonBuilder().setCustomId("VOICElonely").setLabel("Alone times only").setStyle(ButtonStyle.Primary).setDisabled(false),
                    new ButtonBuilder().setCustomId("VOICEbottom").setLabel("Bottom Talkers").setStyle(ButtonStyle.Primary).setDisabled(false)
                );

            const timingFilters2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("VOICE30days").setLabel("Top - Last 30 Days").setStyle(ButtonStyle.Primary).setDisabled(false),
                    new ButtonBuilder().setCustomId("VOICE7days").setLabel("Top - Last 7 Days").setStyle(ButtonStyle.Primary).setDisabled(false),
                    new ButtonBuilder().setCustomId("VOICEchannel").setLabel("User by Channel").setStyle(ButtonStyle.Primary).setDisabled(false),
                    new ButtonBuilder().setCustomId("VOICEchannelUse").setLabel("Channel Usage").setStyle(ButtonStyle.Primary).setDisabled(false)
                );

            message.channel.send({ components: [timingFilters, timingFilters2], embeds: [listEmbed] });
            this.logger.info("[voicetime] Sent initial Voice Leaderboard!");
        } 
    },
    formatDuration(totalSeconds) {
        if (totalSeconds <= 0) return "0 seconds";

        const days = Math.floor(totalSeconds / (24 * 60 * 60));
        totalSeconds %= (24 * 60 * 60);
        const hours = Math.floor(totalSeconds / (60 * 60));
        totalSeconds %= (60 * 60);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);

        const parts = [];
        if (days > 0) parts.push(days + " " + (days === 1 ? "day" : "days"));
        if (hours > 0) parts.push(hours + " " + (hours === 1 ? "hour" : "hours"));
        if (minutes > 0) parts.push(minutes + " " + (minutes === 1 ? "minute" : "minutes"));
        if (seconds > 0) parts.push(seconds + " " + (seconds === 1 ? "second" : "seconds"));
        
        if (parts.length === 0) {
            return "0 seconds";
        }
        return parts.join(" ");
    }
};