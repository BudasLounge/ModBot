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

/* ---------------- Riot Endpoints ---------------- */

const RIOT_ACCOUNT_API =
  'https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/';

const PLATFORM_FALLBACKS = ['na1', 'br1', 'la1', 'la2', 'oc1'];

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
  return ['yes', 'y', 'true', '1'].includes(input.trim().toLowerCase());
}

/* ---------------- Rank Resolution ---------------- */

async function fetchRanksByPUUID(puuid) {
  for (const platform of PLATFORM_FALLBACKS) {
    try {
      logger.info(`[LoL Link] Trying PUUID rank lookup on ${platform}`);

      const summonerRes = await riotGet(
        `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
      );

      const summonerId = summonerRes.data.id;

      const leagueRes = await riotGet(
        `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`
      );

      logger.info(`[LoL Link] Rank data found via PUUID on ${platform}`);
      return leagueRes.data;
    } catch (err) {
      if ([403, 404].includes(err?.response?.status)) {
        logger.info(`[LoL Link] No PUUID summoner on ${platform}`);
        continue;
      }
      throw err;
    }
  }
  return null;
}

async function fetchRanksByLegacyName(name) {
  logger.info('[LoL Link] Falling back to legacy summoner name lookup (NA)');

  const summonerRes = await riotGet(
    `https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(name)}`
  );

  const summonerId = summonerRes.data.id;

  const leagueRes = await riotGet(
    `https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`
  );

  logger.info('[LoL Link] Rank data found via legacy summoner name');
  return leagueRes.data;
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

      /* ---------- Riot ID → PUUID ---------- */
      const accountRes = await riotGet(
        `${RIOT_ACCOUNT_API}${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
      );

      const { puuid } = accountRes.data;
      logger.info(`[LoL Link] PUUID resolved: ${puuid}`);

      /* ---------- Rank Resolution (Hybrid) ---------- */
      let rankEntries = await fetchRanksByPUUID(puuid);

      if (!rankEntries) {
        rankEntries = await fetchRanksByLegacyName(parsed.gameName);
      }

      let soloRank = null;
      let flexRank = null;

      for (const entry of rankEntries || []) {
        if (entry.queueType === 'RANKED_SOLO_5x5') {
          soloRank = `${entry.tier} ${entry.rank}`;
        }
        if (entry.queueType === 'RANKED_FLEX_SR') {
          flexRank = `${entry.tier} ${entry.rank}`;
        }
      }

      logger.info(`[LoL Link] Final ranks solo=${soloRank} flex=${flexRank}`);

      /* ---------- DB ---------- */
      const existing = await api.get('league_player', {
        user_id: interaction.user.id,
      });

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

        await api.put('league_player', {
          ...basePayload,
          solo_rank: soloRank ?? current.solo_rank,
          flex_rank: flexRank ?? current.flex_rank,
        });
      } else {
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
        .addFields(
          { name: 'Riot ID', value: `${parsed.gameName}#${parsed.tagLine}`, inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
          { name: 'Solo Rank', value: soloRank || '—', inline: true },
          { name: 'Flex Rank', value: flexRank || '—', inline: true },
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
