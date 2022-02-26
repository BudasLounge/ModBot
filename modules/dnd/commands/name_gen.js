module.exports = {
    name: 'name_gen',
    description: 'Generate "words" by randomly assembling letters.',
    syntax: 'name_gen [# of words to make] [minimum # of characters] [maximum # of characters]',
    num_args: 1,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        const {performance} = require('perf_hooks');
        const {Util} = require('discord.js');
        var min = 4;
        var max = 9;
        if(Number.isInteger(parseInt(args[1]))){
            var count = args[1];
        }else{
            message.channel.send({content: "Please enter an amount of words to output"});
            return;
        }
        if(args[2]){
            if(Number.isInteger(parseInt(args[2]))){
                min = parseInt(args[2])
                if(min > max){
                    max = min+1;
                }
            }else{
                message.channel.send({content:"One of your inputs is not numeric"});
                return;
            }
        }
        if(args[3]){
            if(Number.isInteger(parseInt(args[3]))){
                max = parseInt(args[3])
                if(min > max){
                    min = max-1;
                }
            }else{
                message.channel.send({content:"One of your inputs is not numeric"});
                return;
            }
        }
        if(max <= 0 || min <= 0){
            min = 4;
            max = 9;
            message.channel.send({content: "The numbers you submitted would make one of the variables less than 0, input different amounts please"});
            return;
        }
        message.channel.send({ content: "Max/Min: "+max.toString()+"/"+min.toString()});
        var balancedAlpha = [
            ['E',1260],
            ['T',937],
            ['A',834],
            ['O',770],
            ['N',680],
            ['I',671],
            ['H',611],
            ['S',611],
            ['R',568],
            ['L',424],
            ['D',414],
            ['U',285],
            ['C',273],
            ['M',253],
            ['W',234],
            ['Y',204],
            ['F',203],
            ['G',192],
            ['P',166],
            ['B',154],
            ['V',106],
            ['K',87],
            ['J',23],
            ['X',20],
            ['Q',9],
            ['Z',6]
        ]
        var tweakedAlpha = [
            ['E',100],
            ['T',10],
            ['A',100],
            ['O',100],
            ['N',10],
            ['I',100],
            ['H',10],
            ['S',10],
            ['R',10],
            ['L',10],
            ['D',10],
            ['U',100],
            ['C',10],
            ['M',10],
            ['W',10],
            ['Y',10],
            ['F',10],
            ['G',10],
            ['P',10],
            ['B',10],
            ['V',10],
            ['K',10],
            ['J',10],
            ['X',10],
            ['Q',10],
            ['Z',10]
        ]
        var flatStart = performance.now();
        var alphabet = [];
        var type = "Balanced";
        if(!args[4]){
            alphabet = balancedAlpha;
        }else{
            if(args[4] == "tweak"){
                alphabet = tweakedAlpha;
                type = "Tweaked";
            }else{
                alphabet = balancedAlpha;
            }
        }
        var flattened = [];
        for(var i = 0;i<alphabet.length; i++){
            for (var j = 0;j<alphabet[i][1];j++){
                flattened.push(alphabet[i][0])
            }
        }
        var flatEnd = performance.now();
        message.channel.send({ content: "Generating Words using: " + type});

        var words = "";
        for(var k = 0;k<count;k++){
            var charCount = Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1) + parseInt(min));
            var word = "";
            for(var m = 0;m<charCount;m++){
                word += flattened[Math.floor(Math.random() * (flattened.length))];
            }
            words += word + "\n";
        }
        var genEnd = performance.now();
        var flat = flatEnd-flatStart;
        var gen = genEnd-flatStart;
        const messageChunks = Util.splitMessage(words, {
            maxLength: 2000,
            char:'\n'
        });
        messageChunks.forEach(async chunk => {
           await message.channel.send({content: chunk});
        })

        message.channel.send({content: `It took ${flat} milliseconds to flatten the array and ${gen} milliseconds to flatten and generate the words!`});
        //message.channel.send({content:words});
    }
}
