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

// Cache for recent matches to allow "Identify Augment" interactions
// Key: gameId, Value: { players: [{ user_id, augments: [id1, id2...] }] }
const recentMatchAugments = new Map();

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
try {
  wikiAugmentData = require('./mayhem_wiki_data.json');
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
  // If we have wiki data for this name, try to resolve the local icon
  if (wikiAugmentData[name] && wikiAugmentData[name].icon) {
    const iconName = wikiAugmentData[name].icon;
    const fullPath = path.join(AUGMENT_ICON_DIR, iconName);
    if (fs.existsSync(fullPath)) {
      // Convert to file URI
      icon = `file://${fullPath.replace(/\\/g, '/')}`;
    }
  }

  return {
    id,
    name,
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
  const map = {
    'Wukong': 'MonkeyKing', 'Renata Glasc': 'Renata', 'Bel\'Veth': 'Belveth',
    'Kog\'Maw': 'KogMaw', 'Rek\'Sai': 'RekSai', 'Dr. Mundo': 'DrMundo',
    'Nunu & Willump': 'Nunu', 'Fiddlesticks': 'Fiddlesticks', 'LeBlanc': 'Leblanc',
  };
  return map[name] || name.replace(/[' .]/g, '');
}

/* =====================================================
   Infographic Logic (Clean Badges + Detailed Footer)
===================================================== */

async function prepareScoreboardData(payload, uploaderInfos = []) {
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const isMayhem = isAramMayhem(payload);
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
      isLocal: isHighlight
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

  let anyUploaderWon = false;
  if (uploaderInfos.length > 0) {
    anyUploaderWon = uploaderInfos.some(u => u.result === 'Win');
  } else {
    const local = payload.localPlayer || teams.flatMap((t) => t.players || []).find((p) => p.isLocalPlayer);
    const winTeam = teams.find((t) => t.isWinningTeam)?.teamId;
    anyUploaderWon = local?.teamId === winTeam;
  }

  return {
    gameMode: isMayhem ? 'ARAM Mayhem' : (payload.gameMode || payload.queueType || 'LoL Match'),
    duration: `${Math.floor(payload.gameLength / 60)}m ${payload.gameLength % 60}s`,
    uploaderResult: anyUploaderWon ? "VICTORY" : "DEFEAT",
    resultClass: anyUploaderWon ? "victory" : "defeat",
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
    t200Win: t200.isWinningTeam
  };
}

async function generateInfographicImage(payload, uploaderInfos) {
  try {
    const templateFile = isAramMayhem(payload) ? 'match-template-mayhem.html' : 'match-template.html';
    const templatePath = path.join(__dirname, templateFile);
    const template = fs.readFileSync(templatePath, 'utf8');
    
    // Await the data preparation (since it fetches version)
    const data = await prepareScoreboardData(payload, uploaderInfos);

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
   Match ingest server
===================================================== */

async function enqueueMatchPayload(payload, client) {
  const gameId = payload.gameId || payload.reportGameId;

  logger.info('[LoL Match Ingest] Enqueue match payload', { gameId });

  // If no gameId, send immediately.
  if (!gameId) {
    logger.info('[LoL Match Ingest] No gameId present, handling immediately');
    return handleMatchPayload(payload, client, [getUploaderInfo(payload)]);
  }

  if (!MATCH_WEBHOOK_CHANNEL) {
    logger.error('[LoL Match Ingest] MATCH_WEBHOOK_CHANNEL not configured; dropping payload');
    return Promise.resolve();
  }

  const key = String(gameId);
  let existing = pendingMatches.get(key);
  // Lock the match entry immediately to avoid concurrent placeholders
  if (!existing) {
    existing = { timer: null, payloads: [], placeholderMessage: null };
    pendingMatches.set(key, existing);
  }

  if (existing.timer) {
    clearTimeout(existing.timer);
  }

  existing.payloads.push(payload);

  // If this is the first payload in the window, post a placeholder message
  if (!existing.placeholderMessage) {
    try {
      const channel = await client.channels.fetch(MATCH_WEBHOOK_CHANNEL);
      if (channel) {
        existing.placeholderMessage = await channel.send(`Receiving data from Match ${gameId}...`);
        logger.info('[LoL Match Ingest] Posted placeholder message', { gameId, messageId: existing.placeholderMessage.id });
      } else {
        logger.warn('[LoL Match Ingest] Could not fetch channel for placeholder', { MATCH_WEBHOOK_CHANNEL });
      }
    } catch (err) {
      existing.placeholderMessage = null;
      logger.warn('[LoL Match Ingest] Failed to post placeholder message', { gameId, err: err?.message });
    }
  }
  existing.timer = setTimeout(async () => {
    try {
      const bundle = pendingMatches.get(key) || existing;
      pendingMatches.delete(key);

      const latest = (bundle.payloads && bundle.payloads[bundle.payloads.length - 1]) || payload;
      const uploaderInfos = (bundle.payloads || []).map(getUploaderInfo).filter(Boolean);
      const placeholderMessage = bundle.placeholderMessage;

      logger.info('[LoL Match Ingest] Debounced payload bundle ready', {
        gameId,
        bundleCount: bundle.payloads?.length || 1,
      });

      await handleMatchPayload(latest, client, uploaderInfos, placeholderMessage);
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

async function handleMatchPayload(payload, client, uploaderInfos = [], placeholderMessage = null) {
  const gameId = payload.gameId || payload.reportGameId || 'unknown';
  logger.info('[LoL Match Ingest] Payload received, generating infographic...', { gameId });

  const forfeit = getForfeitDetails(payload);
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
    const { imageBuffer, errorMessage: imageError } = await generateInfographicImage(payload, uploaderInfos);
    let scoreboardMessage = placeholderMessage;

    if (imageBuffer) {
      const attachment = new AttachmentBuilder(imageBuffer, { name: `match-${gameId}.png` });
      if (scoreboardMessage) {
        await scoreboardMessage.edit({ content: forfeitText, files: [attachment] });
        logger.info('[LoL Match Ingest] Infographic edited into placeholder.', { gameId });
      } else {
        scoreboardMessage = await channel.send({ content: forfeitText, files: [attachment] });
        logger.info('[LoL Match Ingest] Infographic sent (no placeholder).');
      }
    } else {
      const reason = imageError ? `: ${imageError}` : '';
      const fallbackContent = `Match ${gameId} completed (Image generation failed${reason}).`;
      if (scoreboardMessage) {
        await scoreboardMessage.edit({ content: fallbackContent, files: [] });
        logger.info('[LoL Match Ingest] Fallback text edited into placeholder', { gameId });
      } else {
        scoreboardMessage = await channel.send(fallbackContent);
        logger.info('[LoL Match Ingest] Fallback text sent for match', { gameId });
      }
    }

    const matchedPlayers = await matchedPlayersPromise;
    logger.info('[LoL Match Ingest] Matched players fetched', { matchedPlayers: matchedPlayers.length });

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

        await interaction.reply({ content: `Updated ${Object.keys(updates).length} augments! Use /reload to refresh the image if needed.`, ephemeral: true });
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
