module.exports = {
    name: 'voicetime',
    description: 'Prints a leaderboard of everyone\'s time spent in chat',
    syntax: 'voicetime [FUTURE ARGS HERE]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var api = extra.api;

        try{
            var respVoice = await api.get("voice_tracking",{

            })
        }catch(error){
            this.logger.error(error);
        }
        if(!respVoice.voice_trackings[0]) return;
        respVoice.voice_trackings.forEach(element => {
            if(element.disconnect_time != null){
                var diff = Math.floor((element.disconnect_time - element.connect_time) / 1000), units = [
                    { d: 60, l: "seconds" },
                    { d: 60, l: "minutes" },
                    { d: 24, l: "hours" },
                    { d: 7, l: "days" }
                  ];
                
                  var s = '';
                  for (var i = 0; i < units.length; ++i) {
                    s = (diff % units[i].d) + " " + units[i].l + " " + s;
                    diff = Math.floor(diff / units[i].d);
                  }
                this.logger.info(s.toString())
            }

        });



    }
}