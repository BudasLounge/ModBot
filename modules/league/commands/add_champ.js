module.exports = {
    name: 'new_champ',
    description: 'To add a new champion to the league database',
    syntax: 'new_champ',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: true,
    async execute(message, args, extra) {
        this.logger.info("[new_champ] Execute called", { userId: message.member?.id, argsLength: args.length });
        var state = extra.state;
        var api = extra.api;
        var respNewChamp;
        var inputValue = args.slice(1).join(" ").trim();

        if (!inputValue) {
            this.logger.info("[new_champ] Missing input for current state", { stateKeys: Array.from(state.data.keys()) });
        }

        if(!state.data.has("name")) {
            if(inputValue) {
              state.add_data("name", "STRING", inputValue);
              this.logger.info("[new_champ] Captured champion name", { name: state.data.get("name").data });
              message.channel.send({ content: "Okay, the champion is named: " + state.data.get("name").data + ". Next, put in the primary role."});
            } else {
              message.channel.send({ content: "To add a new champion, start with /new_champ [champion name]"});
            }
        }else if(!state.data.has("prim_role")){
            if(inputValue) {
                state.add_data("prim_role", "STRING", inputValue);
                this.logger.info("[new_champ] Captured primary role", { role: state.data.get("prim_role").data });
                message.channel.send({ content: state.data.get("name").data + " has a primary role of: " + state.data.get("prim_role").data + ". Next, put in the secondary role."});
              } else {
                message.channel.send({ content: "To add the champion's primary role, enter /new_champ [primary role]"});
              }
        }else if(!state.data.has("sec_role")){
            if(inputValue) {
                state.add_data("sec_role", "STRING", inputValue);
                this.logger.info("[new_champ] Captured secondary role", { role: state.data.get("sec_role").data });
                message.channel.send({ content: state.data.get("name").data + " has a secondary role of: " + state.data.get("sec_role").data + ". Next, put in if it's an ad or ap champion."});
              } else {
                message.channel.send({ content: "To add the champion's secondary role, enter /new_champ [secondary role]"});
              }
        }else if(!state.data.has("ad_ap")){
            if(inputValue) {
                if(inputValue==="ad"||inputValue==="ap"){
                    state.add_data("ad_ap", "STRING", inputValue);
                    this.logger.info("[new_champ] Captured damage type", { adAp: state.data.get("ad_ap").data });
                    message.channel.send({ content: state.data.get("name").data + " is of damage type: " + state.data.get("ad_ap").data});
                    
                    try{
                        respNewChamp = await api.post("league_champion", {
                        name:state.data.get("name").data,
                        role_primary:state.data.get("prim_role").data,
                        role_secondary:state.data.get("sec_role").data,
                        ad_ap:state.data.get("ad_ap").data
                    });
                        this.logger.info("[new_champ] API response received", { ok: respNewChamp?.ok === true });
                    }catch(err){
                        this.logger.error("[new_champ] Failed to create champion", { error: err?.response || err?.message || err });
                        message.channel.send({ content: "Hit a snag... try again!"});
                        return;

                    }

                      if(respNewChamp && respNewChamp.ok === true){
                        message.channel.send({ content: "Successfully added a new champion!"});
                    }else{
                        message.channel.send({ content: "Hit a snag... try again!"});
                    }

                    state.delete = true;
                      this.logger.info("[new_champ] State completed and scheduled for cleanup");

                } else{
                    message.channel.send({ content: "Please enter '/new_champ ad' or '/new_champ ap' to select a damage type"})
                }
              } else {
                message.channel.send({ content: "To add the champion's damage type, enter /new_champ [damage type (ad or ap only)]"});
              }
        }

        
        
    }
};
