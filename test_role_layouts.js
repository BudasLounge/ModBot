/**
 * test_role_layouts.js
 * Posts 5 different roleAssignment layout variants to the lobby invite channel
 * so you can pick the one you want.
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
const TOKEN_FILE       = path.join(__dirname, '..', 'token.txt');
const CHANNEL_ID       = '1140019871736938537';

// ── Dummy payload (mirrors the Custom Lobby example from the doc) ──────────
const DUMMY = {
  smartUrl:    'https://gg.riotgames.com/LOL?joinCode=NRro-5mLA-Tn24',
  ownerName:   'BigBuda#buda',
  playerCount: 7,
  lobbyName:   "BigBuda's Game",
  isCustom:    true,
  queueId:     3130,
  gameMode:    'CLASSIC',
  roleAssignments: [
    { riotId: 'BigBuda#buda',           role: 'BOTTOM'  },
    { riotId: 'xNullx#1337',            role: 'TOP'     },
    { riotId: 'Type C Cable#NA1',       role: 'MIDDLE'  },
    { riotId: 'Pyke Wazowski#LEGGO',    role: 'JUNGLE'  },
    { riotId: 'uncoolbi#yeet',          role: 'UTILITY' },
    { riotId: 'SpectatorGuy#NA1',       role: 'FILL'    }, // extra to fill to 7 shown
    { riotId: 'LastGuy#EUW',            role: 'TOP'     }, // duplicate role to stress-test
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

function baseEmbed(label) {
  return new EmbedBuilder()
    .setColor(0x1e90ff)
    .setTitle(`League Lobby Open — Layout ${label}`)
    .setURL(DUMMY.smartUrl)
    .addFields(
      { name: 'Host',    value: DUMMY.ownerName,                            inline: true },
      { name: 'Mode',    value: `Custom — ${DUMMY.lobbyName}`,              inline: true },
      { name: 'Players', value: `${DUMMY.playerCount}/10 — 3 spaces left`, inline: true },
    )
    .setFooter({ text: 'League of Legends Lobby Invite' })
    .setTimestamp();
}

// ── Layout builders ────────────────────────────────────────────────────────

/**
 * Layout 1: One inline embed field per role assignment.
 * Renders as a wrapping grid — up to 3 per row in Discord.
 */
function layout1() {
  const embed = baseEmbed('1 — One field per role');
  for (const { riotId, role } of sortRoles(DUMMY.roleAssignments)) {
    embed.addFields({ name: ROLE_LABEL[role] ?? role, value: riotId, inline: true });
  }
  return embed;
}

/**
 * Layout 2: Single "Party" field, one line per player — role · name.
 */
function layout2() {
  const embed = baseEmbed('2 — Single field, role · name');
  const lines = sortRoles(DUMMY.roleAssignments)
    .map(({ riotId, role }) => `**${ROLE_LABEL[role] ?? role}** · ${riotId}`);
  embed.addFields({ name: 'Party', value: lines.join('\n') });
  return embed;
}

/**
 * Layout 3: Two side-by-side inline fields — Role column | Player column.
 * Relies on Discord rendering inline fields 2-per-row when exactly two are present.
 */
function layout3() {
  const sorted = sortRoles(DUMMY.roleAssignments);
  const embed = baseEmbed('3 — Two columns: Role | Player');
  embed.addFields(
    { name: 'Role',   value: sorted.map(({ role }) => ROLE_LABEL[role] ?? role).join('\n'), inline: true },
    { name: 'Player', value: sorted.map(({ riotId }) => riotId).join('\n'),                 inline: true },
  );
  return embed;
}

/**
 * Layout 4: Monospace code block table inside a single field.
 */
function layout4() {
  const sorted = sortRoles(DUMMY.roleAssignments);
  const COL = 5; // width of role column
  const rows = sorted.map(({ riotId, role }) => {
    const label = (ROLE_LABEL[role] ?? role).padEnd(COL);
    return `${label}  ${riotId}`;
  });
  const embed = baseEmbed('4 — Code block table');
  embed.addFields({ name: 'Party', value: `\`\`\`\n${rows.join('\n')}\n\`\`\`` });
  return embed;
}

/**
 * Layout 5: Roles embedded in the description — bold role tag followed by name,
 * separated by newlines. No extra field needed.
 */
function layout5() {
  const sorted = sortRoles(DUMMY.roleAssignments);
  const lines = sorted.map(({ riotId, role }) => `**[${ROLE_LABEL[role] ?? role}]** ${riotId}`);
  return new EmbedBuilder()
    .setColor(0x1e90ff)
    .setTitle('League Lobby Open — Layout 5 — Roles in description')
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

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const token = fs.readFileSync(TOKEN_FILE, 'utf8').replace(/\s+/g, '');

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel) throw new Error('Channel not found');

      const layouts = [layout1, layout2, layout3, layout4, layout5];
      for (const fn of layouts) {
        await channel.send({ embeds: [fn()] });
        console.log(`Posted: ${fn.name}`);
        // Small delay to preserve ordering in the channel.
        await new Promise(r => setTimeout(r, 800));
      }

      console.log('Done — all 5 layouts posted.');
    } catch (err) {
      console.error('Error:', err.message);
    } finally {
      client.destroy();
    }
  });

  await client.login(token);
}

main().catch(err => { console.error(err); process.exit(1); });
