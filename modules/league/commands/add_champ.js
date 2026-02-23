const axios = require('axios');

const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const ROLE_ORDER = ['top', 'jg', 'mid', 'adc', 'sup'];

const ROLE_OVERRIDES = {
  'Aurelion Sol': { role_primary: 'mid', role_secondary: 'top' },
  'Nunu & Willump': { role_primary: 'jg', role_secondary: 'mid' }
};

function normalizeChampionName(name) {
  return (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function inferRolesFromTags(championName, tags) {
  if (ROLE_OVERRIDES[championName]) {
    return ROLE_OVERRIDES[championName];
  }

  const scores = {
    top: 0,
    jg: 0,
    mid: 0,
    adc: 0,
    sup: 0
  };

  if (tags.includes('Fighter')) {
    scores.top += 3;
    scores.jg += 2;
    scores.mid += 1;
  }

  if (tags.includes('Tank')) {
    scores.top += 3;
    scores.jg += 3;
    scores.sup += 1;
  }

  if (tags.includes('Assassin')) {
    scores.mid += 3;
    scores.jg += 3;
  }

  if (tags.includes('Mage')) {
    scores.mid += 4;
    scores.sup += 2;
    scores.top += 1;
  }

  if (tags.includes('Marksman')) {
    scores.adc += 5;
    scores.mid += 2;
  }

  if (tags.includes('Support')) {
    scores.sup += 5;
    scores.mid += 2;
  }

  const sorted = Object.keys(scores).sort((a, b) => {
    if (scores[b] !== scores[a]) {
      return scores[b] - scores[a];
    }
    return ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b);
  });

  const role_primary = sorted[0] || 'mid';
  const role_secondary = sorted.find((role) => role !== role_primary) || 'top';

  return { role_primary, role_secondary };
}

function inferDamageType(championData) {
  const attack = Number(championData?.info?.attack || 0);
  const magic = Number(championData?.info?.magic || 0);

  if (magic > attack) {
    return 'ap';
  }
  if (attack > magic) {
    return 'ad';
  }

  const tags = Array.isArray(championData?.tags) ? championData.tags : [];
  if (tags.includes('Mage') || tags.includes('Support')) {
    return 'ap';
  }

  return 'ad';
}

async function fetchLatestChampionDataset(logger) {
  logger.info('[new_champ] Fetching Data Dragon versions');
  const versionResponse = await axios.get(DDRAGON_VERSIONS_URL, { timeout: 15000 });
  const latestVersion = versionResponse?.data?.[0];
  if (!latestVersion) {
    throw new Error('Could not determine latest Data Dragon version');
  }

  logger.info('[new_champ] Fetching Data Dragon champion dataset', { version: latestVersion });
  const championsResponse = await axios.get(
    `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`,
    { timeout: 30000 }
  );

  const championMap = championsResponse?.data?.data;
  if (!championMap || typeof championMap !== 'object') {
    throw new Error('Champion dataset was empty or malformed');
  }

  return {
    version: latestVersion,
    champions: Object.values(championMap)
  };
}

module.exports = {
  name: 'new_champ',
  description: 'Sync champions from Data Dragon or add one manually',
  syntax: 'new_champ [sync|dryrun|preview|champion name]',
  num_args: 0,
  args_to_lower: false,
  needs_api: true,
  has_state: true,
  async execute(message, args, extra) {
    this.logger.info('[new_champ] Execute called', { userId: message.member?.id, argsLength: args.length });

    var state = extra.state;
    var api = extra.api;
    var inputValue = args.slice(1).join(' ').trim();
    const mode = (args[1] || '').toLowerCase();
    const isDryRun = mode === 'dryrun' || mode === 'preview';
    const shouldSyncFromDataDragon = !inputValue || mode === 'sync' || mode === 'auto' || isDryRun;

    if (shouldSyncFromDataDragon) {
      this.logger.info('[new_champ] Starting automatic Data Dragon sync', { isDryRun });
      message.channel.send({ content: isDryRun ? 'Running Data Dragon dry run (no DB changes). This can take a minute...' : 'Syncing champions from Data Dragon. This can take a minute...' });

      let dataset;
      try {
        dataset = await fetchLatestChampionDataset(this.logger);
      } catch (error) {
        this.logger.error('[new_champ] Failed fetching Data Dragon dataset', { error: error?.message || error });
        message.channel.send({ content: 'I could not fetch Data Dragon right now. Please try again later.' });
        return;
      }

      let existingList = [];
      try {
        const existingResponse = await api.get('league_champion', { _limit: 500 });
        existingList = Array.isArray(existingResponse?.league_champions) ? existingResponse.league_champions : [];
        this.logger.info('[new_champ] Loaded existing DB champions', { count: existingList.length });
      } catch (error) {
        this.logger.error('[new_champ] Failed loading existing champions from API', { error: error?.response || error?.message || error });
        message.channel.send({ content: 'I could not load existing champions from the API. Please try again later.' });
        return;
      }

      const existingByExact = new Map();
      const existingByNormalized = new Map();
      for (const existingChampion of existingList) {
        if (!existingChampion?.name) {
          continue;
        }
        existingByExact.set(existingChampion.name.toLowerCase(), existingChampion);
        existingByNormalized.set(normalizeChampionName(existingChampion.name), existingChampion);
      }

      let addedCount = 0;
      let alreadyExistsCount = 0;
      let normalizedMatchCount = 0;
      let failedCount = 0;
      const failedNames = [];
      let wouldAddCount = 0;
      const previewRows = [];

      for (const champion of dataset.champions) {
        const championName = (champion?.name || '').trim();
        if (!championName) {
          continue;
        }

        if (existingByExact.has(championName.toLowerCase())) {
          alreadyExistsCount += 1;
          continue;
        }

        const normalizedName = normalizeChampionName(championName);
        if (existingByNormalized.has(normalizedName)) {
          normalizedMatchCount += 1;
          this.logger.info('[new_champ] Found normalized name match (likely punctuation/casing mismatch)', {
            datadragonName: championName,
            dbName: existingByNormalized.get(normalizedName)?.name
          });
          continue;
        }

        const tags = Array.isArray(champion?.tags) ? champion.tags : [];
        const inferredRoles = inferRolesFromTags(championName, tags);
        const payload = {
          name: championName,
          role_primary: inferredRoles.role_primary,
          role_secondary: inferredRoles.role_secondary,
          ad_ap: inferDamageType(champion)
        };

        if (isDryRun) {
          wouldAddCount += 1;
          if (previewRows.length < 15) {
            previewRows.push(`${payload.name} | ${payload.role_primary} | ${payload.role_secondary} | ${payload.ad_ap}`);
          }
          continue;
        }

        try {
          const createResponse = await api.post('league_champion', payload);
          if (createResponse?.ok === true) {
            addedCount += 1;
          } else {
            failedCount += 1;
            failedNames.push(championName);
            this.logger.error('[new_champ] API returned non-ok response while creating champion', { champion: championName, response: createResponse });
          }
        } catch (error) {
          const serverError = error?.response?.data?.error || error?.response || error?.message || error;
          this.logger.error('[new_champ] Failed creating champion from Data Dragon', {
            champion: championName,
            payload,
            error: serverError
          });
          failedCount += 1;
          failedNames.push(championName);
        }
      }

      this.logger.info('[new_champ] Data Dragon sync finished', {
        version: dataset.version,
        isDryRun,
        totalFromDataDragon: dataset.champions.length,
        wouldAddCount,
        addedCount,
        alreadyExistsCount,
        normalizedMatchCount,
        failedCount
      });

      const failurePreview = failedNames.slice(0, 10).join(', ');
      let responseText = `${isDryRun ? 'Data Dragon dry run complete' : 'Data Dragon sync complete'} (v${dataset.version}).\n`;
      if (isDryRun) {
        responseText += `Would add: ${wouldAddCount}\n`;
      } else {
        responseText += `Added: ${addedCount}\n`;
      }
      responseText += `Already in DB (exact): ${alreadyExistsCount}\n`;
      responseText += `Matched by normalized name (special chars/case): ${normalizedMatchCount}\n`;
      responseText += `Failed: ${failedCount}`;
      if (isDryRun && previewRows.length) {
        responseText += `\nSample rows (name | role_primary | role_secondary | ad_ap):\n${previewRows.join('\n')}`;
      }
      if (failurePreview) {
        responseText += `\nFirst failures: ${failurePreview}`;
      }

      message.channel.send({ content: responseText });
      state.delete = true;
      return;
    }

    if (!inputValue) {
      this.logger.info('[new_champ] Missing input for current manual state', { stateKeys: Array.from(state.data.keys()) });
    }

    if (!state.data.has('name')) {
      if (inputValue) {
        state.add_data('name', 'STRING', inputValue);
        this.logger.info('[new_champ] Captured manual champion name', { name: state.data.get('name').data });
        message.channel.send({ content: 'Okay, the champion is named: ' + state.data.get('name').data + '. Next, put in the primary role.' });
      } else {
        message.channel.send({ content: 'To add a new champion manually, start with ,new_champ [champion name]. To auto-sync Data Dragon, run ,new_champ sync. For a no-write preview, run ,new_champ dryrun' });
      }
    } else if (!state.data.has('prim_role')) {
      if (inputValue) {
        state.add_data('prim_role', 'STRING', inputValue);
        this.logger.info('[new_champ] Captured manual primary role', { role: state.data.get('prim_role').data });
        message.channel.send({ content: state.data.get('name').data + ' has a primary role of: ' + state.data.get('prim_role').data + '. Next, put in the secondary role.' });
      } else {
        message.channel.send({ content: "To add the champion's primary role, enter ,new_champ [primary role]" });
      }
    } else if (!state.data.has('sec_role')) {
      if (inputValue) {
        state.add_data('sec_role', 'STRING', inputValue);
        this.logger.info('[new_champ] Captured manual secondary role', { role: state.data.get('sec_role').data });
        message.channel.send({ content: state.data.get('name').data + ' has a secondary role of: ' + state.data.get('sec_role').data + ". Next, put in if it's an ad or ap champion." });
      } else {
        message.channel.send({ content: "To add the champion's secondary role, enter ,new_champ [secondary role]" });
      }
    } else if (!state.data.has('ad_ap')) {
      if (inputValue) {
        const normalizedInput = inputValue.toLowerCase();
        if (normalizedInput === 'ad' || normalizedInput === 'ap') {
          state.add_data('ad_ap', 'STRING', normalizedInput);
          this.logger.info('[new_champ] Captured manual damage type', { adAp: state.data.get('ad_ap').data });
          message.channel.send({ content: state.data.get('name').data + ' is of damage type: ' + state.data.get('ad_ap').data });

          let respNewChamp;
          try {
            respNewChamp = await api.post('league_champion', {
              name: state.data.get('name').data,
              role_primary: state.data.get('prim_role').data,
              role_secondary: state.data.get('sec_role').data,
              ad_ap: state.data.get('ad_ap').data
            });
            this.logger.info('[new_champ] Manual API response received', { ok: respNewChamp?.ok === true });
          } catch (err) {
            this.logger.error('[new_champ] Failed to create champion manually', { error: err?.response || err?.message || err });
            message.channel.send({ content: 'Hit a snag... try again!' });
            return;
          }

          if (respNewChamp && respNewChamp.ok === true) {
            message.channel.send({ content: 'Successfully added a new champion!' });
          } else {
            message.channel.send({ content: 'Hit a snag... try again!' });
          }

          state.delete = true;
          this.logger.info('[new_champ] Manual state completed and scheduled for cleanup');
        } else {
          message.channel.send({ content: "Please enter ',new_champ ad' or ',new_champ ap' to select a damage type" });
        }
      } else {
        message.channel.send({ content: "To add the champion's damage type, enter ,new_champ [damage type (ad or ap only)]" });
      }
    }
  }
};
