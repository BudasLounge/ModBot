/**
 * League Match Archive
 * --------------------
 * Persists final (post-debounce) LeagueLoader match payloads to disk so that
 * later commands can analyze KDA over time, champion play rates, and other
 * historical stats without needing to re-fetch from Riot or LeagueLoader.
 *
 * Storage layout (flat, one file per gameId):
 *   <archiveDir>/<gameId>.json.gz
 *
 * The archive directory defaults to `modules/league/match_archive/` but can
 * be overridden via the `LEAGUE_MATCH_ARCHIVE_DIR` environment variable so
 * ops can redirect to a larger or external disk.
 *
 * Each file is a gzip-compressed compact JSON envelope:
 *   {
 *     "archivedAt": "2026-04-22T12:34:56.789Z",
 *     "gameId": "NA1_1234567890",
 *     "payload": { ...original LeagueLoader payload... }
 *   }
 *
 * Failure isolation: every public method catches its own errors and logs
 * them via the injected logger. Archive failures must NEVER bubble up and
 * interrupt match handling / Discord rendering.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzipAsync = promisify(zlib.gunzip);

// Strict allow-list for gameId values used as filenames. Riot gameIds look
// like "NA1_1234567890" or pure digits; restricting to this set blocks any
// path traversal attempts (e.g. "../../etc/passwd") from a malicious or
// malformed payload before the value ever touches the filesystem.
const SAFE_GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

class MatchArchive {
  /**
   * @param {object} logger - shared module logger (must expose info/warn/error)
   */
  constructor(logger) {
    this.logger = logger;
    this._archiveDir = null; // resolved + ensured lazily on first use
  }

  /**
   * Resolve the archive directory, creating it on first use.
   * @returns {string} absolute path to the archive directory
   */
  getArchiveDir() {
    if (this._archiveDir) return this._archiveDir;

    const configured = process.env.LEAGUE_MATCH_ARCHIVE_DIR;
    const dir = configured && configured.trim().length > 0
      ? path.resolve(configured.trim())
      : path.join(__dirname, '..', 'match_archive');

    try {
      fs.mkdirSync(dir, { recursive: true });
      this.logger.info('[LoL Match Archive] Archive directory ready', { dir });
    } catch (err) {
      // Don't cache on failure so subsequent calls retry.
      this.logger.error('[LoL Match Archive] Failed to create archive directory', {
        dir,
        err: err?.message,
      });
      throw err;
    }

    this._archiveDir = dir;
    return dir;
  }

  /**
   * Validate a gameId for filesystem use. Returns the sanitized id or null.
   * @param {*} gameId
   * @returns {string|null}
   */
  _safeGameId(gameId) {
    if (gameId === null || gameId === undefined) return null;
    const asString = String(gameId).trim();
    if (!SAFE_GAME_ID_RE.test(asString)) return null;
    return asString;
  }

  /**
   * Build the absolute path to the archive file for a given gameId.
   * Caller must pass an already-sanitized gameId.
   * @param {string} safeGameId
   * @returns {string}
   */
  _filePathFor(safeGameId) {
    return path.join(this.getArchiveDir(), `${safeGameId}.json.gz`);
  }

  /**
   * Persist the final debounced match payload to disk. Overwrites any
   * existing file for the same gameId (latest wins, matching the "one file
   * per gameId" archive policy).
   *
   * Never throws — archive failures are logged and swallowed so the caller's
   * Discord rendering continues uninterrupted.
   *
   * @param {object} payload - the normalized LeagueLoader match payload
   * @returns {{ ok: boolean, gameId?: string, bytes?: number, reason?: string }}
   */
  saveMatch(payload) {
    try {
      if (!payload || typeof payload !== 'object') {
        this.logger.warn('[LoL Match Archive] saveMatch called with non-object payload, skipping');
        return { ok: false, reason: 'invalid_payload' };
      }

      // Mirror the gameId resolution used by enqueueMatchPayload so we
      // archive under the same identifier the rest of the pipeline uses.
      const rawGameId = payload.gameId || payload.reportGameId;
      const gameId = this._safeGameId(rawGameId);
      if (!gameId) {
        this.logger.warn('[LoL Match Archive] No usable gameId on payload, skipping archive', {
          rawGameId,
        });
        return { ok: false, reason: 'no_game_id' };
      }

      this.logger.info('[LoL Match Archive] Saving match payload', { gameId });

      const envelope = {
        archivedAt: new Date().toISOString(),
        gameId,
        payload,
      };

      // Compact JSON keeps the file small; gzip on top of that gets us
      // another large reduction since match payloads are repetitive.
      const json = JSON.stringify(envelope);
      const gzipped = zlib.gzipSync(json);

      const finalPath = this._filePathFor(gameId);
      // Write to a temp file first then rename to avoid leaving a torn /
      // partially-written .json.gz on disk if the process dies mid-write.
      // The temp suffix includes pid + random bytes so a crashed prior run
      // can never leave an orphan tmp that collides with a new write, and
      // concurrent writers (shouldn't happen in practice, but belt &
      // suspenders) won't clobber each other's temp files.
      const tmpSuffix = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
      const tmpPath = `${finalPath}.${tmpSuffix}.tmp`;

      try {
        fs.writeFileSync(tmpPath, gzipped);
        fs.renameSync(tmpPath, finalPath);
      } catch (writeErr) {
        // Best-effort cleanup of the temp file so we don't leak it on
        // partial failures (e.g. rename denied by AV / permissions).
        try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
        throw writeErr;
      }

      this.logger.info('[LoL Match Archive] Saved match payload', {
        gameId,
        bytes: gzipped.length,
        path: finalPath,
      });

      return { ok: true, gameId, bytes: gzipped.length };
    } catch (err) {
      this.logger.error('[LoL Match Archive] Failed to save match payload', {
        err: err?.message,
        stack: err?.stack,
      });
      return { ok: false, reason: 'exception' };
    }
  }

  /**
   * List all archived gameIds (filenames without the .json.gz suffix).
   * @returns {string[]}
   */
  listMatchIds() {
    try {
      const dir = this.getArchiveDir();
      const entries = fs.readdirSync(dir);
      const ids = [];
      for (const name of entries) {
        if (!name.endsWith('.json.gz')) continue;
        const id = name.slice(0, -'.json.gz'.length);
        if (this._safeGameId(id)) ids.push(id);
      }
      return ids;
    } catch (err) {
      this.logger.error('[LoL Match Archive] Failed to list match ids', {
        err: err?.message,
      });
      return [];
    }
  }

  /**
   * Read and decompress the envelope for a single archived match.
   * @param {string} gameId
   * @returns {Promise<object|null>} the envelope, or null if missing/invalid
   */
  async readMatch(gameId) {
    const safe = this._safeGameId(gameId);
    if (!safe) {
      this.logger.warn('[LoL Match Archive] readMatch rejected unsafe gameId', { gameId });
      return null;
    }

    const filePath = this._filePathFor(safe);
    try {
      const buf = await fsp.readFile(filePath);
      const json = (await gunzipAsync(buf)).toString('utf8');
      return JSON.parse(json);
    } catch (err) {
      // ENOENT is an expected "not archived" case; log at info level only.
      if (err && err.code === 'ENOENT') {
        this.logger.info('[LoL Match Archive] No archive file for gameId', { gameId: safe });
        return null;
      }
      this.logger.error('[LoL Match Archive] Failed to read archived match', {
        gameId: safe,
        err: err?.message,
      });
      return null;
    }
  }

  /**
   * Stream archived matches one at a time so analytics commands can
   * aggregate large numbers of games without loading them all into memory.
   *
   * Usage:
   *   for await (const { gameId, envelope } of archive.iterateMatches()) {
   *     // ...accumulate stats...
   *   }
   *
   * Skips (and logs) any individual file that fails to read or decompress
   * so a single corrupt archive entry doesn't poison a full sweep.
   *
   * @returns {AsyncGenerator<{ gameId: string, envelope: object }>}
   */
  async *iterateMatches() {
    const ids = this.listMatchIds();
    for (const gameId of ids) {
      const envelope = await this.readMatch(gameId);
      if (!envelope) continue;
      yield { gameId, envelope };
    }
  }
}

module.exports = MatchArchive;
