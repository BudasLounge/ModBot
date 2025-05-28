module.exports = {
    name: 'pal_stop',
    description: 'Stops the Palworld server and checks if it restarts automatically',
    syntax: 'pal_stop',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args) {
      if(!message.member.roles.cache.some(role => role.name === "PalworldAdmin")){
        message.channel.send({ content: "You don't have permission to use that command!"});
        return;
      }
      const axios = require('axios');
      const fs = require('fs');
  
      // Read Palworld password from file
      const password = fs.readFileSync('../palworld_password.txt').toString().trim();
  
      // Inform the channel that shutdown is initiated
      message.channel.send('Initiating Palworld server shutdown...');
  
      try {
        // Send POST request to stop endpoint with HTTP Basic Auth
        await axios.post('http://192.168.1.4:8212/v1/api/stop', {}, {
          auth: { username: 'admin', password }
        });
        message.channel.send('Shutdown command sent. Waiting for server to restart... (10 seconds)');
      } catch (error) {
        console.error('Error sending shutdown command:', error);
        message.channel.send('Failed to send shutdown command.');
        return;
      }
  
      // Wait for 10 seconds to allow server restart
      await new Promise(resolve => setTimeout(resolve, 10000));
  
      try {
        // Check the server metrics endpoint to confirm restart
        const metricsResp = await axios.get('http://192.168.1.4:8212/v1/api/metrics', {
          auth: { username: 'admin', password }
        });
        const metrics = metricsResp.data;
        // Inform channel with some of the metrics info
        message.channel.send(`Server restarted successfully.`);
      } catch (error) {
        console.error('Error fetching metrics after restart:', error);
        message.channel.send('Server does not seem to have restarted correctly.');
      }
    },
  };
  