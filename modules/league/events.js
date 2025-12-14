var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

const axios = require('axios');
require('dotenv').config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;

const RIOT_SUMMONER_BY_NAME_URL =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_LEAGUE_BY_SUMMONER_URL =
  'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/';

let logger;

/* -------------------- Utilities -------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function riotGet(url, attempt = 0) {
  try {
    return await axios.get(url, {
      headers: { "X-Riot-Token": RIOT_API_KEY },
    });
  } catch (err) {
    if (err?.response?.status === 429 && attempt < 5) {
      const retryAfter =
        parseInt(err.response.headers?.['retry-after'], 10) * 1000 || 2000;
      await sleep(retryAfter);
      return riotGet(url, attempt + 1);
    }
    throw err;
  }
}

function normalizeRole(input) {
  if (!input) return 'fill';

  const value = input.trim().toLowerCase();
  const map = {
    top: 'top',
    jungle: 'jg',
    jung: 'jg',
    jg: 'jg',
    jgl: 'jg',
    mid: 'mid',
    middle: 'mid',
    midlane: 'mid',
    adc: 'adc',
    bot: 'adc',
    carry: 'adc',
    marksman: 'adc',
    sup: 'sup',
    support: 'sup',
    supp: 'sup',
  };

  return map[value] || 'fill';
}

function parseLFG(input) {
  if (!input) return 0;
  return ['yes', 'y', 'true', '1'].includes(input.trim().toLowerCase()) ? 1 : 0;
}

/* -------------------- Interaction Handler -------------------- */

async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  /* ---------- Button → Modal ---------- */
  if (interaction.isButton()) {
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

    const modal = new ModalBuilder()
      .setCustomId('LEAGUE_LINK_MODAL')
      .setTitle('Link League Account');

    const summonerInput = new TextInputBuilder()
      .setCustomId('summoner_name')
      .setLabel('Summoner Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const roleInput = new TextInputBuilder()
      .setCustomId('main_role')
      .setLabel('Main Role (top, jg, mid, adc, sup)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const lfgInput = new TextInputBuilder()
      .setCustomId('lfg_status')
      .setLabel('Looking For Group? (yes/no)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(summonerInput),
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(lfgInput),
    );

    await interaction.showModal(modal);
    return;
  }

  /* ---------- Modal Submit ---------- */
  if (interaction.isModalSubmit()) {
    if (interaction.customId !== 'LEAGUE_LINK_MODAL') return;

    await interaction.deferReply({ ephemeral: true });

    const summonerName = interaction.fields
      .getTextInputValue('summoner_name')
      .trim();

    const mainRole = normalizeRole(
      interaction.fields.getTextInputValue('main_role'),
    );

    const lfg = parseLFG(
      interaction.fields.getTextInputValue('lfg_status'),
    );

    try {
      /* ---------- Riot: Summoner ---------- */
      const summonerRes = await riotGet(
        `${RIOT_SUMMONER_BY_NAME_URL}${encodeURIComponent(summonerName)}`
      );

      const {
        puuid,
        id: summonerId,
        name: officialName,
        profileIconId,
      } = summonerRes.data;

      /* ---------- Riot: Ranks ---------- */
      let soloRank = 'not set yet';
      let flexRank = null;

      try {
        const leagueRes = await riotGet(
          `${RIOT_LEAGUE_BY_SUMMONER_URL}${summonerId}`
        );

        for (const entry of leagueRes.data) {
          if (entry.queueType === 'RANKED_SOLO_5x5') {
            soloRank = `${entry.tier} ${entry.rank}`;
          }
          if (entry.queueType === 'RANKED_FLEX_SR') {
            flexRank = `${entry.tier} ${entry.rank}`;
          }
        }
      } catch (rankErr) {
        logger?.warn('Rank fetch failed, continuing without ranks');
      }

      /* ---------- DB Write ---------- */
      const payload = {
        user_id: interaction.user.id,
        league_name: officialName,
        discord_name: interaction.user.username,
        main_role: mainRole,
        solo_rank: soloRank,
        flex_rank: flexRank,
        lfg: lfg,
        puuid: puuid,
        league_admin: 0,
      };

      const existing = await api.get('league_player', {
        user_id: interaction.user.id,
      });

      if (existing?.league_players?.length) {
        await api.put('league_player', payload);
      } else {
        await api.post('league_player', payload);
      }

      /* ---------- Confirmation ---------- */
      const embed = new EmbedBuilder()
        .setTitle('✅ League Account Linked')
        .setColor('#2ecc71')
        .setThumbnail(
          `http://ddragon.leagueoflegends.com/cdn/13.24.1/img/profileicon/${profileIconId}.png`
        )
        .addFields(
          { name: 'Summoner', value: officialName, inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
          { name: 'Solo Rank', value: soloRank || '—', inline: true },
          { name: 'Flex Rank', value: flexRank || '—', inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger?.error(err);
      await interaction.editReply({
        content:
          err?.response?.status === 404
            ? 'Summoner not found. Please check the name.'
            : 'Failed to link League account. Please try again later.',
      });
    }
  }
}

/* -------------------- Register -------------------- */

function register_handlers(event_registry) {
  logger = event_registry.logger;
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
