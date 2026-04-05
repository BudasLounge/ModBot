const MATCH_TAG_PREFIX = '[MB_MATCH_TAGS]';

const MAX_PLAYER_TAGS = 10;
const MAX_CHAMP_TAGS = 10;
const MAX_MANUAL_KEYWORDS = 8;
const MAX_KEYWORD_LENGTH = 24;

function normalizeToken(value, { allowHash = false, maxLength = 36 } = {}) {
  if (!value) return '';

  let token = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9#._\-\s']+/g, '')
    .replace(/['\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!allowHash) {
    token = token.replace(/#/g, '');
  }

  if (token.length > maxLength) {
    token = token.slice(0, maxLength);
  }

  return token;
}

function uniqueLimited(values, maxCount) {
  const out = [];
  const seen = new Set();

  for (const v of values || []) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= maxCount) break;
  }

  return out;
}

function buildPlayersTag(payload, matchedPlayers = []) {
  const names = [];

  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  for (const team of teams) {
    for (const player of team.players || []) {
      const riotId = player?.riotIdGameName && player?.riotIdTagLine
        ? `${player.riotIdGameName}#${player.riotIdTagLine}`
        : (player?.summonerName || player?.riotIdGameName || null);

      const normalized = normalizeToken(riotId, { allowHash: true, maxLength: 40 });
      if (normalized) names.push(normalized);
    }
  }

  for (const row of matchedPlayers || []) {
    const normalized = normalizeToken(row?.league_name, { allowHash: true, maxLength: 40 });
    if (normalized) names.push(normalized);
  }

  const deduped = uniqueLimited(names, MAX_PLAYER_TAGS);
  return deduped.length > 0 ? deduped.join(',') : 'none';
}

function buildChampionsTag(payload) {
  const champs = [];
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];

  for (const team of teams) {
    for (const player of team.players || []) {
      const normalized = normalizeToken(player?.championName, { maxLength: 32 });
      if (normalized) champs.push(normalized);
    }
  }

  const deduped = uniqueLimited(champs, MAX_CHAMP_TAGS);
  return deduped.length > 0 ? deduped.join(',') : 'none';
}

function normalizeResultTag(resultText) {
  const value = normalizeToken(resultText, { maxLength: 12 });
  if (value.includes('win')) return 'win';
  if (value.includes('loss')) return 'loss';
  return 'unknown';
}

function normalizeManualKeywords(rawKeywords) {
  const source = Array.isArray(rawKeywords)
    ? rawKeywords.join(',')
    : String(rawKeywords || '');

  if (!source.trim()) return [];

  const tokens = source
    .split(/[\n,]+/)
    .map((part) => normalizeToken(part, { maxLength: MAX_KEYWORD_LENGTH }))
    .filter(Boolean);

  return uniqueLimited(tokens, MAX_MANUAL_KEYWORDS);
}

function toDateTag(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function sanitizeSnowflake(value) {
  const token = String(value || '').trim();
  return /^\d{15,22}$/.test(token) ? token : 'none';
}

function sanitizeScalar(value, fallback = 'unknown', maxLength = 48, allowHash = false) {
  const token = normalizeToken(value, { maxLength, allowHash });
  return token || fallback;
}

function sanitizeListScalar(value, { fallback = 'none', allowHash = false, maxLength = 40, maxCount = 20 } = {}) {
  if (value === null || value === undefined) return fallback;

  const tokens = String(value)
    .split(',')
    .map((entry) => normalizeToken(entry, { allowHash, maxLength }))
    .filter(Boolean);

  const deduped = uniqueLimited(tokens, maxCount);
  return deduped.length > 0 ? deduped.join(',') : fallback;
}

function buildAutoKeywords(payload) {
  const autoKws = [];
  if (String(payload?.gameType || '').toUpperCase() === 'CUSTOM_GAME') {
    autoKws.push('custom');
  }
  return autoKws;
}

function buildMatchTagLine({ payload, gameId, uploaderInfo, uploaderDiscordId = null, matchedPlayers = [], keywords = [] }) {
  const autoKeywords = buildAutoKeywords(payload);
  const manualKeywords = normalizeManualKeywords(keywords);
  const mergedKeywords = uniqueLimited([...autoKeywords, ...manualKeywords], MAX_MANUAL_KEYWORDS);

  const fields = {
    gid: sanitizeScalar(gameId, 'unknown', 64),
    ts: toDateTag(payload?.gameCreationDate || payload?.gameCreation || Date.now()),
    result: normalizeResultTag(uploaderInfo?.result),
    queue: sanitizeScalar(payload?.queueType || payload?.gameQueueType, 'unknown', 48),
    mode: sanitizeScalar(payload?.gameMode, 'unknown', 48),
    uploader: sanitizeScalar(uploaderInfo?.name, 'unknown', 48, true),
    uid: sanitizeSnowflake(uploaderDiscordId),
    players: buildPlayersTag(payload, matchedPlayers),
    champs: buildChampionsTag(payload),
    kw: mergedKeywords.length > 0 ? mergedKeywords.join(',') : 'none',
  };

  return formatMatchTagLine(fields);
}

function parseListField(value) {
  if (!value || value === 'none') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMatchTagLine(rawLine) {
  if (typeof rawLine !== 'string') return null;

  const line = rawLine.trim();
  if (!line.startsWith(MATCH_TAG_PREFIX)) return null;

  const body = line.slice(MATCH_TAG_PREFIX.length).trim();
  const fields = {};

  for (const chunk of body.split(';')) {
    const part = chunk.trim();
    if (!part) continue;
    const equalsIdx = part.indexOf('=');
    if (equalsIdx <= 0) continue;

    const key = part.slice(0, equalsIdx).trim().toLowerCase();
    const value = part.slice(equalsIdx + 1).trim();
    if (!key) continue;
    fields[key] = value;
  }

  if (!fields.gid) return null;

  return {
    raw: line,
    fields,
    gameId: fields.gid,
    timestamp: fields.ts || null,
    result: fields.result || 'unknown',
    queue: fields.queue || 'unknown',
    mode: fields.mode || 'unknown',
    uploader: fields.uploader || 'unknown',
    uploaderId: fields.uid && fields.uid !== 'none' ? fields.uid : null,
    players: parseListField(fields.players),
    champions: parseListField(fields.champs),
    keywords: parseListField(fields.kw),
  };
}

function formatMatchTagLine(fields) {
  const safeFields = {
    gid: sanitizeScalar(fields?.gid, 'unknown', 64),
    ts: sanitizeScalar(fields?.ts, toDateTag(Date.now()), 16),
    result: sanitizeScalar(fields?.result, 'unknown', 12),
    queue: sanitizeScalar(fields?.queue, 'unknown', 48),
    mode: sanitizeScalar(fields?.mode, 'unknown', 48),
    uploader: sanitizeScalar(fields?.uploader, 'unknown', 48, true),
    uid: sanitizeSnowflake(fields?.uid),
    players: sanitizeListScalar(fields?.players, { fallback: 'none', allowHash: true, maxLength: 40, maxCount: MAX_PLAYER_TAGS }),
    champs: sanitizeListScalar(fields?.champs, { fallback: 'none', allowHash: false, maxLength: 32, maxCount: MAX_CHAMP_TAGS }),
    kw: sanitizeListScalar(fields?.kw, { fallback: 'none', allowHash: false, maxLength: MAX_KEYWORD_LENGTH, maxCount: MAX_MANUAL_KEYWORDS }),
  };

  return `${MATCH_TAG_PREFIX} gid=${safeFields.gid}; ts=${safeFields.ts}; result=${safeFields.result}; queue=${safeFields.queue}; mode=${safeFields.mode}; uploader=${safeFields.uploader}; uid=${safeFields.uid}; players=${safeFields.players}; champs=${safeFields.champs}; kw=${safeFields.kw}`;
}

function extractTagLineAndIndex(content) {
  const lines = String(content || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith(MATCH_TAG_PREFIX)) {
      return { index: i, line: lines[i].trim(), lines };
    }
  }
  return { index: -1, line: null, lines };
}

function upsertKeywordsInContent(content, keywords) {
  const normalizedKeywords = normalizeManualKeywords(keywords);
  const { index, line, lines } = extractTagLineAndIndex(content);

  if (index === -1 || !line) {
    return null;
  }

  const parsed = parseMatchTagLine(line);
  if (!parsed) {
    return null;
  }

  const nextFields = {
    ...parsed.fields,
    kw: normalizedKeywords.length > 0 ? normalizedKeywords.join(',') : 'none',
  };

  lines[index] = formatMatchTagLine(nextFields);
  return lines.join('\n').trim();
}

module.exports = {
  MATCH_TAG_PREFIX,
  buildMatchTagLine,
  parseMatchTagLine,
  normalizeToken,
  normalizeManualKeywords,
  upsertKeywordsInContent,
};
