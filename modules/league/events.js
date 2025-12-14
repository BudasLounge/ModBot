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
   Riot HTTP Client
===================================================== */

const http = axios.create({
  headers: { 'X-Riot-Token': RIOT_API_KEY },
  timeout: 15000,
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function riotGet(url, attempt = 0) {
  try {
    logger.debug?.(`[Riot] GET ${url}`);
    return await http.get(url);
  } catch (err) {
    const status = err?.response?.status;

    if (status === 429 && attempt < 5) {
      const retryAfter =
        parseInt(err.response.headers?.['retry-after'], 10) * 1000 || 2000;
      logger.warn(
        `[Riot] 429 rate limited. Retrying in ${retryAfter}ms (attempt ${attempt + 1})`
      );
      await sleep(retryAfter);
      return riotGet(url, attempt + 1);
    }

    throw err;
  }
}

/* =====================================================
   Helpers
===================================================== */

function parseRiotId(input) {
  if (!input) return null;
  const idx = input.lastIndexOf('#');
  if (idx === -1) return null;
  return {
    gameName: input.slice(0, idx).trim(),
    tagLine: input.slice(idx + 1).trim(),
  };
}

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
    if (e.queueType === 'RANKED_SOLO_5x5') {
      soloRank = `${e.tier} ${e.rank}`;
    }
    if (e.queueType === 'RANKED_FLEX_SR') {
      flexRank = `${e.tier} ${e.rank}`;
    }
  }

  return { soloRank, flexRank };
}

/* =====================================================
   Core Interaction Handler
===================================================== */

async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  /* ---------- Button ---------- */
  if (interaction.isButton()) {
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

    const modal = new ModalBuilder()
      .setCustomId('LEAGUE_LINK_MODAL')
      .setTitle('Link League Account');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('riot_id')
          .setLabel('Riot ID (Name#TAG)')
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

  /* ---------- Modal Submit ---------- */
  if (interaction.isModalSubmit()) {
    if (interaction.customId !== 'LEAGUE_LINK_MODAL') return;

    await interaction.deferReply({ ephemeral: true });

    try {
      logger.info(`[LoL Link] Modal submit by ${interaction.user.id}`);

      if (!RIOT_API_KEY) {
        await interaction.editReply({ content: 'RIOT_API_KEY is not configured.' });
        return;
      }

      const parsed = parseRiotId(
        interaction.fields.getTextInputValue('riot_id')
      );
      if (!parsed) {
        await interaction.editReply({
          content: 'Invalid Riot ID format. Use **Name#TAG**.',
        });
        return;
      }

      const mainRole = normalizeRole(
        interaction.fields.getTextInputValue('main_role')
      );
      const lfg = parseLFG(
        interaction.fields.getTextInputValue('lfg_status')
      );

      /* =====================================================
         STEP 1 — Riot ID → PUUID (GLOBAL)
      ===================================================== */

      logger.info(
        `[LoL Link] Resolving Riot ID ${parsed.gameName}#${parsed.tagLine}`
      );

      const accountRes = await riotGet(
        `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
      );

      const { puuid } = accountRes.data;
      logger.info(`[LoL Link] PUUID resolved: ${puuid}`);

      /* =====================================================
         STEP 2 — NA Summoner by PUUID (BEST EFFORT)
      ===================================================== */

      let summoner = null;

      try {
        logger.info('[LoL Link] Attempting NA summoner lookup by PUUID');
        summoner = await riotGet(
          `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
        );
        logger.info('[LoL Link] NA PUUID → summoner resolved successfully');
      } catch (err) {
        const status = err?.response?.status;

        if (status === 403) {
          logger.warn(
            `[LoL Link] NA PUUID lookup FORBIDDEN (403). Falling back to legacy summoner-name lookup`
          );
        } else if (status === 404) {
          logger.warn(
            `[LoL Link] NA PUUID lookup returned 404. Possible propagation delay. Falling back`
          );
        } else {
          throw err;
        }
      }

      /* =====================================================
         STEP 3 — Legacy NA Summoner Name Fallback (wins.js logic)
      ===================================================== */

      if (!summoner) {
        logger.info(
          `[LoL Link] Legacy NA lookup by summoner name: ${parsed.gameName}`
        );

        summoner = await riotGet(
          `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(parsed.gameName)}`
        );

        logger.info('[LoL Link] Legacy NA summoner lookup succeeded');
      }

      const summonerData = summoner?.data;

        if (!summonerData?.id) {
        logger.error('[LoL Link] Summoner object missing id', {
            summonerData,
        });
        throw new Error('Failed to resolve summoner ID');
        }

        const summonerId = summonerData.id;

      /* =====================================================
         STEP 4 — League Entries
      ===================================================== */

      logger.info('[LoL Link] Fetching ranked data');

      const leagueRes = await riotGet(
        `https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`
      );

      const { soloRank, flexRank } = extractRanks(leagueRes.data);

      logger.info(
        `[LoL Link] Rank results — Solo: ${soloRank ?? 'unranked'}, Flex: ${flexRank ?? 'unranked'}`
      );

      /* =====================================================
         STEP 5 — DB Upsert
      ===================================================== */

      const existing = await api.get('league_player', {
        user_id: interaction.user.id,
      });

      const payload = {
        user_id: interaction.user.id,
        league_name: `${parsed.gameName}#${parsed.tagLine}`,
        discord_name: interaction.user.username,
        main_role: mainRole,
        lfg,
        puuid,
        solo_rank: soloRank || 'unranked',
        flex_rank: flexRank || null,
      };

      if (existing?.league_players?.length) {
        logger.info('[LoL Link] Updating existing league_player record');
        await api.put('league_player', payload);
      } else {
        logger.info('[LoL Link] Creating new league_player record');
        await api.post('league_player', {
          ...payload,
          league_admin: 0,
        });
      }

      /* =====================================================
         SUCCESS RESPONSE
      ===================================================== */

      const embed = new EmbedBuilder()
        .setTitle('✅ League Account Linked')
        .setColor('#2ecc71')
        .addFields(
          { name: 'Riot ID', value: `${parsed.gameName}#${parsed.tagLine}`, inline: true },
          { name: 'Region', value: 'NA', inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'Solo Rank', value: soloRank || 'Unranked', inline: true },
          { name: 'Flex Rank', value: flexRank || 'Unranked', inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      logger.error('[LoL Link] Fatal error', err);
      await interaction.editReply({
        content: 'Failed to link League account. Check logs for details.',
      });
    }
  }
}

/* =====================================================
   Registration
===================================================== */

function register_handlers(event_registry) {
  logger = event_registry.logger;
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
