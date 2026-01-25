const axios = require('axios');
const fs = require('fs');
const path = require('path');

const WIKI_URL = 'https://wiki.leagueoflegends.com/en-us/Module:MayhemAugmentData/data?action=raw';
const OUTPUT_FILE = path.join(__dirname, 'mayhem_wiki_data.json');
const ICON_DIR = path.join(__dirname, 'assets', 'mayhem');

if (!fs.existsSync(ICON_DIR)) {
  fs.mkdirSync(ICON_DIR, { recursive: true });
}

async function downloadImage(filename) {
  const safeFilename = filename.replace(/ /g, '_');
  const imageUrl = `https://wiki.leagueoflegends.com/en-us/Special:Redirect/file/${encodeURIComponent(safeFilename)}`;
  const filePath = path.join(ICON_DIR, filename);

  if (fs.existsSync(filePath)) return; // Skip if exists

  try {
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (err) {
    if (err.response && err.response.status === 404) {
         console.warn(`Image not found on wiki: ${safeFilename}`);
    } else {
         console.warn(`Failed to download image: ${filename}`, err.message);
    }
  }
}

async function fetchAndParseWiki() {
  try {
    console.log(`Fetching data from ${WIKI_URL}...`);
    const response = await axios.get(WIKI_URL);
    const rawLua = response.data;

    console.log('Parsing Lua table...');
    
    // Regex to match: ["Name"] = { ... }
    const augmentRegex = /\["(?<name>[^"]+)"\]\s*=\s*\{(?<content>[\s\S]*?)\}(?=,\s*\["|$)/g;
    
    const augments = {};
    let match;

    while ((match = augmentRegex.exec(rawLua)) !== null) {
      const name = match.groups.name;
      const content = match.groups.content;

      // Extract Tier
      const tierMatch = content.match(/\["tier"\]\s*=\s*"(?<tier>[^"]+)"/);
      const tier = tierMatch ? tierMatch.groups.tier : 'Unknown';

      // Extract Description
      const descMatch = content.match(/\["description"\]\s*=\s*"(?<desc>.*?)"/);
      let description = descMatch ? descMatch.groups.desc : '';
      description = description.replace(/\\"/g, '"');

      // Generate Icon Filename
      const iconName = `${name} augment.png`;

      augments[name] = {
        name: name,
        tier: tier,
        icon: iconName,
        description: description
      };
      
      // Download Icon
      await downloadImage(iconName);
      process.stdout.write('.');
    }
    console.log('\n');

    const count = Object.keys(augments).length;
    console.log(`Found ${count} augments.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(augments, null, 2));
    console.log(`Saved augment data to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Error fetching/parsing wiki data:', error);
  }
}

fetchAndParseWiki();
