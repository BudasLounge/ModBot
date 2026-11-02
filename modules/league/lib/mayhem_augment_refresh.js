/**
 * Patch-aware Mayhem augment index.
 *
 * The match payload only carries numeric augment IDs. This module keeps the
 * ID index in sync with CommunityDragon and refuses to cross Arena/Mayhem
 * pools. It is intentionally safe to call from the match receiver: refresh
 * failures are logged and the existing index is kept.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const INDEX_FILE = path.join(__dirname, '..', 'mayhem_augment_index.json');
const WIKI_FILE = path.join(__dirname, '..', 'mayhem_wiki_data.json');
const METADATA_URL =
  'https://raw.communitydragon.org/latest/content-metadata.json';
const CATALOG_URL =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json';
const LISTS_URL =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/augment-lists.json';

const GOA_ALIASES = {
  HEAVY: 'Pentakill: HEAVY',
  POWER: 'Pentakill: POWER',
  THRASH: 'Pentakill: THRASH',
  DOOM: 'Pentakill: DOOM',
};
const NAME_OVERRIDES = {
  2102: 'Pressure Cooker',
  2108: 'Support Main',
  3176: 'Pentakill Augment',
};

let refreshPromise = null;
let lastVersionCheck = 0;
const VERSION_CHECK_TTL_MS = 30 * 60 * 1000;

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/quest:/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function numericParts(version) {
  return (String(version || '').match(/\d+/g) || []).map(Number);
}

function patchKey(version) {
  return numericParts(version).slice(0, 2).join('.');
}

function isNewerPatch(liveVersion, cachedVersion) {
  const live = patchKey(liveVersion);
  const cached = patchKey(cachedVersion);
  if (!live || !cached) return true;
  const a = live.split('.').map(Number);
  const b = cached.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

function readIndexVersion() {
  const index = readJson(INDEX_FILE);
  return index?.version || index?.patch || null;
}

async function fetchJson(url) {
  const response = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'ModBot/1.0 (+https://budaslounge.com)' },
  });
  return response.data;
}

async function getLiveVersion() {
  try {
    const metadata = await fetchJson(METADATA_URL);
    return metadata?.version || null;
  } catch (_err) {
    return null;
  }
}

function buildIndex(catalog, lists, wiki, version) {
  const byNameId = new Map(
    (catalog || [])
      .filter((entry) => entry && entry.augmentNameId)
      .map((entry) => [entry.augmentNameId, entry])
  );
  const wikiByName = new Map(
    Object.keys(wiki || {}).map((name) => [normalizeName(name), name])
  );

  const modes = {};
  for (const mode of lists || []) {
    const modeName = mode.modeName;
    if (!modeName) continue;
    const byId = {};
    for (const assetPath of mode.augmentList || []) {
      const key = String(assetPath).split('/').pop();
      const entry =
        byNameId.get(key) ||
        byNameId.get(`ARAM_${key}`) ||
        byNameId.get(key.replace(/^ARAM_/, ''));
      if (!entry) continue;

      const id = Number(entry.id);
      const rawName = String(entry.nameTRA || '').trim();
      const name = NAME_OVERRIDES[id] || rawName || `Augment ${id}`;
      let wikiName =
        wikiByName.get(normalizeName(name)) ||
        wikiByName.get(normalizeName(entry.augmentNameId)) ||
        null;
      if (!wikiName && GOA_ALIASES[name]) {
        wikiName = wikiByName.get(normalizeName(GOA_ALIASES[name])) || null;
      }
      if (!wikiName && name.startsWith('Quest: ')) {
        wikiName = wikiByName.get(normalizeName(name.slice(7))) || null;
      }

      byId[String(id)] = {
        id,
        name,
        nameId: entry.augmentNameId || null,
        icon: entry.augmentSmallIconPath || null,
        rarity: String(entry.rarity || '').replace(/^k/, '') || null,
        wikiName,
        mode: modeName,
      };
    }
    modes[modeName] = { byId };
  }

  return {
    version: version || 'latest',
    patch: patchKey(version),
    generatedAt: new Date().toISOString(),
    source:
      'CommunityDragon cherry-augments.json + augment-lists.json; wiki names joined locally',
    modes,
  };
}

async function writeIndex(index) {
  const temp = `${INDEX_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(index, null, 2));
  fs.renameSync(temp, INDEX_FILE);
}

async function refreshMayhemAugmentIndex({ force = false, version = null, liveVersion = null, logger = null } = {}) {
  const resolvedLiveVersion = liveVersion || (await getLiveVersion()) || version;
  const cachedVersion = readIndexVersion();
  if (!force && cachedVersion && resolvedLiveVersion && !isNewerPatch(resolvedLiveVersion, cachedVersion)) {
    return { updated: false, version: cachedVersion, reason: 'up-to-date' };
  }

  try {
    const [catalog, lists] = await Promise.all([
      fetchJson(CATALOG_URL),
      fetchJson(LISTS_URL),
    ]);
    const wiki = readJson(WIKI_FILE, {}) || {};
    const index = buildIndex(catalog, lists, wiki, resolvedLiveVersion || cachedVersion);
    await writeIndex(index);
    logger?.info?.('[MayhemAugments] Refreshed augment index', {
      version: index.version,
      patch: index.patch,
      modes: Object.fromEntries(
        Object.entries(index.modes).map(([mode, data]) => [mode, Object.keys(data.byId).length])
      ),
    });
    return { updated: true, version: index.version, patch: index.patch };
  } catch (err) {
    logger?.warn?.('[MayhemAugments] Refresh failed; keeping existing index', {
      err: err?.message,
      cachedVersion,
    });
    return { updated: false, version: cachedVersion, error: err?.message || String(err) };
  }
}

async function ensureMayhemAugmentIndexForPayload(payload, logger = null) {
  if (!payload || !isMayhemPayload(payload)) {
    return { updated: false, reason: 'not-mayhem' };
  }

  const gamePatch = payload.gameVersion || null;
  const cachedVersion = readIndexVersion();
  if (gamePatch && cachedVersion && !isNewerPatch(gamePatch, cachedVersion)) {
    return { updated: false, version: cachedVersion, reason: 'up-to-date' };
  }

  // EOG payloads often omit gameVersion. Poll CDragon metadata at most every
  // 30 minutes so a patch rollover is still detected without a network call on
  // every match.
  let liveVersion = null;
  if (!gamePatch) {
    if (cachedVersion && Date.now() - lastVersionCheck < VERSION_CHECK_TTL_MS) {
      return { updated: false, version: cachedVersion, reason: 'up-to-date-cached' };
    }
    liveVersion = await getLiveVersion();
    lastVersionCheck = Date.now();
    if (cachedVersion && liveVersion && !isNewerPatch(liveVersion, cachedVersion)) {
      return { updated: false, version: cachedVersion, reason: 'up-to-date-metadata' };
    }
  }

  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshMayhemAugmentIndex({
    version: gamePatch || liveVersion,
    liveVersion,
    logger,
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function isMayhemPayload(payload) {
  const gameMode = String(payload?.gameMode || '').toUpperCase();
  return gameMode === 'KIWI' || gameMode === 'KIWI_JADE' || Number(payload?.queueId) === 2400;
}

module.exports = {
  INDEX_FILE,
  refreshMayhemAugmentIndex,
  ensureMayhemAugmentIndexForPayload,
  isNewerPatch,
  patchKey,
  readIndexVersion,
  getLiveVersion,
  buildIndex,
};
