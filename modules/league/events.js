const axios = require('axios');
const http = require('http');
const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

require('dotenv').config();

const ApiClient = require("../../core/js/APIClient.js");
const api = new ApiClient();

const RIOT_API_KEY = process.env.RIOT_API_KEY;
let logger;

const MATCH_WEBHOOK_PORT = parseInt(process.env.MATCH_WEBHOOK_PORT || '38900', 10);
const MATCH_WEBHOOK_HOST = process.env.MATCH_WEBHOOK_HOST || '0.0.0.0';
const MATCH_WEBHOOK_PATH = process.env.MATCH_WEBHOOK_PATH || '/lol/match';
const MATCH_WEBHOOK_SECRET = process.env.MATCH_WEBHOOK_SECRET;
const MATCH_WEBHOOK_CHANNEL = process.env.MATCH_WEBHOOK_CHANNEL;
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

/* =====================================================
   Match ingest server
===================================================== */

async function handleMatchPayload(payload, client) {
  const gameId = payload.gameId || payload.reportGameId || 'unknown';
  const mode = payload.gameMode || payload.queueType || 'unknown';
  const teams = Array.isArray(payload.teams) ? payload.teams : [];
  const playerCount = teams.reduce((acc, t) => acc + (Array.isArray(t.players) ? t.players.length : 0), 0);
  const winningTeam = teams.find((t) => t.isWinningTeam);
  const lengthSeconds = typeof payload.gameLength === 'number' ? payload.gameLength : null;

  const formatName = (p) => {
    if (!p) return 'unknown';
    if (p.riotIdGameName) return `${p.riotIdGameName}${p.riotIdTagLine ? '#' + p.riotIdTagLine : ''}`;
    if (p.summonerName) return p.summonerName;
    return 'unknown';
  };

  const localPlayer = payload.localPlayer || teams.flatMap((t) => t.players || []).find((p) => p?.isLocalPlayer);
  const uploader =
    payload.uploader ||
    payload.uploadedBy ||
    payload.uploaderName ||
    payload.uploaderId ||
    formatName(localPlayer);

  logger.info('[LoL Match Ingest] Payload received', {
    gameId,
    mode,
    teams: teams.length,
    players: playerCount,
  });

  if (!MATCH_WEBHOOK_CHANNEL) return;

  try {
    const channel = await client.channels.fetch(MATCH_WEBHOOK_CHANNEL);
    if (!channel) return;

    const durationLabel = lengthSeconds !== null
      ? `${Math.floor(lengthSeconds / 60)}m ${Math.max(0, lengthSeconds % 60)}s`
      : 'unknown';

    const formatPlayer = (p) => {
      const name = formatName(p);
      const champ = p.championName || 'Unknown';
      const s = p.stats || {};
      const k = s.CHAMPIONS_KILLED ?? '?';
      const d = s.NUM_DEATHS ?? '?';
      const a = s.ASSISTS ?? '?';
      const dmgChamp = s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS ?? s.TOTAL_DAMAGE_DEALT ?? '?';
      return `${champ}: ${name} | K/D/A ${k}/${d}/${a} | DMG to Champs ${dmgChamp}`;
    };

    const team100 = teams.find((t) => t.teamId === 100);
    const team200 = teams.find((t) => t.teamId === 200);

    const embed = new EmbedBuilder()
      .setTitle('LoL Match Received')
      .setColor('#3498db')
      .addFields(
        { name: 'Game ID', value: String(gameId) },
        { name: 'Mode', value: String(mode), inline: true },
        { name: 'Length', value: durationLabel, inline: true },
        { name: 'Players', value: playerCount ? String(playerCount) : 'unknown', inline: true },
        { name: 'Winner', value: winningTeam ? (winningTeam.teamId === 100 ? 'Blue (100)' : 'Red (200)') : 'unknown', inline: true },
        { name: 'Uploaded By', value: String(uploader) }
      );

    if (team100?.players?.length) {
      const lines = team100.players.map(formatPlayer).slice(0, 10).join('\n');
      embed.addFields({ name: 'Blue (100)', value: lines ? '```' + lines + '```' : 'No players', inline: false });
    }

    if (team200?.players?.length) {
      const lines = team200.players.map(formatPlayer).slice(0, 10).join('\n');
      embed.addFields({ name: 'Red (200)', value: lines ? '```' + lines + '```' : 'No players', inline: false });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    logger.error('[LoL Match Ingest] Failed to fan out payload', err);
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

      handleMatchPayload(payload, client)
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
