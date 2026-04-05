require('dotenv').config();

const {
  MATCH_TAG_PREFIX,
  parseMatchTagLine,
  normalizeToken,
  normalizeManualKeywords,
} = require('../lib/match_tags.js');

const MATCH_WEBHOOK_CHANNEL = process.env.MATCH_WEBHOOK_CHANNEL;

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 2000;
const DEFAULT_RESULT_LIMIT = 10;
const MAX_RESULT_LIMIT = 25;
const PAGE_FETCH_LIMIT = 100;
const HELP_ALIASES = new Set(['help', '--help', '-h', '?']);

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function splitForDiscord(content, maxLength = 1900) {
  if (!content || content.length <= maxLength) return [content || ''];

  const chunks = [];
  let remaining = content;

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < Math.floor(maxLength * 0.4)) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function normalizeSnowflake(value) {
  const token = String(value || '').trim();
  return /^\d{15,22}$/.test(token) ? token : null;
}

function createBaseQuery() {
  return {
    players: [],
    champions: [],
    keywords: [],
    terms: [],
    result: null,
    queue: null,
    mode: null,
    uploader: null,
    uploaderId: null,
    gameId: null,
    date: null,
    resultLimit: DEFAULT_RESULT_LIMIT,
    scanLimit: DEFAULT_SCAN_LIMIT,
    _help: false,
  };
}

function parseTagFromMessageContent(content) {
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseMatchTagLine(line);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeResultFilter(value) {
  const token = normalizeToken(value, { maxLength: 12 });
  if (token.includes('win')) return 'win';
  if (token.includes('loss')) return 'loss';
  return null;
}

function addFilterValues(target, value, normalizeOptions = {}) {
  const values = String(value || '')
    .split(',')
    .map((entry) => normalizeToken(entry, normalizeOptions))
    .filter(Boolean);

  for (const token of values) {
    if (!target.includes(token)) {
      target.push(token);
    }
  }
}

function applyFreeTerms(query, value) {
  const terms = String(value || '')
    .split(/\s+/)
    .map((term) => normalizeToken(term, { allowHash: true, maxLength: 40 }))
    .filter(Boolean);

  for (const term of terms) {
    if (!query.terms.includes(term)) {
      query.terms.push(term);
    }
  }
}

function applyKeyValue(query, rawKey, rawValue) {
  if (!rawKey || !rawValue) return false;

  if (rawKey === 'player' || rawKey === 'p') {
    addFilterValues(query.players, rawValue, { allowHash: true, maxLength: 40 });
    return true;
  }

  if (rawKey === 'champ' || rawKey === 'champion' || rawKey === 'c') {
    addFilterValues(query.champions, rawValue, { maxLength: 32 });
    return true;
  }

  if (rawKey === 'kw' || rawKey === 'keyword' || rawKey === 'keywords' || rawKey === 'k') {
    const kws = normalizeManualKeywords(rawValue);
    for (const kw of kws) {
      if (!query.keywords.includes(kw)) query.keywords.push(kw);
    }
    return true;
  }

  if (rawKey === 'result' || rawKey === 'r') {
    query.result = normalizeResultFilter(rawValue);
    return true;
  }

  if (rawKey === 'queue' || rawKey === 'q') {
    query.queue = normalizeToken(rawValue, { maxLength: 48 }) || null;
    return true;
  }

  if (rawKey === 'mode' || rawKey === 'm') {
    query.mode = normalizeToken(rawValue, { maxLength: 48 }) || null;
    return true;
  }

  if (rawKey === 'uploader' || rawKey === 'u') {
    query.uploader = normalizeToken(rawValue, { allowHash: true, maxLength: 48 }) || null;
    return true;
  }

  if (rawKey === 'uploader_id' || rawKey === 'uid') {
    query.uploaderId = normalizeSnowflake(rawValue);
    return true;
  }

  if (rawKey === 'gid' || rawKey === 'game' || rawKey === 'gameid' || rawKey === 'game_id') {
    query.gameId = normalizeToken(rawValue, { maxLength: 64 }) || null;
    return true;
  }

  if (rawKey === 'date' || rawKey === 'd') {
    const dateToken = String(rawValue).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) {
      query.date = dateToken;
    }
    return true;
  }

  if (rawKey === 'limit' || rawKey === 'max') {
    query.resultLimit = clampInt(rawValue, 1, MAX_RESULT_LIMIT, query.resultLimit);
    return true;
  }

  if (rawKey === 'scan' || rawKey === 'depth') {
    query.scanLimit = clampInt(rawValue, 50, MAX_SCAN_LIMIT, query.scanLimit);
    return true;
  }

  if (rawKey === 'help') {
    query._help = ['1', 'true', 'yes', 'y'].includes(String(rawValue).toLowerCase());
    return true;
  }

  return false;
}

function applyTokenString(query, input) {
  const tokens = String(input || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const lowered = token.toLowerCase();
    if (HELP_ALIASES.has(lowered)) {
      query._help = true;
      continue;
    }

    const delimiter = token.includes('=') ? '=' : (token.includes(':') ? ':' : null);
    if (!delimiter) {
      const freeTerm = normalizeToken(token, { allowHash: true, maxLength: 40 });
      if (freeTerm && !query.terms.includes(freeTerm)) query.terms.push(freeTerm);
      continue;
    }

    const idx = token.indexOf(delimiter);
    const rawKey = token.slice(0, idx).trim().toLowerCase();
    const rawValue = token.slice(idx + 1).trim();
    if (!rawKey || !rawValue) continue;

    const applied = applyKeyValue(query, rawKey, rawValue);
    if (!applied) {
      const fallbackTerm = normalizeToken(rawValue, { allowHash: true, maxLength: 40 });
      if (fallbackTerm && !query.terms.includes(fallbackTerm)) {
        query.terms.push(fallbackTerm);
      }
    }
  }
}

function parsePrefixQuery(args) {
  const query = createBaseQuery();
  const input = args.slice(1).join(' ').trim();
  if (!input) return { query, wantsHelp: false };

  applyTokenString(query, input);
  return { query, wantsHelp: query._help };
}

function parseSlashQuery(args) {
  const query = createBaseQuery();
  const values = args.slice(1);

  const get = (index) => values[index];
  const helpRaw = get(0);
  if (helpRaw !== null && helpRaw !== undefined) {
    query._help = ['1', 'true', 'yes', 'y'].includes(String(helpRaw).toLowerCase());
  }

  addFilterValues(query.players, get(1), { allowHash: true, maxLength: 40 });
  addFilterValues(query.champions, get(2), { maxLength: 32 });

  if (get(3)) query.result = normalizeResultFilter(get(3));
  if (get(4)) query.queue = normalizeToken(get(4), { maxLength: 48 }) || null;
  if (get(5)) query.mode = normalizeToken(get(5), { maxLength: 48 }) || null;
  if (get(6)) query.uploader = normalizeToken(get(6), { allowHash: true, maxLength: 48 }) || null;
  if (get(7)) query.uploaderId = normalizeSnowflake(get(7));
  if (get(8)) query.gameId = normalizeToken(get(8), { maxLength: 64 }) || null;

  const dateValue = String(get(9) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    query.date = dateValue;
  }

  const keywordTokens = normalizeManualKeywords(get(10));
  for (const kw of keywordTokens) {
    if (!query.keywords.includes(kw)) query.keywords.push(kw);
  }

  applyFreeTerms(query, get(11));

  if (get(12) !== null && get(12) !== undefined) {
    query.resultLimit = clampInt(get(12), 1, MAX_RESULT_LIMIT, query.resultLimit);
  }

  if (get(13) !== null && get(13) !== undefined) {
    query.scanLimit = clampInt(get(13), 50, MAX_SCAN_LIMIT, query.scanLimit);
  }

  if (get(14)) {
    applyTokenString(query, get(14));
  }

  return { query, wantsHelp: query._help };
}

function buildHelpText() {
  return [
    'League Match Search Help',
    '',
    'Prefix usage:',
    ',search_games help',
    ',search_games player=alpha#na1 champ=ahri result=win kw=comeback limit=8 scan=600',
    '',
    'Slash usage:',
    '/search_games player:<riot_id> champion:<champ> result:<win|loss> keywords:<k1,k2> limit:<n> scan:<n>',
    '',
    'Filters:',
    'player= / champion= / result= / queue= / mode= / uploader= / uploader_id= / game_id= / date=YYYY-MM-DD / keywords=',
    'You can combine filters. Unkeyed words are treated as free-text terms.',
    `Tagged matches are discovered from lines prefixed with ${MATCH_TAG_PREFIX}.`,
  ].join('\n');
}

function listContainsAll(haystack, needles) {
  if (!needles || needles.length === 0) return true;
  if (!haystack || haystack.length === 0) return false;

  return needles.every((needle) =>
    haystack.some((entry) => entry.includes(needle))
  );
}

function isMatchForQuery(tags, query) {
  if (query.gameId && tags.gameId !== query.gameId) return false;
  if (query.date && tags.timestamp !== query.date) return false;
  if (query.result && tags.result !== query.result) return false;
  if (query.queue && !String(tags.queue || '').includes(query.queue)) return false;
  if (query.mode && !String(tags.mode || '').includes(query.mode)) return false;
  if (query.uploader && !String(tags.uploader || '').includes(query.uploader)) return false;
  if (query.uploaderId && tags.uploaderId !== query.uploaderId) return false;

  if (!listContainsAll(tags.players, query.players)) return false;
  if (!listContainsAll(tags.champions, query.champions)) return false;
  if (!listContainsAll(tags.keywords, query.keywords)) return false;

  if (query.terms.length > 0) {
    const searchable = [
      tags.gameId,
      tags.timestamp,
      tags.result,
      tags.queue,
      tags.mode,
      tags.uploader,
      tags.uploaderId,
      ...(tags.players || []),
      ...(tags.champions || []),
      ...(tags.keywords || []),
    ]
      .filter(Boolean)
      .join(' ');

    const hasAllFreeTerms = query.terms.every((term) => searchable.includes(term));
    if (!hasAllFreeTerms) return false;
  }

  return true;
}

async function resolveSearchChannel(message, api, logger) {
  // Prefer the channel ID stored in the discord_server record
  if (message.guild?.id && api) {
    try {
      const resp = await api.get('discord_server', { server_id: message.guild.id });
      const channelId = resp?.discord_servers?.[0]?.match_data_channel;
      if (channelId && message.guild?.channels?.fetch) {
        const ch = await message.guild.channels.fetch(channelId);
        if (ch?.messages?.fetch) {
          logger.info('[search_games] Using match_data_channel from discord_server', { channelId });
          return ch;
        }
      }
    } catch (err) {
      logger.error('[search_games] Failed to resolve match_data_channel from API, trying env fallback', {
        err: err?.message,
      });
    }
  }

  // Fall back to env var
  if (MATCH_WEBHOOK_CHANNEL && message.guild?.channels?.fetch) {
    try {
      const configuredChannel = await message.guild.channels.fetch(MATCH_WEBHOOK_CHANNEL);
      if (configuredChannel?.messages?.fetch) {
        logger.info('[search_games] Using MATCH_WEBHOOK_CHANNEL env fallback', { channelId: MATCH_WEBHOOK_CHANNEL });
        return configuredChannel;
      }
    } catch (err) {
      logger.error('[search_games] Failed to resolve MATCH_WEBHOOK_CHANNEL env fallback', {
        channelId: MATCH_WEBHOOK_CHANNEL,
        err: err?.message,
      });
    }
  }

  return message.channel;
}

function summarizeQuery(query) {
  const parts = [];
  if (query.gameId) parts.push(`gid=${query.gameId}`);
  if (query.result) parts.push(`result=${query.result}`);
  if (query.queue) parts.push(`queue~${query.queue}`);
  if (query.mode) parts.push(`mode~${query.mode}`);
  if (query.uploader) parts.push(`uploader~${query.uploader}`);
  if (query.uploaderId) parts.push(`uploader_id=${query.uploaderId}`);
  if (query.date) parts.push(`date=${query.date}`);
  if (query.players.length) parts.push(`player=${query.players.join(',')}`);
  if (query.champions.length) parts.push(`champ=${query.champions.join(',')}`);
  if (query.keywords.length) parts.push(`kw=${query.keywords.join(',')}`);
  if (query.terms.length) parts.push(`terms=${query.terms.join(',')}`);
  parts.push(`limit=${query.resultLimit}`);
  parts.push(`scan=${query.scanLimit}`);
  return parts.join(' | ');
}

module.exports = {
  name: 'search_games',
  description: 'Search tagged League match posts without opening threads',
  syntax: 'search_games help | search_games [player=riotid] [champ=champion] [result=win|loss] [kw=keyword1,keyword2] [limit=10] [scan=500]',
  num_args: 0,
  args_to_lower: false,
  needs_api: true,
  has_state: false,
  options: [
    { name: 'help',        description: 'Show command help',                                                   type: 'BOOLEAN', required: false },
    { name: 'player',      description: 'Player filter (Riot ID or summoner, comma-separated supported)',      type: 'STRING',  required: false },
    { name: 'champion',    description: 'Champion filter (comma-separated supported)',                          type: 'STRING',  required: false },
    { name: 'result',      description: 'Match result filter',                                                  type: 'STRING',  required: false, choices: ['win', 'loss'] },
    { name: 'queue',       description: 'Queue contains filter (e.g. ranked_solo)',                            type: 'STRING',  required: false },
    { name: 'mode',        description: 'Mode contains filter (e.g. classic, aram)',                           type: 'STRING',  required: false },
    { name: 'uploader',    description: 'Uploader Riot name filter',                                            type: 'STRING',  required: false },
    { name: 'uploader_id', description: 'Uploader Discord ID filter',                                           type: 'STRING',  required: false },
    { name: 'game_id',     description: 'Exact game ID (gid)',                                                  type: 'STRING',  required: false },
    { name: 'date',        description: 'Date filter in YYYY-MM-DD',                                            type: 'STRING',  required: false },
    { name: 'keywords',    description: 'Manual keyword filter list (comma-separated)',                         type: 'STRING',  required: false },
    { name: 'terms',       description: 'Free-text terms (space-separated)',                                    type: 'STRING',  required: false },
    { name: 'limit',       description: `Max results (${1}-${MAX_RESULT_LIMIT})`,                              type: 'INTEGER', required: false },
    { name: 'scan',        description: `How many messages to scan (${50}-${MAX_SCAN_LIMIT})`,                 type: 'INTEGER', required: false },
    {
      name: 'query',
      description: 'Advanced token query: player=... champ=... kw=... result=... limit=... scan=...',
      type: 'STRING',
      required: false,
    },
  ],
  async execute(message, args, extra) {
    const isSlashInvocation = Boolean(message?._interaction);
    this.logger.info('[search_games] Execute called', {
      userId: message.author?.id,
      argCount: args.length,
      invocation: isSlashInvocation ? 'slash' : 'prefix',
    });

    const parsed = isSlashInvocation ? parseSlashQuery(args) : parsePrefixQuery(args);
    const query = parsed.query;

    if (parsed.wantsHelp) {
      this.logger.info('[search_games] Help requested', {
        userId: message.author?.id,
        invocation: isSlashInvocation ? 'slash' : 'prefix',
      });
      await message.channel.send(buildHelpText());
      return;
    }

    this.logger.info('[search_games] Parsed query', {
      summary: summarizeQuery(query),
    });

    const channel = await resolveSearchChannel(message, extra?.api, this.logger);
    if (!channel?.messages?.fetch) {
      this.logger.error('[search_games] Target channel does not support message history fetch');
      await message.channel.send('Could not search this channel. Please run this in a text channel.');
      return;
    }

    const matches = [];
    let scanned = 0;
    let pages = 0;
    let before = null;

    try {
      while (scanned < query.scanLimit && matches.length < query.resultLimit) {
        const pageLimit = Math.min(PAGE_FETCH_LIMIT, query.scanLimit - scanned);
        const fetchOpts = before
          ? { limit: pageLimit, before }
          : { limit: pageLimit };

        const fetched = await channel.messages.fetch(fetchOpts);
        if (!fetched || fetched.size === 0) {
          break;
        }

        pages += 1;
        const pageMessages = Array.from(fetched.values());

        for (const msg of pageMessages) {
          scanned += 1;

          const tags = parseTagFromMessageContent(msg.content);
          if (!tags) continue;

          if (isMatchForQuery(tags, query)) {
            matches.push({
              message: msg,
              tags,
            });

            if (matches.length >= query.resultLimit) break;
          }
        }

        before = pageMessages[pageMessages.length - 1]?.id;
        if (!before) break;
      }
    } catch (err) {
      this.logger.error('[search_games] Failed while scanning message history', {
        err: err?.message,
        scanned,
        pages,
      });
      await message.channel.send('Search failed while scanning channel history. Please try again in a minute.');
      return;
    }

    this.logger.info('[search_games] Scan completed', {
      channelId: channel.id,
      scanned,
      pages,
      matches: matches.length,
    });

    if (matches.length === 0) {
      await message.channel.send(
        `No tagged match posts found. Query: ${summarizeQuery(query)}\nTip: tags start with ${MATCH_TAG_PREFIX} and live on the match post itself.`
      );
      return;
    }

    const lines = matches.map((entry, idx) => {
      const players = entry.tags.players.slice(0, 3).join(', ') || 'none';
      const champs = entry.tags.champions.slice(0, 3).join(', ') || 'none';
      const keywords = entry.tags.keywords.length > 0 ? entry.tags.keywords.join(', ') : 'none';

      const uploader = entry.tags.uploader || 'unknown';
      const uploaderId = entry.tags.uploaderId || 'none';
      return `${idx + 1}. [Match ${entry.tags.gameId}](${entry.message.url}) | ${entry.tags.result} | ${entry.tags.queue} | ${entry.tags.mode} | uploader:${uploader} | uid:${uploaderId} | players:${players} | champs:${champs} | kw:${keywords}`;
    });

    const header = `Match Search Results (${matches.length})\nQuery: ${summarizeQuery(query)}\nScanned: ${scanned} messages across ${pages} page(s) in <#${channel.id}>\n`;
    const chunks = splitForDiscord(`${header}\n${lines.join('\n')}`, 1900);

    for (const chunk of chunks) {
      await message.channel.send(chunk);
    }
  },
};
