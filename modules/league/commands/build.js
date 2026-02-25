'use strict';

const axios = require('axios');
const { buildChampionToon } = require('../lib/champion_builder');
const { buildItemsToon } = require('../lib/items_builder');

// ─── Toon encoder (ESM package, dynamic import fallback) ───────────────────────

let encodeToon = null;
let toonLoadError = null;

async function ensureToonEncoder(logger) {
    if (typeof encodeToon === 'function') return encodeToon;

    try {
        ({ encode: encodeToon } = require('@toon-format/toon'));
    } catch (err) {
        if (err?.code === 'ERR_REQUIRE_ESM') {
            try {
                const esmModule = await import('@toon-format/toon');
                encodeToon = esmModule?.encode ?? esmModule?.default?.encode ?? null;
            } catch (importErr) {
                toonLoadError = importErr;
                if (logger) logger.error('[build] ESM import of @toon-format/toon failed', { error: importErr?.message });
            }
        } else {
            toonLoadError = err;
            if (logger) logger.error('[build] require @toon-format/toon failed', { error: err?.message });
        }
    }

    if (typeof encodeToon !== 'function') {
        throw toonLoadError || new Error('@toon-format/toon could not be loaded');
    }

    return encodeToon;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CDRAGON_SUMMARY_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json';
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || 'http://192.168.1.10/v1';
const KEY_LOL_THEORYCRAFT_BUILDER = process.env.KEY_LOL_THEORYCRAFT_BUILDER;

// ─── Champion name matching ─────────────────────────────────────────────────────

function normalizeChampionName(name) {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

function findChampionMatch(champions, userInput) {
    const normalizedInput = normalizeChampionName(userInput);
    if (!normalizedInput) {
        return { match: null, ambiguous: [] };
    }

    const exactMatches = champions.filter((champion) => {
        const normalizedName = normalizeChampionName(champion?.name);
        const normalizedAlias = normalizeChampionName(champion?.alias);
        return normalizedInput === normalizedName || normalizedInput === normalizedAlias;
    });

    if (exactMatches.length === 1) {
        return { match: exactMatches[0], ambiguous: [] };
    }

    if (exactMatches.length > 1) {
        return { match: null, ambiguous: exactMatches };
    }

    const partialMatches = champions.filter((champion) => {
        const normalizedName = normalizeChampionName(champion?.name);
        const normalizedAlias = normalizeChampionName(champion?.alias);
        return normalizedName.includes(normalizedInput) || normalizedAlias.includes(normalizedInput);
    });

    if (partialMatches.length === 1) {
        return { match: partialMatches[0], ambiguous: [] };
    }

    return { match: null, ambiguous: partialMatches };
}

// ─── Discord helpers ───────────────────────────────────────────────────────────

function splitForDiscord(content, maxLength = 1900) {
    const chunks = [];
    let remaining = String(content || '');

    while (remaining.length > maxLength) {
        let splitIndex = remaining.lastIndexOf('\n', maxLength);
        if (splitIndex < 1) {
            splitIndex = maxLength;
        }
        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    if (remaining.length) {
        chunks.push(remaining);
    }

    return chunks;
}

function stripThinkingBlocks(text) {
    return String(text || '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^\s*think\s*>/i, '')
        .trim();
}

// ─── Dify workflow helpers ─────────────────────────────────────────────────────

async function sendWorkflowRequest(inputs, userId, logger) {
    logger.info('[build] Sending payload to Dify workflow', {
        champion: inputs.champion_name,
        buildTypeLength: String(inputs.build_type || '').length
    });

    const response = await axios.post(
        `${DIFY_BASE_URL}/workflows/run`,
        {
            inputs,
            response_mode: 'blocking',
            user: `discord-${userId}`
        },
        {
            headers: {
                Authorization: `Bearer ${KEY_LOL_THEORYCRAFT_BUILDER}`,
                'Content-Type': 'application/json'
            },
            timeout: 180000
        }
    );

    return response?.data;
}

function extractWorkflowText(workflowData) {
    const outputs = workflowData?.data?.outputs || {};

    if (typeof outputs.text === 'string' && outputs.text.trim()) {
        return outputs.text.trim();
    }

    const candidate = Object.values(outputs).find((value) => typeof value === 'string' && value.trim());
    if (candidate) {
        return candidate.trim();
    }

    if (workflowData?.data?.error) {
        return `Workflow error: ${workflowData.data.error}`;
    }

    return `Workflow completed, but no text output was returned. Raw output keys: ${Object.keys(outputs).join(', ') || 'none'}`;
}

// ─── Module export ─────────────────────────────────────────────────────────────

module.exports = {
    name: 'build',
    description: 'Generate champion + item toon payloads and send them to the LoL theorycraft workflow',
    syntax: 'build [champion name] [build type]',
    num_args: 2,
    args_to_lower: false,
    needs_api: false,
    has_state: false,

    // Debug access for build2
    __debug: {
        findChampionMatch,
        buildChampionToon,
        buildItemsToon,
        stripThinkingBlocks
    },

    async execute(message, args, extra) {
        this.logger.info('[build] Execute called', { userId: message.member?.id, argsLength: args.length });

        try {
            await ensureToonEncoder(this.logger);
        } catch (err) {
            this.logger.error('[build] Missing dependency @toon-format/toon', { error: err?.message });
            await message.reply('I could not load `@toon-format/toon`. Please install it and try again.');
            return;
        }

        if (!KEY_LOL_THEORYCRAFT_BUILDER) {
            this.logger.error('[build] Missing KEY_LOL_THEORYCRAFT_BUILDER env var');
            await message.reply('Missing environment variable: KEY_LOL_THEORYCRAFT_BUILDER');
            return;
        }

        const championInput = String(args[1] || '').trim();
        const buildType = args.slice(2).join(' ').trim();

        if (!championInput) {
            await message.reply('Usage: `,build <champion name> <build type>`');
            return;
        }

        if (!buildType) {
            await message.reply('Please provide a build type. Usage: `,build <champion name> <build type>`');
            return;
        }

        const statusMessage = await message.reply({ content: `Building theorycraft payload for **${championInput}**...` });

        try {
            this.logger.info('[build] Validating champion name');
            const summaryResponse = await axios.get(CDRAGON_SUMMARY_URL, { timeout: 30000 });
            const champions = Array.isArray(summaryResponse?.data)
                ? summaryResponse.data.filter((champion) => Number(champion?.id) > 0)
                : [];

            const { match, ambiguous } = findChampionMatch(champions, championInput);
            if (!match) {
                if (ambiguous.length > 1) {
                    const topMatches = ambiguous.slice(0, 8).map((champion) => champion.name).join(', ');
                    await statusMessage.edit({ content: `Champion name is ambiguous. Did you mean: ${topMatches}` });
                    return;
                }

                await statusMessage.edit({ content: `Could not find a champion matching "${championInput}".` });
                return;
            }

            this.logger.info('[build] Champion validated', { championName: match.name, championId: match.id, buildType });
            await statusMessage.edit({ content: `Champion validated (**${match.name}**). Building toon payloads...` });

            const encode = await ensureToonEncoder(this.logger);

            const [championToon, itemsToon] = await Promise.all([
                buildChampionToon(match.name, encode, this.logger),
                buildItemsToon(encode, this.logger)
            ]);

            const workflowPayload = {
                champion_name: match.name,
                build_type: buildType,
                champion_toon: championToon,
                items_toon: itemsToon
            };

            this.logger.info('[build] Payloads generated', {
                championToonLength: championToon.length,
                itemsToonLength: itemsToon.length
            });
            await statusMessage.edit({ content: `Let me cook for **${match.name}**... this might take a minute.` });

            const workflowData = await sendWorkflowRequest(workflowPayload, message.author.id, this.logger);
            let workflowText = extractWorkflowText(workflowData);
            const sanitizedWorkflowText = stripThinkingBlocks(workflowText);

            if (sanitizedWorkflowText !== workflowText) {
                this.logger.info('[build] Sanitized thinking tags from workflow response', {
                    beforeLength: workflowText.length,
                    afterLength: sanitizedWorkflowText.length
                });
            }

            workflowText = sanitizedWorkflowText;

            const chunks = splitForDiscord(workflowText, 1900);
            await statusMessage.edit({ content: `Theorycraft build received for **${match.name}** (${buildType}).` });

            for (const chunk of chunks) {
                await message.channel.send({ content: chunk });
            }

            this.logger.info('[build] Workflow completed successfully', {
                championName: match.name,
                outputLength: workflowText.length,
                outputChunks: chunks.length
            });
        } catch (error) {
            this.logger.error('[build] Failed to generate build', {
                error: error?.response?.data || error?.message || error
            });

            const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
            await statusMessage.edit({ content: `Build generation failed: ${errorMessage}` });
        }
    }
};
