/**
 * test_role_layouts.js
 * Posts role layout variants to the lobby invite channel for review.
 *
 * Run from the ModBot directory:
 *   node test_role_layouts.js
 *
 * Delete this file when done.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ── Config ─────────────────────────────────────────────────────────────────
const TOKEN_FILE = path.join(__dirname, '..', 'token.txt');
const CHANNEL_ID = '1140019871736938537';

// ── Dummy payload — custom 5v5, 7 players, team assignments ───────────────
const DUMMY = {
  smartUrl:    'https://gg.riotgames.com/LOL?joinCode=NRro-5mLA-Tn24',
  ownerName:   'BigBuda#buda',
  playerCount: 7,
  lobbyName:   "BigBuda's Game",
  isCustom:    true,
  queueId:     3130,
  gameMode:    'CLASSIC',
  roleAssignments: [
    { riotId: 'BigBuda#buda',        role: 'BOTTOM',  team: '100' },
    { riotId: 'xNullx#1337',         role: 'TOP',     team: '100' },
    { riotId: 'Type C Cable#NA1',    role: 'MIDDLE',  team: '200' },
    { riotId: 'Pyke Wazowski#LEGGO', role: 'JUNGLE',  team: '100' },
    { riotId: 'uncoolbi#yeet',       role: 'UTILITY', team: '200' },
    { riotId: 'SpectatorGuy#NA1',    role: 'FILL',    team: '200' },
    { riotId: 'LastGuy#EUW',         role: 'TOP',     team: '200' },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
const ROLE_LABEL = {
  TOP:     'Top',
  JUNGLE:  'Jg',
  MIDDLE:  'Mid',
  BOTTOM:  'Bot',
  UTILITY: 'Sup',
  FILL:    'Fill',
};

const ROLE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'FILL'];

function sortRoles(assignments) {
  return [...assignments].sort(
    (a, b) => (ROLE_ORDER.indexOf(a.role) ?? 99) - (ROLE_ORDER.indexOf(b.role) ?? 99)
  );
}

function baseEmbed(title) {
  return new EmbedBuilder()
    .setColor(0x1e90ff)
    .setTitle(`League Lobby Open — ${title}`)
    .setURL(DUMMY.smartUrl)
    .addFields(
      { name: 'Host',    value: DUMMY.ownerName,                            inline: true },
      { name: 'Mode',    value: `Custom — ${DUMMY.lobbyName}`,              inline: true },
      { name: 'Players', value: `${DUMMY.playerCount}/10 — 3 spaces left`, inline: true },
    )
    .setFooter({ text: 'League of Legends Lobby Invite' })
    .setTimestamp();
}

// ── Layout 4 — Monospace code block, single list ───────────────────────────
function layout4() {
  const sorted = sortRoles(DUMMY.roleAssignments);
  const COL = 5;
  const rows = sorted.map(({ riotId, role }) =>
    `${(ROLE_LABEL[role] ?? role).padEnd(COL)}  ${riotId}`
  );
  const embed = baseEmbed('4 — Code block, single list');
  embed.addFields({ name: 'Party', value: `\`\`\`\n${rows.join('\n')}\n\`\`\`` });
  return embed;
}

// ── Layout 4a — Code block, Blue / Red team split ─────────────────────────
function layout4a() {
  const blue = sortRoles(DUMMY.roleAssignments.filter(r => r.team === '100'));
  const red  = sortRoles(DUMMY.roleAssignments.filter(r => r.team === '200'));
  const COL  = 5;

  const fmt = list =>
    list.length
      ? list.map(({ riotId, role }) => `${(ROLE_LABEL[role] ?? role).padEnd(COL)}  ${riotId}`).join('\n')
      : '(empty)';

  const embed = baseEmbed('4a — Code block, team split');
  embed.addFields(
    { name: '🔵 Blue Team', value: `\`\`\`\n${fmt(blue)}\n\`\`\``, inline: true },
    { name: '🔴 Red Team',  value: `\`\`\`\n${fmt(red)}\n\`\`\``,  inline: true },
  );
  return embed;
}

// ── Layout 5 — Roles in description, single list ──────────────────────────
function layout5() {
  const sorted = sortRoles(DUMMY.roleAssignments);
  const lines  = sorted.map(({ riotId, role }) => `**[${ROLE_LABEL[role] ?? role}]** ${riotId}`);
  return new EmbedBuilder()
    .setColor(0x1e90ff)
    .setTitle('League Lobby Open — 5 — Roles in description')
    .setURL(DUMMY.smartUrl)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Host',    value: DUMMY.ownerName,                            inline: true },
      { name: 'Mode',    value: `Custom — ${DUMMY.lobbyName}`,              inline: true },
      { name: 'Players', value: `${DUMMY.playerCount}/10 — 3 spaces left`, inline: true },
    )
    .setFooter({ text: 'League of Legends Lobby Invite' })
    .setTimestamp();
}

// ── Layout 5a — Roles in description, Blue / Red team split ───────────────
function layout5a() {
  const blue = sortRoles(DUMMY.roleAssignments.filter(r => r.team === '100'));
  const red  = sortRoles(DUMMY.roleAssignments.filter(r => r.team === '200'));

  const section = (header, list) => {
    if (!list.length) return null;
    const lines = list.map(({ riotId, role }) => `**[${ROLE_LABEL[role] ?? role}]** ${riotId}`);
    return `**${header}**\n${lines.join('\n')}`;
  };

  const sections = [
    section('🔵 Blue Team', blue),
    section('🔴 Red Team',  red),
  ].filter(Boolean);

  return new EmbedBuilder()
    .setColor(0x1e90ff)
    .setTitle('League Lobby Open — 5a — Description, team split')
    .setURL(DUMMY.smartUrl)
    .setDescription(sections.join('\n\n'))
    .addFields(
      { name: 'Host',    value: DUMMY.ownerName,                            inline: true },
      { name: 'Mode',    value: `Custom — ${DUMMY.lobbyName}`,              inline: true },
      { name: 'Players', value: `${DUMMY.playerCount}/10 — 3 spaces left`, inline: true },
    )
    .setFooter({ text: 'League of Legends Lobby Invite' })
    .setTimestamp();
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const token  = fs.readFileSync(TOKEN_FILE, 'utf8').replace(/\s+/g, '');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel) throw new Error('Channel not found');

      const layouts = [layout4, layout4a, layout5, layout5a];
      for (const fn of layouts) {
        await channel.send({ embeds: [fn()] });
        console.log(`Posted: ${fn.name}`);
        await new Promise(r => setTimeout(r, 800));
      }
      console.log('Done — all 4 layouts posted.');
    } catch (err) {
      console.error('Error:', err.message);
    } finally {
      client.destroy();
    }
  });

  await client.login(token);
}

main().catch(err => { console.error(err); process.exit(1); });
