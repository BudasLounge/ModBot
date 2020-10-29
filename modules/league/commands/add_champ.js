module.exports = {
    name: 'new_champ',
    description: 'To add a new champion to the league database',
    syntax: 'new_champ',
    num_args: 0,
    args_to_lower: true,
    needs_api: true,
    has_state: true,
    async execute(message, args, extra) {
        var state = extra.state;
        var api = extra.api;

        if(!state.data.has("name")) {
            if(args.length == 2) {
              state.add_data("name", "STRING", args[1]);
              message.channel.send("Okay, the champion is named: " + state.data.get("name"));
            } else {
              message.channel.send("To add a new champion, start with /new_champ [champion name]");
            }
        }else if(!state.data.has("prim_role")){
            if(args.length == 2) {
                state.add_data("prim_role", "STRING", args[1]);
                message.channel.send(state.data.get("name") + " has a primary role of: " + state.data.get("prim_role"));
              } else {
                message.channel.send("To add the champion's primary role, enter /new_champ [primary role]");
              }
        }else if(!state.data.has("sec_role")){
            if(args.length == 2) {
                state.add_data("sec_role", "STRING", args[1]);
                message.channel.send(state.data.get("name") + " has a secondary role of: " + state.data.get("sec_role"));
              } else {
                message.channel.send("To add the champion's secondary role, enter /new_champ [secondary role]");
              }
        }else if(!state.data.has("ad_ap")){
            if(args.length == 2) {
                if(args[1]=="ad"||args[1]=="ap"){
                    state.add_data("ad_ap", "STRING", args[1]);
                    message.channel.send(state.data.get("name") + " is of damage type: " + state.data.get("ad_ap"));
                } else{
                    message.channel.send("Please enter '/new_champ ad' or '/new_champ ap' to select a damage type")
                }
              } else {
                message.channel.send("To add the championss damage type, enter /new_champ [damage type (ad or ap only)]");
              }
        }

        try{
            var respNewChamp = await api.post("league_champion", {
                name:state.data.get("name"),
                role_primary:state.data.get("prim_role"),
                role_secondary:state.data.get("sec_role"),
                ad_ap:state.data.get("ad_ap")
            });
        }catch(err){
            this.logger.error(err);
        }
        if(respNewChamp.ok == true){
            message.channel.send("Successfully added a new champion!");
        }else{
            message.channel.send("Hit a snag... try again!");
        }
    }
};
