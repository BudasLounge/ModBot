module.exports = {
    name: 'groceries',
    description: 'Brings up the grocery list. No argument will return the current list.',
    syntax: 'groceries [add/drop/clear] [name of item]',
    num_args: 0,//minimum amount of arguments to accept
    args_to_lower: false,//if the arguments should be lower case
    needs_api: true,//if this command needs access to the api
    has_state: false,//if this command uses the state engine
    options: [
        { name: 'action', description: 'add, drop, or clear', type: 'STRING', required: false, choices: ['add', 'drop', 'clear'] },
        { name: 'item',   description: 'Name of the item',   type: 'STRING', required: false },
    ],
    async execute(message, args, extra) {
        const fs = require('fs');
        const groceryList = 'groceryList.txt';
        fs.access(groceryList, fs.F_OK, (err) => {
            if (err) {
              this.logger.error("Could not find the groceryList, creating file");
              fs.writeFile(groceryList, 'Top of list', (err) => {
                  if(err) this.logger.error(err.message);
                  this.logger.info("File created");
              });
            }
        })
        var groceries = [];
        fs.readFile(groceryList, function(err, data) {
            if(err) throw err;
            groceries = data.toString().split("\n");
        });
        if(args[1] == "add"){
            if(args[2]){
                args.shift();
                args.shift();
                var item = args.join(" ");
                fs.appendFile(groceryList , item,  (err) => {
                    if (err){
                        this.logger.error(err.message);
                        message.channel.send("An error occurred. Item not added.");
                        return;
                    }
                    this.logger.info("Added " + item + " to the grocery list");
                    message.channel.send({content: "Added " + item + " to the grocery list"})
                });
            }else{
                message.channel.send({content: "You did not put a name to add"});
            }
        }else if(args[1] == "drop"){
            args.shift();
            args.shift();
            var item = args.join(" ");
            groceries.splice(groceries.indexOf(item),1);
            var txtGroceries = "";
            for(var i = 0;i<groceries.length;i++){
                txtGroceries+=groceries[i]+"\n"
            }
            fs.writeFile(groceryList, txtGroceries, function(err){
                if(err){
                    this.logger.error(err.message);
                    message.channel.send({content: "An error occurred. Item not dropped."});
                    return;
                }
                message.channel.send({content: "Added " + item + " to the grocery list"});
            })
        }else if(args[1] == "clear"){
            fs.writeFile(groceryList,'Top of list', function(err){
                if(err){
                    this.logger.error(err.message);
                    message.channel.send({content: "An error occurred. List not cleared."});
                    return;
                }
            })
        }
        var output = "";
        for(var i = 0;i<groceries.length;i++){
            output+=groceries[i]+"\n"
        }
        message.channel.send({content: "Here is the current list of groceries: " + output})
    }
}