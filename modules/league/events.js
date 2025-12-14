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

/**
 * LoL "platform routing values" (NOT regional routing like americas/europe/asia).
 * Expanded so non-Americas accounts can resolve ranks.
 */
const ALL_PLATFORMS = [
  'na1', 'br1', 'la1', 'la2', 'oc1',
  'euw1', 'eun1', 'tr1', 'ru',
  'kr', 'jp1',
  // SEA shard platforms (Riot has been moving some traffic here; harmless to try)
  'ph2', 'sg2', 'th2', 'tw2', 'vn2',
];

const PLATFORM_ALIASES = {
  na: 'na1',
  br: 'br1',
  lan: 'la1',
  las: 'la2',
  oce: 'oc1',
  euw: 'euw1',
  eune: 'eun1',
  tr: 'tr1',
  ru: 'ru',
  kr: 'kr',
  jp: 'jp1',
  ph: 'ph2',
  sg: 'sg2',
  th: 'th2',
  tw: 'tw2',
  vn: 'vn2',
};

const http = axios.create({
  headers: { 'X-Riot-Token': RIOT_API_KEY },
  timeout: 15000,
});

let logger;

/* ---------------- Utilities ---------------- */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isTransientStatus(status) {
  return [500, 502, 503, 504].includes(status);
}

/**
 * Riot GET wrapper with:
 * - 429 retry-after handling
 * - transient 5xx backoff retries
 */
async function riotGet(url, attempt = 0) {
  try {
    return await http.get(url);
  } catch (err) {
    const status = err?.response?.status;

    // Rate limit
    if (status === 429 && attempt < 6) {
      const retryAfterHeader = err.response.headers?.['retry-after'];
      const retryAfterMs = Number.isFinite(parseInt(retryAfterHeader, 10))
        ? parseInt(retryAfterHeader, 10) * 1000
        : 2000 + attempt * 750;

      logger?.info?.(`[LoL Link] 429 rate limit, sleeping ${retryAfterMs}ms (attempt ${attempt + 1})`);
      await sleep(retryAfterMs);
      return riotGet(url, attempt + 1);
    }

    // Transient Riot / network errors
    if ((isTransientStatus(status) || !status) && attempt < 4) {
      const backoff = 1000 * Math.pow(2, attempt);
      logger?.info?.(`[LoL Link] transient error (${status ?? 'no-status'}), retrying in ${backoff}ms (attempt ${attempt + 1})`);
      await sleep(backoff);
      return riotGet(url, attempt + 1);
    }

    throw err;
  }
}

function parseRiotId(input) {
  if (!input) return null;
  // Allow "Name#TAG" with extra spaces around #
  const cleaned = input.trim();
  const hashIndex = cleaned.lastIndexOf('#');
  if (hashIndex === -1) return null;

  const gameName = cleaned.slice(0, hashIndex).trim();
  const tagLine = cleaned.slice(hashIndex + 1).trim();

  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

function normalizeRole(input) {
  if (!input) return 'fill';
  const map = {
    top: 'top',
    jungle: 'jg',
    jung: 'jg',
    jg: 'jg',
    mid: 'mid',
    middle: 'mid',
    adc: 'adc',
    bot: 'adc',
    bottom: 'adc',
    sup: 'sup',
    support: 'sup',
    supp: 'sup',
  };
  return map[input.trim().toLowerCase()] || 'fill';
}

function parseLFG(input) {
  if (!input) return false;
  return ['yes', 'y', 'true', '1'].includes(input.trim().toLowerCase());
}

function normalizePlatformInput(input) {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  if (ALL_PLATFORMS.includes(v)) return v;
  if (PLATFORM_ALIASES[v]) return PLATFORM_ALIASES[v];
  return null;
}

/* ---------------- Rank Resolution ---------------- */

async function fetchRanksByPUUID(puuid, platforms) {
  for (const platform of platforms) {
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
      return { entries: leagueRes.data, platformUsed: platform };
    } catch (err) {
      const status = err?.response?.status;

      // "Not found here" — try next platform
      if ([403, 404].includes(status)) {
        logger.info(`[LoL Link] No PUUID summoner on ${platform} (status ${status})`);
        continue;
      }

      // Otherwise, real error
      throw err;
    }
  }
  return null;
}

async function fetchRanksByLegacyName(name, platform = 'na1') {
  logger.info(`[LoL Link] Falling back to legacy summoner name lookup (${platform})`);

  const summonerRes = await riotGet(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(name)}`
  );

  const summonerId = summonerRes.data.id;

  const leagueRes = await riotGet(
    `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`
  );

  logger.info('[LoL Link] Rank data found via legacy summoner name');
  return leagueRes.data;
}

function extractRanks(rankEntries) {
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

  return { soloRank, flexRank };
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
          .setCustomId('platform')
          .setLabel('Region (optional: na1, euw1, kr, etc)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
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
        await interaction.editReply({
          content: 'Bot misconfiguration: RIOT_API_KEY is not set.',
        });
        return;
      }

      const parsed = parseRiotId(interaction.fields.getTextInputValue('riot_id'));
      if (!parsed) {
        await interaction.editReply({
          content: 'Please enter your Riot ID as **Name#TAG**.',
        });
        return;
      }

      const preferredPlatform = normalizePlatformInput(
        interaction.fields.getTextInputValue('platform')
      );

      const mainRole = normalizeRole(
        interaction.fields.getTextInputValue('main_role')
      );
      const lfg = parseLFG(
        interaction.fields.getTextInputValue('lfg_status')
      );

      /* ---------- Riot ID → PUUID ---------- */
      let accountRes;
      try {
        accountRes = await riotGet(
          `${RIOT_ACCOUNT_API}${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`
        );
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
          await interaction.editReply({
            content: `Couldn't find that Riot ID (**${parsed.gameName}#${parsed.tagLine}**). Double-check spelling + tag.`,
          });
          return;
        }
        if (status === 401 || status === 403) {
          await interaction.editReply({
            content: 'Riot API authentication failed (check API key permissions / expiry).',
          });
          return;
        }
        throw err;
      }

      const { puuid } = accountRes.data;
      logger.info(`[LoL Link] PUUID resolved: ${puuid}`);

      /* ---------- Rank Resolution (Hybrid) ---------- */
      const platformsToTry = preferredPlatform
        ? [preferredPlatform, ...ALL_PLATFORMS.filter(p => p !== preferredPlatform)]
        : ALL_PLATFORMS;

      let rankEntries = null;
      let platformUsed = null;

      const byPuuid = await fetchRanksByPUUID(puuid, platformsToTry);
      if (byPuuid) {
        rankEntries = byPuuid.entries;
        platformUsed = byPuuid.platformUsed;
      } else {
        // Legacy fallback: try preferred platform first (if supplied), then NA
        const legacyPlatform = preferredPlatform || 'na1';
        try {
          rankEntries = await fetchRanksByLegacyName(parsed.gameName, legacyPlatform);
          platformUsed = legacyPlatform;
        } catch (err) {
          // If legacy also fails, keep ranks null — don't block linking entirely
          logger.info('[LoL Link] Legacy name lookup failed; continuing without ranks');
        }
      }

      const { soloRank, flexRank } = extractRanks(rankEntries);

      logger.info(
        `[LoL Link] Final ranks solo=${soloRank} flex=${flexRank} platform=${platformUsed ?? 'unknown'}`
      );

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
          { name: 'Region', value: preferredPlatform || platformUsed || 'Unknown', inline: true },
          { name: 'Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfg ? 'Yes' : 'No', inline: true },
          { name: 'Solo Rank', value: soloRank || '—', inline: true },
          { name: 'Flex Rank', value: flexRank || '—', inline: true },
        );

      // If we couldn't find platform-based data, give the user a hint without failing the link.
      if (!platformUsed && !preferredPlatform) {
        embed.setFooter({
          text: 'Ranks not found. Re-run and fill Region (e.g., euw1 / kr / na1) to improve rank lookup.',
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('[LoL Link] Fatal error', err);

      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        await interaction.editReply({
          content: 'Riot API auth failed (key expired/invalid or missing permissions).',
        });
        return;
      }

      await interaction.editReply({
        content: 'Failed to link League account due to an unexpected error. Check logs for details.',
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
