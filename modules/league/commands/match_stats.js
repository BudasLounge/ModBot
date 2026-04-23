/**
 * /match_stats <game_id>
 *
 * Renders per-player post-match stats for an archived LeagueLoader match.
 * Reads the gzipped envelope from the match archive, generates the stats
 * image for the first player in the ordered roster (Blue top → Red support),
 * and posts it with a full set of pagination buttons. The buttons reuse the
 * existing `LEAGUE_PLAYER_STATS_{gameId}_{idx}` handler in events.js, which
 * now falls back to the archive on cache miss — so pagination works
 * indefinitely, not just within the 5-minute post-match cache window.
 *
 * Options:
 *   game_id (required STRING) — the Riot / LeagueLoader gameId as stored
 *     in the archive (e.g. 5545789240 or NA1_5545789240).
 */

const { AttachmentBuilder } = require('discord.js');

// Pull shared render + selector helpers from the league events module.
// These are attached to the callable `register_handlers` export to avoid
// duplicating the stats pipeline across files.
const leagueEvents = require('../events.js');

module.exports = {
    name: 'match_stats',
    description: 'Show per-player stats for an archived match (paginated by player).',
    syntax: 'match_stats [game_id]',
    num_args: 1,
    // Preserve case — gameIds can contain region prefixes like "NA1_...".
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    options: [
        {
            name: 'game_id',
            description: 'Game ID of an archived match (e.g. 5545789240)',
            type: 'STRING',
            required: true,
        },
    ],

    async execute(message, args, extra) {
        this.logger.info('[match_stats] Execute called', {
            userId: message.author?.id,
            argsLength: args.length,
        });

        const rawGameId = (args[1] || '').trim();
        if (!rawGameId) {
            message.channel.send({ content: 'Usage: `/match_stats [game_id]`' });
            return;
        }

        // Resolve shared helpers. If events.js isn't wired up (e.g. module
        // loaded partially during reload), fail loud but friendly.
        const archive = typeof leagueEvents.getMatchArchive === 'function'
            ? leagueEvents.getMatchArchive()
            : null;
        const generatePlayerStatsImage = leagueEvents.generatePlayerStatsImage;
        const getAllPlayersOrdered = leagueEvents.getAllPlayersOrdered;
        const buildPlayerSelectorRows = leagueEvents.buildPlayerSelectorRows;

        if (!archive || !generatePlayerStatsImage || !getAllPlayersOrdered || !buildPlayerSelectorRows) {
            this.logger.error('[match_stats] League events helpers unavailable', {
                hasArchive: Boolean(archive),
                hasGen: Boolean(generatePlayerStatsImage),
                hasOrder: Boolean(getAllPlayersOrdered),
                hasRows: Boolean(buildPlayerSelectorRows),
            });
            message.channel.send({ content: 'Internal error: match analysis pipeline not initialized. Try again shortly.' });
            return;
        }

        // Load the archived envelope. readMatch returns null on missing /
        // malformed files without throwing.
        this.logger.info('[match_stats] Reading archive', { gameId: rawGameId });
        const envelope = await archive.readMatch(rawGameId);
        if (!envelope || !envelope.payload) {
            this.logger.info('[match_stats] No archive found for gameId', { gameId: rawGameId });
            message.channel.send({
                content:
                    `No archived match found for \`${rawGameId}\`. ` +
                    `The archive only contains matches the bot has seen via LeagueLoader; make sure the ID is correct.`,
            });
            return;
        }

        const payload = envelope.payload;
        const allPlayers = getAllPlayersOrdered(payload);
        if (!Array.isArray(allPlayers) || allPlayers.length === 0) {
            this.logger.warn('[match_stats] Archived payload had no players', { gameId: rawGameId });
            message.channel.send({ content: `Archived match \`${rawGameId}\` contained no player data.` });
            return;
        }

        // Render the first player (blue-team top lane in tab order) and post
        // the paginator. Clicking any button fires the existing
        // LEAGUE_PLAYER_STATS_ handler, which will re-read from the archive.
        const activeIdx = 0;
        const activePlayer = allPlayers[activeIdx];

        this.logger.info('[match_stats] Generating first-page image', {
            gameId: rawGameId,
            playerCount: allPlayers.length,
            archivedAt: envelope.archivedAt,
            firstChampion: activePlayer?.championName,
        });

        const result = await generatePlayerStatsImage(activePlayer, payload, allPlayers);
        if (!result || !result.imageBuffer) {
            const errMsg = result?.errorMessage || 'unknown error';
            this.logger.error('[match_stats] Image generation failed', { gameId: rawGameId, errMsg });
            message.channel.send({ content: `Could not generate stats image: ${errMsg}` });
            return;
        }

        // Archive stores canonical gameId; use it for the button customIds so
        // the handler's cache/archive lookup resolves to the same file.
        const canonicalGameId = envelope.gameId || String(rawGameId);
        const rows = buildPlayerSelectorRows(allPlayers, canonicalGameId, activeIdx);
        const attachment = new AttachmentBuilder(result.imageBuffer, {
            name: `player-stats-${canonicalGameId}-${activeIdx}.png`,
        });

        // Build a short human-readable header line with archive provenance
        // and basic match info so users know what they're looking at.
        const gameLen = payload.gameLength || 0;
        const durationLabel = gameLen > 0
            ? `${Math.floor(gameLen / 60)}m ${gameLen % 60}s`
            : 'unknown duration';
        // Convert ISO archivedAt to a Discord timestamp tag (<t:unix:D> → "Month Day, Year").
        const archivedAtLabel = envelope.archivedAt
            ? `archived <t:${Math.floor(new Date(envelope.archivedAt).getTime() / 1000)}:D>`
            : 'archive time unknown';
        const header =
            `**Match \`${canonicalGameId}\`** — ${payload.gameMode || 'LoL'} • ${durationLabel} • ${archivedAtLabel}\n` +
            `Use the buttons below to page through all ${allPlayers.length} players.`;

        this.logger.info('[match_stats] Sending paginated stats post', { gameId: canonicalGameId });
        await message.channel.send({
            content: header,
            files: [attachment],
            components: rows,
        });
    },
};
