module.exports = {
    name: 'approve_champ',
    description: 'Approves the champion for your custom champ pool',
    syntax: 'approve_champ [champion name]',
    num_args: 1,
    args_to_lower: true,
    needs_api: true,
    has_state: false,
    options: [
        { name: 'champion_name', description: 'Champion name to approve', type: 'STRING', required: true },
    ],
    async execute(message, args, extra) {
        var api = extra.api;

        this.logger.info("[approve_champ] Execute called", { userId: message.member?.id, argsLength: args.length });

        if (!args[1]) {
            message.channel.send({ content: "Usage: /approve_champ [champion name]" });
            return;
        }

        var respChamps;
        try{
            respChamps = await api.get("league_champion",{
                name: args[1]
            });
        } catch(error){
            this.logger.error("[approve_champ] Failed champion lookup", { error: error?.response || error?.message || error });
            message.channel.send({ content: "I couldn't verify that champion right now. Please try again." });
            return;
        }

        if(respChamps && respChamps.league_champions && respChamps.league_champions[0]){
            this.logger.info("[approve_champ] Champion found", { champion: respChamps.league_champions[0].name });
            try{
                var respUpdate = await api.post("league_pref_champ" , {
                    champ_name: args[1],
                    user_id:message.member.id
                });
                this.logger.info("[approve_champ] Preference create response", { ok: respUpdate?.ok === true });
                if(respUpdate && respUpdate.ok === true){
                    message.channel.send({ content: respChamps.league_champions[0].name.toString() + " is now <@" + message.member.id.toString() + "> approved"});
                } else {
                    message.channel.send({ content: "I couldn't approve that champion right now. Please try again." });
                }
            }catch(error2){
                this.logger.error("[approve_champ] Failed to save preference", { error: error2?.response || error2?.message || error2 });
                const errText = error2?.response?.data?.error || "I couldn't approve that champion. It may already be approved.";
                message.channel.send({ content: errText });
            }
        }else{
            message.channel.send({ content: "No champion with that name here!"});
        }
    }
};