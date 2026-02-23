const axios = require('axios');

const MERAKI_CHAMPIONS_INDEX_URL = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions/';
const ROLE_ORDER = ['top', 'jg', 'mid', 'adc', 'sup'];

function normalizeChampionName(name) {
  return (name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function inferRolesFromTags(tags) {
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

function inferRolesFromPositions(positions) {
  const normalizedPositions = Array.isArray(positions) ? positions : [];
  const mapped = normalizedPositions
    .map((position) => {
      switch (position) {
      case 'TOP': return 'top';
      case 'JUNGLE': return 'jg';
      case 'MIDDLE': return 'mid';
      case 'BOTTOM': return 'adc';
      case 'UTILITY': return 'sup';
      default: return null;
      }
    })
    .filter(Boolean);

  const unique = Array.from(new Set(mapped));
  if (!unique.length) {
    return null;
  }

  const sorted = unique.sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  const role_primary = sorted[0] || 'mid';
  const role_secondary = sorted.find((role) => role !== role_primary) || 'top';
  return { role_primary, role_secondary };
}

function inferDamageType(championData) {
  const adaptiveType = (championData?.adaptiveType || '').toUpperCase();
  if (adaptiveType === 'MAGIC_DAMAGE') {
    return 'ap';
  }
  if (adaptiveType === 'PHYSICAL_DAMAGE') {
    return 'ad';
  }

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

function buildChampionJsonUrl(championFileName) {
  return `${MERAKI_CHAMPIONS_INDEX_URL}${championFileName}`;
}

function chunkLines(lines, maxCharsPerChunk) {
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    const nextValue = currentChunk ? `${currentChunk}\n${line}` : line;
    if (nextValue.length > maxCharsPerChunk) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
    } else {
      currentChunk = nextValue;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function fetchLatestChampionDataset(logger) {
  logger.info('[new_champ] Fetching Meraki champion index');
  const indexResponse = await axios.get(MERAKI_CHAMPIONS_INDEX_URL, { timeout: 30000 });
  const indexHtml = String(indexResponse?.data || '');

  const fileMatches = Array.from(indexHtml.matchAll(/href="([A-Za-z0-9]+\.json)"/g));
  const championFiles = Array.from(new Set(fileMatches.map((m) => m[1])));
  if (!championFiles.length) {
    throw new Error('Could not parse champion files from Meraki index');
  }

  logger.info('[new_champ] Fetching Meraki champion JSON files', { count: championFiles.length });
  const champions = [];
  const batchSize = 12;

  for (let i = 0; i < championFiles.length; i += batchSize) {
    const batch = championFiles.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (fileName) => {
        const url = buildChampionJsonUrl(fileName);
        try {
          const championResponse = await axios.get(url, { timeout: 30000 });
          const championData = championResponse?.data;
          if (!championData || !championData.name) {
            logger.info('[new_champ] Skipping malformed Meraki champion payload', { fileName });
            return null;
          }
          return {
            ...championData,
            _sourceUrl: url,
            _sourceFile: fileName
          };
        } catch (error) {
          logger.error('[new_champ] Failed to fetch Meraki champion file', { fileName, error: error?.message || error });
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (!result) {
        continue;
      }
      champions.push(result);
    }
  }

  return {
    source: 'meraki-latest',
    champions
  };
}

module.exports = {
  name: 'new_champ',
  description: 'Sync champions from source or add one manually',
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
    const shouldSyncFromSource = !inputValue || mode === 'sync' || mode === 'auto' || isDryRun;

    if (shouldSyncFromSource) {
      this.logger.info('[new_champ] Starting automatic Meraki sync', { isDryRun });
      message.channel.send({ content: isDryRun ? 'Running Meraki dry run (no DB changes). This can take a minute...' : 'Syncing champions from Meraki. This can take a minute...' });

      let dataset;
      try {
        dataset = await fetchLatestChampionDataset(this.logger);
      } catch (error) {
        this.logger.error('[new_champ] Failed fetching Meraki dataset', { error: error?.message || error });
        message.channel.send({ content: 'I could not fetch Meraki right now. Please try again later.' });
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
      const wouldAddChampionLinks = [];

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
            merakiName: championName,
            dbName: existingByNormalized.get(normalizedName)?.name
          });
          continue;
        }

        const inferredFromPositions = inferRolesFromPositions(champion?.positions);
        const tags = Array.isArray(champion?.tags) ? champion.tags : [];
        const inferredRoles = inferredFromPositions || inferRolesFromTags(tags);
        const championJsonUrl = champion?._sourceUrl || buildChampionJsonUrl(champion?._sourceFile || `${champion?.key || championName}.json`);
        const payload = {
          name: championName,
          role_primary: inferredRoles.role_primary,
          role_secondary: inferredRoles.role_secondary,
          ad_ap: inferDamageType(champion)
        };

        if (isDryRun) {
          wouldAddCount += 1;
          wouldAddChampionLinks.push(`${payload.name}: ${championJsonUrl}`);
          if (previewRows.length < 15) {
            previewRows.push(`${payload.name} | ${payload.role_primary} | ${payload.role_secondary} | ${payload.ad_ap} | ${championJsonUrl}`);
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
          this.logger.error('[new_champ] Failed creating champion from source dataset', {
            champion: championName,
            payload,
            error: serverError
          });
          failedCount += 1;
          failedNames.push(championName);
        }
      }

      this.logger.info('[new_champ] Source sync finished', {
        source: dataset.source,
        isDryRun,
        totalFromMeraki: dataset.champions.length,
        wouldAddCount,
        addedCount,
        alreadyExistsCount,
        normalizedMatchCount,
        failedCount
      });

      const failurePreview = failedNames.slice(0, 10).join(', ');
      let responseText = `${isDryRun ? 'Meraki dry run complete' : 'Meraki sync complete'} (${dataset.source}).\n`;
      if (isDryRun) {
        responseText += `Would add: ${wouldAddCount}\n`;
      } else {
        responseText += `Added: ${addedCount}\n`;
      }
      responseText += `Already in DB (exact): ${alreadyExistsCount}\n`;
      responseText += `Matched by normalized name (special chars/case): ${normalizedMatchCount}\n`;
      responseText += `Failed: ${failedCount}`;
      if (isDryRun && previewRows.length) {
        responseText += `\nSample rows (name | role_primary | role_secondary | ad_ap | meraki_json):\n${previewRows.join('\n')}`;
      }
      if (failurePreview) {
        responseText += `\nFirst failures: ${failurePreview}`;
      }

      message.channel.send({ content: responseText });

      if (isDryRun && wouldAddChampionLinks.length) {
        this.logger.info('[new_champ] Sending dry run Meraki links', { linkCount: wouldAddChampionLinks.length });
        const linkChunks = chunkLines(wouldAddChampionLinks, 1800);
        for (let i = 0; i < linkChunks.length; i++) {
          const header = i === 0 ? 'Meraki JSON links for champions that would be added:\n' : '';
          await message.channel.send({ content: `${header}${linkChunks[i]}` });
        }
      }

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
        message.channel.send({ content: 'To add a new champion manually, start with ,new_champ [champion name]. To auto-sync Meraki, run ,new_champ sync. For a no-write preview, run ,new_champ dryrun' });
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
