module.exports ={
    name: 'showAll',
    description: 'Shows all servers and their information',
    syntax: 'showAll',
    num_args: 0,
    async execute(message, args, api){
        try{
            respServer = await api.get("minecraft_server", {
                
            });
        } catch(error){
            console.error(error);
        }
        console.log(respServer.minecraft_servers.length);
    }
};