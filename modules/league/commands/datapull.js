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
                }catch(error){
                    console.error(error);
                }
                if(!respServer.minecraft_servers[0]){
                    message.channel.send({ content: "short_name not found...checking display_name"});
                    try{
                        respServer = await api.get("minecraft_server", {
                            display_name: args[1]
                        });
                    }catch(error2){
                        console.error(error2);
                    }
                }
                if(respServer.minecraft_servers[0]){
                    message.channel.send({ content: "The IP of " + respServer.minecraft_servers[0].display_name + "(" + respServer.minecraft_servers[0].short_name + ")" + " is: **" + respServer.minecraft_servers[0].server_ip + "**"});
                }else{
                    message.channel.send({ content: "That server could not be found..."});
                }
            }
        };