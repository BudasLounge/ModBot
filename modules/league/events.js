const axios = require('axios');
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

const http = axios.create({ timeout: 15000 });

async function riotGet(url) {
  logger.info(`[Riot] GET ${url}`);
  return http.get(url, {
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

async function fetchRanksNA(puuid) {
  try {
    logger.info('[LoL Link] Resolving summonerId by PUUID');

    const summonerRes = await riotGet(
      `${RIOT_SUMMONER_BY_PUUID_NA}${puuid}`
    );

    const summonerId = summonerRes.data?.id;
    if (!summonerId) {
      logger.warn('[LoL Link] Summoner-V4 returned no id', summonerRes.data);
      return { success: false };
    }

    logger.info('[LoL Link] Fetching ranked entries', { summonerId });

    const leagueRes = await riotGet(
      `${RIOT_LEAGUE_BY_SUMMONER_NA}${summonerId}`
    );

    // SUCCESS: even empty array = unranked
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

    const rankResult = await fetchRanksNA(puuid);

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
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
