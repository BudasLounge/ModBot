const axios = require('axios');
const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

require('dotenv').config();

var ApiClient = require("../../core/js/APIClient.js");
var api = new ApiClient();

const RIOT_API_KEY = process.env.RIOT_API_KEY;

/* ---------------- Riot Endpoints (Modern) ----------------
   Riot Account API is regional routing (americas/europe/asia).
   Summoner/League APIs are platform routing (na1/euw1/etc).
*/
const RIOT_ACCOUNT_API =
  'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/';
const RIOT_SUMMONER_BY_PUUID =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/';
const RIOT_LEAGUE_BY_SUMMONER =
  'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/';

// Create axios instance like wins.js style
const http = axios.create({
  headers: { 'X-Riot-Token': RIOT_API_KEY },
});

let logger;

/* ---------------- Utilities ---------------- */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function riotGet(url, attempt = 0) {
  try {
    return await http.get(url);
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

function parseRiotId(input) {
  if (!input || !input.includes('#')) return null;
  const [gameName, tagLine] = input.split('#');
  if (!gameName || !tagLine) return null;
  return { gameName: gameName.trim(), tagLine: tagLine.trim() };
}

function normalizeRole(input) {
  if (!input) return 'fill';
  const v = input.trim().toLowerCase();
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
  return map[v] || 'fill';
}

function parseLFG(input) {
  if (!input) return 0;
  return ['yes', 'y', 'true', '1'].includes(input.trim().toLowerCase()) ? 1 : 0;
}

/* ---------------- Interaction Handler ---------------- */

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
      if (!RIOT_API_KEY) {
        await interaction.editReply({
          content: 'Server is missing RIOT_API_KEY. Ask an admin to configure it.',
        });
        return;
      }

      const riotIdInput = interaction.fields.getTextInputValue('riot_id');
      const parsed = parseRiotId(riotIdInput);

      if (!parsed) {
        await interaction.editReply({
          content: 'Please enter your Riot ID in the format **Name#TAG**.',
        });
        return;
      }

      const mainRole = normalizeRole(
        interaction.fields.getTextInputValue('main_role')
      );
      const lfg = parseLFG(
        interaction.fields.getTextInputValue('lfg_status')
      );

      /* ---------- Riot ID → PUUID ---------- */
      const accountRes = await riotGet(
        `${RIOT_ACCOUNT_API}${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
      );

      const { puuid, gameName, tagLine } = accountRes.data;

      /* ---------- PUUID → Summoner (platform endpoint) ---------- */
      const summonerRes = await riotGet(
        `${RIOT_SUMMONER_BY_PUUID}${puuid}`
      );

      const {
        id: summonerId,
        profileIconId,
      } = summonerRes.data;

      /* ---------- Ranks (queue-aware) ---------- */
      let soloRank = 'not set yet';
      let flexRank = null;

      try {
        const leagueRes = await riotGet(
          `${RIOT_LEAGUE_BY_SUMMONER}${summonerId}`
        );

        for (const entry of leagueRes.data) {
          if (entry.queueType === 'RANKED_SOLO_5x5') {
            soloRank = `${entry.tier} ${entry.rank}`;
          }
          if (entry.queueType === 'RANKED_FLEX_SR') {
            flexRank = `${entry.tier} ${entry.rank}`;
          }
        }
      } catch (e) {
        logger?.warn('Rank fetch failed; continuing without ranks');
      }

      /* ---------- DB Write (fixed syntax here) ---------- */
      const payload = {
        user_id: interaction.user.id,
        league_name: `${gameName}#${tagLine}`,
        discord_name: interaction.user.username,
        main_role: mainRole,
        solo_rank: soloRank,
        flex_rank: flexRank,
        lfg: lfg,
        puuid: puuid,
        league_admin: 0,
      };

      const existing = await api.get('league_player', {
        user_id: interaction.user.id, // ✅ FIXED
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
          { name: 'Riot ID', value: `${gameName}#${tagLine}`, inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
          { name: 'Solo Rank', value: soloRank || '—', inline: true },
          { name: 'Flex Rank', value: flexRank || '—', inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger?.error(err);

      const status = err?.response?.status;
      const msg =
        status === 404
          ? 'Riot account not found. Check your Riot ID.'
          : status === 403
            ? 'Riot API rejected the request (check key / permissions / routing).'
            : 'Failed to link League account. Please try again later.';

      await interaction.editReply({ content: msg });
    }
  }
}

/* ---------------- Register ---------------- */

function register_handlers(event_registry) {
  logger = event_registry.logger;
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
