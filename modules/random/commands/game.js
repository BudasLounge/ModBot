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
        const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
        const voiceChannel = message.member.voice.channel;
        if (voiceChannel) {
            var voiceChannelId = voiceChannel.id;
        } else {
            message.channel.send({ content: "You need to be in a voice channel to use this command."})
            return;
        }
        var respGame;
                try{
                    respGame = await api.get("game_joining_master",{
                        host_id:message.member.id
                    });
                } catch(error){
                    this.logger.error(error.message);
                }
                if(respGame.game_joining_masters[0]){
                    message.channel.send({ content: "You already have a live game! Close it out with ,game end"}); return
                }
                this.logger.info(respGame[0]);
                try{
                    respGame = await api.post("game_joining_master",{
                        host_id:message.member.id,
                        starting_channel_id:voiceChannelId
                    });
                } catch(error2){
                    this.logger.error(error2.message);
                }
                if(!respGame.ok){
                    message.channel.send({ content: "Game creation failed..."});
                }
                message.channel.send({ content: "Created a game! Let me pull up the menu for you..."});
                const ListEmbed = new MessageEmbed()
                .setColor("#c586b6")
                .setTitle(`${message.member.displayName}'s game menu.`);
                ListEmbed.addField("Info about the buttons:", "Host is not added to their own game by default, but can join if they want to.\n\nBlurple buttons = anyone can interact\nGray buttons = only host can interact");
                const row = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('GAMEjoin-'+message.member.id)
                        .setLabel('Join')
                        .setStyle('PRIMARY'),
                    new MessageButton()
                        .setCustomId('GAMEleave-'+message.member.id)
                        .setLabel('Leave')
                        .setStyle('PRIMARY'),
                );
                const row2 = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('GAMEstart-'+message.member.id)
                        .setLabel('Start')
                        .setStyle('SECONDARY'),
                    new MessageButton()
                        .setCustomId('GAMEend-'+message.member.id)
                        .setLabel('End')
                        .setStyle('SECONDARY'),
                );
                message.channel.send({embeds: [ListEmbed], components: [row, row2] });
        }
};