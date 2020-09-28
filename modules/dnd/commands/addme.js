module.exports = {
    name: 'addme_dnd',
    description: 'Adds you to the dnd database',
    syntax: 'addme_dnd',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    execute(message, args, extra) {
        try{
            var respPlayer = await api.post("dnd_player", {
                discord_id: message.member.id,
                is_dm: 0
            });
        }catch(error2){
            this.logger.error(error2);
        }
    }
};
