'use strict';

/**
 * Debug command: ,build2 <champion>
 * Runs champion + item toon generation without calling Dify, posts diagnostics.
 */

const { buildChampionToon } = require('../lib/champion_builder');
const { buildItemsToon } = require('../lib/items_builder');

let encodeToon = null;

async function ensureToonEncoder() {
    if (typeof encodeToon === 'function') return encodeToon;
    try {
        ({ encode: encodeToon } = require('@toon-format/toon'));
    } catch (err) {
        if (err?.code === 'ERR_REQUIRE_ESM') {
            const esmModule = await import('@toon-format/toon');
            encodeToon = esmModule?.encode ?? esmModule?.default?.encode ?? null;
        } else {
            throw err;
        }
    }
    if (typeof encodeToon !== 'function') throw new Error('@toon-format/toon could not be loaded');
    return encodeToon;
}

module.exports = {
    name: 'build2',
    description: 'Debug: generate champion + item toon payloads without sending to Dify',
    syntax: 'build2 [champion name]',
    num_args: 1,
    args_to_lower: false,
    needs_api: false,
    has_state: false,

    async execute(message, args, extra) {
        this.logger.info('[build2] Debug execute called', { userId: message.member?.id });

        const championInput = String(args[1] || '').trim();
        if (!championInput) {
            await message.reply('Usage: `,build2 <champion name>`');
            return;
        }

        const statusMessage = await message.reply({ content: `Running debug toon build for **${championInput}**...` });

        try {
            const encode = await ensureToonEncoder();

            const [championToon, itemsToon] = await Promise.all([
                buildChampionToon(championInput, encode, this.logger),
                buildItemsToon(encode, this.logger)
            ]);

            // Diagnostic metrics
            const champHashTokens = (championToon.match(/\{[0-9a-f]{8}\}/gi) || []).length;
            const champUnmapped = (championToon.match(/UnmappedValue/g) || []).length;
            const champUndefinedStats = (championToon.match(/Stat\[undefined\]/g) || []).length;
            const champEngineMath = (championToon.match(/ENGINE MATH:/g) || []).length;

            const diagnostics = [
                `**Champion Toon Diagnostics — ${championInput}**`,
                `\`\`\``,
                `length              : ${championToon.length}`,
                `unresolvedHashTokens: ${champHashTokens}`,
                `unmappedValueTokens : ${champUnmapped}`,
                `undefinedStatTokens : ${champUndefinedStats}`,
                `engineMathSections  : ${champEngineMath}`,
                `itemsToonLength     : ${itemsToon.length}`,
                `\`\`\``,
                `**Champion toon preview (first 3500 chars):**`,
                `\`\`\``,
                championToon.slice(0, 3500),
                `\`\`\``
            ].join('\n');

            await statusMessage.edit({ content: 'Debug toon generated. Posting diagnostics...' });

            // Split and send
            const chunks = [];
            let remaining = diagnostics;
            while (remaining.length > 1900) {
                let split = remaining.lastIndexOf('\n', 1900);
                if (split < 1) split = 1900;
                chunks.push(remaining.slice(0, split));
                remaining = remaining.slice(split).trimStart();
            }
            if (remaining.length) chunks.push(remaining);

            for (const chunk of chunks) {
                await message.channel.send({ content: chunk });
            }

            this.logger.info('[build2] Debug toon complete', {
                championInput,
                champToonLength: championToon.length,
                unresolvedHashTokens: champHashTokens,
                unmappedValueTokens: champUnmapped,
                undefinedStatTokens: champUndefinedStats,
                engineMathSections: champEngineMath
            });
        } catch (error) {
            this.logger.error('[build2] Debug toon failed', { error: error?.message || error });
            await statusMessage.edit({ content: `Debug build failed: ${error?.message || 'Unknown error'}` });
        }
    }
};
