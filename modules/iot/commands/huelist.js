const fs = require('fs');
const axios = require('axios');

module.exports = {
  name: 'huelist',
  description: 'Lists all Hue devices',
  syntax: 'huelist',
  num_args: 0,
  args_to_lower: true,
  needs_api: false,
  has_state: false,
  async execute(message, args, extra) {
    const token = fs.readFileSync('../hue_token.txt', 'utf-8').trim();
    const lightResp = await axios.get(`http://192.168.1.58/api/${token}/lights`);

    message.channel.send({ content: 'Compiling light list...' });

    const lightArray = await Promise.all(Object.keys(lightResp.data).map(async (key) => {
      const resp = await axios.get(`http://192.168.1.58/api/${token}/lights/${key}`);
      return {
        id: key,
        name: resp.data.name,
        on: resp.data.state.on,
      };
    }));

    const output = lightArray.map((light) => {
      const status = light.on ? 'ON' : 'OFF';
      return `${light.name} has lightID: ${light.id} and is ${status}\n`;
    }).join('');

    message.channel.send({ content: output });
  },
};
