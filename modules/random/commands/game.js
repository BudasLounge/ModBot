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
        const Discord = require("discord.js");
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
                        host_id:message.member.id
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
                .setTitle(`<@${message.member.id}>'s Game Menu.\nOnly the game creator can interact with this menu`);
                message.channel.send({embeds: [ListEmbed] });
        }
};