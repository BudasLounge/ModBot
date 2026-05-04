/**
 * Arena (CHERRY) scoreboard data preparation.
 *
 * Consumes the canonical `arenaPlayers[]` schema produced by the LeagueLoader
 * desktop client (see arena_ingestion_guide.md §3) and produces a flat data
 * object suitable for handlebars rendering by `match-template-arena.html`.
 *
 * Required stats per player (per user request):
 *   - placement, champion, augments, items, gold earned,
 *     damage dealt + taken
 */

const axios = require('axios');
const { getArenaAugmentIndex, resolveAugmentDisplay } = require('./arena_augments.js');

// Cache champion ID → { name, urlId } keyed by ddVersion to avoid repeated fetches.
let _champIdMap = null;
let _champIdMapVersion = null;

async function buildChampionIdMap(ddVersion, logger) {
  if (_champIdMap && _champIdMapVersion === ddVersion) return _champIdMap;
  try {
    const url = `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/en_US/champion.json`;
    logger?.info?.(`[ArenaScoreboard] Fetching champion ID map from ${url}`);
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data?.data || {};
    const map = new Map();
    for (const champ of Object.values(data)) {
      map.set(Number(champ.key), { name: champ.name, urlId: champ.id });
    }
    _champIdMap = map;
    _champIdMapVersion = ddVersion;
    logger?.info?.(`[ArenaScoreboard] Built champion ID map with ${map.size} champions`);
  } catch (err) {
    logger?.warn?.('[ArenaScoreboard] Failed to fetch champion.json — champion icons will be missing', { err: err.message });
    _champIdMap = _champIdMap || new Map();
  }
  return _champIdMap;
}

function fixChampName(name) {
  if (!name) return 'Unknown';
  const normalized = String(name).replace(/[\u2018\u2019\u02BC]/g, "'");
  const map = {
    'Wukong': 'MonkeyKing', 'Renata Glasc': 'Renata', "Bel'Veth": 'Belveth',
    "Kog'Maw": 'KogMaw', "Rek'Sai": 'RekSai', 'Dr. Mundo': 'DrMundo',
    'Nunu & Willump': 'Nunu', 'Fiddlesticks': 'Fiddlesticks', 'LeBlanc': 'Leblanc',
    "Cho'Gath": 'Chogath', "Kai'Sa": 'Kaisa', "Kha'Zix": 'Khazix',
    "Vel'Koz": 'Velkoz',
  };
  return map[normalized] || normalized.replace(/[' .&]/g, '');
}

function placementLabel(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return '-';
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

const SUMMONER_SPELL_MAP = {
  1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash',
  6: 'SummonerHaste', 7: 'SummonerHeal', 11: 'SummonerSmite',
  12: 'SummonerTeleport', 13: 'SummonerMana', 14: 'SummonerDot',
  21: 'SummonerBarrier', 32: 'SummonerSnowball',
  // Arena-specific ("Flee"/"Flash" round abilities).
  // CDragon publishes them under SummonerCherryHold/SummonerCherryFlash but
  // DataDragon doesn't ship them; we fall back to a generic flash icon.
  2201: 'SummonerFlash', 2202: 'SummonerFlash',
};

/**
 * Pulls the canonical 16-player list out of a payload, preferring the
 * annotated `arenaPlayers[]` shape but falling back to the raw match-history
 * `participants[].stats` shape so that older client builds still render.
 */
function extractArenaPlayers(payload) {
  if (Array.isArray(payload?.arenaPlayers) && payload.arenaPlayers.length > 0) {
    return payload.arenaPlayers.map((p) => ({
      puuid: p.puuid || null,
      championId: p.championId,
      championName: p.championName || null,
      subteamId: p.subteamId,
      placement: p.placement,
      kills: p.kills ?? 0,
      deaths: p.deaths ?? 0,
      assists: p.assists ?? 0,
      damageDealtToChampions: p.damageDealtToChampions ?? 0,
      damageTaken: p.damageTaken ?? 0,
      goldEarned: p.goldEarned ?? 0,
      itemIds: Array.isArray(p.itemIds) ? p.itemIds : [],
      summonerSpell1: p.summonerSpell1 ?? 0,
      summonerSpell2: p.summonerSpell2 ?? 0,
      augmentIds: Array.isArray(p.augments) ? p.augments.map((a) => a?.id).filter((id) => Number.isFinite(id)) : [],
      riotIdGameName: p.riotIdGameName || null,
      riotIdTagLine: p.riotIdTagLine || null,
      isLocalPlayer: Boolean(p.isLocalPlayer),
    }));
  }

  // Fallback: raw match-history `participants[]` (stats keys: subteamPlacement,
  // playerSubteamId, playerAugment1..6).
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  if (!participants.length) return [];
  const identitiesById = new Map();
  for (const ident of payload?.participantIdentities || []) {
    if (ident?.participantId !== undefined) identitiesById.set(ident.participantId, ident.player || {});
  }
  return participants.map((p) => {
    const s = p.stats || {};
    const ident = identitiesById.get(p.participantId) || {};
    const augmentIds = [1, 2, 3, 4, 5, 6]
      .map((i) => s[`playerAugment${i}`])
      .filter((id) => Number.isFinite(id) && id > 0);
    const itemIds = [0, 1, 2, 3, 4, 5, 6].map((i) => s[`item${i}`] ?? 0);
    return {
      puuid: ident.puuid || p.puuid || null,
      championId: p.championId,
      championName: null,
      subteamId: s.playerSubteamId,
      placement: s.subteamPlacement,
      kills: s.kills ?? 0,
      deaths: s.deaths ?? 0,
      assists: s.assists ?? 0,
      damageDealtToChampions: s.totalDamageDealtToChampions ?? 0,
      damageTaken: s.totalDamageTaken ?? 0,
      goldEarned: s.goldEarned ?? 0,
      itemIds,
      summonerSpell1: p.spell1Id ?? 0,
      summonerSpell2: p.spell2Id ?? 0,
      augmentIds,
      riotIdGameName: ident.gameName || ident.summonerName || null,
      riotIdTagLine: ident.tagLine || null,
      isLocalPlayer: false,
    };
  });
}

function uploaderNameMatchesPlayer(uploaderInfos, p) {
  if (!Array.isArray(uploaderInfos) || uploaderInfos.length === 0) return false;
  const candidates = new Set(
    uploaderInfos
      .map((u) => (u?.name || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (candidates.size === 0) return false;
  const fullName = p.riotIdGameName && p.riotIdTagLine
    ? `${p.riotIdGameName}#${p.riotIdTagLine}`.toLowerCase()
    : null;
  if (fullName && candidates.has(fullName)) return true;
  if (p.riotIdGameName && candidates.has(String(p.riotIdGameName).toLowerCase())) return true;
  return false;
}

/**
 * Build the handlebars view-model for an Arena match.
 *
 * @param {object}   payload         Annotated match payload (post-ingest)
 * @param {string}   ddVersion       DataDragon version string (already resolved by caller)
 * @param {Array}    uploaderInfos   getUploaderInfo() results — used to highlight the local player
 *                                   when `isLocalPlayer` wasn't set on any row.
 * @param {object}   logger
 */
async function prepareArenaScoreboardData(payload, ddVersion, uploaderInfos = [], logger = null) {
  const [augmentIndex, champIdMap] = await Promise.all([
    getArenaAugmentIndex(logger),
    buildChampionIdMap(ddVersion, logger),
  ]);

  const CDN = `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img`;
  const ITEM_CDN = `${CDN}/item`;
  const SPELL_CDN = `${CDN}/spell`;
  const buildItemUrl = (id) => (id ? `${ITEM_CDN}/${id}.png` : null);

  const rawPlayers = extractArenaPlayers(payload);

  if (rawPlayers.length === 0) {
    logger?.warn?.('[ArenaScoreboard] No arena players found in payload');
  }

  // Compute extremes for in-row bar rendering.
  const maxDealt = Math.max(1, ...rawPlayers.map((p) => p.damageDealtToChampions || 0));
  const maxTaken = Math.max(1, ...rawPlayers.map((p) => p.damageTaken || 0));
  const maxGold  = Math.max(1, ...rawPlayers.map((p) => p.goldEarned || 0));

  const explicitLocalExists = rawPlayers.some((p) => p.isLocalPlayer);

  const mapPlayer = (p) => {
    const champEntry = champIdMap.get(p.championId);
    const championName = p.championName || champEntry?.name || `Champion ${p.championId}`;
    // Use DataDragon's URL-safe id (champEntry.urlId) directly so names with
    // apostrophes, spaces, etc. don't produce broken URLs even without championName.
    const championIconId = champEntry?.urlId || fixChampName(p.championName || championName);
    const championIcon = p.championId
      ? `${CDN}/champion/${championIconId}.png`
      : null;

    // Items: Arena pads to 7 slots. Slot 6 is the trinket (often 0/3340).
    const itemIds = (p.itemIds || []).slice(0, 7);
    while (itemIds.length < 7) itemIds.push(0);
    const items = itemIds.map((id) => ({
      id,
      url: buildItemUrl(id),
      isPlaceholder: !id,
    }));

    const augments = (p.augmentIds || [])
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => resolveAugmentDisplay(id, augmentIndex));

    const s1Icon = SUMMONER_SPELL_MAP[p.summonerSpell1] || 'SummonerFlash';
    const s2Icon = SUMMONER_SPELL_MAP[p.summonerSpell2] || 'SummonerFlash';

    const displayName = p.riotIdGameName
      ? (p.riotIdTagLine ? `${p.riotIdGameName}#${p.riotIdTagLine}` : p.riotIdGameName)
      : (p.puuid ? p.puuid.slice(0, 8) : 'Unknown');

    const isLocal = p.isLocalPlayer
      || (!explicitLocalExists && uploaderNameMatchesPlayer(uploaderInfos, p));

    const dealt = p.damageDealtToChampions || 0;
    const taken = p.damageTaken || 0;
    const gold  = p.goldEarned || 0;

    return {
      puuid: p.puuid,
      championId: p.championId,
      championName,
      championIcon,
      displayName,
      shortName: p.riotIdGameName || displayName,
      subteamId: p.subteamId,
      placement: p.placement,
      placementLabel: placementLabel(p.placement),
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kda: `${p.kills} / ${p.deaths} / ${p.assists}`,
      gold,
      goldFmt: gold >= 1000 ? `${(gold / 1000).toFixed(1)}k` : String(gold),
      goldPct: Math.round((gold / maxGold) * 100),
      damageDealt: dealt,
      damageDealtFmt: dealt.toLocaleString(),
      damageDealtPct: Math.round((dealt / maxDealt) * 100),
      damageTaken: taken,
      damageTakenFmt: taken.toLocaleString(),
      damageTakenPct: Math.round((taken / maxTaken) * 100),
      items,
      augments,
      spell1Url: `${SPELL_CDN}/${s1Icon}.png`,
      spell2Url: `${SPELL_CDN}/${s2Icon}.png`,
      isLocal,
    };
  };

  const players = rawPlayers.map(mapPlayer);

  // Group into subteams, sorted by placement (1 = winners).
  const bySubteam = new Map();
  for (const pl of players) {
    const key = pl.subteamId ?? 0;
    if (!bySubteam.has(key)) bySubteam.set(key, []);
    bySubteam.get(key).push(pl);
  }

  const subteams = Array.from(bySubteam.entries()).map(([subteamId, list]) => {
    const placement = list[0]?.placement ?? 99;
    const placementLbl = list[0]?.placementLabel ?? '-';
    const containsLocal = list.some((p) => p.isLocal);
    return {
      subteamId,
      placement,
      placementLabel: placementLbl,
      isWinner: placement === 1,
      containsLocal,
      players: list,
    };
  });

  subteams.sort((a, b) => (a.placement || 99) - (b.placement || 99));

  // Friendly mode label.
  const gameModeLabel = 'Arena';

  const durationSeconds =
    payload?.gameDuration
    ?? payload?.gameLength
    ?? payload?.statsBlock?.gameLengthSeconds
    ?? 0;
  const duration = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;

  const localSubteam = subteams.find((st) => st.containsLocal);
  let outcomeText = 'MATCH COMPLETE';
  let resultClass = 'neutral';
  if (localSubteam) {
    if (localSubteam.placement === 1) {
      outcomeText = '1ST PLACE — VICTORY';
      resultClass = 'victory';
    } else if (localSubteam.placement <= 4) {
      outcomeText = `${localSubteam.placementLabel.toUpperCase()} PLACE`;
      resultClass = 'top-half';
    } else {
      outcomeText = `${localSubteam.placementLabel.toUpperCase()} PLACE`;
      resultClass = 'defeat';
    }
  }

  return {
    gameMode: gameModeLabel,
    duration,
    uploaderResult: outcomeText,
    resultClass,
    gameId: payload?.gameId,
    subteams,
  };
}

module.exports = {
  prepareArenaScoreboardData,
  extractArenaPlayers,
};
