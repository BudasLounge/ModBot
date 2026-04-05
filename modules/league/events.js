const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeHtmlToImage = require('node-html-to-image');

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

require('dotenv').config();

const ApiClient = require("../../core/js/APIClient.js");
const api = new ApiClient();
const {
  buildMatchTagLine,
  parseMatchTagLine,
  normalizeManualKeywords,
  upsertKeywordsInContent,
} = require('./lib/match_tags.js');

// Cache for recent matches to allow "Identify Augment" interactions
// Key: gameId, Value: { players: [{ user_id, augments: [id1, id2...] }] }
const recentMatchAugments = new Map();

// Cache for full match payload to support "Show More Stats" (5-min TTL)
// Key: gameId (string), Value: { payload, uploaderInfos }
const recentMatchData = new Map();

// File path for persistent Augment ID->Name mapping
const AUGMENT_ID_FILE = path.join(__dirname, 'augment_ids.json');

const RIOT_API_KEY = process.env.RIOT_API_KEY;
let logger;
const pendingMatches = new Map();

const MATCH_WEBHOOK_PORT = parseInt(process.env.MATCH_WEBHOOK_PORT || '38900', 10);
const MATCH_WEBHOOK_HOST = process.env.MATCH_WEBHOOK_HOST || '0.0.0.0';
const MATCH_WEBHOOK_PATH = process.env.MATCH_WEBHOOK_PATH || '/lol/match';
const MATCH_WEBHOOK_SECRET = process.env.MATCH_WEBHOOK_SECRET;
const MATCH_WEBHOOK_CHANNEL = process.env.MATCH_WEBHOOK_CHANNEL;
const MATCH_DEBOUNCE_MS = 10000;
const LEAGUE_EDIT_KEYWORDS_PREFIX = 'LEAGUE_EDIT_KEYWORDS_';
const LEAGUE_KEYWORDS_MODAL_PREFIX = 'LEAGUE_KW_MODAL_';
const LEAGUE_KEYWORDS_FIELD_ID = 'match_keywords';
let matchServerStarted = false;

/* =====================================================
   Riot Endpoints (NA)
===================================================== */

const RIOT_ACCOUNT_BY_RIOT_ID =
  'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/';
const RIOT_SUMMONER_BY_NAME_NA =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_SUMMONER_BY_PUUID_NA =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/';
const RIOT_LEAGUE_BY_SUMMONER_NA =
  'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/';

const riotHttp = axios.create({ timeout: 15000 });

async function riotGet(url) {
  logger.info(`[Riot] GET ${url}`);
  return riotHttp.get(url, {
    headers: { 'X-Riot-Token': RIOT_API_KEY },
  });
}

/* =====================================================
   Helpers
===================================================== */

function normalizeRole(input) {
  if (!input) return 'fill';
  const map = {
    top: 'top',
    jungle: 'jg',
    jg: 'jg',
    mid: 'mid',
    adc: 'adc',
    bot: 'adc',
    sup: 'sup',
    support: 'sup',
  };
  return map[input.toLowerCase()] || 'fill';
}

function parseLFG(input) {
  if (!input) return false;
  return ['yes', 'y', 'true', '1'].includes(input.toLowerCase());
}

function extractRanks(entries) {
  let soloRank = 'unranked';
  let flexRank = null;

  for (const e of entries) {
    if (e.queueType === 'RANKED_SOLO_5x5') {
      soloRank = `${e.tier} ${e.rank}`;
    }
    if (e.queueType === 'RANKED_FLEX_SR') {
      flexRank = `${e.tier} ${e.rank}`;
    }
  }

  return { soloRank, flexRank };
}

function parseRiotId(raw) {
  const idx = raw.lastIndexOf('#');
  if (idx === -1) return null;
  return {
    gameName: raw.slice(0, idx).trim(),
    tagLine: raw.slice(idx + 1).trim(),
  };
}

function formatName(player) {
  if (!player) return 'unknown';
  if (player.riotIdGameName) {
    return `${player.riotIdGameName}${player.riotIdTagLine ? '#' + player.riotIdTagLine : ''}`;
  }
  if (player.summonerName) return player.summonerName;
  return 'unknown';
}

function getUploaderInfo(payload) {
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  const winningTeam = teams.find((t) => t.isWinningTeam);

  const localPlayer = payload?.localPlayer || teams.flatMap((t) => t.players || []).find((p) => p?.isLocalPlayer);
  const uploaderName =
    payload?.uploader ||
    payload?.uploadedBy ||
    payload?.uploaderName ||
    payload?.uploaderId ||
    formatName(localPlayer);

  const uploaderPlayer = localPlayer || teams.flatMap((t) => t.players || []).find((p) => formatName(p) === uploaderName);
  const uploaderTeamId = uploaderPlayer?.teamId ?? null;
  const winningTeamId = winningTeam?.teamId ?? null;
  const result = uploaderTeamId && winningTeamId
    ? (uploaderTeamId === winningTeamId ? 'Win' : 'Loss')
    : 'Unknown';

  return { name: uploaderName, result };
}

function toDiscordSnowflake(value) {
  const asString = String(value || '').trim();
  if (!/^\d{15,22}$/.test(asString)) return null;
  return asString;
}

function normalizeLeagueName(value) {
  return String(value || '').trim().toLowerCase();
}

function stripRiotTag(value) {
  const normalized = normalizeLeagueName(value);
  const idx = normalized.lastIndexOf('#');
  return idx === -1 ? normalized : normalized.slice(0, idx);
}

function parseLeagueAdminFlag(value) {
  if (typeof value === 'boolean') return value;
  return value === 1 || value === '1' || value === 'true';
}

function collectUploaderDiscordIds(payload) {
  const rawCandidates = [
    payload?.user_id,
    payload?.uploaderId,
    payload?.uploaderUserId,
    payload?.uploadedByUserId,
    payload?.discordUserId,
    payload?.uploaderDiscordId,
  ];

  return Array.from(
    new Set(rawCandidates.map(toDiscordSnowflake).filter(Boolean))
  );
}

function extractParsedMatchTags(content) {
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseMatchTagLine(line);
    if (parsed) return parsed;
  }
  return null;
}

async function loadLeaguePlayerByUserId(userId) {
  try {
    const response = await api.get('league_player', { user_id: userId });
    const rows = Array.isArray(response?.league_players) ? response.league_players : [];
    return rows[0] || null;
  } catch (err) {
    logger.error('[LoL Match Tags] Failed to load league_player row', { userId, err: err?.message });
    return null;
  }
}

async function loadLeaguePlayerByLeagueName(leagueName) {
  if (!leagueName) return null;
  try {
    const response = await api.get('league_player', {});
    const rows = Array.isArray(response?.league_players) ? response.league_players : [];
    const normalized = normalizeLeagueName(leagueName);
    const base = stripRiotTag(leagueName);
    return rows.find((p) => {
      const pFull = normalizeLeagueName(p?.league_name);
      const pBase = stripRiotTag(p?.league_name);
      return (normalized && pFull === normalized) || (base && pBase === base);
    }) || null;
  } catch (err) {
    logger.error('[LoL Match Tags] Failed to load league_player by name', { leagueName, err: err?.message });
    return null;
  }
}

async function canEditMatchKeywords(userId, payload, uploaderInfos = [], tagUploader = null, tagUploaderId = null) {
  if (tagUploaderId && tagUploaderId === userId) {
    return { allowed: true, reason: 'tag_uploader_id', isAdmin: false };
  }

  const uploaderIds = collectUploaderDiscordIds(payload);
  if (uploaderIds.includes(userId)) {
    return { allowed: true, reason: 'uploader_id', isAdmin: false };
  }

  const leaguePlayer = await loadLeaguePlayerByUserId(userId);
  const isAdmin = parseLeagueAdminFlag(leaguePlayer?.league_admin);

  const uploaderNameSet = new Set();
  for (const info of uploaderInfos) {
    const full = normalizeLeagueName(info?.name);
    const base = stripRiotTag(info?.name);
    if (full) uploaderNameSet.add(full);
    if (base) uploaderNameSet.add(base);
  }

  const tagUploaderFull = normalizeLeagueName(tagUploader);
  const tagUploaderBase = stripRiotTag(tagUploader);
  if (tagUploaderFull) uploaderNameSet.add(tagUploaderFull);
  if (tagUploaderBase) uploaderNameSet.add(tagUploaderBase);

  const linkedLeagueName = normalizeLeagueName(leaguePlayer?.league_name);
  const linkedLeagueNameBase = stripRiotTag(leaguePlayer?.league_name);
  if ((linkedLeagueName && uploaderNameSet.has(linkedLeagueName)) ||
      (linkedLeagueNameBase && uploaderNameSet.has(linkedLeagueNameBase))) {
    return { allowed: true, reason: 'uploader_name', isAdmin };
  }

  if (isAdmin) {
    return { allowed: true, reason: 'league_admin', isAdmin: true };
  }

  return { allowed: false, reason: 'not_allowed', isAdmin: false };
}


/* =====================================================
   League DB helpers (for match mentions)
===================================================== */

function collectMatchPuuids(payload) {
  logger.info('[LoL Match Ingest] Collecting PUUIDs from payload');
  const puuidSet = new Set();

  if (!payload?.teams) return [];

  for (const team of payload.teams) {
    for (const player of team.players || []) {
      if (player?.puuid) {
        puuidSet.add(player.puuid);
      }
    }
  }

  const list = Array.from(puuidSet);
  logger.info('[LoL Match Ingest] Collected PUUIDs', { count: list.length });
  return list;
}

async function fetchPlayersByPuuid(puuids) {
  if (!Array.isArray(puuids) || puuids.length === 0) return [];

  try {
    logger.info('[LoL Match Ingest] Fetching league_player records for match PUUIDs', { count: puuids.length });
    const res = await api.get('league_player', {});
    const players = Array.isArray(res?.league_players) ? res.league_players : [];
    const puuidSet = new Set(puuids);

    const matched = players.filter((p) => p?.puuid && puuidSet.has(p.puuid));
    logger.info('[LoL Match Ingest] Matched players against DB', { matched: matched.length });
    return matched;
  } catch (err) {
    logger.error('[LoL Match Ingest] Failed to fetch league players', err);
    return [];
  }
}

// LoL Match Ingest helper: resolve DB rows by Riot ID (NAME#TAG) instead of PUUID
async function resolveMatchPlayers(payload) {
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];

  const riotIds = [];
  for (const team of teams) {
    for (const player of team.players || []) {
      const name = (player?.riotIdGameName || '').trim();
      const tag = (player?.riotIdTagLine || '').trim();
      if (name && tag) {
        riotIds.push(`${name}#${tag}`);
      }
    }
  }

  const normalizedRiotIds = Array.from(new Set(riotIds.map((id) => id.toLowerCase())));

  logger.info('[LoL Match Ingest] Resolving match players by Riot ID', {
    riotIdCount: normalizedRiotIds.length,
    riotIds: normalizedRiotIds
  });

  if (normalizedRiotIds.length === 0) return [];

  let players = [];
  try {
    const resAll = await api.get('league_player', {});
    players = Array.isArray(resAll?.league_players) ? resAll.league_players : [];
    logger.info('[LoL Match Ingest] Loaded league_player rows for matching', { totalPlayers: players.length });
  } catch (err) {
    logger.error('[LoL Match Ingest] Failed to load league_player table', err);
    return [];
  }

  const riotIdSet = new Set(normalizedRiotIds);
  const matched = new Map();

  for (const row of players) {
    const leagueName = (row?.league_name || '').trim().toLowerCase();
    if (!leagueName) continue;
    if (riotIdSet.has(leagueName) && !matched.has(leagueName)) {
      matched.set(leagueName, row);
    }
  }

  logger.info('[LoL Match Ingest] Matched players by Riot ID', {
    matched: matched.size,
    matchedLeagueNames: Array.from(matched.keys())
  });

  return Array.from(matched.values());
}

async function createMentionThread(parentMessage, matchedPlayers, gameId, payload) {
  if (!parentMessage || !Array.isArray(matchedPlayers) || matchedPlayers.length === 0) return;

  try {
    logger.info('[LoL Match Ingest] Creating mention thread for matched players', {
      matchedPlayers: matchedPlayers.length,
      gameId,
    });

    // Map riotId (name#tag) to champion for display
    const riotIdToChamp = new Map();
    const teams = Array.isArray(payload?.teams) ? payload.teams : [];
    for (const team of teams) {
      for (const player of team.players || []) {
        const name = (player?.riotIdGameName || '').trim();
        const tag = (player?.riotIdTagLine || '').trim();
        if (name && tag) {
          riotIdToChamp.set(`${name.toLowerCase()}#${tag.toLowerCase()}`, player.championName || 'Unknown');
        }
      }
    }
    const uniqueUserIds = Array.from(
      new Set(
        matchedPlayers
          .map((p) => (p?.user_id ? String(p.user_id).trim() : ''))
          .filter(Boolean)
      )
    );

    if (uniqueUserIds.length === 0) return;

    const threadNameBase = gameId ? `Match ${gameId} players` : 'Match participants';
    const threadName = threadNameBase.slice(0, 90);

    const thread = await parentMessage.startThread({
      name: threadName,
      autoArchiveDuration: 1440,
    });
    logger.info('[LoL Match Ingest] Mention thread created', { threadName, mentions: uniqueUserIds.length });

    const lines = matchedPlayers.map((p, idx) => {
      const label = `Player${idx + 1}`;
      const leagueName = (p?.league_name || 'Unknown').trim();
      const mention = p?.user_id ? ` (<@${String(p.user_id).trim()}>)` : '';
      const champ = riotIdToChamp.get(leagueName.toLowerCase()) || 'Unknown';
      return `${label}: ${leagueName} — ${champ}${mention}`;
    });

    await thread.send({ content: `Players in this match:\n${lines.join('\n')}` });
  } catch (err) {
    logger.error('[LoL Match Ingest] Failed to create mention thread', err);
  }
}


/* =====================================================
   Infographic Logic (Dynamic & Season 2026 Ready)
===================================================== */

// 1. Dynamic Version Cache
let cachedVersion = '14.3.1';
let lastVersionFetch = 0;

// Forfeit helpers
function getForfeitDetails(payload) {
  const isForfeit = Boolean(payload?.forfeit);
  const reasonRaw = payload?.forfeitReason;
  const reasonLabel = reasonRaw === 'early_surrender'
    ? 'Early surrender'
    : reasonRaw === 'surrender'
      ? 'Surrender'
      : 'Forfeit';

  const teamId = payload?.forfeitTeamId || null;
  const teamIsPlayer = Boolean(payload?.forfeitTeamIsPlayer);
  const teamLabel = teamId === 100 ? 'Blue team' : teamId === 200 ? 'Red team' : 'Unknown team';

  const forfeitingNames = Array.isArray(payload?.forfeitPlayers)
    ? payload.forfeitPlayers
        .map((p) => {
          if (!p) return null;
          if (p.riotIdTagLine) return `${p.riotIdGameName || p.summonerName || 'Unknown'}#${p.riotIdTagLine}`;
          return p.riotIdGameName || p.summonerName || null;
        })
        .filter(Boolean)
    : [];

  if (isForfeit && forfeitingNames.length === 0) {
    logger?.warn('[LoL Match Ingest] Forfeit flagged but no forfeitPlayers provided');
  }

  return {
    isForfeit,
    reasonLabel,
    teamLabel,
    teamId,
    teamIsPlayer,
    forfeitingNames,
  };
}

function isAramMayhem(payload) {
  const mode = (payload?.gameMode || '').toUpperCase();
  const queue = (payload?.queueType || '').toUpperCase();
  return Boolean(payload?.isAramMayhem) || mode === 'KIWI' || queue === 'KIWI';
}

function isSRGame(payload) {
  if (isAramMayhem(payload)) return false;
  const mode = (payload?.gameMode || '').toUpperCase();
  const qt   = (payload?.queueType || '').toUpperCase();
  return mode === 'CLASSIC' || qt.includes('RANKED') || qt === 'CLASH' || qt.includes('NORMAL') || qt === 'DRAFT';
}

function extractRankedLpInfo(payload) {
  const hasRankedPayload = Boolean(payload?.isRanked || payload?.rankedSummary || payload?.rankedLpChange || payload?.rankedCurrent);
  if (!hasRankedPayload) {
    return {
      hasRankedLp: false,
      rankedQueueLabel: null,
      rankedCurrent: null,
      rankedDelta: null,
      rankedDeltaClass: 'ranked-delta-neutral'
    };
  }

  const top = payload?.rankedLpChange || null;
  const summary = payload?.rankedSummary || null;
  const change = top || summary?.rankedChange || null;
  const current = payload?.rankedCurrent || summary?.rankedCurrent || null;

  const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const queueRaw = String(pick(payload?.queueType, change?.queueType, current?.queueType, summary?.queueType, '')).toUpperCase();
  const rankedQueueLabel = queueRaw.includes('FLEX')
    ? 'Ranked Flex'
    : queueRaw.includes('SOLO')
      ? 'Ranked Solo'
      : 'Ranked';

  const tier = pick(change?.tier, current?.tier, summary?.tier, change?.currentTier, summary?.currentTier);
  const division = pick(
    change?.rank,
    change?.division,
    current?.division,
    current?.rank,
    summary?.rank,
    summary?.division,
    change?.currentRank,
    summary?.currentRank
  );
  const lp = toNum(pick(
    change?.lp,
    change?.leaguePoints,
    change?.currentLp,
    change?.currentLP,
    current?.lp,
    current?.leaguePoints,
    current?.currentLp,
    current?.currentLP,
    summary?.lp,
    summary?.leaguePoints,
    summary?.currentLp,
    summary?.currentLP
  ));

  const delta = toNum(pick(
    change?.lpChange,
    change?.lpDelta,
    change?.deltaLp,
    change?.deltaLP,
    change?.change,
    summary?.lpChange,
    summary?.lpDelta
  ));

  const rankParts = [tier, division].filter(Boolean);
  const rankedCurrent = rankParts.length
    ? `${rankParts.join(' ')}${lp !== null ? ` (${lp} LP)` : ' (LP unknown)'}`
    : (lp !== null ? `${lp} LP` : 'Rank unavailable');

  const rankedDelta = delta !== null ? `${delta >= 0 ? '+' : ''}${delta} LP` : 'LP change unavailable';
  const rankedDeltaClass = delta === null
    ? 'ranked-delta-neutral'
    : (delta >= 0 ? 'ranked-delta-up' : 'ranked-delta-down');

  return {
    hasRankedLp: true,
    rankedQueueLabel,
    rankedTier: tier || null,
    rankedDivision: division || null,
    rankedLeaguePoints: lp,
    rankedCurrent,
    rankedDelta,
    rankedDeltaClass
  };
}

function formatCompactRankLabel(entry) {
  if (!entry) return null;

  const abbr = {
    IRON: 'Iron',
    BRONZE: 'Bronze',
    SILVER: 'Silver',
    GOLD: 'Gold',
    PLATINUM: 'Plat',
    EMERALD: 'Emrld',
    DIAMOND: 'Dia',
    MASTER: 'Master',
    GRANDMASTER: 'GMaster',
    CHALLENGER: 'Chlngr',
  };

  let tier = String(entry.rankedTier || '').toUpperCase();
  let division = entry.rankedDivision ? String(entry.rankedDivision).toUpperCase() : null;
  let lp = Number.isFinite(Number(entry.rankedLeaguePoints)) ? Number(entry.rankedLeaguePoints) : null;

  // Back-compat parse from existing label when tier/div/lp are not explicitly present.
  if (!tier || lp === null) {
    const current = String(entry.rankedCurrent || '');
    const rankMatch = current.match(/(IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER)\s*(I|II|III|IV)?/i);
    const lpMatch = current.match(/(\d+)\s*LP/i);
    if (!tier && rankMatch?.[1]) tier = rankMatch[1].toUpperCase();
    if (!division && rankMatch?.[2]) division = rankMatch[2].toUpperCase();
    if (lp === null && lpMatch?.[1]) lp = Number(lpMatch[1]);
  }

  if (!tier && lp === null) return entry.rankedCurrent || null;

  const tierLabel = abbr[tier] || tier;
  const parts = [tierLabel];
  if (division) parts.push(division);
  if (lp !== null) parts.push(String(lp));
  return parts.join(' ');
}

function buildRankedLpEntries(payloads = []) {
  if (!Array.isArray(payloads) || payloads.length === 0) return [];

  const entriesByPlayerAndQueue = new Map();

  for (const payload of payloads) {
    const ranked = extractRankedLpInfo(payload);
    if (!ranked.hasRankedLp) continue;

    const uploader = getUploaderInfo(payload);
    const playerName = (uploader?.name || 'Player').trim() || 'Player';
    const key = `${playerName.toLowerCase()}::${ranked.rankedQueueLabel || 'Ranked'}`;

    entriesByPlayerAndQueue.set(key, {
      playerName,
      rankedQueueLabel: ranked.rankedQueueLabel,
      rankedTier: ranked.rankedTier,
      rankedDivision: ranked.rankedDivision,
      rankedLeaguePoints: ranked.rankedLeaguePoints,
      rankedCurrent: ranked.rankedCurrent,
      rankedDelta: ranked.rankedDelta,
      rankedDeltaClass: ranked.rankedDeltaClass,
    });
  }

  return Array.from(entriesByPlayerAndQueue.values());
}

const AUGMENT_NAME_MAP = {
  // Populate with known ID->name pairs as they become available.
};

// Load persistent ID map
try {
  if (fs.existsSync(AUGMENT_ID_FILE)) {
    const savedIds = JSON.parse(fs.readFileSync(AUGMENT_ID_FILE, 'utf8'));
    Object.assign(AUGMENT_NAME_MAP, savedIds);
    // logger.info('Loaded augment IDs', { count: Object.keys(savedIds).length });
  }
} catch (err) {
  console.error('Failed to load augment_ids.json', err);
}

let wikiAugmentData = {};
const wikiAugmentDataLower = {};
try {
  wikiAugmentData = require('./mayhem_wiki_data.json');
  Object.keys(wikiAugmentData).forEach(k => {
      wikiAugmentDataLower[k.toLowerCase()] = wikiAugmentData[k];
  });
} catch (e) {
  // Wiki data not yet fetched
}
const AUGMENT_ICON_DIR = path.join(__dirname, 'assets', 'mayhem');

function getAugmentName(id) {
  // If the ID is already a string (Name), return it.
  if (typeof id === 'string') return id;

  if (!Number.isFinite(id)) return 'Augment';
  return AUGMENT_NAME_MAP[id] || `Augment ${id}`;
}

function buildAugmentDisplay(id) {
  const name = getAugmentName(id);
  
  let icon = null;
  const wikiEntry = wikiAugmentData[name] || (name ? wikiAugmentDataLower[name.toLowerCase()] : null);
  
  // If we have wiki data for this name, try to resolve the local icon
  if (wikiEntry && wikiEntry.icon) {
    const iconName = wikiEntry.icon;
    const fullPath = path.join(AUGMENT_ICON_DIR, iconName);
    
    if (fs.existsSync(fullPath)) {
      try {
        // Read as base64 to avoid Puppeteer local file permission issues
        const imgParams = fs.readFileSync(fullPath, 'base64');
        icon = `data:image/png;base64,${imgParams}`;
      } catch (err) {
        if (logger) logger.error(`[Infographic] Failed to read icon file: ${fullPath}`, err);
      }
    } else {
      if (logger) logger.warn(`[Infographic] Icon file missing: ${fullPath} (Augment: ${name})`);
    }
  } else {
    // Debug: log if we have a name but no wiki entry
    // if (name && !name.startsWith('Augment ') && logger) {
    //   logger.info(`[Infographic] No wiki entry found for augment: ${name}`);
    // }
  }

  return {
    id,
    name: wikiEntry ? wikiEntry.name : name,
    short: (name || '').slice(0, 3).toUpperCase() || 'AUG',
    icon: icon, 
  };
}

function extractPlayerAugments(player) {
  if (!player) return [];

  let ids = [];
  if (Array.isArray(player.augments)) {
    ids = player.augments;
  } else {
    const stats = player.stats || {};
    ids = [1, 2, 3, 4, 5, 6]
      .map((i) => stats[`PLAYER_AUGMENT_${i}`])
      .filter((v) => v !== undefined && v !== null && v !== 0);
  }

  // Allow Numbers or non-empty Strings
  const unique = Array.from(new Set(ids.filter((v) => Number.isFinite(v) || (typeof v === 'string' && v.length > 0))));
  return unique.map(buildAugmentDisplay);
}

async function getLatestDDVersion() {
  const now = Date.now();
  // Fetch only once every hour to be polite
  if (now - lastVersionFetch > 1000 * 60 * 60) {
    try {
      const res = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
      if (res.data && res.data[0]) {
        cachedVersion = res.data[0];
        logger.info(`[Infographic] Updated DataDragon version to: ${cachedVersion}`);
      }
    } catch (e) {
      logger.warn('[Infographic] Failed to fetch versions, using cache', e.message);
    }
    lastVersionFetch = now;
  } else {
    logger.info('[Infographic] Using cached DataDragon version', { cachedVersion });
  }
  return cachedVersion;
}

function fixChampName(name) {
  if (!name) return 'Unknown';
  // Normalize curly/smart apostrophes to straight apostrophe first
  const normalized = name.replace(/[\u2018\u2019\u02BC]/g, "'");
  const map = {
    'Wukong': 'MonkeyKing', 'Renata Glasc': 'Renata', 'Bel\'Veth': 'Belveth',
    'Kog\'Maw': 'KogMaw', 'Rek\'Sai': 'RekSai', 'Dr. Mundo': 'DrMundo',
    'Nunu & Willump': 'Nunu', 'Fiddlesticks': 'Fiddlesticks', 'LeBlanc': 'Leblanc',
    // Apostrophe champs where stripping leaves wrong capitalisation vs DDragon filenames
    'Cho\'Gath': 'Chogath', 'Kai\'Sa': 'Kaisa', 'Kha\'Zix': 'Khazix',
    'Vel\'Koz': 'Velkoz', 'Nunu & Willump': 'Nunu',
  };
  return map[normalized] || normalized.replace(/[' .&]/g, '');
}

/* =====================================================
   Infographic Logic (Clean Badges + Detailed Footer)
===================================================== */

async function prepareScoreboardData(payload, uploaderInfos = [], rankedLpEntries = []) {
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const isMayhem = isAramMayhem(payload);
  const fallbackRanked = extractRankedLpInfo(payload);
  const effectiveRankedEntries = Array.isArray(rankedLpEntries) && rankedLpEntries.length > 0
    ? rankedLpEntries
    : (fallbackRanked.hasRankedLp
      ? [{
          playerName: (uploaderInfos?.[0]?.name || 'Player'),
          rankedQueueLabel: fallbackRanked.rankedQueueLabel,
          rankedTier: fallbackRanked.rankedTier,
          rankedDivision: fallbackRanked.rankedDivision,
          rankedLeaguePoints: fallbackRanked.rankedLeaguePoints,
          rankedCurrent: fallbackRanked.rankedCurrent,
          rankedDelta: fallbackRanked.rankedDelta,
          rankedDeltaClass: fallbackRanked.rankedDeltaClass,
        }]
      : []);
  const primaryRanked = effectiveRankedEntries[0] || {
    rankedQueueLabel: fallbackRanked.rankedQueueLabel,
    rankedCurrent: fallbackRanked.rankedCurrent,
    rankedDelta: fallbackRanked.rankedDelta,
    rankedDeltaClass: fallbackRanked.rankedDeltaClass,
  };
  const forfeit = getForfeitDetails(payload);
  const ver = await getLatestDDVersion();
  const CDN = `https://ddragon.leagueoflegends.com/cdn/${ver}/img`;
  const ITEM_CDN = `${CDN}/item`;
  const SPELL_CDN = `${CDN}/spell`;
  const RUNE_CDN = `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles`;

  // --- SVG ICONS ---
  const ICONS = {
    HEART: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    FIRE: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>`,
    SHIELD: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
    TOWER: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-4V0h-4v2H6v4h2v8H6v6h12v-6h-2V6h2z"/></svg>`,
    CC: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L10 6H6l2 4-2 4h4l2 4 2-4h4l-2-4 2-4h-4z"/></svg>`,
    SKULL: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-4.42 0-8 3.58-8 8 0 4.42 8 10 8 10s8-5.58 8-10c0-4.42-3.58-8-8-8zm0 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
    SWORD: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 17.5L3 6V3h3l11.5 11.5-3 3zM5 5l10 10"/><path d="M6 6l12 12M6 18L18 6"/></svg>`,
    EYE: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
  };

  const spellMap = { 1:'SummonerBoost', 3:'SummonerExhaust', 4:'SummonerFlash', 6:'SummonerHaste', 7:'SummonerHeal', 11:'SummonerSmite', 12:'SummonerTeleport', 13:'SummonerMana', 14:'SummonerDot', 21:'SummonerBarrier', 32:'SummonerSnowball' };
  const runeMap = { 8000:'7201_Precision', 8100:'7200_Domination', 8200:'7202_Sorcery', 8300:'7203_Whimsy', 8400:'7204_Resolve', 40500:'7201_Precision', 41300:'7200_Domination' };

  const allPlayers = teams.flatMap((t) => t.players || []);
  const getStat = (p, key) => (p.stats && p.stats[key]) ? p.stats[key] : 0;
  
  const maxVals = {
    protector: Math.max(...allPlayers.map(p => getStat(p, 'TOTAL_HEAL_ON_TEAMMATES') + getStat(p, 'TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES'))),
    spree: Math.max(...allPlayers.map(p => getStat(p, 'LARGEST_KILLING_SPREE'))),
    damage: Math.max(...allPlayers.map(p => getStat(p, 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS'))),
    tank: Math.max(...allPlayers.map(p => getStat(p, 'TOTAL_DAMAGE_TAKEN') + getStat(p, 'TOTAL_DAMAGE_SELF_MITIGATED'))),
    vision: Math.max(...allPlayers.map(p => getStat(p, 'VISION_SCORE'))),
    turret: Math.max(...allPlayers.map(p => getStat(p, 'TOTAL_DAMAGE_DEALT_TO_TURRETS'))),
    cc: Math.max(...allPlayers.map(p => getStat(p, 'TIME_CCING_OTHERS'))),
    dead: Math.max(...allPlayers.map(p => getStat(p, 'TOTAL_TIME_SPENT_DEAD')))
  };

  const uploaderNameSet = new Set(
    uploaderInfos
      .map((u) => (u?.name || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const normalizeName = (name) => String(name || '').trim().toLowerCase();
  const stripTag = (name) => {
    const raw = String(name || '').trim();
    const idx = raw.lastIndexOf('#');
    return idx === -1 ? raw : raw.slice(0, idx);
  };
  const compactQueueLabel = (label) => {
    const upper = String(label || '').toUpperCase();
    if (upper.includes('SOLO')) return 'Solo';
    if (upper.includes('FLEX')) return 'Flex';
    return 'Ranked';
  };

  const rankedEntryByName = new Map();
  for (const entry of effectiveRankedEntries) {
    const full = normalizeName(entry?.playerName);
    const base = normalizeName(stripTag(entry?.playerName));
    if (full && !rankedEntryByName.has(full)) rankedEntryByName.set(full, entry);
    if (base && !rankedEntryByName.has(base)) rankedEntryByName.set(base, entry);
  }

  const mapPlayer = (p) => {
    const stats = p.stats || {};
    
    // Items
    const itemIds = [0, 1, 2, 3, 4, 5, 6].map(i => (p.items && p.items[i]) ? p.items[i] : (stats[`ITEM${i}`] || 0));
    const trinketId = itemIds[6];
    const mainItemIds = itemIds.slice(0, 6);
    const roleItem = stats.ROLE_BOUND_ITEM || 0;
    const buildUrl = (id) => id ? `${ITEM_CDN}/${id}.png` : null;

    const displayItems = [
      ...mainItemIds.map(id => ({ url: buildUrl(id), isPlaceholder: !id })),
      { url: buildUrl(roleItem), isPlaceholder: !roleItem, isRole: true },
      { url: buildUrl(trinketId), isPlaceholder: !trinketId, isTrinket: true }
    ];

    // --- ASSIGN BADGES (Icon + Title Only) ---
    const badges = [];

    // The Protector
    const myProtection = getStat(p, 'TOTAL_HEAL_ON_TEAMMATES') + getStat(p, 'TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES');
    if (myProtection === maxVals.protector && maxVals.protector > 1000) 
      badges.push({ icon: ICONS.HEART, title: 'The Protector' });
    
    // Unstoppable
    if (getStat(p, 'LARGEST_KILLING_SPREE') === maxVals.spree && maxVals.spree >= 3)
      badges.push({ icon: ICONS.FIRE, title: 'Unstoppable' });

    // Most Tanked
    if ((getStat(p, 'TOTAL_DAMAGE_TAKEN') + getStat(p, 'TOTAL_DAMAGE_SELF_MITIGATED')) === maxVals.tank && maxVals.tank > 0)
      badges.push({ icon: ICONS.SHIELD, title: 'Most Tanked' });

    // Objective Boss
    if (getStat(p, 'TOTAL_DAMAGE_DEALT_TO_TURRETS') === maxVals.turret && maxVals.turret > 0)
      badges.push({ icon: ICONS.TOWER, title: 'Objective Boss' });

    // CC King
    if (getStat(p, 'TIME_CCING_OTHERS') === maxVals.cc && maxVals.cc > 0)
      badges.push({ icon: ICONS.CC, title: 'CC King' });
      
    // Grey Screen
    if (getStat(p, 'TOTAL_TIME_SPENT_DEAD') === maxVals.dead && maxVals.dead > 0)
      badges.push({ icon: ICONS.SKULL, title: 'Grey Screen King' });
    // ------------------------------------------

    const k = stats.CHAMPIONS_KILLED || 0;
    const d = stats.NUM_DEATHS || 0;
    const a = stats.ASSISTS || 0;
    const dmg = stats.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0;
    
    let isHighlight = p.isLocalPlayer || (payload.user_id && p.puuid === payload.puuid);
    const playerName = p.summonerName || p.riotIdGameName;
    const normalizedPlayerName = (playerName || '').trim().toLowerCase();
    const normalizedFormattedName = (formatName(p) || '').trim().toLowerCase();
    if (!isHighlight && uploaderNameSet.size > 0) {
      if (uploaderNameSet.has(normalizedPlayerName) || uploaderNameSet.has(normalizedFormattedName)) {
        isHighlight = true;
      }
    }

    const s1 = spellMap[p.spell1Id] || 'SummonerFlash';
    const s2 = spellMap[p.spell2Id] || 'SummonerFlash';
    const pStyle = stats.PERK_PRIMARY_STYLE || 8000;
    const sStyle = stats.PERK_SUB_STYLE || 8100;

    const playerRiotId = p.riotIdGameName && p.riotIdTagLine
      ? `${p.riotIdGameName}#${p.riotIdTagLine}`
      : null;
    const rankedCandidateNames = [
      formatName(p),
      playerName,
      playerRiotId,
      p.riotIdGameName,
      stripTag(formatName(p)),
    ]
      .map(normalizeName)
      .filter(Boolean);

    let playerRankedEntry = null;
    for (const candidate of rankedCandidateNames) {
      const found = rankedEntryByName.get(candidate);
      if (found) {
        playerRankedEntry = found;
        break;
      }
    }

    return {
      name: playerName || 'Unknown',
      championName: p.championName,
      championIcon: `${CDN}/champion/${fixChampName(p.championName)}.png`,
      level: stats.LEVEL || 18,
      spell1: `${SPELL_CDN}/${s1}.png`,
      spell2: `${SPELL_CDN}/${s2}.png`,
      rune1: `${RUNE_CDN}/${runeMap[pStyle]||'7201_Precision'}.png`,
      rune2: `${RUNE_CDN}/${runeMap[sStyle]||'7200_Domination'}.png`,
      displayItems,
      badges,
      augments: isMayhem ? extractPlayerAugments(p) : [],
      k, d, a,
      kdaRatio: d === 0 ? (k + a).toFixed(2) : ((k + a) / d).toFixed(2),
      totalDamage: dmg.toLocaleString(),
      damagePercent: maxVals.damage > 0 ? ((dmg / maxVals.damage) * 100).toFixed(1) : 0,
      gold: ((stats.GOLD_EARNED || 0) / 1000).toFixed(1) + 'k',
      cs: (stats.MINIONS_KILLED || 0) + (stats.NEUTRAL_MINIONS_KILLED || 0),
      vision: stats.VISION_SCORE || 0,
      isLocal: isHighlight,
      hasRankedCard: Boolean(playerRankedEntry),
      rankedQueueCompact: playerRankedEntry ? compactQueueLabel(playerRankedEntry.rankedQueueLabel) : null,
      rankedCurrentCompact: formatCompactRankLabel(playerRankedEntry),
      rankedDeltaCompact: playerRankedEntry?.rankedDelta || null,
      rankedDeltaClassCompact: playerRankedEntry?.rankedDeltaClass || 'ranked-delta-neutral',
    };
  };

  const t100 = teams.find((t) => t.teamId === 100) || { players: [] };
  const t200 = teams.find((t) => t.teamId === 200) || { players: [] };

  const getTotals = (team) => ({
    k: team.players.reduce((a,b) => a + (b.stats.CHAMPIONS_KILLED||0), 0),
    d: team.players.reduce((a,b) => a + (b.stats.NUM_DEATHS||0), 0),
    a: team.players.reduce((a,b) => a + (b.stats.ASSISTS||0), 0),
    gold: (team.players.reduce((a,b) => a + (b.stats.GOLD_EARNED||0), 0) / 1000).toFixed(1) + 'k'
  });

  // Build badge winners for the visual awards section
  const formatK = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  const findWinnerName = (statFn) => {
    if (!allPlayers.length) return 'Unknown';
    const winner = allPlayers.reduce((best, p) => statFn(p) > statFn(best) ? p : best, allPlayers[0]);
    return winner ? (winner.summonerName || winner.riotIdGameName || 'Unknown') : 'Unknown';
  };

  const badgeWinners = [
    {
      icon: ICONS.HEART,
      title: 'The Protector',
      desc: 'Most Heals & Shields',
      winnerName: findWinnerName(p => getStat(p, 'TOTAL_HEAL_ON_TEAMMATES') + getStat(p, 'TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES')),
      value: formatK(maxVals.protector)
    },
    {
      icon: ICONS.FIRE,
      title: 'Unstoppable',
      desc: 'Largest Kill Spree',
      winnerName: findWinnerName(p => getStat(p, 'LARGEST_KILLING_SPREE')),
      value: maxVals.spree + ' kill spree'
    },
    {
      icon: ICONS.SHIELD,
      title: 'Most Tanked',
      desc: 'Dmg Taken + Mitigated',
      winnerName: findWinnerName(p => getStat(p, 'TOTAL_DAMAGE_TAKEN') + getStat(p, 'TOTAL_DAMAGE_SELF_MITIGATED')),
      value: formatK(maxVals.tank)
    },
    {
      icon: ICONS.TOWER,
      title: 'Objective Boss',
      desc: 'Most Tower Dmg',
      winnerName: findWinnerName(p => getStat(p, 'TOTAL_DAMAGE_DEALT_TO_TURRETS')),
      value: formatK(maxVals.turret)
    },
    {
      icon: ICONS.CC,
      title: 'CC King',
      desc: 'Crowd Control Time',
      winnerName: findWinnerName(p => getStat(p, 'TIME_CCING_OTHERS')),
      value: maxVals.cc + 's'
    },
    {
      icon: ICONS.SKULL,
      title: 'Grey Screen',
      desc: 'Time Spent Dead',
      winnerName: findWinnerName(p => getStat(p, 'TOTAL_TIME_SPENT_DEAD')),
      value: maxVals.dead + 's'
    }
  ];

  const blueTeamWon = Boolean(t100.isWinningTeam);
  const redTeamWon = Boolean(t200.isWinningTeam);

  let outcomeText = 'MATCH COMPLETE';
  let outcomeClass = 'neutral';
  if (blueTeamWon && !redTeamWon) {
    outcomeText = 'BLUE TEAM VICTORY';
    outcomeClass = 'victory';
  } else if (redTeamWon && !blueTeamWon) {
    outcomeText = 'RED TEAM VICTORY';
    outcomeClass = 'defeat';
  }

  // Use clashSummary existence check or explicit queueType override where applicable
  let gameModeLabel = payload.gameMode || payload.queueType || 'LoL Match';
  const qt = (payload.queueType || '').toUpperCase();
  const gt = (payload.gameType || '').toUpperCase();

  if (isMayhem) {
    gameModeLabel = 'ARAM Mayhem';
  } else if (qt === 'CLASH' || payload.clashSummary) {
    gameModeLabel = 'Clash';
  } else if (qt.includes('RANKED')) {
    if (qt.includes('SOLO')) gameModeLabel = 'Ranked Solo';
    else if (qt.includes('FLEX')) gameModeLabel = 'Ranked Flex';
    else gameModeLabel = 'Ranked Match';
  } else if (qt === 'ARAM' || qt.includes('ARAM')) {
    gameModeLabel = 'ARAM';
  } else if (qt === 'CHERRY' || qt === 'ARENA') {
    gameModeLabel = 'Arena';
  } else if (qt.includes('NORMAL')) {
    gameModeLabel = 'Normal';
  } else if (qt.includes('BOT')) {
    gameModeLabel = 'Co-op vs AI';
  }

  if (gt === 'CUSTOM_GAME') {
    gameModeLabel = `${gameModeLabel} (Custom game)`;
  }

  return {
    gameMode: gameModeLabel,
    duration: `${Math.floor(payload.gameLength / 60)}m ${payload.gameLength % 60}s`,
    uploaderResult: outcomeText,
    resultClass: outcomeClass,
    isMayhem,
    augmentsVersion: payload.augmentsVersion || null,
    forfeit: forfeit.isForfeit,
    forfeitReason: forfeit.reasonLabel,
    forfeitTeam: forfeit.teamLabel,
    forfeitNames: forfeit.forfeitingNames.length ? forfeit.forfeitingNames.join(', ') : 'Unknown players',
    team100: t100.players.map(mapPlayer),
    t100Stats: getTotals(t100),
    t100Win: t100.isWinningTeam,
    team200: t200.players.map(mapPlayer),
    t200Stats: getTotals(t200),
    t200Win: t200.isWinningTeam,
    badgeWinners,
    hasRankedLp: effectiveRankedEntries.length > 0,
    rankedEntries: effectiveRankedEntries,
    rankedQueueLabel: primaryRanked.rankedQueueLabel,
    rankedCurrent: primaryRanked.rankedCurrent,
    rankedDelta: primaryRanked.rankedDelta,
    rankedDeltaClass: primaryRanked.rankedDeltaClass,
  };
}

async function generateInfographicImage(payload, uploaderInfos, rankedLpEntries = []) {
  try {
    const templateFile = isAramMayhem(payload) ? 'match-template-mayhem.html' : 'match-template.html';
    const templatePath = path.join(__dirname, templateFile);
    const template = fs.readFileSync(templatePath, 'utf8');
    
    // Await the data preparation (since it fetches version)
    const data = await prepareScoreboardData(payload, uploaderInfos, rankedLpEntries);

    logger.info('[Infographic] Generating infographic image', { templateFile });
    const imageBuffer = await nodeHtmlToImage({
      html: template,
      content: data,
      puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    logger.info('[Infographic] Infographic generation completed');
    return { imageBuffer, errorMessage: null };
  } catch (err) {
    logger.error('[Infographic] Generation failed', err);
    return { imageBuffer: null, errorMessage: err?.message || 'unknown error' };
  }
}


/* =====================================================
   Clash Adaptation
===================================================== */

function parseClashSummary(summary) {
  // Use teams directly from summary, mapping players to include stats for compatibility
  const teams = (summary.teams || []).map(t => {
    const players = (t.players || []).map(p => ({
      ...p,
      summonerName: p.riotIdGameName,
      stats: {
        CHAMPIONS_KILLED: p.kills,
        NUM_DEATHS: p.deaths,
        ASSISTS: p.assists,
        TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: p.damageDealt,
        GOLD_EARNED: p.gold,
        MINIONS_KILLED: p.cs,
        VISION_SCORE: p.visionScore,
        // Add defaults for missing fields to avoid crashes
        TOTAL_DAMAGE_TAKEN: 0,
        TOTAL_DAMAGE_SELF_MITIGATED: 0,
        TOTAL_HEAL_ON_TEAMMATES: 0,
        TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES: 0,
        LARGEST_KILLING_SPREE: 0,
        TOTAL_DAMAGE_DEALT_TO_TURRETS: 0,
        TIME_CCING_OTHERS: 0,
        TOTAL_TIME_SPENT_DEAD: 0
      }
    }));
    return { ...t, players };
  });
  
  return {
    gameId: summary.matchId,
    teams, // These teams contain players with mapped stats
    forfeit: summary.forfeit,
    forfeitReason: summary.forfeitReason,
    forfeitTeamId: summary.forfeitTeamId,
    forfeitTeamIsPlayer: summary.forfeitTeamIsPlayer,
    forfeitPlayers: summary.forfeitPlayers
  };
}

function normalizeMatchPayload(payload) {
  if (payload.clashSummary) {
    const derived = parseClashSummary(payload.clashSummary);
    
    // Check if the original payload has detailed team data (items, runes)
    // Detailed payloads usually have items array on players
    const hasDetailedStats = Array.isArray(payload.teams) && 
      payload.teams.some(t => t.players && t.players.some(p => p.items && p.items.length > 0));

    // If detailed stats exist, we prefer them for the 'teams' property
    // But we still want derived metadata (gameId mapping, forfeit info)
    if (hasDetailedStats) {
      return {
        ...payload,
        // Override simplified derived teams with detailed payload teams
        teams: payload.teams,
        // Apply derived metadata
        gameId: derived.gameId,
        forfeit: derived.forfeit,
        forfeitReason: derived.forfeitReason,
        forfeitTeamId: derived.forfeitTeamId,
        forfeitTeamIsPlayer: derived.forfeitTeamIsPlayer,
        forfeitPlayers: derived.forfeitPlayers
      };
    }

    // Fallback to derived data entirely if detailed stats are missing
    return {
      ...payload,
      ...derived
    };
  } else if (payload.rankedSummary) {
    // If rankedSummary exists, ensure we have top-level queue info
    return {
      ...payload,
      queueType: payload.queueType || payload.rankedSummary.queueType,
      gameMode: payload.gameMode || payload.rankedSummary.gameMode
    };
  }
  return payload;
}

/* =====================================================
   Match ingest server
===================================================== */

async function enqueueMatchPayload(rawPayload, client) {
  const payload = normalizeMatchPayload(rawPayload);
  const gameId = payload.gameId || payload.reportGameId;

  logger.info('[LoL Match Ingest] Enqueue match payload', { gameId });

  // If no gameId, send immediately.
  if (!gameId) {
    logger.info('[LoL Match Ingest] No gameId present, handling immediately');
    return handleMatchPayload(payload, client, [getUploaderInfo(payload)], null, buildRankedLpEntries([payload]));
  }

  if (!MATCH_WEBHOOK_CHANNEL) {
    logger.error('[LoL Match Ingest] MATCH_WEBHOOK_CHANNEL not configured; dropping payload');
    return Promise.resolve();
  }

  const key = String(gameId);
  let existing = pendingMatches.get(key);
  // Lock the match entry immediately to avoid concurrent placeholders
  if (!existing) {
    existing = { timer: null, payloads: [], placeholderMessage: null, placeholderPromise: null };
    pendingMatches.set(key, existing);
  }

  if (existing.timer) {
    clearTimeout(existing.timer);
  }

  existing.payloads.push(payload);

  // If this is the first payload in the window, post a placeholder message
  if (!existing.placeholderMessage && !existing.placeholderPromise) {
    existing.placeholderPromise = (async () => {
      try {
        const channel = await client.channels.fetch(MATCH_WEBHOOK_CHANNEL);
        if (channel) {
          const msg = await channel.send(`Receiving data from Match ${gameId}...`);
          existing.placeholderMessage = msg;
          logger.info('[LoL Match Ingest] Posted placeholder message', { gameId, messageId: msg.id });
          return msg;
        }
        logger.warn('[LoL Match Ingest] Could not fetch channel for placeholder', { MATCH_WEBHOOK_CHANNEL });
        return null;
      } catch (err) {
        existing.placeholderMessage = null;
        logger.warn('[LoL Match Ingest] Failed to post placeholder message', { gameId, err: err?.message });
        return null;
      } finally {
        // Release the promise so future matches can retry if needed
        existing.placeholderPromise = existing.placeholderMessage ? Promise.resolve(existing.placeholderMessage) : null;
      }
    })();
  }
  existing.timer = setTimeout(async () => {
    try {
      const bundle = pendingMatches.get(key) || existing;
      pendingMatches.delete(key);

      const latest = (bundle.payloads && bundle.payloads[bundle.payloads.length - 1]) || payload;
      const uploaderInfos = (bundle.payloads || []).map(getUploaderInfo).filter(Boolean);
      const rankedLpEntries = buildRankedLpEntries(bundle.payloads || []);
      const placeholderMessage = bundle.placeholderMessage || (bundle.placeholderPromise ? await bundle.placeholderPromise.catch(() => null) : null);

      logger.info('[LoL Match Ingest] Debounced payload bundle ready', {
        gameId,
        bundleCount: bundle.payloads?.length || 1,
        rankedLpEntries: rankedLpEntries.length,
      });

      await handleMatchPayload(latest, client, uploaderInfos, placeholderMessage, rankedLpEntries);
    } catch (err) {
      logger.error('[LoL Match Ingest] Debounce handler error', { gameId, err: err?.message });
    }
  }, MATCH_DEBOUNCE_MS);

  logger.info('[LoL Match Ingest] Payload enqueued with debounce', {
    gameId,
    debounceMs: MATCH_DEBOUNCE_MS,
    queueSize: existing.payloads.length,
  });

  return Promise.resolve();
}

async function handleMatchPayload(payload, client, uploaderInfos = [], placeholderMessage = null, rankedLpEntries = []) {
  const gameId = payload.gameId || payload.reportGameId || 'unknown';
  logger.info('[LoL Match Ingest] Payload received, generating infographic...', { gameId });

  const forfeit = getForfeitDetails(payload);
  const rankedInfo = extractRankedLpInfo(payload);
  const effectiveRankedEntries = Array.isArray(rankedLpEntries) && rankedLpEntries.length > 0
    ? rankedLpEntries
    : (rankedInfo.hasRankedLp
      ? [{
          playerName: uploaderInfos?.[0]?.name || 'Player',
          rankedQueueLabel: rankedInfo.rankedQueueLabel,
          rankedTier: rankedInfo.rankedTier,
          rankedDivision: rankedInfo.rankedDivision,
          rankedLeaguePoints: rankedInfo.rankedLeaguePoints,
          rankedCurrent: rankedInfo.rankedCurrent,
          rankedDelta: rankedInfo.rankedDelta,
          rankedDeltaClass: rankedInfo.rankedDeltaClass,
        }]
      : []);
  const primaryUploaderInfo = uploaderInfos?.[0] || getUploaderInfo(payload);
  const uploaderDiscordIds = collectUploaderDiscordIds(payload);
  if (uploaderDiscordIds.length === 0 && primaryUploaderInfo?.name) {
    const linkedPlayer = await loadLeaguePlayerByLeagueName(primaryUploaderInfo.name);
    if (linkedPlayer?.user_id) {
      const snowflake = toDiscordSnowflake(linkedPlayer.user_id);
      if (snowflake) {
        uploaderDiscordIds.push(snowflake);
        logger.info('[LoL Match Ingest] Resolved uploader Discord ID from linked account', { leagueName: primaryUploaderInfo.name, userId: snowflake });
      }
    }
  }
  const matchTagLine = buildMatchTagLine({
    payload,
    gameId,
    uploaderInfo: primaryUploaderInfo,
    uploaderDiscordId: uploaderDiscordIds[0] || null,
    keywords: [],
  });
  const forfeitText = forfeit.isForfeit
    ? `${forfeit.reasonLabel} by ${forfeit.teamLabel}${forfeit.forfeitingNames.length ? `: ${forfeit.forfeitingNames.join(', ')}` : ''}`
    : '';

  if (forfeit.isForfeit) {
    logger.info('[LoL Match Ingest] Forfeit detected', {
      gameId,
      reason: forfeit.reasonLabel,
      teamId: forfeit.teamId,
      teamIsPlayer: forfeit.teamIsPlayer,
      forfeitingCount: forfeit.forfeitingNames.length,
    });
  }

  if (effectiveRankedEntries.length > 0) {
    logger.info('[LoL Match Ingest] Ranked LP payload detected', {
      gameId,
      rankedEntries: effectiveRankedEntries,
    });
  }

  if (!MATCH_WEBHOOK_CHANNEL) {
    logger.error('[LoL Match Ingest] MATCH_WEBHOOK_CHANNEL not configured');
    return;
  }

  try {
    const channel = await client.channels.fetch(MATCH_WEBHOOK_CHANNEL);
    if (!channel) {
      logger.error('[LoL Match Ingest] Failed to fetch webhook channel', { MATCH_WEBHOOK_CHANNEL });
      return;
    }

    const matchedPlayersPromise = resolveMatchPlayers(payload);

    // Generate image in memory
    const { imageBuffer, errorMessage: imageError } = await generateInfographicImage(payload, uploaderInfos, effectiveRankedEntries);
    let scoreboardMessage = placeholderMessage;

    if (imageBuffer) {
      const attachment = new AttachmentBuilder(imageBuffer, { name: `match-${gameId}.png` });
      if (scoreboardMessage) {
        await scoreboardMessage.edit({ content: matchTagLine, files: [attachment] });
        logger.info('[LoL Match Ingest] Infographic edited into placeholder.', { gameId });
      } else {
        scoreboardMessage = await channel.send({ content: matchTagLine, files: [attachment] });
        logger.info('[LoL Match Ingest] Infographic sent (no placeholder).');
      }
      logger.info('[LoL Match Ingest] Added searchable match tags to post', { gameId });
    } else {
      const reason = imageError ? `: ${imageError}` : '';
      const fallbackContent = `Match ${gameId} completed (Image generation failed${reason}).`;
      const taggedFallbackContent = `${fallbackContent}\n${matchTagLine}`;
      if (scoreboardMessage) {
        await scoreboardMessage.edit({ content: taggedFallbackContent, files: [] });
        logger.info('[LoL Match Ingest] Fallback text edited into placeholder', { gameId });
      } else {
        scoreboardMessage = await channel.send(taggedFallbackContent);
        logger.info('[LoL Match Ingest] Fallback text sent for match', { gameId });
      }
    }

    const matchedPlayers = await matchedPlayersPromise;
    logger.info('[LoL Match Ingest] Matched players fetched', { matchedPlayers: matchedPlayers.length });

    // Handle Augment Identification (Mayhem)
    if (isAramMayhem(payload)) {
      const matchAugmentsData = { players: [] };
      const teams = Array.isArray(payload.teams) ? payload.teams : [];
      const payloadPlayers = teams.flatMap(t => t.players || []);

      for (const dbPlayer of matchedPlayers) {
        let p = null;
        if (dbPlayer.puuid && dbPlayer.puuid !== 'none') {
          p = payloadPlayers.find(pp => pp.puuid === dbPlayer.puuid);
        }
        if (!p && dbPlayer.league_name) {
          const lowerDB = dbPlayer.league_name.trim().toLowerCase();
          p = payloadPlayers.find(pp => {
            const name = (pp.riotIdGameName || '').trim().toLowerCase();
            const tag = (pp.riotIdTagLine || '').trim().toLowerCase();
            const full = name && tag ? `${name}#${tag}` : name;
            return full === lowerDB;
          });
        }

        if (p) {
          let ids = [];
          if (Array.isArray(p.augments)) {
            ids = p.augments;
          } else {
            const stats = p.stats || {};
            // Try to grab from stats if not in top-level array
            ids = [1, 2, 3, 4, 5, 6]
              .map((i) => stats[`PLAYER_AUGMENT_${i}`])
              .filter((v) => v !== undefined && v !== null && v !== 0);
          }
          
          // Filter valid IDs
          const validIds = ids.filter(id => (typeof id === 'number' && id > 0) || (typeof id === 'string' && id.length > 0));

          if (validIds.length > 0) {
            matchAugmentsData.players.push({
              user_id: dbPlayer.user_id,
              augments: validIds
            });
          }
        }
      }

      if (matchAugmentsData.players.length > 0) {
        recentMatchAugments.set(String(gameId), matchAugmentsData);
        // Expire after 2 hours
        setTimeout(() => recentMatchAugments.delete(String(gameId)), 2 * 60 * 60 * 1000);
      }
    }

    // Cache full payload for "Show More Stats" button (30-min TTL)
    recentMatchData.set(String(gameId), {
      payload,
      uploaderInfos,
      matchedPlayers,
      v5Data: null,
      messageId: scoreboardMessage?.id || null,
      channelId: scoreboardMessage?.channelId || MATCH_WEBHOOK_CHANNEL,
      manualKeywords: [],
      uploaderDiscordIds,
    });
    setTimeout(() => recentMatchData.delete(String(gameId)), 30 * 60 * 1000);
    logger.info('[LoL Match Ingest] Cached match data for Show More Stats', { gameId });

    // Build combined button row: always "Show More Stats", plus "Identify Augments" for Mayhem
    if (scoreboardMessage) {
      try {
        const augmentsData = recentMatchAugments.get(String(gameId));
        const row = new ActionRowBuilder();

        if (augmentsData) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`LEAGUE_ID_AUGMENTS_${gameId}`)
              .setLabel('Identify Augments')
              .setStyle(ButtonStyle.Primary)
          );
        }

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`LEAGUE_MORE_STATS_${gameId}`)
            .setLabel('Show More Stats')
            .setStyle(ButtonStyle.Secondary)
        );

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`${LEAGUE_EDIT_KEYWORDS_PREFIX}${gameId}`)
            .setLabel('Edit Keywords')
            .setStyle(ButtonStyle.Secondary)
        );

        await scoreboardMessage.edit({ components: [row] });
        logger.info('[LoL Match Ingest] Added match buttons', { gameId, augments: !!augmentsData });
      } catch (err) {
        logger.error('[LoL Match Ingest] Failed to add match buttons', err);
      }
    }

    // TODO: Re-enable mention threads once we have a better UX; currently floods the sidebar.
    // await createMentionThread(scoreboardMessage, matchedPlayers, gameId, payload);

  } catch (err) {
    logger.error('[LoL Match Ingest] Handler error', err);
  }
}

function startMatchWebhook(event_registry) {
  if (matchServerStarted) return;
  matchServerStarted = true;

  const client = event_registry.client;

  const server = http.createServer((req, res) => {
    logger.info('[LoL Match Ingest] Incoming webhook request', {
      url: req.url,
      method: req.method,
    });

    if (!req.url || !req.url.startsWith(MATCH_WEBHOOK_PATH) || req.method !== 'POST') {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (MATCH_WEBHOOK_SECRET) {
      const provided = req.headers['x-match-secret'] || req.headers['x-webhook-secret'];
      if (provided !== MATCH_WEBHOOK_SECRET) {
        res.statusCode = 401;
        res.end('unauthorized');
        return;
      }
    }

    let raw = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        logger.warn('[LoL Match Ingest] Payload exceeded 5MB, dropping');
        tooLarge = true;
        res.statusCode = 429;
        res.setHeader('Retry-After', '5');
        res.end('payload too large');
        req.destroy();
      }
    });

    req.on('end', () => {
      if (tooLarge) return;
      let payload;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (err) {
        res.statusCode = 400;
        res.end('invalid json');
        return;
      }

      enqueueMatchPayload(payload, client)
        .then(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          logger.info('[LoL Match Ingest] Payload accepted');
        })
        .catch((err) => {
          logger.error('[LoL Match Ingest] Handler error', err);
          res.statusCode = 503;
          res.setHeader('Retry-After', '5');
          res.end('error');
        });
    });

    req.on('error', (err) => {
      logger.error('[LoL Match Ingest] Request error', err);
    });
  });

  server.on('error', (err) => {
    logger.error('[LoL Match Ingest] Server error', err);
  });

  server.listen(MATCH_WEBHOOK_PORT, MATCH_WEBHOOK_HOST, () => {
    logger.info(
      `[LoL Match Ingest] Listening on http://${MATCH_WEBHOOK_HOST}:${MATCH_WEBHOOK_PORT}${MATCH_WEBHOOK_PATH}`
    );
  });
}

/* =====================================================
   Identity Resolution (wins.js-compatible)
===================================================== */

async function resolvePUUID(userId, input) {
  logger.info('[LoL Link] Resolving PUUID for user', { userId, input });
  // 1. Try DB first (wins.js behavior)
  const db = await api.get('league_player', { user_id: userId });
  const existing = db?.league_players?.[0];

  if (existing?.puuid && existing.puuid !== 'none') {
    logger.info('[LoL Link] Using PUUID from DB', { puuid: existing.puuid });
    return { puuid: existing.puuid, existing };
  }

  // 2. Riot ID path
  if (input.includes('#')) {
    const parsed = parseRiotId(input);
    if (!parsed) throw new Error('Invalid Riot ID format');

    logger.info('[LoL Link] Resolving PUUID via Account-V1', parsed);

    const res = await riotGet(
      `${RIOT_ACCOUNT_BY_RIOT_ID}${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
    );

    if (!res.data?.puuid) {
      throw new Error('Account-V1 returned no PUUID');
    }

    return { puuid: res.data.puuid, existing };
  }

  // 3. Legacy summoner-name path
  logger.info('[LoL Link] Resolving PUUID via Summoner-V4 by-name', { input });

  const res = await riotGet(
    `${RIOT_SUMMONER_BY_NAME_NA}${encodeURIComponent(input)}`
  );

  if (!res.data?.puuid) {
    throw new Error('Summoner-V4 returned no PUUID');
  }

  return { puuid: res.data.puuid, existing };
}

/* =====================================================
   Rank Fetch (explicit success vs failure)
===================================================== */

async function fetchRanksNA(puuid, summonerName) {
  try {
    logger.info('[LoL Link] Resolving summonerId by PUUID');

    const summonerRes = await riotGet(
      `${RIOT_SUMMONER_BY_PUUID_NA}${puuid}`
    );

    let summonerId = summonerRes.data?.id;

    // 🔑 IMPORTANT FIX:
    // Riot sometimes returns a PUUID shell without `id`
    if (!summonerId && summonerName) {
      logger.warn(
        '[LoL Link] Summoner-V4 by-puuid returned no id; retrying by-name',
        summonerRes.data
      );

      const byNameRes = await riotGet(
        `${RIOT_SUMMONER_BY_NAME_NA}${encodeURIComponent(summonerName)}`
      );

      summonerId = byNameRes.data?.id;
    }

    if (!summonerId) {
      logger.warn('[LoL Link] Unable to resolve summonerId by any method');
      return { success: false };
    }

    logger.info('[LoL Link] Fetching ranked entries', { summonerId });

    const leagueRes = await riotGet(
      `${RIOT_LEAGUE_BY_SUMMONER_NA}${summonerId}`
    );

    // SUCCESS: empty array = unranked
    const ranks = extractRanks(leagueRes.data);
    return { success: true, ...ranks };

  } catch (err) {
    logger.warn('[LoL Link] Rank fetch failed', {
      status: err?.response?.status,
      data: err?.response?.data,
    });
    return { success: false };
  }
}


/* =====================================================
   Per-Player Stats Data + Image Generation
===================================================== */

async function preparePlayerStatsData(player, payload, allPlayers) {
  const stats = player.stats || {};
  const isMayhem = isAramMayhem(payload);
  const ver = await getLatestDDVersion();
  const CDN = `https://ddragon.leagueoflegends.com/cdn/${ver}/img`;
  const ITEM_CDN = `${CDN}/item`;
  const SPELL_CDN = `${CDN}/spell`;

  const spellMap = {
    1:'SummonerBoost', 3:'SummonerExhaust', 4:'SummonerFlash',
    6:'SummonerHaste', 7:'SummonerHeal', 11:'SummonerSmite',
    12:'SummonerTeleport', 13:'SummonerMana', 14:'SummonerDot',
    21:'SummonerBarrier', 32:'SummonerSnowball'
  };

  const k = stats.CHAMPIONS_KILLED || 0;
  const d = stats.NUM_DEATHS || 0;
  const a = stats.ASSISTS || 0;
  const kdaRatio = d === 0 ? '\u221e' : ((k + a) / d).toFixed(2) + ':1';

  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const myTeam = teams.find(t => t.teamId === player.teamId) || {};
  const isWinner = Boolean(myTeam.isWinningTeam);
  const teamLabel = player.teamId === 100 ? 'Blue' : 'Red';
  const teamBarClass = player.teamId === 100 ? 'bar-blue' : 'bar-red';

  // Items
  const itemIds = [0,1,2,3,4,5,6].map(i =>
    (player.items && player.items[i] != null) ? player.items[i] : (stats[`ITEM${i}`] || 0)
  );
  const displayItems = [
    ...itemIds.slice(0, 6).map(id => ({ url: id ? `${ITEM_CDN}/${id}.png` : null, isPlaceholder: !id })),
    { url: itemIds[6] ? `${ITEM_CDN}/${itemIds[6]}.png` : null, isPlaceholder: !itemIds[6], isTrinket: true }
  ];

  const augments = isMayhem ? extractPlayerAugments(player) : [];

  const s1Name = spellMap[player.spell1Id] || 'SummonerFlash';
  const s2Name = spellMap[player.spell2Id] || 'SummonerFlash';
  const champKey = fixChampName(player.championName || '');
  const championIcon = `${CDN}/champion/${champKey}.png`;

  // Bar percentages relative to game max
  const maxDmg  = Math.max(...allPlayers.map(p => (p.stats || {}).TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0), 1);
  const maxTaken = Math.max(...allPlayers.map(p => (p.stats || {}).TOTAL_DAMAGE_TAKEN || 0), 1);
  const myDmg   = stats.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0;
  const myTaken = stats.TOTAL_DAMAGE_TAKEN || 0;

  const fmtN = (n) => (n || 0).toLocaleString();

  const timeDead = stats.TOTAL_TIME_SPENT_DEAD || 0;
  const timeDeadFmt = timeDead >= 60
    ? `${Math.floor(timeDead / 60)}m ${timeDead % 60}s`
    : `${timeDead}s`;
  const gameLength = payload.gameLength || 1;
  const isHighDeathTime = timeDead > gameLength * 0.25;

  const multiKillLabels = ['\u2014', '\u2014', 'Double Kill', 'Triple Kill', 'Quadra Kill', 'Penta Kill'];
  const lmk = stats.LARGEST_MULTI_KILL || 0;
  const largestMultiKillLabel = (lmk >= 2 && lmk <= 5) ? multiKillLabels[lmk] : (lmk > 5 ? `${lmk}x Kill` : '\u2014');

  const wins = player.wins || 0;
  const losses = player.losses || 0;
  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) + '%' : 'N/A';

  const qt = (payload.queueType || '').toUpperCase();
  const gt = (payload.gameType || '').toUpperCase();
  let gameModeLabel = payload.gameMode || payload.queueType || 'LoL Match';
  if (isMayhem) gameModeLabel = 'ARAM Mayhem';
  else if (qt === 'CLASH' || payload.clashSummary) gameModeLabel = 'Clash';
  else if (qt.includes('RANKED_SOLO')) gameModeLabel = 'Ranked Solo';
  else if (qt.includes('RANKED_FLEX')) gameModeLabel = 'Ranked Flex';
  else if (qt === 'ARAM' || qt.includes('ARAM')) gameModeLabel = 'ARAM';
  else if (qt === 'CHERRY' || qt === 'ARENA') gameModeLabel = 'Arena';
  else if (qt.includes('NORMAL')) gameModeLabel = 'Normal';

  if (gt === 'CUSTOM_GAME') gameModeLabel = `${gameModeLabel} (Custom game)`;

  const healAlliesRaw = stats.TOTAL_HEAL_ON_TEAMMATES || 0;
  const shieldsRaw    = stats.TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES || 0;

  // Height: base 572px, add 46px augments row for Mayhem
  const bodyHeight = isMayhem ? '618px' : '572px';

  return {
    playerName: formatName(player),
    championName: player.championName || 'Unknown',
    championIcon,
    level: stats.LEVEL || 18,
    accountLevel: player.level || '?',
    teamLabel,
    teamBarClass,
    resultText: isWinner ? 'VICTORY' : 'DEFEAT',
    resultClass: isWinner ? 'victory' : 'defeat',
    gameMode: gameModeLabel,
    duration: `${Math.floor(gameLength / 60)}m ${gameLength % 60}s`,
    isMayhem,
    bodyHeight,
    displayItems,
    augments,
    kills: k, deaths: d, assists: a,
    kdaRatio,
    largestSpree: stats.LARGEST_KILLING_SPREE || 0,
    largestMultiKillLabel,
    largestCrit: fmtN(stats.LARGEST_CRITICAL_STRIKE || 0),
    totalDamageToChamps: fmtN(myDmg),
    physicalDamage: fmtN(stats.PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS || 0),
    magicDamage: fmtN(stats.MAGIC_DAMAGE_DEALT_TO_CHAMPIONS || 0),
    trueDamage: fmtN(stats.TRUE_DAMAGE_DEALT_TO_CHAMPIONS || 0),
    totalDamageAll: fmtN(stats.TOTAL_DAMAGE_DEALT || 0),
    turretDamage: fmtN(stats.TOTAL_DAMAGE_DEALT_TO_TURRETS || 0),
    objectiveDamage: fmtN(stats.TOTAL_DAMAGE_DEALT_TO_OBJECTIVES || 0),
    dmgPercent: Math.round((myDmg / maxDmg) * 100),
    totalTaken: fmtN(myTaken),
    physicalTaken: fmtN(stats.PHYSICAL_DAMAGE_TAKEN || 0),
    magicTaken: fmtN(stats.MAGIC_DAMAGE_TAKEN || 0),
    trueTaken: fmtN(stats.TRUE_DAMAGE_TAKEN || 0),
    mitigated: fmtN(stats.TOTAL_DAMAGE_SELF_MITIGATED || 0),
    takenPercent: Math.round((myTaken / maxTaken) * 100),
    timeDead, timeDeadFmt, isHighDeathTime,
    wasAfk: Boolean(stats.WAS_AFK),
    ccTime: stats.TIME_CCING_OTHERS || 0,
    ccDealt: stats.TOTAL_TIME_CROWD_CONTROL_DEALT || 0,
    heals: fmtN(stats.TOTAL_HEAL || 0),
    healAllies: fmtN(healAlliesRaw),
    shields: fmtN(shieldsRaw),
    hasHealAllies: healAlliesRaw > 0,
    hasShields: shieldsRaw > 0,
    combinedSupport: fmtN(healAlliesRaw + shieldsRaw),
    turretKills: stats.TURRETS_KILLED || 0,
    inhibKills: stats.BARRACKS_KILLED || 0,
    spell1Icon: `${SPELL_CDN}/${s1Name}.png`,
    spell2Icon: `${SPELL_CDN}/${s2Name}.png`,
    spell1Name: s1Name.replace('Summoner', ''),
    spell2Name: s2Name.replace('Summoner', ''),
    spell1Casts: stats.SPELL1_CAST || 0,
    spell2Casts: stats.SPELL2_CAST || 0,
    leaves: player.leaves || 0,
    hadLeaverPenalty: (player.leaves || 0) > 0,
    gold: fmtN(stats.GOLD_EARNED || 0),
    cs: stats.MINIONS_KILLED || 0,
    neutralCs: stats.NEUTRAL_MINIONS_KILLED || 0,
    visionScore: stats.VISION_SCORE || 0,
    wardsPlaced: stats.SIGHT_WARDS_BOUGHT_IN_GAME || 0,
    visionWards: stats.VISION_WARDS_BOUGHT_IN_GAME || 0,
    wins, losses, winRate,
  };
}

async function generatePlayerStatsImage(player, payload, allPlayers) {
  try {
    const templatePath = path.join(__dirname, 'match-template-player-stats.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    const data = await preparePlayerStatsData(player, payload, allPlayers);
    logger.info('[PlayerStats] Generating player stats image', { player: formatName(player) });
    const imageBuffer = await nodeHtmlToImage({
      html: template,
      content: data,
      puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });
    logger.info('[PlayerStats] Player stats image generated');
    return { imageBuffer, errorMessage: null };
  } catch (err) {
    logger.error('[PlayerStats] Image generation failed', err);
    return { imageBuffer: null, errorMessage: err?.message || 'unknown error' };
  }
}

/* =====================================================
   SR (Summoner's Rift) Per-Player Stats
===================================================== */

async function fetchMatchV5Data(gameId) {
  try {
    const matchId = `NA1_${gameId}`;
    logger.info('[PlayerStats] Fetching Match V5 data', { gameId, matchId });
    const res = await riotGet(`https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`);
    logger.info('[PlayerStats] Match V5 data fetched', { gameId });
    return res.data;
  } catch (err) {
    logger.error('[PlayerStats] Failed to fetch Match V5 data', { gameId, err: err?.message });
    return null;
  }
}

async function preparePlayerStatsDataSR(participant, v5Match, allParticipants) {
  const p    = participant;
  const info = v5Match.info || {};
  const ver  = await getLatestDDVersion();
  const CDN       = `https://ddragon.leagueoflegends.com/cdn/${ver}/img`;
  const ITEM_CDN  = `${CDN}/item`;
  const SPELL_CDN = `${CDN}/spell`;

  const spellMap = {
    1:'SummonerBoost', 3:'SummonerExhaust', 4:'SummonerFlash', 6:'SummonerHaste',
    7:'SummonerHeal', 11:'SummonerSmite', 12:'SummonerTeleport', 13:'SummonerMana',
    14:'SummonerDot', 21:'SummonerBarrier', 32:'SummonerSnowball'
  };
  const spellDisplayNames = {
    SummonerBoost:'Cleanse', SummonerExhaust:'Exhaust', SummonerFlash:'Flash',
    SummonerHaste:'Ghost', SummonerHeal:'Heal', SummonerSmite:'Smite',
    SummonerTeleport:'Teleport', SummonerMana:'Clarity', SummonerDot:'Ignite',
    SummonerBarrier:'Barrier', SummonerSnowball:'Mark'
  };

  const k = p.kills || 0;
  const d = p.deaths || 0;
  const a = p.assists || 0;
  const kdaRatio = d === 0 ? '∞' : ((k + a) / d).toFixed(2) + ':1';
  const isWinner     = Boolean(p.win);
  const teamBarClass = p.teamId === 100 ? 'bar-blue' : 'bar-red';
  const teamLabel    = p.teamId === 100 ? 'Blue' : 'Red';

  const posMap = { TOP:'Top', JUNGLE:'Jungle', MIDDLE:'Mid', BOTTOM:'Bot', UTILITY:'Support', '':'Fill' };
  const posKey        = p.teamPosition || p.individualPosition || '';
  const positionLabel = posMap[posKey] || posKey;

  const s1Key = spellMap[p.summoner1Id] || 'SummonerFlash';
  const s2Key = spellMap[p.summoner2Id] || 'SummonerFlash';

  const itemIds     = [0,1,2,3,4,5].map(i => p[`item${i}`] || 0);
  const trinketId   = p.item6 || 0;
  const displayItems = [
    ...itemIds.map(id => ({ url: id ? `${ITEM_CDN}/${id}.png` : null, isPlaceholder: !id })),
    { url: trinketId ? `${ITEM_CDN}/${trinketId}.png` : null, isPlaceholder: !trinketId, isTrinket: true }
  ];

  const maxDmg   = Math.max(...allParticipants.map(pp => pp.totalDamageDealtToChampions || 0), 1);
  const maxTaken = Math.max(...allParticipants.map(pp => pp.totalDamageTaken || 0), 1);
  const myDmg    = p.totalDamageDealtToChampions || 0;
  const myTaken  = p.totalDamageTaken || 0;

  const gameLength = info.gameDuration || 1;
  const timeDead   = p.totalTimeSpentDead || 0;
  const timeDeadFmt    = timeDead   >= 60 ? `${Math.floor(timeDead/60)}m ${timeDead%60}s`   : `${timeDead}s`;
  const isHighDeathTime = timeDead > gameLength * 0.25;
  const longestAlive    = p.longestTimeSpentLiving || 0;
  const longestAliveFmt = longestAlive >= 60 ? `${Math.floor(longestAlive/60)}m ${longestAlive%60}s` : `${longestAlive}s`;

  const queueMap = {
    420:'Ranked Solo/Duo', 440:'Ranked Flex', 400:'Normal Draft', 430:'Normal Blind',
    700:'Clash', 900:'URF', 1020:'One for All', 1700:'Arena', 450:'ARAM'
  };
  const gameModeLabel = queueMap[info.queueId] || info.gameMode || 'LoL Match';

  const fmtN = (n) => (n || 0).toLocaleString();

  const multiKillMax = Math.max(
    (p.doubleKills||0) > 0 ? 2 : 0,
    (p.tripleKills||0) > 0 ? 3 : 0,
    (p.quadraKills||0) > 0 ? 4 : 0,
    (p.pentaKills||0)  > 0 ? 5 : 0
  );
  const mkLabels = { 0:'—', 2:'Double', 3:'Triple', 4:'Quadra', 5:'Penta' };
  const largestMultiKillLabel = mkLabels[multiKillMax] || `${multiKillMax}x`;

  const healAlliesRaw = p.totalHealsOnTeammates || 0;
  const shieldsRaw    = p.totalDamageShieldedOnTeammates || 0;
  const totalPings =
    (p.allInPings||0)+(p.assistMePings||0)+(p.basicPings||0)+(p.commandPings||0)+
    (p.dangerPings||0)+(p.enemyMissingPings||0)+(p.getBackPings||0)+(p.holdPings||0)+
    (p.needVisionPings||0)+(p.onMyWayPings||0)+(p.pushPings||0)+(p.retreatPings||0)+
    (p.visionClearedPings||0);

  return {
    playerName:   p.riotIdGameName || 'Unknown',
    riotTag:      p.riotIdTagline  ? `#${p.riotIdTagline}` : '',
    championName: p.championName   || 'Unknown',
    championIcon: `${CDN}/champion/${fixChampName(p.championName || '')}.png`,
    level:        p.champLevel   || 18,
    accountLevel: p.summonerLevel || '?',
    teamLabel, teamBarClass, position: positionLabel,
    resultText:  isWinner ? 'VICTORY' : 'DEFEAT',
    resultClass: isWinner ? 'victory' : 'defeat',
    gameMode: gameModeLabel,
    duration: `${Math.floor(gameLength/60)}m ${gameLength%60}s`,
    displayItems,
    spell1Icon: `${SPELL_CDN}/${s1Key}.png`,
    spell2Icon: `${SPELL_CDN}/${s2Key}.png`,
    spell1Name:  spellDisplayNames[s1Key] || s1Key.replace('Summoner',''),
    spell2Name:  spellDisplayNames[s2Key] || s2Key.replace('Summoner',''),
    spell1Casts: p.summoner1Casts || 0,
    spell2Casts: p.summoner2Casts || 0,
    abilityCasts: [
      { key: 'Q', count: p.spell1Casts || 0 },
      { key: 'W', count: p.spell2Casts || 0 },
      { key: 'E', count: p.spell3Casts || 0 },
      { key: 'R', count: p.spell4Casts || 0 },
    ],
    // Combat
    kills: k, deaths: d, assists: a, kdaRatio,
    largestSpree: p.largestKillingSpree || 0,
    killingSprees: p.killingSprees || 0,
    largestMultiKillLabel,
    doubleKills: p.doubleKills || 0,
    tripleKills: p.tripleKills || 0,
    quadraKills: p.quadraKills || 0,
    pentaKills:  p.pentaKills  || 0,
    firstBloodKill:   Boolean(p.firstBloodKill),
    firstBloodAssist: Boolean(p.firstBloodAssist),
    firstTowerKill:   Boolean(p.firstTowerKill),
    firstTowerAssist: Boolean(p.firstTowerAssist),
    largestCrit: fmtN(p.largestCriticalStrike || 0),
    longestAliveFmt,
    // Damage dealt
    totalDamageToChamps: fmtN(myDmg),
    physicalDamage:  fmtN(p.physicalDamageDealtToChampions || 0),
    magicDamage:     fmtN(p.magicDamageDealtToChampions    || 0),
    trueDamage:      fmtN(p.trueDamageDealtToChampions     || 0),
    totalDamageAll:  fmtN(p.totalDamageDealt               || 0),
    turretDamage:    fmtN(p.damageDealtToTurrets           || 0),
    objectiveDamage: fmtN(p.damageDealtToObjectives        || 0),
    epicMonsterDmg:  fmtN(p.damageDealtToEpicMonsters      || 0),
    dmgPercent:      Math.round((myDmg   / maxDmg)   * 100),
    // Survivability
    totalTaken:    fmtN(myTaken),
    physicalTaken: fmtN(p.physicalDamageTaken || 0),
    magicTaken:    fmtN(p.magicDamageTaken    || 0),
    trueTaken:     fmtN(p.trueDamageTaken     || 0),
    mitigated:     fmtN(p.damageSelfMitigated || 0),
    takenPercent:  Math.round((myTaken / maxTaken) * 100),
    timeDead, timeDeadFmt, isHighDeathTime,
    // Support
    ccTime:  p.timeCCingOthers  || 0,
    ccDealt: p.totalTimeCCDealt || 0,
    heals:      fmtN(p.totalHeal || 0),
    healAllies: fmtN(healAlliesRaw),
    shields:    fmtN(shieldsRaw),
    hasHealAllies: healAlliesRaw > 0,
    hasShields:    shieldsRaw    > 0,
    combinedSupport: fmtN(healAlliesRaw + shieldsRaw),
    // Objectives
    turretKills:         p.turretKills         || 0,
    turretTakedowns:     p.turretTakedowns      || 0,
    inhibitorKills:      p.inhibitorKills       || 0,
    inhibitorTakedowns:  p.inhibitorTakedowns   || 0,
    dragonKills:         p.dragonKills          || 0,
    baronKills:          p.baronKills           || 0,
    objectivesStolen:    p.objectivesStolen     || 0,
    objectivesStolenAssists: p.objectivesStolenAssists || 0,
    // Vision
    visionScore:   p.visionScore              || 0,
    wardsPlaced:   p.wardsPlaced              || 0,
    wardsKilled:   p.wardsKilled              || 0,
    controlWards:  p.visionWardsBoughtInGame   || 0,
    detectorWards: p.detectorWardsPlaced       || 0,
    sightWards:    p.sightWardsBoughtInGame    || 0,
    // Resources
    gold:      fmtN(p.goldEarned || 0),
    goldSpent: fmtN(p.goldSpent  || 0),
    cs:        p.totalMinionsKilled          || 0,
    neutralCs: p.neutralMinionsKilled        || 0,
    allyJungleCs:  p.totalAllyJungleMinionsKilled  || 0,
    enemyJungleCs: p.totalEnemyJungleMinionsKilled || 0,
    itemsPurchased:      p.itemsPurchased    || 0,
    consumablesPurchased: p.consumablesPurchased || 0,
    // Pings
    allInPings:   p.allInPings       || 0,
    dangerPings:  p.dangerPings      || 0,
    missingPings: p.enemyMissingPings || 0,
    onMyWayPings: p.onMyWayPings     || 0,
    assistMePings: p.assistMePings   || 0,
    retreatPings:  p.retreatPings    || 0,
    totalPings,
  };
}

async function generatePlayerStatsImageSR(participant, v5Match, allParticipants) {
  try {
    const templatePath = path.join(__dirname, 'match-template-player-stats-sr.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    const data = await preparePlayerStatsDataSR(participant, v5Match, allParticipants);
    logger.info('[PlayerStats] Generating SR player stats image', { player: participant.riotIdGameName });
    const imageBuffer = await nodeHtmlToImage({
      html: template,
      content: data,
      puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });
    logger.info('[PlayerStats] SR player stats image generated');
    return { imageBuffer, errorMessage: null };
  } catch (err) {
    logger.error('[PlayerStats] SR image generation failed', err);
    return { imageBuffer: null, errorMessage: err?.message || 'unknown error' };
  }
}

/* =====================================================
   Show More Stats Handler
===================================================== */

/**
 * Builds the ordered all-players list from a payload (team100 first, then team200).
 */
function getAllPlayersOrdered(payload) {
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const t100 = teams.find(t => t.teamId === 100);
  const t200 = teams.find(t => t.teamId === 200);
  return [...(t100?.players || []), ...(t200?.players || [])];
}

/**
 * Builds ActionRows for player selector buttons, highlighting the active player.
 */
function buildPlayerSelectorRows(allPlayers, gameId, activeIdx) {
  const rows = [];
  for (let rowStart = 0; rowStart < allPlayers.length; rowStart += 5) {
    const slice = allPlayers.slice(rowStart, rowStart + 5);
    const row = new ActionRowBuilder();
    for (let i = 0; i < slice.length; i++) {
      const idx = rowStart + i;
      const p   = slice[i];
      const isTeam100 = p.teamId === 100;
      const isActive  = idx === activeIdx;
      const label = (p.championName || `Player ${idx + 1}`).slice(0, 20);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`LEAGUE_PLAYER_STATS_${gameId}_${idx}`)
          .setLabel(label)
          .setStyle(isActive ? ButtonStyle.Success : (isTeam100 ? ButtonStyle.Primary : ButtonStyle.Danger))
      );
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Called when a user clicks "Show More Stats" on a match post.
 * @param {import('discord.js').ButtonInteraction} interaction - already deferred (ephemeral)
 * @param {object} payload        - full normalised match payload
 * @param {Array}  uploaderInfos  - uploader info array
 * @param {Array}  matchedPlayers - DB players matched in this match
 * @param {object} cachedEntry    - live cache entry (for storing fetched V5 data)
 */
async function handleMoreStatsInteraction(interaction, payload, uploaderInfos, matchedPlayers = [], cachedEntry = null) {
  const gameId = String(payload.gameId || payload.reportGameId || 'unknown');
  const userId = String(interaction.user.id);

  // ─── SR: fetch Match V5 and use the SR template ───
  if (isSRGame(payload) && gameId !== 'unknown') {
    let v5Data = cachedEntry?.v5Data || null;
    if (!v5Data) {
      v5Data = await fetchMatchV5Data(gameId);
      if (cachedEntry && v5Data) cachedEntry.v5Data = v5Data;
    }

    if (v5Data) {
      const allParticipants = v5Data.info.participants;

      // Find default index – linked player first, then local player, then 0
      let defaultIdx = 0;
      const linked = matchedPlayers.find(mp => String(mp.user_id) === userId);
      if (linked) {
        const idx = allParticipants.findIndex(p => {
          if (linked.puuid && linked.puuid !== 'none') return p.puuid === linked.puuid;
          const lName = (linked.league_name || '').trim().toLowerCase();
          return lName && (
            `${(p.riotIdGameName||'').toLowerCase()}#${(p.riotIdTagline||'').toLowerCase()}` === lName
            || (p.riotIdGameName||'').toLowerCase() === lName
          );
        });
        if (idx !== -1) defaultIdx = idx;
      } else {
        const localPlayer = payload.localPlayer
          || (Array.isArray(payload.teams) ? payload.teams.flatMap(t => t.players || []).find(p => p.isLocalPlayer) : null);
        if (localPlayer?.puuid) {
          const idx = allParticipants.findIndex(p => p.puuid === localPlayer.puuid);
          if (idx !== -1) defaultIdx = idx;
        }
      }

      logger.info('[PlayerStats] Show More Stats (SR)', { gameId, defaultIdx, userId });
      const result = await generatePlayerStatsImageSR(allParticipants[defaultIdx], v5Data, allParticipants);
      if (!result.imageBuffer) {
        return interaction.editReply({ content: `Could not generate player stats: ${result.errorMessage || 'unknown error'}` });
      }
      const rows = buildPlayerSelectorRows(allParticipants, gameId, defaultIdx);
      const attachment = new AttachmentBuilder(result.imageBuffer, { name: `player-stats-${gameId}-${defaultIdx}.png` });
      return interaction.editReply({ files: [attachment], components: rows });
    }
    logger.info('[PlayerStats] V5 fetch failed, falling back to LCU data', { gameId });
  }

  // ─── ARAM / Mayhem / V5 fallback: use LCU data ───
  const allPlayers = getAllPlayersOrdered(payload);
  if (allPlayers.length === 0) {
    logger.info('[PlayerStats] No players found in payload', { gameId });
    return interaction.editReply({ content: 'No player data found in this match.' });
  }

  let defaultIdx = 0;
  const linked = matchedPlayers.find(mp => String(mp.user_id) === userId);
  if (linked) {
    const idx = allPlayers.findIndex(p => {
      if (linked.puuid && linked.puuid !== 'none' && p.puuid) return p.puuid === linked.puuid;
      const lName = (linked.league_name || '').trim().toLowerCase();
      const pName = (formatName(p) || '').trim().toLowerCase();
      return lName && lName === pName;
    });
    if (idx !== -1) defaultIdx = idx;
  }

  logger.info('[PlayerStats] Show More Stats (LCU/Mayhem)', { gameId, defaultIdx, userId });
  const result = await generatePlayerStatsImage(allPlayers[defaultIdx], payload, allPlayers);
  if (!result.imageBuffer) {
    return interaction.editReply({ content: `Could not generate player stats: ${result.errorMessage || 'unknown error'}` });
  }

  const rows = buildPlayerSelectorRows(allPlayers, gameId, defaultIdx);
  const attachment = new AttachmentBuilder(result.imageBuffer, { name: `player-stats-${gameId}-${defaultIdx}.png` });
  await interaction.editReply({ files: [attachment], components: rows });
}

/* =====================================================
   Interaction Handler
===================================================== */

async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  // Button
  if (interaction.isButton()) {
    if (interaction.customId === 'LEAGUE_LINK_BUTTON') {

      logger.info('[LoL Link] Link button pressed', { user: interaction.user.id });

      const modal = new ModalBuilder()
        .setCustomId('LEAGUE_LINK_MODAL')
        .setTitle('Link League Account (NA)');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('account_input')
            .setLabel('Riot ID (Name#TAG) or Summoner Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('main_role')
            .setLabel('Main Role')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('lfg_status')
            .setLabel('Looking for group? (yes / no)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId.startsWith('LEAGUE_MORE_STATS_')) {
      const gameId = interaction.customId.replace('LEAGUE_MORE_STATS_', '');
      const cached = recentMatchData.get(gameId);

      if (!cached) {
        return interaction.reply({ content: 'Match data has expired (30-minute window). Re-upload to refresh.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      await handleMoreStatsInteraction(interaction, cached.payload, cached.uploaderInfos, cached.matchedPlayers || [], cached);
      return;
    }

    if (interaction.customId.startsWith(LEAGUE_EDIT_KEYWORDS_PREFIX)) {
      const gameId = interaction.customId.replace(LEAGUE_EDIT_KEYWORDS_PREFIX, '');
      const cached = recentMatchData.get(gameId);
      const parsedTags = extractParsedMatchTags(interaction.message?.content || '');

      if (!cached && !parsedTags) {
        return interaction.reply({ content: 'Match data has expired (30-minute window). Re-upload to refresh.', ephemeral: true });
      }

      const uploaderInfos = Array.isArray(cached?.uploaderInfos) && cached.uploaderInfos.length > 0
        ? cached.uploaderInfos
        : (parsedTags?.uploader ? [{ name: parsedTags.uploader }] : []);

      if (uploaderInfos.length === 0 && cached?.payload) {
        uploaderInfos.push(getUploaderInfo(cached.payload));
      }

      const permission = await canEditMatchKeywords(
        interaction.user.id,
        cached?.payload || null,
        uploaderInfos,
        parsedTags?.uploader || null,
        parsedTags?.uploaderId || null
      );
      if (!permission.allowed) {
        logger.info('[LoL Match Tags] Keyword edit denied', { gameId, userId: interaction.user.id, reason: permission.reason });
        return interaction.reply({
          content: 'Only the uploader or a league admin can edit match keywords.',
          ephemeral: true,
        });
      }

      const currentKeywords = parsedTags?.keywords || cached?.manualKeywords || [];
      const modalToken = interaction.message?.id
        ? `${gameId}_${interaction.message.id}`
        : gameId;

      const modal = new ModalBuilder()
        .setCustomId(`${LEAGUE_KEYWORDS_MODAL_PREFIX}${modalToken}`)
        .setTitle('Edit Match Keywords');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(LEAGUE_KEYWORDS_FIELD_ID)
            .setLabel('Keywords (comma separated)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('comeback, baron_steal, finals_scrim')
            .setValue(currentKeywords.join(', '))
            .setRequired(false)
        )
      );

      logger.info('[LoL Match Tags] Opening keyword modal', { gameId, userId: interaction.user.id, reason: permission.reason });
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId.startsWith('LEAGUE_PLAYER_STATS_')) {
      // Format: LEAGUE_PLAYER_STATS_{gameId}_{playerIdx}
      const withoutPrefix = interaction.customId.replace('LEAGUE_PLAYER_STATS_', '');
      const lastUnderscore = withoutPrefix.lastIndexOf('_');
      const gameId    = withoutPrefix.slice(0, lastUnderscore);
      const playerIdx = parseInt(withoutPrefix.slice(lastUnderscore + 1), 10);

      const cached = recentMatchData.get(gameId);
      if (!cached) {
        return interaction.reply({ content: 'Match data expired. Re-upload to refresh.', ephemeral: true });
      }

      await interaction.deferUpdate();

      // ─── SR branch: use V5 participants ───
      if (isSRGame(cached.payload) && cached.v5Data) {
        const allParticipants = cached.v5Data.info.participants;
        if (isNaN(playerIdx) || playerIdx < 0 || playerIdx >= allParticipants.length) {
          return interaction.editReply({ content: 'Invalid player selection.' });
        }
        logger.info('[PlayerStats] SR Player button clicked', { gameId, playerIdx });
        const result = await generatePlayerStatsImageSR(allParticipants[playerIdx], cached.v5Data, allParticipants);
        if (!result.imageBuffer) {
          return interaction.editReply({ content: `Could not generate stats: ${result.errorMessage || 'unknown error'}` });
        }
        const rows = buildPlayerSelectorRows(allParticipants, gameId, playerIdx);
        const attachment = new AttachmentBuilder(result.imageBuffer, { name: `player-stats-${gameId}-${playerIdx}.png` });
        await interaction.editReply({ files: [attachment], components: rows });
        return;
      }

      // ─── LCU / Mayhem branch ───
      const allPlayers = getAllPlayersOrdered(cached.payload);
      if (isNaN(playerIdx) || playerIdx < 0 || playerIdx >= allPlayers.length) {
        return interaction.editReply({ content: 'Invalid player selection.' });
      }

      logger.info('[PlayerStats] Player button clicked', { gameId, playerIdx });

      const result = await generatePlayerStatsImage(allPlayers[playerIdx], cached.payload, allPlayers);
      if (!result.imageBuffer) {
        return interaction.editReply({ content: `Could not generate stats: ${result.errorMessage || 'unknown error'}` });
      }

      const rows = buildPlayerSelectorRows(allPlayers, gameId, playerIdx);
      const attachment = new AttachmentBuilder(result.imageBuffer, { name: `player-stats-${gameId}-${playerIdx}.png` });

      await interaction.editReply({ files: [attachment], components: rows });
      return;
    }

    if (interaction.customId.startsWith('LEAGUE_ID_AUGMENTS_')) {
      const gameId = interaction.customId.replace('LEAGUE_ID_AUGMENTS_', '');
      const gameData = recentMatchAugments.get(gameId);
      
      if (!gameData) {
        return interaction.reply({ content: 'Match data expired or not found.', ephemeral: true });
      }

      const playerInfo = gameData.players.find(p => p.user_id === interaction.user.id);
      if (!playerInfo) {
         return interaction.reply({ content: 'You were not detected in this match (or are not linked).', ephemeral: true });
      }

      const editableAugments = playerInfo.augments.filter(id => typeof id === 'number');

      if (editableAugments.length === 0) {
         return interaction.reply({ content: 'You have no augments that need identification!', ephemeral: true });
      }
      
      const modal = new ModalBuilder()
        .setCustomId(`LEAGUE_ID_MODAL_${gameId}`)
        .setTitle('Identify Augments');
      
      const maxFields = Math.min(editableAugments.length, 5);
      
      for (let i = 0; i < maxFields; i++) {
        const id = editableAugments[i];
        const knownName = AUGMENT_NAME_MAP[id] || '';
        
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`aug_${id}`)
              .setLabel(`Augment ${id} Name`)
              .setStyle(TextInputStyle.Short)
              .setPlaceholder(knownName || 'e.g. Poltergeist')
              .setValue(knownName) 
              .setRequired(true)
          )
        );
      }
      
      await interaction.showModal(modal);
      return;
    }
  }

  // Modal submit
if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith(LEAGUE_KEYWORDS_MODAL_PREFIX)) {
      const modalToken = interaction.customId.replace(LEAGUE_KEYWORDS_MODAL_PREFIX, '');
      const tokenSplitIdx = modalToken.lastIndexOf('_');
      const gameId = tokenSplitIdx === -1 ? modalToken : modalToken.slice(0, tokenSplitIdx);
      const modalMessageId = tokenSplitIdx === -1 ? null : modalToken.slice(tokenSplitIdx + 1);
      const cached = recentMatchData.get(gameId);

      const rawKeywords = interaction.fields.getTextInputValue(LEAGUE_KEYWORDS_FIELD_ID);
      const normalizedKeywords = normalizeManualKeywords(rawKeywords);

      let targetMessage = null;
      try {
        if (cached?.channelId && cached?.messageId) {
          const targetChannel = await interaction.client.channels.fetch(cached.channelId);
          if (targetChannel?.messages?.fetch) {
            targetMessage = await targetChannel.messages.fetch(cached.messageId);
          }
        }

        if (!targetMessage && modalMessageId && interaction.channel?.messages?.fetch) {
          targetMessage = await interaction.channel.messages.fetch(modalMessageId);
        }

        if (!targetMessage && modalMessageId && interaction.channelId) {
          const interactionChannel = await interaction.client.channels.fetch(interaction.channelId);
          if (interactionChannel?.messages?.fetch) {
            targetMessage = await interactionChannel.messages.fetch(modalMessageId);
          }
        }
      } catch (err) {
        logger.error('[LoL Match Tags] Failed to fetch target message for keyword update', {
          gameId,
          err: err?.message,
          channelId: cached?.channelId || interaction.channelId,
          messageId: cached?.messageId || modalMessageId,
        });
      }

      if (!targetMessage) {
        return interaction.reply({
          content: 'Could not find the original match message to update keywords.',
          ephemeral: true,
        });
      }

      const parsedTags = extractParsedMatchTags(targetMessage.content || '');
      if (!cached && !parsedTags) {
        return interaction.reply({
          content: 'This match message does not contain searchable tags to update.',
          ephemeral: true,
        });
      }

      const uploaderInfos = Array.isArray(cached?.uploaderInfos) && cached.uploaderInfos.length > 0
        ? cached.uploaderInfos
        : (parsedTags?.uploader ? [{ name: parsedTags.uploader }] : []);

      if (uploaderInfos.length === 0 && cached?.payload) {
        uploaderInfos.push(getUploaderInfo(cached.payload));
      }

      const permission = await canEditMatchKeywords(
        interaction.user.id,
        cached?.payload || null,
        uploaderInfos,
        parsedTags?.uploader || null,
        parsedTags?.uploaderId || null
      );
      if (!permission.allowed) {
        logger.info('[LoL Match Tags] Keyword modal submit denied', {
          gameId,
          userId: interaction.user.id,
          reason: permission.reason,
        });
        return interaction.reply({
          content: 'Only the uploader or a league admin can edit match keywords.',
          ephemeral: true,
        });
      }

      let updatedContent = upsertKeywordsInContent(targetMessage.content, normalizedKeywords);
      if (!updatedContent) {
        if (cached?.payload) {
          const rebuiltTagLine = buildMatchTagLine({
            payload: cached.payload,
            gameId,
            uploaderInfo: uploaderInfos[0],
            uploaderDiscordId: cached?.uploaderDiscordIds?.[0] || parsedTags?.uploaderId || null,
            matchedPlayers: cached.matchedPlayers || [],
            keywords: normalizedKeywords,
          });

          const existingContent = String(targetMessage.content || '').trim();
          updatedContent = existingContent
            ? `${existingContent}\n${rebuiltTagLine}`
            : rebuiltTagLine;
        } else {
          return interaction.reply({
            content: 'Could not update keywords because no match tag line was found.',
            ephemeral: true,
          });
        }
      }

      if (updatedContent !== targetMessage.content) {
        await targetMessage.edit({ content: updatedContent });
      }

      if (cached) {
        cached.manualKeywords = normalizedKeywords;
        recentMatchData.set(gameId, cached);
      }

      logger.info('[LoL Match Tags] Match keywords updated', {
        gameId,
        userId: interaction.user.id,
        keywordCount: normalizedKeywords.length,
      });

      const keywordText = normalizedKeywords.length > 0
        ? normalizedKeywords.join(', ')
        : 'none';
      await interaction.reply({
        content: `Updated match keywords: ${keywordText}`,
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId.startsWith('LEAGUE_ID_MODAL_')) {
        const updates = {};
        // Iterate through all fields submitted
        for (const [key, component] of interaction.fields.fields) {
           if (key.startsWith('aug_')) {
              const idStr = key.replace('aug_', '');
              const id = parseInt(idStr, 10);
              const name = component.value.trim();
              if (name) {
                 updates[id] = name;
              }
           }
        }
        
        Object.assign(AUGMENT_NAME_MAP, updates);
        
        try {
           let fileData = {};
           if (fs.existsSync(AUGMENT_ID_FILE)) {
              fileData = JSON.parse(fs.readFileSync(AUGMENT_ID_FILE, 'utf8'));
           }
           Object.assign(fileData, updates);
           fs.writeFileSync(AUGMENT_ID_FILE, JSON.stringify(fileData, null, 2));
           
           logger.info('Updated augment IDs from user input', { count: Object.keys(updates).length });
        } catch (e) {
           logger.error('Failed to save augments', e);
        }

        await interaction.reply({ content: `Thank you for uploading augment data!`, ephemeral: true });
        return;
    }

  if (interaction.customId !== 'LEAGUE_LINK_MODAL') return;

  logger.info('[LoL Link] Link modal submitted', { user: interaction.user.id });

  // ✅ ACKNOWLEDGE THE INTERACTION IMMEDIATELY
  // This MUST be the first awaited call
  await interaction.deferReply({ flags: 64 });

  try {
    const input =
      interaction.fields.getTextInputValue('account_input').trim();

    const mainRole = normalizeRole(
      interaction.fields.getTextInputValue('main_role')
    );

    const lfg = parseLFG(
      interaction.fields.getTextInputValue('lfg_status')
    );

    logger.info('[LoL Link] Modal submit', {
      user: interaction.user.id,
      input,
    });

    const { puuid, existing } = await resolvePUUID(
      interaction.user.id,
      input
    );

    const rankResult = await fetchRanksNA(puuid, existing?.league_name || input);


    const payload = {
      user_id: interaction.user.id,
      league_name: input,
      discord_name: interaction.user.username,
      puuid,
      main_role: mainRole,
      lfg,
    };

    // ✅ Only write ranks if Riot explicitly succeeded
    if (rankResult.success) {
      payload.solo_rank = rankResult.soloRank;
      payload.flex_rank = rankResult.flexRank;
    }

    if (existing) {
      const merged = {
        ...existing,
        ...payload,

        // ✅ enforce boolean typing
        league_admin:
            typeof existing.league_admin === 'boolean'
            ? existing.league_admin
            : existing.league_admin === 1 ||
                existing.league_admin === '1' ||
                existing.league_admin === 'true',
        };

        await api.put('league_player', merged);

    } else {
      await api.post('league_player', {
        ...payload,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ League Account Linked')
      .setColor('#2ecc71')
      .addFields(
        { name: 'Input', value: input },
        { name: 'Region', value: 'NA', inline: true },
        {
          name: 'Solo Rank',
          value: rankResult.success
            ? rankResult.soloRank
            : 'unchanged',
          inline: true,
        },
        {
          name: 'Flex Rank',
          value: rankResult.success
            ? rankResult.flexRank || 'Unranked'
            : 'unchanged',
          inline: true,
        },
        { name: 'Role', value: mainRole, inline: true },
        { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
      );

    // ✅ After deferReply, ALWAYS use editReply
    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    logger.error('[LoL Link] Fatal error', err);

    // ✅ Safe fallback — editReply only
    try {
      await interaction.editReply({
        content:
          'An unexpected error occurred while linking your League account.',
      });
    } catch (e) {
      logger.error('[LoL Link] Failed to edit reply after error', e);
    }
  }
}
}

/* =====================================================
   Register
===================================================== */

function register_handlers(event_registry) {
  logger = event_registry.logger;
  startMatchWebhook(event_registry);
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
