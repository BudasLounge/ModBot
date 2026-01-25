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
      let iconName = `${name} augment.png`;
      
      // Handle known exceptions for filenames
      const iconOverrides = {
        "Escape Plan": "Escape Plan mayhem augment.png",
        "Adamant": "Adamant mayhem augment.png",
        "Fetch": "Fetch mayhem augment.png",
        "Hat on a Hat": "Hat on a Hat mayhem augment.png",
        "Mighty Shield": "Mighty Shield mayhem augment.png",
        "Poltergeist": "Poltergeist mayhem augment.png",
        "ReEnergize": "ReEnergize mayhem augment.png",
        "Swift and Safe": "Swift and Safe mayhem augment.png",
        "Transmute: Gold": "Transmute Gold augment.png",
        "Upgrade Collector": "Upgrade Collector mayhem augment.png",
        "Upgrade Cutlass": "Upgrade Cutlass mayhem augment.png",
        "Upgrade Immolate": "Upgrade Immolate mayhem augment.png",
        "Upgrade Zhonya's": "Upgrade Zhonya's mayhem augment.png",
        "Wind Beneath Blade": "Wind Beneath Blade mayhem augment.png",
        "Cheating": "Cheating mayhem augment.png",
        "Critical Rhythm": "Critical Rhythm mayhem augment.png",
        "Flash 2": "Flash 2 mayhem augment.png",
        "Get Excited": "Get Excited mayhem augment.png",
        "Nightstalking": "Nightstalking mayhem augment.png",
        "Snowball Upgrade": "Snowball Upgrade mayhem augment.png",
        "Spiritual Purification": "Spiritual Purification mayhem augment.png",
        "Transmute: Prismatic": "Transmute Prismatic augment.png",
        "Upgrade Hubris": "Upgrade Hubris mayhem augment.png",
        "Upgrade Infinity Edge": "Upgrade Infinity Edge mayhem augment.png",
        "Upgrade Sheen": "Upgrade Sheen mayhem augment.png",
        "Vampirism": "Vampirism mayhem augment.png",
        "I'm a Baby Kitty Where is Mama": "I'm a Baby Kitty Where is Mama mayhem augment.png",
        "Biggest Snowball Ever": "Biggest Snowball Ever mayhem augment.png",
        "Cruelty": "Cruelty mayhem augment.png",
        "Empyrean Promise": "Empyrean Promise mayhem augment.png",
        "Final Form": "Final Form mayhem augment.png",
        "Gash": "Gash mayhem augment.png",
        "Glass Cannon": "Glass Cannon mayhem augment.png",
        "Goldrend": "Goldrend mayhem augment.png",
        "King Me": "King Me mayhem augment.png",
        "Laser Heal": "Laser Heal mayhem augment.png",
        "Protein Shake": "Protein Shake mayhem augment.png",
        "Quest: Sneakerhead": "Quest Sneakerhead mayhem augment.png",
        "Quest: Steel Your Heart": "Quest Steel Your Heart augment.png",
        "Quest: Urf's Champion": "Quest Urf's Champion augment.png",
        "Quest: Wooglet's Witchcap": "Quest Wooglet's Witchcap augment.png",
        "Snowball Roulette": "Snowball Roulette mayhem augment.png",
        "Transmute: Chaos": "Transmute Chaos augment.png",
        "Ultimate Awakening": "Ultimate Awakening mayhem augment.png",
        "Upgrade Mikael's Blessing": "Upgrade Mikael's Blessing mayhem augment.png"
      };

      if (iconOverrides[name]) {
        iconName = iconOverrides[name];
      }

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
