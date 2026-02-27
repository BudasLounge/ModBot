/**
 * Adapts a Discord.js ChatInputCommandInteraction to a message-like interface,
 * so existing command execute(message, args, extra) functions can work with
 * slash commands with minimal changes to command files.
 *
 * Key mappings:
 *   message.author          → interaction.user
 *   message.member          → interaction.member
 *   message.guild           → interaction.guild
 *   message.channel.id      → interaction.channelId
 *   message.channel.send()  → interaction.reply() / interaction.followUp()
 *   message.reply()         → interaction.reply() / interaction.followUp()
 *   message.delete()        → no-op (slash interactions cannot be deleted)
 *   message.mentions.users.first()   → first USER option user
 *   message.mentions.members.first() → first USER option member
 */
class InteractionAdapter {

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     * @param {import('discord.js').User|null} firstUser  - first USER-type option user (or null)
     * @param {import('discord.js').GuildMember|null} firstMember - first USER-type option member (or null)
     * @param {import('winston').Logger} logger
     */
    constructor(interaction, firstUser, firstMember, logger) {
        this._interaction = interaction;
        this._firstUser = firstUser || null;
        this._firstMember = firstMember || null;
        this._logger = logger;

        /** @type {import('discord.js').User} message.author equivalent */
        this.author = interaction.user;

        /** @type {import('discord.js').GuildMember} message.member equivalent */
        this.member = interaction.member;

        /** @type {import('discord.js').Guild} message.guild equivalent */
        this.guild = interaction.guild;

        // ── message.channel proxy ───────────────────────────────────────────
        const self = this;
        this.channel = {
            id: interaction.channelId,
            guild: interaction.guild,
            /** message.channel.send() proxy */
            send: async (payload) => self._respond(payload),
        };

        // ── message.mentions proxy ──────────────────────────────────────────
        this.mentions = {
            users: {
                first: () => this._firstUser,
            },
            members: {
                first: () => this._firstMember,
            },
        };
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    /**
     * Sends a response via the interaction. Uses reply() if the interaction has
     * not yet been replied to; otherwise uses followUp() so that multiple sends
     * from a single command all reach the user.
     * @param {string|Object} payload
     */
    async _respond(payload) {
        if (typeof payload === 'string') {
            payload = { content: payload };
        }
        try {
            if (this._interaction.replied) {
                // Already sent a real reply — send additional messages as follow-ups
                return await this._interaction.followUp(payload);
            } else if (this._interaction.deferred) {
                // Deferred but not yet replied — editReply replaces the "thinking…" indicator
                return await this._interaction.editReply(payload);
            } else {
                return await this._interaction.reply(payload);
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`[InteractionAdapter] _respond error: ${err.message}`);
            }
            // Best-effort fallback
            try {
                return await this._interaction.followUp(payload);
            } catch (_) { /* silently ignore */ }
        }
    }

    // ── Public message-like API ─────────────────────────────────────────────

    /**
     * message.reply() equivalent.
     * @param {string|Object} payload
     */
    async reply(payload) {
        if (typeof payload === 'string') {
            payload = { content: payload };
        }
        return this._respond(payload);
    }

    /**
     * message.delete() equivalent – no-op for slash commands.
     * Slash command interactions cannot be deleted via this method.
     */
    async delete() {
        // No-op: slash command interactions are not deletable the same way.
    }

    /**
     * Defer the reply for long-running commands. Keeps the interaction alive.
     * @param {Object} [options]
     */
    async deferReply(options = {}) {
        return this._interaction.deferReply(options);
    }
}

module.exports = InteractionAdapter;
