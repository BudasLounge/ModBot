# ModBot
The modular, modifiable moderator for all your discord needs!

## Using the Saved-State System
Any command you create can interface with the built-in saved state system. This system allows you to create a "session" of sorts for a specific command, user, and timeframe.

In order to tell ModBot your command should use the state system, you just have to set `has_state: true` in the command object. Once you've done this, you'll need to include another parameter for the passed-in state in the command's execute function. Below is an example of a very basic command file using saved states:

```javascript
module.exports = {
    name: 'state_example',
    description: 'An example command using the saved state system',
    syntax: 'state_example [parameter]', //Brackets mean the parameter is optional. In the case of this example, the arguments required will vary
    num_args: 0,
    args_to_lower: false, //Disabled to preserve capitalization of user input. This is not required.
    has_state: true, //This is what tells the system that we want to use the state system
    async execute(message, args, api, state) {
      if(!state.data.has("name")) {
        if(args.length == 2) {
          state.add_data("name", "STRING", args[1]);
          message.channel.send("Okay, " + state.data.get("name").data + ". I'll remember your name until this state times out!");
        } else {
          message.channel.send("Hi there! My name is ModBot! What's yours? (run /state_example <your_name>)");
        }
      } else {
        message.channel.send("Hello again, " + state.data.get("name").data);
      }
    }
};
```

As you can see, there is an extra parameter called `state` in the `execute()` function. This object is what will allow you to access and store your data. The section below shows the structure of the `state` object.

```javascript
{
  state_id: 1234, //This is used by the state system. You probably won't need it.
  user_id: 'XXXXXXXXXXXX', //This is the discord ID of the user this state is attached to (the ID with numbers, not their username)
  command_run: 'core:state_example', //This is the command this state is attached to. Format: 'module:command'
  expiration: '2020-06-01 12:00:00', //This is a timestamp for when this state will expire. It is updated every time the state is loaded or saved.
  add_data: function(data_name, data_type, data), //This is a shortcut to make adding new data to the state easier. More about the parameters can be found below.
  data: Discord.Collection //This is a Discord.Collection that contains all of the data for the state. See below for more.
}

//Example of a data object inside the state.data collection
{
  data_id: 1234, //Unique, automatically assigned by the State Manager
  state_id: 1234, //The ID of the state that this piece of data is connected to
  data_name: "name", //The name of this piece of data. In our example above, this would be "name"
  data_type: "STRING", //The type of data this is. Currently, the state system supports STRING, INT, DOUBLE, BOOLEAN
  data: "Andrew" //The actual data that is stored.
}
```

Each piece of data has a name (maximum 50 characters), type (STRING, INT, DOUBLE, or BOOLEAN), and the data itself. The data is always stored as a string in the database, but will be converted back to its proper type before it ever gets to the command.

By default, a saved state will timeout after 10 minutes. However, this 10 minute timeout is reset every time the state is retrieved or saved. Currently, there is not a way to specify a timeout per-command, but I'm considering adding that option.

The `state.data` property is a [Discord.Collection](https://discord.js.org/#/docs/collection/master/class/Collection), which is essentially just an extended version of JavaScript's Map object. Below are some common examples of how you might do things.

To check if a state has a piece of data:
```javascript
if(state.data.has("name")) {
  ...
}
```

To grab a piece of data:
```javascript
var grabbed_name = state.data.get("name").data;
```

To add a new piece of data:
```javascript
state.add_data("name", "STRING", "Andrew");

//or you could do this
state.data.set("name", {
  data_name: "name",
  data_type: "STRING",
  data: "Andrew"
});
```

To change a piece of data:
```javascript
var dataObj = state.data.get("name");
dataObj.data = "Some other value";
state.data.set("name", dataObj);
```

I'll probably add some shortcut functions for these at some point to make it easier, but I haven't gotten to it yet.

You don't have to worry about saving these values or anything. They are automatically pulled from the database before they're passed to your command, and any changes that happen to the data during the course of your command will automatically be saved when it finishes executing.

Finally, when you are done with your saved state and won't need it anymore, just do the following:
```javascript
state.delete = true;
```
The state will automatically be deleted when your command finishes running. If this is not used, the state will eventually be deleted after it times out anyway.
