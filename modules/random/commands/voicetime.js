module.exports = {
    name: 'voicetime',
    description: 'Prints a leaderboard of everyone\'s time spent in chat',
    syntax: 'voicetime [FUTURE ARGS HERE]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
        const api = extra.api;

        this.logger.info("Gathering all voice timings for initial leaderboard.");
        let respVoice;
        try {
            respVoice = await api.get("voice_tracking", {
                discord_server_id: message.guild.id,
            });
        } catch (error) {
            this.logger.error(`Failed to fetch voice_tracking data: ${error}`);
            message.channel.send({ content: "An error occurred while fetching voice data." });
            return;
        }

        const voiceTrackings = respVoice && respVoice.voice_trackings ? respVoice.voice_trackings : [];

        if (voiceTrackings.length === 0) {
            message.channel.send({ content: "There is no voice tracking data available yet." });
            return;
        }

        this.logger.info("Processing voice trackings.");
        const totalTime = new Map(); // Map<user_id, duration_in_seconds>
        const currentTime = Math.floor(new Date().getTime() / 1000);

        for (const track of voiceTrackings) {
            const { user_id, connect_time, disconnect_time } = track;
            const connectTime = parseInt(connect_time, 10);
            const rawDisconnectTime = parseInt(disconnect_time, 10);
            
            if (isNaN(connectTime)) {
                this.logger.warn(`Invalid connect_time for track: ${JSON.stringify(track)}`);
                continue;
            }

            const effectiveDisconnectTime = (rawDisconnectTime === 0 || isNaN(rawDisconnectTime)) ? currentTime : rawDisconnectTime;
            const duration = Math.max(0, Math.floor(effectiveDisconnectTime - connectTime));

            if (user_id) {
                totalTime.set(user_id, (totalTime.get(user_id) || 0) + duration);
            } else {
                this.logger.warn(`Voice tracking entry missing user_id: ${JSON.stringify(track)}`);
            }
        }
        
        if (totalTime.size === 0) {
            this.logger.info("No valid user voice time data to display after processing.");
            message.channel.send({ content: "No voice time data could be processed for users." });
            return;
        }

        this.logger.info("Aggregated voice times calculated.");

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

        const listEmbed = new MessageEmbed()
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
                    this.logger.error(`Failed to fetch member for user ID ${userId}: ${error.message}. Using ID as fallback.`);
                }

                listEmbed.addField(`${i + 1}. ${mention}`, formatDuration(duration));
            }
        }

        const timingFilters = new MessageActionRow()
            .addComponents(
                new MessageButton().setCustomId("VOICEnon-muted").setLabel("Non-muted times only").setStyle('PRIMARY').setDisabled(false),
                new MessageButton().setCustomId("VOICEmuted").setLabel("Muted times only").setStyle('PRIMARY').setDisabled(false),
                new MessageButton().setCustomId("VOICElonely").setLabel("Alone times only").setStyle('PRIMARY').setDisabled(true),
                new MessageButton().setCustomId("VOICEbottom").setLabel("Bottom Talkers").setStyle('PRIMARY').setDisabled(false)
            );

        const timingFilters2 = new MessageActionRow()
            .addComponents(
                new MessageButton().setCustomId("VOICE30days").setLabel("Top - Last 30 Days").setStyle('PRIMARY').setDisabled(false),
                new MessageButton().setCustomId("VOICE7days").setLabel("Top - Last 7 Days").setStyle('PRIMARY').setDisabled(false),
                new MessageButton().setCustomId("VOICEchannel").setLabel("User by Channel").setStyle('PRIMARY').setDisabled(false),
                new MessageButton().setCustomId("VOICEchannelUse").setLabel("Channel Usage").setStyle('PRIMARY').setDisabled(false)
            );

        message.channel.send({ components: [timingFilters, timingFilters2], embeds: [listEmbed] });
        this.logger.info("Sent Voice Leaderboard!");
    },
    formatDuration
};

function formatDuration(totalSeconds) {
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