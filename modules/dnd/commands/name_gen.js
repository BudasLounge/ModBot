module.exports = {
    name: 'name_gen',
    description: 'Generate "words" by randomly assembling letters.',
    syntax: 'name_gen [# of words to make] [minimum # of characters] [maximum # of characters]',
    num_args: 1,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: false,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    async execute(message, args, extra) {
        var min = 4;
        var max = 9;
        if(parseInt(args[3])){
            var count = args[1];
        }else{
            message.channel.send({content: "Please enter an amount of words to output"});
        }
        
        if(args[2]){
            min = args[2]
            if(min > max){
                max = min+1;
            }
        }
        if(args[3]){
            max = args[3]
            if(min > max){
                min = max-1;
            }
        }
        if(max <= 0 || min <= 0){
            min = 4;
            max = 9;
            message.channel.send({content: "The numbers you submitted would make one of the variables less than 0, input different amounts please"});
        }
        var alphabet = [
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
        message.channel.send({ content: "Flattening array"});
        var flattened = [];
        for(var i = 0;i<alphabet.length; i++){
            for (var j = 0;j<alphabet[i][1];j++){
                flattened.push(alphabet[i][0])
            }
        }
        message.channel.send({ content: "Generating Words"});
        var words = "";
        for(var k = 0;k<count;k++){
            var charCount = Math.floor(Math.random() * (max - min + 1)) + parseInt(min);
            message.channel.send({ content: "charCount-->" + charCount.toString()});
            var word = "";
            for(var m = 0;m<charCount;m++){
                word += flattened[Math.floor(Math.random() * (flattened.length))];
            }
            words += word + "\n";
        }
        message.channel.send({content:words});
    }
}
