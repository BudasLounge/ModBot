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
   Riot endpoints (NA majority)
===================================================== */
const RIOT_ACCOUNT_BY_RIOT_ID =
  'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/';
const RIOT_SUMMONER_BY_NAME_NA =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_SUMMONER_BY_PUUID_NA =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/';
const RIOT_LEAGUE_BY_SUMMONER_NA =
  'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/';

/* =====================================================
   Riot HTTP (match wins.js style: pass headers per request)
===================================================== */
const http = axios.create({ timeout: 15000 });

async function riotGet(url) {
  logger.info(`[Riot] GET ${url}`);
  return http.get(url, { headers: { "X-Riot-Token": RIOT_API_KEY } });
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

function extractRanks(entries = []) {
  let soloRank = null;
  let flexRank = null;

  for (const e of entries) {
    if (e.queueType === 'RANKED_SOLO_5x5') soloRank = `${e.tier} ${e.rank}`;
    if (e.queueType === 'RANKED_FLEX_SR') flexRank = `${e.tier} ${e.rank}`;
  }
  return { soloRank, flexRank };
}

function parseRiotId(raw) {
  const idx = raw.lastIndexOf('#');
  if (idx === -1) return null;
  return { gameName: raw.slice(0, idx).trim(), tagLine: raw.slice(idx + 1).trim() };
}

/* =====================================================
   Core: resolve PUUID in a way that actually matches input reality
===================================================== */
async function getPuuidForUser(userId, rawInput) {
  // 1) wins.js behavior: try DB first
  const db = await api.get('league_player', { user_id: userId });
  const existing = db?.league_players?.[0];
  if (existing?.puuid && existing.puuid !== 'none') {
    logger.info('[LoL Link] Using existing PUUID from DB', { userId, puuid: existing.puuid });
    return { puuid: existing.puuid, source: 'db', existing };
  }

  // 2) If input looks like Riot ID (Name#TAG) -> Account-V1 (correct API for this format)
  if (rawInput.includes('#')) {
    const parsed = parseRiotId(rawInput);
    if (!parsed?.gameName || !parsed?.tagLine) {
      throw new Error('Invalid Riot ID format (expected Name#TAG).');
    }

    logger.info('[LoL Link] Resolving PUUID via Account-V1 by-riot-id', parsed);

    const res = await riotGet(
      `${RIOT_ACCOUNT_BY_RIOT_ID}${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
    );

    if (!res?.data?.puuid) {
      logger.error('[LoL Link] Account-V1 response missing puuid', res?.data);
      throw new Error('Account lookup succeeded but returned no PUUID.');
    }

    return { puuid: res.data.puuid, source: 'account-v1', existing };
  }

  // 3) Otherwise treat as summoner name (legacy)
  logger.info('[LoL Link] Resolving PUUID via Summoner-V4 by-name (NA)', { rawInput });

  const res = await riotGet(
    `${RIOT_SUMMONER_BY_NAME_NA}${encodeURIComponent(rawInput)}`
  );

  if (!res?.data?.puuid) {
    logger.error('[LoL Link] Summoner-V4 by-name missing puuid', res?.data);
    throw new Error('Summoner lookup succeeded but returned no PUUID.');
  }

  return { puuid: res.data.puuid, source: 'summoner-v4-by-name', existing };
}

/* =====================================================
   Optional rank fetch (never blocks linking)
===================================================== */
async function tryFetchRanksNA(puuid) {
  try {
    logger.info('[LoL Link] Attempting NA summoner lookup by PUUID for ranks');
    const sRes = await riotGet(`${RIOT_SUMMONER_BY_PUUID_NA}${puuid}`);

    const summonerId = sRes?.data?.id;
    if (!summonerId) {
      logger.warn('[LoL Link] Summoner-V4 by-puuid returned no id; skipping ranks', { data: sRes?.data });
      return { soloRank: 'unranked', flexRank: null, rankSource: 'skipped-no-summoner-id' };
    }

    logger.info('[LoL Link] Fetching league entries by summonerId', { summonerId });
    const lRes = await riotGet(`${RIOT_LEAGUE_BY_SUMMONER_NA}${summonerId}`);
    const { soloRank, flexRank } = extractRanks(lRes.data);

    return {
      soloRank: soloRank || 'unranked',
      flexRank: flexRank || null,
      rankSource: 'league-v4',
    };
  } catch (err) {
    const status = err?.response?.status;
    logger.warn('[LoL Link] Rank fetch failed; continuing without ranks', {
      status,
      message: err?.response?.data || err?.message,
    });
    return { soloRank: 'unranked', flexRank: null, rankSource: `failed-${status || 'unknown'}` };
  }
}

/* =====================================================
   Interaction Handler
===================================================== */
async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  // Button -> show modal
  if (interaction.isButton()) {
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

    const modal = new ModalBuilder()
      .setCustomId('LEAGUE_LINK_MODAL')
      .setTitle('Link League Account (NA)');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('account_input')
          .setLabel('Riot ID (Name#TAG) OR Summoner Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('main_role')
          .setLabel('Main Role (top, jg, mid, adc, sup)')
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

    await interaction.deferReply({ ephemeral: true });

    try {
      logger.info(`[LoL Link] Modal submit by ${interaction.user.id}`);

      const rawInput = interaction.fields.getTextInputValue('account_input').trim();
      const mainRole = normalizeRole(interaction.fields.getTextInputValue('main_role'));
      const lfg = parseLFG(interaction.fields.getTextInputValue('lfg_status'));

      if (!RIOT_API_KEY) {
        await interaction.editReply({ content: 'RIOT_API_KEY is not configured.' });
        return;
      }

      // Resolve PUUID (wins.js behavior + correct RiotID support)
      const { puuid, source, existing } = await getPuuidForUser(interaction.user.id, rawInput);
      logger.info('[LoL Link] PUUID resolved', { puuid, source });

      // Attempt ranks, but never block linking
      const { soloRank, flexRank, rankSource } = await tryFetchRanksNA(puuid);
      logger.info('[LoL Link] Rank outcome', { soloRank, flexRank, rankSource });

      // Upsert record
      const payload = {
        user_id: interaction.user.id,
        league_name: rawInput, // store exactly what user entered (wins.js behavior is permissive)
        discord_name: interaction.user.username,
        puuid,
        main_role: mainRole,
        lfg,
        solo_rank: soloRank,
        flex_rank: flexRank,
      };

      if (existing) {
        logger.info('[LoL Link] Updating existing league_player record');
        await api.put('league_player', payload);
      } else {
        logger.info('[LoL Link] Creating new league_player record');
        await api.post('league_player', { ...payload, league_admin: 0 });
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ League Account Linked')
        .setColor('#2ecc71')
        .addFields(
          { name: 'Input', value: rawInput, inline: false },
          { name: 'Region', value: 'NA', inline: true },
          { name: 'PUUID source', value: source, inline: true },
          { name: 'Solo Rank', value: soloRank || 'Unranked', inline: true },
          { name: 'Flex Rank', value: flexRank || 'Unranked', inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const status = err?.response?.status;
      const body = err?.response?.data || err?.message;

      logger.error('[LoL Link] Fatal error', { status, body, stack: err?.stack });

      await interaction.editReply({
        content:
          `Failed to link account.\n` +
          `Error: ${typeof body === 'string' ? body : JSON.stringify(body)}`
      });
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
