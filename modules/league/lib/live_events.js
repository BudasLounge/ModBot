'use strict';

/**
 * LeagueLoader match-event helpers.
 *
 * The desktop client posts a small event stream to the same `/lol/match`
 * endpoint used by lobby invites and post-match uploads:
 *
 *   in_queue     -> player joined matchmaking
 *   champ_select -> pick/ban phase with picks, bans, roles and timer
 *   in_game      -> game client started
 *   scoreboard   -> live snapshot, sent once per minute while in game
 *   ended        -> game finished / queue cancelled / client disconnected
 *
 * This module is deliberately dependency-free (no discord.js, no axios) so it
 * can be unit-checked in isolation and reused by any renderer. It validates
 * and normalises untrusted payloads before they reach Discord or puppeteer.
 */

const MATCH_EVENT_TYPE = 'match_event';
const VALID_MATCH_EVENTS = new Set([
  'in_queue',
  'champ_select',
  'in_game',
  'scoreboard',
  'ended',
]);

const CHAMPION_FILE_OVERRIDES = {
  Wukong: 'MonkeyKing',
  'Renata Glasc': 'Renata',
  "Bel'Veth": 'Belveth',
  "Kog'Maw": 'KogMaw',
  "Rek'Sai": 'RekSai',
  'Dr. Mundo': 'DrMundo',
  'Nunu & Willump': 'Nunu',
  LeBlanc: 'Leblanc',
  "Cho'Gath": 'Chogath',
  "Kai'Sa": 'Kaisa',
  "Kha'Zix": 'Khazix',
  "Vel'Koz": 'Velkoz',
};

const QUEUE_LABELS = {
  400: 'Normal Draft',
  420: 'Ranked Solo/Duo',
  430: 'Normal Blind',
  440: 'Ranked Flex',
  450: 'ARAM',
  490: 'Quickplay',
  700: 'Clash',
  900: 'ARURF',
  1700: 'Arena',
  1900: 'URF',
  3140: 'Practice Tool',
};

const MAX_PLAYERS_PER_TEAM = 20;
const MAX_ITEMS = 7;
const FIELD_LIMIT = 1024;
const DESCRIPTION_LIMIT = 4096;

const POSITION_LABELS = {
  TOP: 'Top',
  JUNGLE: 'Jg',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
  UTILITY: 'Sup',
  FILL: 'Fill',
};

function isMatchEventPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      payload.eventType === MATCH_EVENT_TYPE &&
      typeof payload.event === 'string'
  );
}

function asString(value, maxLength = 128) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, maxLength);
}

function asInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeItemIds(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    const id =
      item && typeof item === 'object'
        ? asInt(item.itemID ?? item.itemId ?? item.id, 0)
        : asInt(item, 0);
    if (id > 0) out.push(id);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function normalizePlayer(player) {
  if (!player || typeof player !== 'object') return null;
  const riotId = asString(player.riotId ?? player.summonerName, 80);
  const championName = asString(player.championName, 48);
  if (!riotId && !championName) return null;
  return {
    riotId: riotId || 'Unknown',
    championName: championName || 'Unknown',
    level: clamp(asInt(player.level, 1), 1, 99),
    kills: Math.max(0, asInt(player.kills, 0)),
    deaths: Math.max(0, asInt(player.deaths, 0)),
    assists: Math.max(0, asInt(player.assists, 0)),
    cs: Math.max(0, asInt(player.cs, 0)),
    wardScore: Math.max(0, asNumber(player.wardScore, 0)),
    items: normalizeItemIds(player.items),
    isBot: Boolean(player.isBot),
  };
}

function normalizeTeam(team, index) {
  if (!team || typeof team !== 'object') return null;
  const fallbackId = index === 0 ? '100' : '200';
  const teamId = asString(team.teamId, 16) || fallbackId;
  const players = Array.isArray(team.players)
    ? team.players
        .slice(0, MAX_PLAYERS_PER_TEAM)
        .map(normalizePlayer)
        .filter(Boolean)
    : [];

  const summed = players.reduce(
    (acc, player) => {
      acc.kills += player.kills;
      acc.deaths += player.deaths;
      acc.assists += player.assists;
      return acc;
    },
    { kills: 0, deaths: 0, assists: 0 }
  );

  return {
    teamId,
    kills: Math.max(0, asInt(team.kills, summed.kills)),
    deaths: Math.max(0, asInt(team.deaths, summed.deaths)),
    assists: Math.max(0, asInt(team.assists, summed.assists)),
    towers: Math.max(0, asInt(team.towers, 0)),
    dragons: Math.max(0, asInt(team.dragons, 0)),
    barons: Math.max(0, asInt(team.barons, 0)),
    inhibitors: Math.max(0, asInt(team.inhibitors, 0)),
    players,
  };
}

function normalizeChampSelectPlayer(player) {
  if (!player || typeof player !== 'object') return null;
  return {
    cellId: asInt(player.cellId, -1),
    championId: Math.max(0, asInt(player.championId, 0)),
    championName: asString(player.championName, 48),
    pickIntentName: asString(player.pickIntentName, 48),
    assignedPosition: asString(player.assignedPosition, 16).toUpperCase(),
    riotId: asString(player.riotId, 80),
    isLocal: Boolean(player.isLocal),
    isLocked: Boolean(player.isLocked),
  };
}

function normalizeChampSelectBans(bans) {
  if (!Array.isArray(bans)) return [];
  return bans
    .slice(0, 10)
    .map((ban) => {
      if (ban && typeof ban === 'object') {
        return {
          championId: Math.max(0, asInt(ban.championId, 0)),
          championName: asString(ban.championName, 48),
        };
      }
      return { championId: Math.max(0, asInt(ban, 0)), championName: '' };
    })
    .filter((ban) => ban.championId > 0);
}

function normalizeChampSelect(champSelect) {
  if (!champSelect || typeof champSelect !== 'object') return null;
  const mapTeam = (team) =>
    Array.isArray(team)
      ? team.slice(0, 5).map(normalizeChampSelectPlayer).filter(Boolean)
      : [];
  return {
    phase: asString(champSelect.phase, 24).toUpperCase(),
    timeLeft: Math.max(0, asNumber(champSelect.timeLeft, 0)),
    totalTime: Math.max(0, asNumber(champSelect.totalTime, 0)),
    localPlayerCellId: asInt(champSelect.localPlayerCellId, -1),
    myTeam: mapTeam(champSelect.myTeam),
    theirTeam: mapTeam(champSelect.theirTeam),
    myTeamBans: normalizeChampSelectBans(champSelect.myTeamBans),
    theirTeamBans: normalizeChampSelectBans(champSelect.theirTeamBans),
  };
}

/**
 * Validate and normalise an untrusted match-event payload.
 * Returns null for payloads that are not match events.
 */
function normalizeMatchEvent(payload) {
  if (!isMatchEventPayload(payload)) return null;

  const event = asString(payload.event, 32).toLowerCase();
  if (!VALID_MATCH_EVENTS.has(event)) return null;

  const sessionId = asString(payload.sessionId, 64);
  const partyId = asString(payload.partyId, 64);
  if (!sessionId && !partyId) return null;

  const sequence = asInt(payload.sequence, 0);
  const rawGameId = asString(payload.gameId, 64);
  const teams = Array.isArray(payload.teams)
    ? payload.teams
        .slice(0, 4)
        .map(normalizeTeam)
        .filter(Boolean)
    : [];

  return {
    eventType: MATCH_EVENT_TYPE,
    schemaVersion: Math.max(1, asInt(payload.schemaVersion, 1)),
    event,
    sessionId,
    partyId,
    sequence: sequence > 0 ? sequence : null,
    sentAt: asString(payload.sentAt, 40),
    ownerName: asString(payload.ownerName, 80),
    queueId: asInt(payload.queueId, 0),
    queueType: asString(payload.queueType, 64),
    gameMode: asString(payload.gameMode, 32),
    isCustom: Boolean(payload.isCustom),
    lobbyName: asString(payload.lobbyName, 80),
    mapId: asInt(payload.mapId, 0),
    playerCount: Math.max(0, asInt(payload.playerCount, 0)),
    gameId: rawGameId && rawGameId !== '0' ? rawGameId : null,
    startedAt: asString(payload.startedAt, 40),
    gameTime: Math.max(0, asNumber(payload.gameTime, 0)),
    result: asString(payload.result, 16).toLowerCase(),
    reason: asString(payload.reason, 32),
    localPlayer: asString(payload.localPlayer, 80),
    teams,
    champSelect:
      event === 'champ_select' ? normalizeChampSelect(payload.champSelect) : null,
  };
}

function sessionKey(event) {
  return event?.sessionId || event?.partyId || null;
}

function championFile(name) {
  const normalized = String(name || '').replace(/[\u2018\u2019\u02bc]/g, "'");
  return CHAMPION_FILE_OVERRIDES[normalized] || normalized.replace(/[' .&]/g, '');
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(asNumber(totalSeconds, 0)));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function describeMode(event) {
  const lobbyName = asString(event?.lobbyName, 80);
  if (event?.isCustom) {
    return lobbyName ? `Custom — ${lobbyName}` : 'Custom Lobby';
  }
  const queueId = asInt(event?.queueId, 0);
  if (QUEUE_LABELS[queueId]) return QUEUE_LABELS[queueId];

  const queueType = String(event?.queueType || event?.gameMode || '').toUpperCase();
  if (queueType === 'CLASH') return 'Clash';
  if (queueType.includes('RANKED_SOLO')) return 'Ranked Solo';
  if (queueType.includes('RANKED_FLEX')) return 'Ranked Flex';
  if (queueType.includes('RANKED')) return 'Ranked';
  if (queueType.includes('ARAM') || queueType === 'KIWI') return 'ARAM';
  if (queueType.includes('CHERRY') || queueType === 'ARENA') return 'Arena';
  if (queueType.includes('PRACTICETOOL')) return 'Practice Tool';
  if (queueType.includes('NORMAL')) return 'Normal';
  if (queueType.includes('BOT')) return 'Co-op vs AI';
  if (queueType === 'CLASSIC') return 'Normal';
  return lobbyName || 'League';
}

function teamView(team, ddVersion, localPlayer) {
  const CDN = `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img`;
  const localName = String(localPlayer || '').trim().toLowerCase();
  return {
    teamId: team.teamId,
    kills: team.kills,
    deaths: team.deaths,
    assists: team.assists,
    towers: team.towers,
    dragons: team.dragons,
    barons: team.barons,
    inhibitors: team.inhibitors,
    players: team.players.map((player) => {
      const normalizedName = player.riotId.trim().toLowerCase();
      const kdaRatio =
        player.deaths === 0
          ? (player.kills + player.assists).toFixed(2)
          : ((player.kills + player.assists) / player.deaths).toFixed(2);
      return {
        ...player,
        championIcon: `${CDN}/champion/${championFile(player.championName)}.png`,
        itemIcons: player.items.map((id) => ({
          id,
          url: `${CDN}/item/${id}.png`,
        })),
        kda: `${player.kills} / ${player.deaths} / ${player.assists}`,
        kdaRatio,
        wardScore: Math.round(player.wardScore),
        isLocal: Boolean(localName) && normalizedName === localName,
      };
    }),
  };
}

/**
 * Build the handlebars content for match-template-live.html.
 * `ddVersion` should be a Data Dragon version such as "15.1.1".
 */
function buildLiveScoreboardData(event, ddVersion, modeLabel) {
  const teams = Array.isArray(event?.teams) ? event.teams : [];
  const team100Raw = teams.find((team) => team.teamId === '100') || normalizeTeam({ teamId: '100' }, 0);
  const team200Raw = teams.find((team) => team.teamId === '200') || normalizeTeam({ teamId: '200' }, 1);
  const team100 = teamView(team100Raw, ddVersion, event?.localPlayer);
  const team200 = teamView(team200Raw, ddVersion, event?.localPlayer);

  const isEnded = event?.event === 'ended';
  const result = String(event?.result || '').toLowerCase();
  let resultText = 'MATCH IN PROGRESS';
  let resultClass = 'neutral';
  if (isEnded) {
    resultText = result === 'victory' ? 'VICTORY' : result === 'defeat' ? 'DEFEAT' : 'MATCH ENDED';
    resultClass = result === 'victory' ? 'victory' : result === 'defeat' ? 'defeat' : 'neutral';
  }

  return {
    eventLabel: isEnded ? resultText : 'LIVE',
    resultText,
    resultClass,
    mode: modeLabel || describeMode(event),
    clock: formatClock(event?.gameTime),
    team100,
    team200,
    t100: {
      kills: team100.kills,
      deaths: team100.deaths,
      assists: team100.assists,
      towers: team100.towers,
      dragons: team100.dragons,
      barons: team100.barons,
      inhibitors: team100.inhibitors,
    },
    t200: {
      kills: team200.kills,
      deaths: team200.deaths,
      assists: team200.assists,
      towers: team200.towers,
      dragons: team200.dragons,
      barons: team200.barons,
      inhibitors: team200.inhibitors,
    },
    hasTeams: team100.players.length + team200.players.length > 0,
    hasBluePlayers: team100.players.length > 0,
    hasRedPlayers: team200.players.length > 0,
  };
}

function truncate(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function playerLine(player) {
  const champion = player.championName && player.championName !== 'Unknown'
    ? `**${player.championName}** `
    : '';
  const name = truncate(player.riotId, 34);
  return `${champion}${name} — ${player.kills}/${player.deaths}/${player.assists} • ${player.cs} CS`;
}

function teamFieldValue(team) {
  const header = `**${team.kills} / ${team.deaths} / ${team.assists}** · ${team.towers} towers · ${team.dragons} dragons · ${team.barons} barons`;
  const players = team.players.map(playerLine).join('\n');
  return truncate(players ? `${header}\n${players}` : header, FIELD_LIMIT);
}

function formatChampPhase(phase) {
  const labels = {
    PLANNING: 'Planning',
    BAN_PICK: 'Ban/Pick',
    FINALIZATION: 'Finalization',
    GAME_STARTING: 'Starting',
  };
  return labels[String(phase || '').toUpperCase()] || 'Champ Select';
}

function champSelectPlayerLine(player, isEnemy) {
  const role =
    POSITION_LABELS[player.assignedPosition] || player.assignedPosition || 'Fill';
  let champion = player.championName;
  if (!champion && !isEnemy && player.pickIntentName) {
    champion = `${player.pickIntentName}?`;
  }
  if (!champion) champion = isEnemy ? 'Hidden' : '—';
  const name = player.riotId ? ` — ${player.riotId}` : '';
  const lock = player.isLocked ? ' ✓' : '';
  return `**${role}** ${champion}${name}${lock}`;
}

function champSelectTeamValue(team, isEnemy) {
  if (!Array.isArray(team) || team.length === 0) {
    return isEnemy ? 'No enemy picks revealed yet' : 'Waiting for picks…';
  }
  return truncate(
    team.map((player) => champSelectPlayerLine(player, isEnemy)).join('\n'),
    FIELD_LIMIT
  );
}

function champSelectBansValue(champSelect) {
  const myBans = (champSelect.myTeamBans || []).map(
    (ban) => ban.championName || `#${ban.championId}`
  );
  const theirBans = (champSelect.theirTeamBans || []).map(
    (ban) => ban.championName || `#${ban.championId}`
  );
  if (myBans.length === 0 && theirBans.length === 0) return '';
  return truncate(
    `**Yours:** ${myBans.join(', ') || 'None'}\n**Enemy:** ${theirBans.join(', ') || 'None'}`,
    FIELD_LIMIT
  );
}

/**
 * Plain-data embed fallback used when image rendering is unavailable.
 * events.js turns this into an EmbedBuilder, keeping this module dependency-free.
 */
function buildMatchEventEmbedData(event, modeLabel) {
  const mode = modeLabel || describeMode(event);
  const isEnded = event?.event === 'ended';
  const result = String(event?.result || '').toLowerCase();
  const titleByEvent = {
    in_queue: 'League — In Queue',
    champ_select: 'League — Champ Select',
    in_game: 'League — In Game',
    scoreboard: 'League — Live Scoreboard',
    ended: 'League — Match Ended',
  };
  const colorByEvent = {
    in_queue: 0x1e90ff,
    champ_select: 0x9b59b6,
    in_game: 0xffaa00,
    scoreboard: 0xffaa00,
    ended: result === 'victory' ? 0x0acbe6 : result === 'defeat' ? 0xe84057 : 0x5c5c5c,
  };

  const fields = [];
  const owner = event?.ownerName || 'Unknown';

  if (event?.event === 'champ_select') {
    const champSelect = event.champSelect || {};
    const timeLeft = champSelect.timeLeft
      ? ` • ${Math.ceil(champSelect.timeLeft)}s`
      : '';
    fields.push({ name: 'Mode', value: truncate(mode, 256), inline: true });
    fields.push({
      name: 'Phase',
      value: `${formatChampPhase(champSelect.phase)}${timeLeft}`,
      inline: true,
    });
    fields.push({ name: 'Local Player', value: truncate(owner, 256), inline: true });
    fields.push({
      name: 'Your Team',
      value: champSelectTeamValue(champSelect.myTeam, false),
      inline: false,
    });
    fields.push({
      name: 'Enemy Team',
      value: champSelectTeamValue(champSelect.theirTeam, true),
      inline: false,
    });
    const bansValue = champSelectBansValue(champSelect);
    if (bansValue) {
      fields.push({ name: 'Bans', value: bansValue, inline: false });
    }
    return {
      title: 'League — Champ Select',
      color: 0x9b59b6,
      description: truncate(`Champ select • ${mode}`, DESCRIPTION_LIMIT),
      fields,
    };
  }

  if (event?.event === 'in_queue') {
    fields.push({ name: 'Host', value: truncate(owner, 256), inline: true });
    fields.push({ name: 'Mode', value: truncate(mode, 256), inline: true });
    fields.push({
      name: 'Party',
      value: event?.playerCount ? `${event.playerCount} player${event.playerCount === 1 ? '' : 's'}` : 'Unknown',
      inline: true,
    });
  } else {
    fields.push({ name: 'Mode', value: truncate(mode, 256), inline: true });
    if (event?.gameId) {
      fields.push({ name: 'Game', value: truncate(event.gameId, 64), inline: true });
    }
    if (isEnded) {
      const resultLabel = result === 'victory' ? 'Victory' : result === 'defeat' ? 'Defeat' : 'Ended';
      fields.push({ name: 'Result', value: resultLabel, inline: true });
    } else if (event?.gameTime) {
      fields.push({ name: 'Game Time', value: formatClock(event.gameTime), inline: true });
    }
  }

  const teams = Array.isArray(event?.teams) ? event.teams : [];
  const team100 = teams.find((team) => team.teamId === '100');
  const team200 = teams.find((team) => team.teamId === '200');
  if (team100 && team100.players.length) {
    fields.push({ name: '🔵 Blue Team', value: teamFieldValue(team100), inline: false });
  }
  if (team200 && team200.players.length) {
    fields.push({ name: '🔴 Red Team', value: teamFieldValue(team200), inline: false });
  }

  const summaryParts = [];
  if (event?.event === 'scoreboard' || isEnded) {
    summaryParts.push(`⏱ ${formatClock(event?.gameTime)}`);
    if (team100 && team200) {
      summaryParts.push(`${team100.kills} — ${team200.kills} kills`);
    }
  }
  if (event?.event === 'in_queue') {
    summaryParts.push('Waiting for a match…');
  } else if (event?.event === 'in_game') {
    summaryParts.push('Game starting…');
  } else if (isEnded && event?.reason) {
    summaryParts.push(String(event.reason).replace(/_/g, ' '));
  }
  if (owner && owner !== 'Unknown') summaryParts.push(`Host: ${owner}`);

  return {
    title: titleByEvent[event?.event] || 'League Match Event',
    color: colorByEvent[event?.event] ?? 0x5c5c5c,
    description: truncate(summaryParts.join(' • ') || mode, DESCRIPTION_LIMIT),
    fields,
  };
}

function buildMatchEventContent(event) {
  const mode = describeMode(event);
  if (event?.event === 'in_queue') {
    return truncate(`League — In Queue • ${mode}`, 200);
  }
  if (event?.event === 'champ_select') {
    const timeLeft = event?.champSelect?.timeLeft
      ? ` • ${Math.ceil(event.champSelect.timeLeft)}s`
      : '';
    return truncate(`Champ select • ${mode}${timeLeft}`, 200);
  }
  if (event?.event === 'scoreboard') {
    return truncate(`Live scoreboard • ${mode} • ${formatClock(event?.gameTime)}`, 200);
  }
  if (event?.event === 'ended') {
    return truncate(`Match ended • ${mode}`, 200);
  }
  return truncate(`League — In Game • ${mode}`, 200);
}

module.exports = {
  MATCH_EVENT_TYPE,
  VALID_MATCH_EVENTS,
  isMatchEventPayload,
  normalizeMatchEvent,
  sessionKey,
  describeMode,
  formatClock,
  buildLiveScoreboardData,
  buildMatchEventEmbedData,
  buildMatchEventContent,
  teamFieldValue,
  playerLine,
};
