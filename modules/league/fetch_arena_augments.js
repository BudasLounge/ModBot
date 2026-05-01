/**
 * Arena augment data fetcher.
 *
 * Source of truth: CommunityDragon (numeric IDs, names, rarities, icons).
 *   https://raw.communitydragon.org/latest/cdragon/arena/en_us.json
 *
 * Flavor: League of Legends Wiki (rich descriptions, notes).
 *   https://wiki.leagueoflegends.com/en-us/Module:ArenaAugmentData/data?action=raw
 *
 * Output:
 *   - modules/league/arena_wiki_data.json — merged augment table keyed by
 *     augment id (string). Each entry has the canonical CDragon fields plus
 *     wiki-derived `wikiDescription`, `wikiNotes`, `wikiTier` when available.
 *   - modules/league/assets/arena/<id>.png — downloaded icon, mirroring the
 *     mayhem layout so the scoreboard can read icons from disk as base64.
 *
 * Both outputs are .gitignored — this script is meant to run on the server.
 */

const axios = require('axios');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const CDRAGON_URL = 'https://raw.communitydragon.org/latest/cdragon/arena/en_us.json';
const CDRAGON_GAME_BASE = 'https://raw.communitydragon.org/latest/game';
const WIKI_URL = 'https://wiki.leagueoflegends.com/en-us/Module:ArenaAugmentData/data?action=raw';

const OUTPUT_FILE = path.join(__dirname, 'arena_wiki_data.json');
const ICON_DIR = path.join(__dirname, 'assets', 'arena');

const RARITY_LABELS = { 0: 'Silver', 1: 'Gold', 2: 'Prismatic', 4: 'Apex' };

// Matches `["Name"] = { ... }` blocks at the top level of the Lua module.
const AUGMENT_REGEX = /\["(?<name>[^"]+)"\]\s*=\s*\{(?<content>[\s\S]*?)\}(?=,\s*\["|,?\s*\}\s*(?:--|$))/g;
const TIER_REGEX = /\["tier"\]\s*=\s*"(?<tier>[^"]+)"/;
const DESCRIPTION_REGEX = /\["description"\]\s*=\s*"(?<desc>(?:\\.|[^"\\])*)"/;
const NOTES_REGEX = /\["notes?"\]\s*=\s*\[=\[(?<notes>[\s\S]*?)\]=\]/;

const httpClient = axios.create({ timeout: 30000 });

function isNotFoundError(err) {
  return err?.response?.status === 404;
}

function normalizeCdragonIconPath(iconPath) {
  if (!iconPath) return null;
  let p = String(iconPath).trim();
  if (!p) return null;
  p = p.replace(/^\/+/, '');
  p = p.replace(/^lol-game-data\/assets\//i, '');
  p = p.toLowerCase();
  p = p.replace(/\.(dds|tex)$/i, '.png');
  return `${CDRAGON_GAME_BASE}/assets/${p}`;
}

async function ensureIconDirectory() {
  await fsp.mkdir(ICON_DIR, { recursive: true });
}

async function fetchCdragon() {
  console.log(`[CDragon] Fetching ${CDRAGON_URL}`);
  const res = await httpClient.get(CDRAGON_URL);
  const data = res?.data;
  const list = Array.isArray(data) ? data : Array.isArray(data?.augments) ? data.augments : [];
  if (!list.length) throw new Error('CDragon arena payload had no augments');
  console.log(`[CDragon] Loaded ${list.length} augments`);
  return list;
}

async function fetchWikiRaw() {
  console.log(`[Wiki] Fetching ${WIKI_URL}`);
  try {
    const res = await httpClient.get(WIKI_URL);
    return typeof res.data === 'string' ? res.data : '';
  } catch (err) {
    console.warn('[Wiki] Fetch failed; continuing without wiki flavor:', err?.message || err);
    return '';
  }
}

function unescapeLuaString(s) {
  if (!s) return '';
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

function parseWiki(rawLua) {
  const byNameLower = {};
  if (!rawLua) return byNameLower;

  AUGMENT_REGEX.lastIndex = 0;
  let match;
  let count = 0;
  while ((match = AUGMENT_REGEX.exec(rawLua)) !== null) {
    const name = match.groups.name;
    const content = match.groups.content;
    const tierMatch = content.match(TIER_REGEX);
    const descMatch = content.match(DESCRIPTION_REGEX);
    const notesMatch = content.match(NOTES_REGEX);
    byNameLower[name.toLowerCase()] = {
      name,
      tier: tierMatch ? tierMatch.groups.tier : null,
      description: descMatch ? unescapeLuaString(descMatch.groups.desc) : '',
      notes: notesMatch ? notesMatch.groups.notes.trim() : '',
    };
    count++;
  }
  console.log(`[Wiki] Parsed ${count} augments`);
  return byNameLower;
}

async function downloadIcon(id, iconUrl) {
  if (!iconUrl) return null;
  const localFilename = `${id}.png`;
  const filePath = path.join(ICON_DIR, localFilename);

  if (fs.existsSync(filePath)) return localFilename;

  try {
    const response = await httpClient.get(iconUrl, { responseType: 'stream' });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    return localFilename;
  } catch (err) {
    if (!isNotFoundError(err)) {
      console.warn(`[Icon] Failed to download ${iconUrl}:`, err?.message || err);
    }
    return null;
  }
}

async function buildMergedTable(cdragonList, wikiByNameLower) {
  const out = {};
  let withWiki = 0;
  let iconsResolved = 0;

  for (const a of cdragonList) {
    if (!a || a.id === undefined || a.id === null) continue;
    const id = String(a.id);
    const name = a.name || a.apiName || `Augment ${a.id}`;
    const iconLarge = a.iconLarge || a.augmentSmallIconPath || a.iconSmall || null;
    const iconSmall = a.iconSmall || a.augmentSmallIconPath || a.iconLarge || null;
    const iconUrl = normalizeCdragonIconPath(iconLarge);

    const wiki = wikiByNameLower[String(name).toLowerCase()] || null;
    if (wiki) withWiki++;

    const localIcon = await downloadIcon(id, iconUrl);
    if (localIcon) iconsResolved++;
    if (iconsResolved % 25 === 0) process.stdout.write('.');

    out[id] = {
      id: a.id,
      apiName: a.apiName || null,
      name,
      rarity: a.rarity ?? null,
      rarityLabel: RARITY_LABELS[a.rarity] || 'Unknown',
      desc: a.desc || a.tooltip || '',
      iconLarge,
      iconSmall,
      iconUrl,
      icon: localIcon, // local filename inside assets/arena, or null
      wikiName: wiki?.name || null,
      wikiTier: wiki?.tier || null,
      wikiDescription: wiki?.description || '',
      wikiNotes: wiki?.notes || '',
    };
  }

  console.log(`\n[Merge] ${cdragonList.length} CDragon augments — ${withWiki} matched to wiki — ${iconsResolved} icons downloaded`);
  return out;
}

async function writeOutput(table) {
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: { cdragon: CDRAGON_URL, wiki: WIKI_URL },
    byId: table,
  };
  await fsp.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`[Output] Wrote ${OUTPUT_FILE}`);
}

async function main() {
  await ensureIconDirectory();
  const [cdragonList, wikiRaw] = await Promise.all([fetchCdragon(), fetchWikiRaw()]);
  const wikiByNameLower = parseWiki(wikiRaw);
  const table = await buildMergedTable(cdragonList, wikiByNameLower);
  await writeOutput(table);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err?.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchCdragon,
  fetchWikiRaw,
  parseWiki,
  buildMergedTable,
  normalizeCdragonIconPath,
};
