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
  AttachmentBuilder, // <--- Make sure this is added
} = require('discord.js');

require('dotenv').config();

const ApiClient = require("../../core/js/APIClient.js");
const api = new ApiClient();

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
   Infographic Logic
===================================================== */

function fixChampName(name) {
  if (!name) return 'Unknown';
  // Common Riot API vs CDN mismatches
  const map = {
    'Wukong': 'MonkeyKing', 'Renata Glasc': 'Renata', 'Bel\'Veth': 'Belveth',
    'Kog\'Maw': 'KogMaw', 'Rek\'Sai': 'RekSai', 'Dr. Mundo': 'DrMundo',
    'Nunu & Willump': 'Nunu', 'Fiddlesticks': 'Fiddlesticks', 'LeBlanc': 'Leblanc',
  };
  return map[name] || name.replace(/[' .]/g, '');
}

function prepareScoreboardData(payload) {
  // 1. Define Versions and Base URLs
  // Pro-tip: You can fetch https://ddragon.leagueoflegends.com/api/versions.json to get the latest dynamically
  const DD_VER = '14.3.1'; 
  const CDN = `https://ddragon.leagueoflegends.com/cdn/${DD_VER}/img`;
  const RUNE_CDN = `https://ddragon.leagueoflegends.com/cdn/img/perk-images/Styles`;

  // 2. Map IDs to Filenames (Data Dragon format)
  const spellMap = {
    1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash',
    6: 'SummonerHaste', 7: 'SummonerHeal', 11: 'SummonerSmite',
    12: 'SummonerTeleport', 13: 'SummonerMana', 14: 'SummonerDot', // Ignite
    21: 'SummonerBarrier', 30: 'SummonerPoroRecall', 31: 'SummonerPoroThrow',
    32: 'SummonerSnowball', 39: 'SummonerSnowURFSnowball_Mark'
  };

  // Runes are weird. They don't use the versioned CDN, but a static path.
  // We are mapping the "Primary Style" (e.g. Precision) to its icon.
  const runeMap = {
    8000: '7201_Precision',
    8100: '7200_Domination',
    8200: '7202_Sorcery',
    8300: '7203_Whimsy', // Inspiration
    8400: '7204_Resolve'
  };

  let maxDamage = 0;
  payload.teams.forEach(t => t.players.forEach(p => {
    const d = p.stats.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0;
    if (d > maxDamage) maxDamage = d;
  }));

  const mapPlayer = (p, localId) => {
    const stats = p.stats || {};
    const k = stats.CHAMPIONS_KILLED || 0;
    const d = stats.NUM_DEATHS || 0;
    const a = stats.ASSISTS || 0;
    const dmg = stats.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS || 0;

    // ITEMS: Map IDs to URLs
    const items = [0,1,2,3,4,5,6].map(i => {
      const id = stats[`ITEM${i}`];
      // Return URL if item exists, else transparent pixel
      return id ? `${CDN}/item/${id}.png` : 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    });

    // SPELLS: Map ID -> Name -> URL
    const s1Name = spellMap[p.spell1Id] || 'SummonerFlash'; // Fallback
    const s2Name = spellMap[p.spell2Id] || 'SummonerFlash';
    
    // RUNES: Map Style ID -> Name -> URL
    const r1Name = runeMap[stats.PERK_PRIMARY_STYLE] || '7201_Precision';
    const r2Name = runeMap[stats.PERK_SUB_STYLE] || '7201_Precision';

    // Helper for "Is this me?"
    let isLocal = false;
    if (p.isLocalPlayer) isLocal = true;
    if (payload.user_id && p.puuid === payload.puuid) isLocal = true;

    return {
      name: p.summonerName || p.riotIdGameName || 'Unknown',
      championName: p.championName,
      championIcon: `${CDN}/champion/${fixChampName(p.championName)}.png`,
      level: stats.LEVEL || 18,
      
      // NEW: Full URLs for images
      spell1: `${CDN}/spell/${s1Name}.png`,
      spell2: `${CDN}/spell/${s2Name}.png`,
      rune1: `${RUNE_CDN}/${r1Name}.png`,
      rune2: `${RUNE_CDN}/${r2Name}.png`,

      items: items,
      k, d, a,
      kdaRatio: d === 0 ? (k + a).toFixed(2) : ((k + a) / d).toFixed(2),
      totalDamage: dmg.toLocaleString(),
      damagePercent: maxDamage > 0 ? ((dmg / maxDamage) * 100).toFixed(1) : 0,
      gold: ((stats.GOLD_EARNED || 0) / 1000).toFixed(1) + 'k',
      cs: (stats.MINIONS_KILLED || 0) + (stats.NEUTRAL_MINIONS_KILLED || 0),
      vision: stats.VISION_SCORE || 0,
      isLocal: isLocal
    };
  };

  // ... (Rest of function remains the same: uploaderResult logic, return object, etc.)
  const localPlayer = payload.localPlayer || payload.teams.flatMap(t => t.players).find(p => p.isLocalPlayer);
  const uploaderTeamId = localPlayer?.teamId;
  const winningTeamId = payload.teams.find(t => t.isWinningTeam)?.teamId;
  const uploaderWon = uploaderTeamId === winningTeamId;

  const t100 = payload.teams.find(t => t.teamId === 100) || { players: [] };
  const t200 = payload.teams.find(t => t.teamId === 200) || { players: [] };

  return {
    gameMode: payload.gameMode || 'LoL Match',
    duration: payload.gameLength ? `${Math.floor(payload.gameLength / 60)}m ${payload.gameLength % 60}s` : '0m 0s',
    uploaderResult: uploaderWon ? "VICTORY" : "DEFEAT",
    resultClass: uploaderWon ? "victory" : "defeat",
    team100: t100.players.map(p => mapPlayer(p, payload.uploaderId)),
    team200: t200.players.map(p => mapPlayer(p, payload.uploaderId))
  };
}

async function generateInfographicImage(payload) {
  try {
    const templatePath = path.join(__dirname, 'match-template.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    const data = prepareScoreboardData(payload);

    // SSD PROTECTION: No output path provided = Image generated in RAM only.
    const imageBuffer = await nodeHtmlToImage({
      html: template,
      content: data,
      puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    return imageBuffer;
  } catch (err) {
    logger.error('[Infographic] Generation failed', err);
    return null;
  }
}


/* =====================================================
   Match ingest server
===================================================== */

function enqueueMatchPayload(payload, client) {
  const gameId = payload.gameId || payload.reportGameId;

  // If no gameId, send immediately.
  if (!gameId) {
    return handleMatchPayload(payload, client, [getUploaderInfo(payload)]);
  }

  const key = String(gameId);
  const existing = pendingMatches.get(key) || { timer: null, payloads: [] };

  if (existing.timer) {
    clearTimeout(existing.timer);
  }

  existing.payloads.push(payload);
  existing.timer = setTimeout(() => {
    const bundle = pendingMatches.get(key) || existing;
    pendingMatches.delete(key);

    const latest = (bundle.payloads && bundle.payloads[bundle.payloads.length - 1]) || payload;
    const uploaderInfos = (bundle.payloads || []).map(getUploaderInfo).filter(Boolean);

    handleMatchPayload(latest, client, uploaderInfos);
  }, MATCH_DEBOUNCE_MS);

  pendingMatches.set(key, existing);

  return Promise.resolve();
}

async function handleMatchPayload(payload, client) {
  const gameId = payload.gameId || payload.reportGameId || 'unknown';
  logger.info('[LoL Match Ingest] Payload received, generating infographic...', { gameId });

  if (!MATCH_WEBHOOK_CHANNEL) return;

  try {
    const channel = await client.channels.fetch(MATCH_WEBHOOK_CHANNEL);
    if (!channel) return;

    // Generate image in memory
    const imageBuffer = await generateInfographicImage(payload);

    if (imageBuffer) {
      const attachment = new AttachmentBuilder(imageBuffer, { name: `match-${gameId}.png` });
      
      await channel.send({
        content: `Match ID: ${gameId}`,
        files: [attachment]
      });
      logger.info('[LoL Match Ingest] Infographic sent.');
    } else {
      // Fallback text if generation fails
      channel.send(`Match ${gameId} completed (Image generation failed).`);
    }

  } catch (err) {
    logger.error('[LoL Match Ingest] Handler error', err);
  }
}

function startMatchWebhook(event_registry) {
  if (matchServerStarted) return;
  matchServerStarted = true;

  const client = event_registry.client;

  const server = http.createServer((req, res) => {
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
        res.statusCode = 413;
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
        })
        .catch((err) => {
          logger.error('[LoL Match Ingest] Handler error', err);
          res.statusCode = 500;
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
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

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

  // Modal submit
if (interaction.isModalSubmit()) {
  if (interaction.customId !== 'LEAGUE_LINK_MODAL') return;

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
