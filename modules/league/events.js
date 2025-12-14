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

// NOTE: Keeping your existing endpoints (Summoner-V4 + League-V4 on NA1),
// since your codebase already uses them.
const RIOT_SUMMONER_BY_NAME_URL = 'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-name/';
const RIOT_LEAGUE_BY_SUMMONER_URL = 'https://na1.api.riotgames.com/lol/league/v4/entries/by-summoner/';

let logger;

// --- rate-limit handling (lightweight; uses 429 retry-after like wins.js pattern) ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function riotGet(url, config = {}, attempt = 0) {
  try {
    return await axios.get(url, {
      ...config,
      headers: {
        ...(config.headers || {}),
        "X-Riot-Token": RIOT_API_KEY,
      },
    });
  } catch (err) {
    const status = err?.response?.status;

    // Retry on 429 with Riot-provided retry-after (seconds)
    if (status === 429 && attempt < 5) {
      const retryAfterHeader = err.response.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader ? (parseInt(retryAfterHeader, 10) * 1000) : 2000;
      if (logger) logger.info(`Riot 429 hit. Waiting ${retryAfterMs}ms then retrying...`);
      await sleep(retryAfterMs);
      return riotGet(url, config, attempt + 1);
    }

    throw err;
  }
}

async function getLatestDDragonVersion() {
  try {
    const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    return response.data[0];
  } catch (e) {
    return '13.24.1'; // fallback
  }
}

function normalizeRole(input) {
  const v = (input || '').trim();
  if (!v) return 'Fill';
  // Keep it simple; don’t reject user input.
  return v;
}

async function onInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  // 3) button -> show modal
  if (interaction.isButton()) {
    if (interaction.customId !== 'LEAGUE_LINK_BUTTON') return;

    const modal = new ModalBuilder()
      .setCustomId('LEAGUE_LINK_MODAL')
      .setTitle('Link League Account');

    const nameInput = new TextInputBuilder()
      .setCustomId('summoner_name')
      .setLabel("Summoner Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const roleInput = new TextInputBuilder()
      .setCustomId('main_role')
      .setLabel("Main Role (Top, Jungle, Mid, ADC, Support)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const lfgInput = new TextInputBuilder()
      .setCustomId('lfg_status')
      .setLabel("LFG Status (e.g., 'Yes', 'No', 'Ranked')")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(lfgInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // modal submit
  if (interaction.isModalSubmit()) {
    if (interaction.customId !== 'LEAGUE_LINK_MODAL') return;

    await interaction.deferReply({ ephemeral: true });

    const summonerNameRaw = interaction.fields.getTextInputValue('summoner_name');
    const summonerName = (summonerNameRaw || '').trim();
    const mainRole = normalizeRole(interaction.fields.getTextInputValue('main_role'));
    const lfgStatus = (interaction.fields.getTextInputValue('lfg_status') || 'No').trim() || 'No';

    if (!summonerName) {
      await interaction.editReply({ content: 'Please provide a summoner name.' });
      return;
    }

    let dbAction = 'updated';

    try {
      // 5) Riot API: get puuid + encrypted summoner id (+ basic profile info)
      const summonerResp = await riotGet(`${RIOT_SUMMONER_BY_NAME_URL}${encodeURIComponent(summonerName)}`);
      const {
        puuid,
        id: encryptedSummonerId,
        name: officialName,
        summonerLevel,
        profileIconId,
      } = summonerResp.data;

      // 5) Riot API: get rank if available (solo preferred, else flex, else unranked)
      let rankString = "Unranked";
      try {
        const leagueResp = await riotGet(`${RIOT_LEAGUE_BY_SUMMONER_URL}${encryptedSummonerId}`);
        const solo = leagueResp.data.find((e) => e.queueType === 'RANKED_SOLO_5x5');
        const flex = leagueResp.data.find((e) => e.queueType === 'RANKED_FLEX_SR');
        const best = solo || flex;

        if (best) {
          rankString = `${best.tier} ${best.rank}`;
        }
      } catch (rankErr) {
        if (logger) logger.error(`Error fetching rank for ${summonerName}: ${rankErr?.message || rankErr}`);
        // keep "Unranked"
      }

      // 4) DB edits: existing -> put, new -> post
      const existingUser = await api.get("league_player", { user_id: interaction.user.id });

      const playerData = {
        league_name: officialName,
        user_id: interaction.user.id,
        discord_name: interaction.user.username,
        main_role: mainRole,
        rank: rankString,
        lfg: lfgStatus,
        puuid: puuid,
      };

      if (existingUser && existingUser.league_players && existingUser.league_players.length > 0) {
        await api.put("league_player", playerData);
        dbAction = 'updated';
      } else {
        await api.post("league_player", playerData);
        dbAction = 'created';
      }

      // 6) tell user they are connected + show basic card
      const version = await getLatestDDragonVersion();
      const iconUrl = `http://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;

      const embed = new EmbedBuilder()
        .setTitle("✅ League Account Connected")
        .setColor('#0099ff')
        .setThumbnail(iconUrl)
        .addFields(
          { name: 'Discord User', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Summoner', value: officialName, inline: true },
          { name: 'Rank', value: rankString, inline: true },

          { name: 'Main Role', value: mainRole, inline: true },
          { name: 'LFG', value: lfgStatus, inline: true },
          { name: 'Level', value: String(summonerLevel ?? '—'), inline: true },

          { name: 'DB Status', value: `Record ${dbAction}`, inline: true },
          { name: 'PUUID', value: puuid ? `Saved (${puuid.slice(0, 8)}…${puuid.slice(-6)})` : 'Not found', inline: true },
          { name: 'System', value: 'League ↔ Discord link active', inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      if (logger) logger.error("Error linking account: " + (error?.message || error));

      let errorMessage = "An error occurred while linking your account.";
      if (error?.response) {
        if (error.response.status === 404) errorMessage = "Summoner not found. Please check the name and try again.";
        else if (error.response.status === 403) errorMessage = "Riot API key invalid or expired.";
        else if (error.response.status === 429) errorMessage = "Riot rate limit hit. Please try again shortly.";
      }

      await interaction.editReply({ content: errorMessage });
    }
  }
}

function register_handlers(event_registry) {
  logger = event_registry.logger;
  event_registry.register('interactionCreate', onInteraction);
}

module.exports = register_handlers;
