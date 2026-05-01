/**
 * Arena (CHERRY) augment data loader.
 *
 * Loading strategy:
 *   1. Prefer the merged on-disk file produced by `fetch_arena_augments.js`
 *      (modules/league/arena_wiki_data.json). It carries CDragon's canonical
 *      ID→name mapping plus wiki-derived flavor (description, notes, tier).
 *      Local icons (assets/arena/<id>.png) are loaded as base64 data URIs so
 *      the puppeteer renderer doesn't need network/file access.
 *   2. Fall back to a live CommunityDragon fetch when the merged file is
 *      missing — this keeps a fresh dev environment functional without
 *      requiring the operator to run the fetch script first.
 *
 * Data sources:
 *   https://raw.communitydragon.org/latest/cdragon/arena/en_us.json
 *   https://wiki.leagueoflegends.com/en-us/Module:ArenaAugmentData/data?action=raw
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const MERGED_FILE = path.join(__dirname, '..', 'arena_wiki_data.json');
const ICON_DIR = path.join(__dirname, '..', 'assets', 'arena');
const CACHE_FILE = path.join(__dirname, '..', 'arena_augment_cache.json');
const SOURCE_URL = 'https://raw.communitydragon.org/latest/cdragon/arena/en_us.json';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CDRAGON_GAME_BASE = 'https://raw.communitydragon.org/latest/game';

const RARITY_LABELS = { 0: 'Silver', 1: 'Gold', 2: 'Prismatic', 4: 'Apex' };

let memoryCache = null;       // { fetchedAt, byId, source }
let inFlightFetch = null;     // de-dupe concurrent fetches
const iconBase64Cache = new Map(); // id -> data URI (or null when missing)

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

function loadIconAsDataUri(id) {
  const key = String(id);
  if (iconBase64Cache.has(key)) return iconBase64Cache.get(key);
  const filePath = path.join(ICON_DIR, `${key}.png`);
  try {
    if (!fs.existsSync(filePath)) {
      iconBase64Cache.set(key, null);
      return null;
    }
    const b64 = fs.readFileSync(filePath, 'base64');
    const uri = `data:image/png;base64,${b64}`;
    iconBase64Cache.set(key, uri);
    return uri;
  } catch (_e) {
    iconBase64Cache.set(key, null);
    return null;
  }
}

function indexCdragonList(list) {
  const byId = {};
  for (const a of list || []) {
    if (!a || a.id === undefined || a.id === null) continue;
    const iconLarge = a.iconLarge || a.augmentSmallIconPath || a.iconSmall || null;
    byId[String(a.id)] = {
      id: a.id,
      apiName: a.apiName || null,
      name: a.name || a.apiName || `Augment ${a.id}`,
      rarity: a.rarity ?? null,
      rarityLabel: RARITY_LABELS[a.rarity] || 'Unknown',
      desc: a.desc || a.tooltip || '',
      iconUrl: normalizeCdragonIconPath(iconLarge),
      icon: null,
      wikiDescription: '',
      wikiNotes: '',
      wikiTier: null,
    };
  }
  return byId;
}

function loadMergedFromDisk(logger) {
  try {
    if (!fs.existsSync(MERGED_FILE)) return null;
    const raw = fs.readFileSync(MERGED_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.byId || typeof parsed.byId !== 'object') return null;
    logger?.info?.('[ArenaAugments] Loaded merged augment data from disk', {
      count: Object.keys(parsed.byId).length,
      fetchedAt: parsed.fetchedAt,
    });
    return { fetchedAt: Date.parse(parsed.fetchedAt) || 0, byId: parsed.byId, source: 'merged' };
  } catch (err) {
    logger?.warn?.('[ArenaAugments] Failed to read merged data file', { err: err?.message });
    return null;
  }
}

function loadLegacyCacheFromDisk(logger) {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.byId) return null;
    return { fetchedAt: parsed.fetchedAt || 0, byId: parsed.byId, source: 'cdragon-cache' };
  } catch (err) {
    logger?.warn?.('[ArenaAugments] Failed to read legacy cache file', { err: err?.message });
    return null;
  }
}

function saveLegacyCache(payload, logger) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf8');
  } catch (err) {
    logger?.warn?.('[ArenaAugments] Failed to write cache file', { err: err?.message });
  }
}

async function fetchFromCdragon(logger) {
  logger?.info?.('[ArenaAugments] Fetching augment data from CommunityDragon', { url: SOURCE_URL });
  const res = await axios.get(SOURCE_URL, { timeout: 20000 });
  const data = res?.data;
  const list = Array.isArray(data) ? data : Array.isArray(data?.augments) ? data.augments : [];
  if (!list.length) throw new Error('CommunityDragon arena payload had no augments');
  const byId = indexCdragonList(list);
  return { fetchedAt: Date.now(), byId, source: 'cdragon-live' };
}

/**
 * Returns the cached arena augment index, refreshing it when stale or missing.
 * Never throws — falls back to {} if all sources are unavailable.
 */
async function getArenaAugmentIndex(logger) {
  if (memoryCache?.byId) return memoryCache.byId;

  // 1. Prefer merged on-disk file (operator-controlled, includes wiki flavor + local icons).
  const merged = loadMergedFromDisk(logger);
  if (merged) {
    memoryCache = merged;
    return merged.byId;
  }

  // 2. Fall back to legacy CDragon cache if recent enough.
  const legacy = loadLegacyCacheFromDisk(logger);
  const now = Date.now();
  if (legacy && now - (legacy.fetchedAt || 0) < CACHE_TTL_MS) {
    memoryCache = legacy;
    return legacy.byId;
  }

  // 3. Live CDragon fetch (de-duped).
  if (!inFlightFetch) {
    inFlightFetch = (async () => {
      try {
        const fresh = await fetchFromCdragon(logger);
        memoryCache = fresh;
        saveLegacyCache({ fetchedAt: fresh.fetchedAt, byId: fresh.byId }, logger);
        return fresh;
      } catch (err) {
        logger?.error?.('[ArenaAugments] Fetch failed; falling back to stale data', { err: err?.message });
        if (legacy) {
          memoryCache = legacy;
          return legacy;
        }
        return { fetchedAt: 0, byId: {}, source: 'empty' };
      } finally {
        inFlightFetch = null;
      }
    })();
  }

  const result = await inFlightFetch;
  return result?.byId || {};
}

/**
 * Resolve a single augment ID into a display-ready entry:
 *   { id, name, iconUrl, rarity, rarityLabel, desc, wikiDescription, wikiNotes, isUnknown }
 *
 * Prefers the local base64-encoded icon when available (for puppeteer
 * rendering); otherwise returns the public CDragon URL.
 */
function resolveAugmentDisplay(id, byId) {
  const key = String(id);
  const entry = byId?.[key];
  if (!entry) {
    return {
      id,
      name: `Augment ${id}`,
      iconUrl: null,
      rarity: null,
      rarityLabel: 'Unknown',
      desc: '',
      wikiDescription: '',
      wikiNotes: '',
      isUnknown: true,
    };
  }
  // Prefer locally-downloaded icon (base64) over remote URL.
  const localIcon = loadIconAsDataUri(entry.id);
  const iconUrl = localIcon || entry.iconUrl || normalizeCdragonIconPath(entry.iconLarge || entry.iconSmall);
  return {
    id: entry.id,
    name: entry.name,
    iconUrl,
    rarity: entry.rarity,
    rarityLabel: entry.rarityLabel || RARITY_LABELS[entry.rarity] || 'Unknown',
    desc: entry.desc || '',
    wikiDescription: entry.wikiDescription || '',
    wikiNotes: entry.wikiNotes || '',
    isUnknown: false,
  };
}

module.exports = {
  getArenaAugmentIndex,
  resolveAugmentDisplay,
  normalizeIconPath: normalizeCdragonIconPath,
};
