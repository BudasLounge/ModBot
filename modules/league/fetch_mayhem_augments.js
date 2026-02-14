const axios = require('axios');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const WIKI_URL = 'https://wiki.leagueoflegends.com/en-us/Module:MayhemAugmentData/data?action=raw';
const OUTPUT_FILE = path.join(__dirname, 'mayhem_wiki_data.json');
const ICON_DIR = path.join(__dirname, 'assets', 'mayhem');
const AUGMENT_REGEX = /\["(?<name>[^"]+)"\]\s*=\s*\{(?<content>[\s\S]*?)\}(?=,\s*\["|$)/g;
const TIER_REGEX = /\["tier"\]\s*=\s*"(?<tier>[^"]+)"/;
const DESCRIPTION_REGEX = /\["description"\]\s*=\s*"(?<desc>.*?)"/;
const ICON_SUFFIXES = ['augment.png', 'mayhem augment.png'];
const NAME_VARIANT_RULES = [
  { pattern: /:\s/g, replacement: ' ' },
  { pattern: /:/g, replacement: '' }
];

const httpClient = axios.create({ timeout: 30000 });

function isNotFoundError(error) {
  return error?.response?.status === 404;
}

async function ensureIconDirectory() {
  await fsp.mkdir(ICON_DIR, { recursive: true });
}

function sanitizeLocalFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

function normalizeWikiFilename(filename) {
  return filename.replace(/ /g, '_');
}

function extractTier(content) {
  const tierMatch = content.match(TIER_REGEX);
  return tierMatch ? tierMatch.groups.tier : 'Unknown';
}

function extractDescription(content) {
  const descMatch = content.match(DESCRIPTION_REGEX);
  const description = descMatch ? descMatch.groups.desc : '';
  return description.replace(/\\"/g, '"');
}

function getDefaultIconName(augmentName) {
  return `${augmentName} augment.png`;
}

function getNameVariants(augmentName) {
  const variants = new Set([augmentName]);

  for (const rule of NAME_VARIANT_RULES) {
    const currentVariants = Array.from(variants);
    for (const value of currentVariants) {
      variants.add(value.replace(rule.pattern, rule.replacement));
    }
  }

  return Array.from(variants);
}

function getIconCandidates(augmentName) {
  const candidates = new Set([getDefaultIconName(augmentName)]);
  const nameVariants = getNameVariants(augmentName);

  for (const nameVariant of nameVariants) {
    for (const suffix of ICON_SUFFIXES) {
      candidates.add(`${nameVariant} ${suffix}`);
    }
  }

  return Array.from(candidates);
}

async function downloadImage(filenames) {
  const candidates = Array.from(new Set(Array.isArray(filenames) ? filenames : [filenames]));

  for (const filename of candidates) {
    const localFilename = sanitizeLocalFilename(filename);
    const safeFilename = normalizeWikiFilename(filename);
    const imageUrl = `https://wiki.leagueoflegends.com/en-us/Special:Redirect/file/${encodeURIComponent(safeFilename)}`;
    const filePath = path.join(ICON_DIR, localFilename);

    if (fs.existsSync(filePath)) return localFilename;

    try {
      const response = await httpClient({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream'
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      return localFilename;
    } catch (err) {
      if (!isNotFoundError(err)) {
        console.warn(`Failed to download image: ${filename}`, err.message);
      }
    }
  }

  const attempted = candidates.map(normalizeWikiFilename).join(', ');
  console.warn(`Image not found on wiki: ${attempted}`);
  return null;
}

async function fetchWikiData() {
  console.log(`Fetching data from ${WIKI_URL}...`);
  const response = await httpClient.get(WIKI_URL);
  return response.data;
}

function parseAugments(rawLua) {
  AUGMENT_REGEX.lastIndex = 0;
  const augments = {};
  const parsedEntries = [];
  let match;

  while ((match = AUGMENT_REGEX.exec(rawLua)) !== null) {
    const name = match.groups.name;
    const content = match.groups.content;
    const tier = extractTier(content);
    const description = extractDescription(content);
    const iconCandidates = getIconCandidates(name);
    const iconName = getDefaultIconName(name);

    parsedEntries.push({
      name,
      tier,
      description,
      iconName,
      iconCandidates
    });

    augments[name] = {
      name,
      tier,
      icon: iconName,
      description
    };
  }

  return { augments, parsedEntries };
}

async function resolveAugmentIcons(augments, parsedEntries) {
  for (const entry of parsedEntries) {
    const resolvedIconName = await downloadImage(entry.iconCandidates) || entry.iconName;
    augments[entry.name].icon = resolvedIconName;
    process.stdout.write('.');
  }
}

async function writeAugments(augments) {
  await fsp.writeFile(OUTPUT_FILE, JSON.stringify(augments, null, 2));
}

async function fetchAndParseWiki() {
  const rawLua = await fetchWikiData();
  console.log('Parsing Lua table...');
  const { augments, parsedEntries } = parseAugments(rawLua);

  await resolveAugmentIcons(augments, parsedEntries);
  console.log('\n');

  const count = Object.keys(augments).length;
  console.log(`Found ${count} augments.`);

  await writeAugments(augments);
  console.log(`Saved augment data to ${OUTPUT_FILE}`);
}

async function main() {
  try {
    await ensureIconDirectory();
    await fetchAndParseWiki();
  } catch (error) {
    console.error('Error fetching/parsing wiki data:', error?.message || error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  fetchAndParseWiki,
  parseAugments,
  getIconCandidates,
  sanitizeLocalFilename,
  normalizeWikiFilename
};
