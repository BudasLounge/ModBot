module.exports = {
    name: 'datapull',
    description: 'Pulls data from specified number of matches and saves it locally',
    syntax: 'datapull [summoner name] [number of games up to 1000](optional)',
    num_args: 2,
    args_to_lower: true,
    needs_api: false,
    has_state: false,
    
    async execute(message, args, extra) {
                var api = extra.api;
        
                var respServer;
                try{
                    respServer = await api.get("league_pref_champ", {
                        id: args[1]
                    });
                    this.logger.info(respServer);
                }catch(error){
                    console.error(error);
                }
                if(!respServer.league_pref_champs[0]){
                    message.channel.send({ content: "short_name not found...checking display_name"});
                }
            }
        };