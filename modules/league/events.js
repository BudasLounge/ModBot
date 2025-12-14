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
   Riot HTTP (IDENTICAL BEHAVIOR TO wins.js)
===================================================== */

const http = axios.create({
  headers: {
    "X-Riot-Token": RIOT_API_KEY,
  },
  timeout: 15000,
});

const SUMMONER_BY_NAME_URL =
  "https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/";
const LEAGUE_BY_SUMMONER_URL =
  "https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/";

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

  for (const entry of entries) {
    if (entry.queueType === 'RANKED_SOLO_5x5') {
      soloRank = `${entry.tier} ${entry.rank}`;
    }
    if (entry.queueType === 'RANKED_FLEX_SR') {
      flexRank = `${entry.tier} ${entry.rank}`;
    }
  }

  return { soloRank, flexRank };
}

/* =====================================================
   Interaction Handler
===================================================== */

async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  /* ---------- Button ---------- */
  if (interaction.isButton()) {
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

    const modal = new ModalBuilder()
      .setCustomId('LEAGUE_LINK_MODAL')
      .setTitle('Link League Account (NA)');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('summoner_name')
          .setLabel('League Summoner Name (NA)')
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

      const summonerName =
        interaction.fields.getTextInputValue('summoner_name').trim();

      const mainRole = normalizeRole(
        interaction.fields.getTextInputValue('main_role')
      );
      const lfg = parseLFG(
        interaction.fields.getTextInputValue('lfg_status')
      );

      /* =====================================================
         STEP 1 — Resolve Summoner (IDENTICAL TO wins.js)
      ===================================================== */

      logger.info(`[LoL Link] Resolving summoner: ${summonerName}`);

      let summonerRes;
      try {
        summonerRes = await http.get(
          `${SUMMONER_BY_NAME_URL}${encodeURIComponent(summonerName)}`
        );
      } catch (err) {
        logger.error('[LoL Link] Summoner lookup failed', err?.response?.data || err);
        await interaction.editReply({
          content:
            'Unable to find that summoner on NA. Please check spelling and try again.',
        });
        return;
      }

      const summoner = summonerRes.data;

      if (!summoner?.id) {
        logger.error('[LoL Link] Invalid summoner response', summoner);
        await interaction.editReply({
          content:
            'Riot returned incomplete summoner data. Please try again later.',
        });
        return;
      }

      logger.info('[LoL Link] Summoner resolved', {
        id: summoner.id,
        puuid: summoner.puuid,
      });

      /* =====================================================
         STEP 2 — Ranked Data (IDENTICAL TO wins.js)
      ===================================================== */

      const leagueRes = await http.get(
        `${LEAGUE_BY_SUMMONER_URL}${summoner.id}`
      );

      const { soloRank, flexRank } = extractRanks(leagueRes.data);

      /* =====================================================
         STEP 3 — Store Link Data
      ===================================================== */

      const payload = {
        user_id: interaction.user.id,
        league_name: summonerName,
        discord_name: interaction.user.username,
        puuid: summoner.puuid,
        main_role: mainRole,
        lfg,
        solo_rank: soloRank || 'unranked',
        flex_rank: flexRank || null,
      };

      logger.info('[LoL Link] Saving league_player record', payload);

      await api.post('league_player', payload);

      /* =====================================================
         SUCCESS
      ===================================================== */

      const embed = new EmbedBuilder()
        .setTitle('✅ League Account Linked')
        .setColor('#2ecc71')
        .addFields(
          { name: 'Summoner', value: summonerName, inline: true },
          { name: 'Region', value: 'NA', inline: true },
          { name: 'Solo Rank', value: soloRank || 'Unranked', inline: true },
          { name: 'Flex Rank', value: flexRank || 'Unranked', inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      logger.error('[LoL Link] Fatal error', err);
      await interaction.editReply({
        content:
          'An unexpected error occurred while linking your League account.',
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
