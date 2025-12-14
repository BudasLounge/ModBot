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

const RIOT_ACCOUNT_API =
  'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/';
const RIOT_SUMMONER_BY_PUUID =
  'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/';
const RIOT_LEAGUE_BY_SUMMONER =
  'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/';

const http = axios.create({
  headers: { 'X-Riot-Token': RIOT_API_KEY },
});

let logger;

/* ---------------- Utilities ---------------- */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  return gameName && tagLine
    ? { gameName: gameName.trim(), tagLine: tagLine.trim() }
    : null;
}

function normalizeRole(input) {
  if (!input) return 'fill';
  const map = {
    top: 'top',
    jungle: 'jg',
    jung: 'jg',
    jg: 'jg',
    mid: 'mid',
    adc: 'adc',
    bot: 'adc',
    sup: 'sup',
    support: 'sup',
  };
  return map[input.trim().toLowerCase()] || 'fill';
}

function parseLFG(input) {
  if (!input) return false;

  return ['yes', 'y', 'true', '1'].includes(
    input.trim().toLowerCase()
  );
}


/* ---------------- Interaction Handler ---------------- */

async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  if (interaction.isButton()) {
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

    logger.info(`[LoL Link] Button clicked by ${interaction.user.id}`);

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
          .setStyle(TextInputStyle.Short),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('lfg_status')
          .setLabel('Looking for group? (yes / no)')
          .setStyle(TextInputStyle.Short),
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

      const parsed = parseRiotId(
        interaction.fields.getTextInputValue('riot_id')
      );

      if (!parsed) {
        logger.info('[LoL Link] Invalid Riot ID format');
        await interaction.editReply({
          content: 'Please enter your Riot ID as **Name#TAG**.',
        });
        return;
      }

      const mainRole = normalizeRole(
        interaction.fields.getTextInputValue('main_role')
      );
      const lfg = parseLFG(
        interaction.fields.getTextInputValue('lfg_status')
      );

      logger.info(`[LoL Link] Fetching Riot account for ${parsed.gameName}#${parsed.tagLine}`);

      const accountRes = await riotGet(
        `${RIOT_ACCOUNT_API}${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
      );

      const { puuid } = accountRes.data;

      logger.info(`[LoL Link] PUUID resolved: ${puuid}`);

      const summonerRes = await riotGet(
        `${RIOT_SUMMONER_BY_PUUID}${puuid}`
      );

      const { id: summonerId, profileIconId } = summonerRes.data;

      let soloRank = null;
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

        logger.info(`[LoL Link] Ranks resolved solo=${soloRank} flex=${flexRank}`);
      } catch {
        logger.info('[LoL Link] No rank data available');
      }

      const existing = await api.get('league_player', {
        user_id: interaction.user.id,
      });

      logger.info(`[LoL Link] Existing DB rows: ${existing?.league_players?.length || 0}`);

      const basePayload = {
        user_id: interaction.user.id,
        league_name: `${parsed.gameName}#${parsed.tagLine}`,
        discord_name: interaction.user.username,
        main_role: mainRole,
        lfg,
        puuid,
      };

      if (existing?.league_players?.length) {
        const current = existing.league_players[0];

        const updatePayload = {
          ...basePayload,
          solo_rank: soloRank ?? current.solo_rank,
          flex_rank: flexRank ?? current.flex_rank,
          league_admin: current.league_admin,
        };

        logger.info('[LoL Link] Updating existing player', updatePayload);
        await api.put('league_player', updatePayload);
      } else {
        logger.info('[LoL Link] Creating new player record');
        await api.post('league_player', {
          ...basePayload,
          solo_rank: soloRank || 'not set yet',
          flex_rank: flexRank,
          league_admin: 0,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ League Account Linked')
        .setColor('#2ecc71')
        .setThumbnail(
          `http://ddragon.leagueoflegends.com/cdn/13.24.1/img/profileicon/${profileIconId}.png`
        )
        .addFields(
          { name: 'Riot ID', value: `${parsed.gameName}#${parsed.tagLine}`, inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
          { name: 'Solo Rank', value: soloRank || 'unchanged', inline: true },
          { name: 'Flex Rank', value: flexRank || 'unchanged', inline: true },
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

/* ---------------- Register ---------------- */

function register_handlers(event_registry) {
  logger = event_registry.logger;
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
