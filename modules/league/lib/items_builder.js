'use strict';

/**
 * Items toon builder — exact port of get-items.js logic.
 * Exported: buildItemsToon(encodeToon, logger)
 */

const axios = require('axios');

const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';

// ─── Riot API Bug Blacklist ─────────────────────────────────────────────────────

const RIOT_API_BUG_BLACKLIST = new Set([
    'Cruelty', 'Flesheater', "Demon King's Crown", 'Shield of Molten Stone',
    'Cloak of Starry Night', 'Sword of the Divine', "Veigar's Talisman of Ascension",
    'Gargoyle Stoneplate', 'Sword of Blossoming Dawn', 'Crown of the Shattered Queen',
    "Gambler's Blade", "Atma's Reckoning", 'Zephyr'
]);

// ─── CDragon URL builders ───────────────────────────────────────────────────────

function toCDragonPatchTag(ddragonVersion) {
    const parts = String(ddragonVersion).split('.');
    if (parts.length >= 2) {
        return `${parts[0]}.${parts[1]}`;
    }
    return String(ddragonVersion);
}

function buildCDragonUrls(patchTag) {
    const base = `https://raw.communitydragon.org/${patchTag}`;
    return {
        items: `${base}/plugins/rcp-be-lol-game-data/global/default/v1/items.json`,
        itemsBin: `${base}/game/items.cdtb.bin.json`,
        stringtable: `${base}/game/en_us/data/menu/en_us/lol.stringtable.json`
    };
}

// ─── Text / number helpers ──────────────────────────────────────────────────────

function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';

    return text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li>/gi, '• ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{\{\s*[^}]+\s*\}\}/g, ' ')
        .replace(/\s*\n\s*/g, ' | ')
        .replace(/\s+/g, ' ')
        .replace(/\|\s*\|/g, '|')
        .replace(/\s+\./g, '.')
        .trim();
}

function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    const rounded = Number(numeric.toFixed(3));
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function toTokenAlias(fieldName) {
    if (!fieldName || fieldName.length < 2) return null;
    if (!fieldName.startsWith('m')) return null;

    const second = fieldName.charAt(1);
    if (second !== second.toUpperCase()) return null;

    return second.toLowerCase() + fieldName.slice(2);
}

function statIdToLabel(statId) {
    const statMap = {
        1: 'Armor',
        2: 'Attack Damage',
        3: 'Ability Power',
        5: 'Magic Resist',
        6: 'Health',
        7: 'Max Health',
        8: 'Bonus Health',
        9: 'Bonus AD',
        11: 'Max Mana',
        12: 'Bonus Health',
        29: 'Lethality'
    };

    return statMap[statId] || `Stat[${statId}]`;
}

function inferStatFromName(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('ap')) return 'Ability Power';
    if (lower.includes('bonusad') || lower.includes('bad')) return 'Bonus AD';
    if (lower.includes('ad')) return 'Attack Damage';
    if (lower.includes('health') || lower.includes('hp')) return 'Health';
    if (lower.includes('mana')) return 'Max Mana';
    return 'Ability Power';
}

function isHashToken(token) {
    return typeof token === 'string' && /^\{[0-9a-f]{8}\}$/i.test(token);
}

function sanitizeTokenName(token, fallback = 'Value') {
    if (!token) return fallback;
    if (isHashToken(token)) return fallback;
    return String(token);
}

// ─── Item calculation parser ────────────────────────────────────────────────────

function parseItemCalculation(calc, dataValues, calculations, seen = new Set()) {
    if (!calc) return '';
    if (typeof calc === 'number') return formatNumber(calc);

    if (typeof calc === 'string') {
        if (isHashToken(calc)) return '';
        if (dataValues[calc] !== undefined) return formatNumber(dataValues[calc]);
        if (calculations[calc] && !seen.has(calc)) {
            seen.add(calc);
            const nested = parseItemCalculation(calculations[calc], dataValues, calculations, seen);
            seen.delete(calc);
            return nested || calc;
        }
        return calc;
    }

    if (calc.__type === 'NumberCalculationPart') {
        return formatNumber(calc.mNumber);
    }

    if (calc.__type === 'NamedDataValueCalculationPart') {
        if (isHashToken(calc.mDataValue)) return 'UnknownValue';
        return dataValues[calc.mDataValue] !== undefined
            ? formatNumber(dataValues[calc.mDataValue])
            : calc.mDataValue;
    }

    if (calc.__type === 'StatByNamedDataValueCalculationPart') {
        const coeffValue = dataValues[calc.mDataValue] !== undefined
            ? formatNumber(dataValues[calc.mDataValue])
            : calc.mDataValue;
        const stat = calc.mStat !== undefined
            ? statIdToLabel(calc.mStat)
            : inferStatFromName(calc.mDataValue);
        return `(${coeffValue} * ${stat})`;
    }

    if (calc.__type === 'StatByCoefficientCalculationPart') {
        const stat = calc.mStat !== undefined
            ? statIdToLabel(calc.mStat)
            : 'Ability Power';
        return `(${formatNumber(calc.mCoefficient)} * ${stat})`;
    }

    if (calc.__type === 'AbilityResourceByCoefficientCalculationPart') {
        const coeff = formatNumber(calc.mCoefficient ?? 1);
        return `(${coeff} * Max Mana)`;
    }

    if (calc.__type === 'BuffCounterByNamedDataValueCalculationPart') {
        const coeffValue = dataValues[calc.mDataValue] !== undefined
            ? formatNumber(dataValues[calc.mDataValue])
            : sanitizeTokenName(calc.mDataValue, 'Value');
        return `(${coeffValue} * BuffCounter)`;
    }

    if (calc.__type === 'BuffCounterByCoefficientCalculationPart') {
        const coeff = formatNumber(calc.mCoefficient ?? 1);
        return `(${coeff} * BuffCounter)`;
    }

    if (calc.__type === 'StatBySubPartCalculationPart') {
        const stat = calc.mStat !== undefined
            ? statIdToLabel(calc.mStat)
            : 'Ability Power';
        const subPart = parseItemCalculation(calc.mSubpart, dataValues, calculations, seen);
        return subPart ? `(${subPart} * ${stat})` : '';
    }

    if (calc.__type === 'SumOfSubPartsCalculationPart') {
        const parts = Array.isArray(calc.mSubparts)
            ? calc.mSubparts.map(p => parseItemCalculation(p, dataValues, calculations, seen)).filter(Boolean)
            : [];
        return parts.join(' + ');
    }

    if (calc.__type === 'ProductOfSubPartsCalculationPart') {
        const part1 = parseItemCalculation(calc.mPart1, dataValues, calculations, seen);
        const part2 = parseItemCalculation(calc.mPart2, dataValues, calculations, seen);
        if (part1 && part2) return `(${part1} * ${part2})`;
        return part1 || part2 || '';
    }

    if (calc.__type === 'ByItemEpicnessCountCalculationPart') {
        return 'LegendaryItemCount';
    }

    if (calc.__type === 'ByCharLevelInterpolationCalculationPart') {
        const start = formatNumber(calc.mStartValue ?? 0);
        const end = formatNumber(calc.mEndValue ?? calc.mStartValue ?? 0);
        return `[LevelScale ${start}->${end}]`;
    }

    if (calc.__type === 'ByCharLevelBreakpointsCalculationPart') {
        const level1 = formatNumber(calc.mLevel1Value ?? 0);
        const initialPerLevel = typeof calc.mInitialBonusPerLevel === 'number'
            ? `, +${formatNumber(calc.mInitialBonusPerLevel)}/lvl`
            : '';
        const breakpoints = Array.isArray(calc.mBreakpoints) && calc.mBreakpoints.length
            ? `, breakpoints=${calc.mBreakpoints.length}`
            : '';
        return `[Level1=${level1}${initialPerLevel}${breakpoints}]`;
    }

    if (calc.__type === 'GameCalculation' || Array.isArray(calc.mFormulaParts)) {
        const parts = Array.isArray(calc.mFormulaParts)
            ? calc.mFormulaParts.map(p => parseItemCalculation(p, dataValues, calculations, seen)).filter(Boolean)
            : [];
        const base = parts.join(' + ');

        const multiplierPart = calc.mMultiplier || calc.mRangedMultiplier;
        if (multiplierPart) {
            const multiplier = parseItemCalculation(multiplierPart, dataValues, calculations, seen);
            if (base && multiplier) return `(${base}) * ${multiplier}`;
        }

        return base;
    }

    if (calc.__type === 'GameCalculationModified') {
        const base = parseItemCalculation(calc.mModifiedGameCalculation, dataValues, calculations, seen);
        const mult = parseItemCalculation(calc.mMultiplier || calc.mCoefficient, dataValues, calculations, seen);
        if (base && mult) return `(${base} * ${mult})`;
        return base;
    }

    if (calc.mPart1 || calc.mPart2) {
        const part1 = parseItemCalculation(calc.mPart1, dataValues, calculations, seen);
        const part2 = parseItemCalculation(calc.mPart2, dataValues, calculations, seen);
        if (part1 && part2) return `(${part1} * ${part2})`;
        return part1 || part2 || '';
    }

    return '';
}

// ─── Item resolver ──────────────────────────────────────────────────────────────

function buildItemResolver(binItem) {
    if (!binItem) return {};

    const resolver = {};

    for (const [key, value] of Object.entries(binItem)) {
        if (typeof value === 'number') {
            resolver[key.toLowerCase()] = value;

            const alias = toTokenAlias(key);
            if (alias) {
                resolver[alias.toLowerCase()] = value;
            }
        }
    }

    const dataValues = {};
    for (const dataValue of (binItem.mDataValues || [])) {
        if (dataValue?.mName && typeof dataValue.mValue === 'number') {
            dataValues[dataValue.mName] = dataValue.mValue;
            resolver[dataValue.mName.toLowerCase()] = dataValue.mValue;
        }
    }

    const calculations = binItem.mItemCalculations || {};
    for (const [calcName, calcObj] of Object.entries(calculations)) {
        const parsed = parseItemCalculation(calcObj, dataValues, calculations);
        if (parsed) resolver[calcName.toLowerCase()] = parsed;
    }

    return resolver;
}

// ─── Tooltip helpers ────────────────────────────────────────────────────────────

function extractMainText(rawTooltip) {
    if (!rawTooltip || typeof rawTooltip !== 'string') return rawTooltip || '';

    const match = rawTooltip.match(/<mainText>([\s\S]*?)<\/mainText>/i);
    if (match && match[1]) {
        return match[1];
    }

    return rawTooltip;
}

function resolveTooltipTemplate(raw, resolver) {
    if (!raw) return '';

    const withTokens = raw.replace(/@([a-zA-Z0-9_.]+)(\*100(?:\.0+)?)?@/g, (match, tokenName, multiplier) => {
        const tokenValue = resolver[tokenName.toLowerCase()];
        if (tokenValue === undefined) return match;

        if (typeof tokenValue === 'number') {
            const numeric = multiplier ? tokenValue * 100 : tokenValue;
            return formatNumber(numeric);
        }

        return String(tokenValue);
    });

    return withTokens
        .replace(/\{\{\s*[^}]+\s*\}\}/g, ' ')
        .replace(/%i:[^%]+%/g, ' ')
        .replace(/@[a-zA-Z0-9_.]+(?:\*100(?:\.0+)?)?@/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function itemBinIdCandidates(id) {
    return [id, id + 220000, id + 440000];
}

function getBinItemEntry(itemsBinData, id) {
    for (const candidate of itemBinIdCandidates(id)) {
        const entry = itemsBinData[`Items/${candidate}`];
        if (entry) return entry;
    }
    return null;
}

function getLocalizedString(stringEntries, key) {
    if (!stringEntries || !key) return '';
    return stringEntries[key.toLowerCase()] || '';
}

function descriptionScore(rawDescription, cleanDescription) {
    if (!cleanDescription) return 0;

    const numbers = (cleanDescription.match(/\d+(?:\.\d+)?%?/g) || []).length;
    const unresolvedTokens = (rawDescription?.match(/\{\{\s*[^}]+\s*\}\}/g) || []).length;
    const unresolvedAtTokens = (rawDescription?.match(/@[a-zA-Z0-9_.]+(?:\*100(?:\.0+)?)?@/g) || []).length;

    return (numbers * 10) + cleanDescription.length - (unresolvedTokens * 25) - (unresolvedAtTokens * 20);
}

function buildBinTooltipDescription(binItem, stringEntries) {
    if (!binItem) return '';

    const resolver = buildItemResolver(binItem);
    const tooltipKeys = [
        binItem.mItemDataClient?.mDynamicTooltip,
        binItem.mItemDataClient?.mShopTooltip,
        binItem.mItemDataClient?.mDescription,
        binItem.mItemDataClient?.mTooltipData?.mLocKeys?.keyTooltipExternal,
        binItem.mItemDataClient?.mTooltipData?.mLocKeys?.keyTooltip
    ].filter(Boolean);

    const resolvedCandidates = tooltipKeys
        .map((key, index) => {
            const template = getLocalizedString(stringEntries, key);
            if (!template) return null;

            const resolved = resolveTooltipTemplate(template, resolver);
            const focused = extractMainText(resolved);
            const clean = normalizeText(focused);
            const priorityBonus = (tooltipKeys.length - index) * 15;
            const score = descriptionScore(focused, clean) + priorityBonus;

            return { score, clean };
        })
        .filter(Boolean)
        .filter(candidate => candidate.clean);

    if (!resolvedCandidates.length) return '';

    resolvedCandidates.sort((a, b) => b.score - a.score);
    return resolvedCandidates[0].clean;
}

function buildFormulaSummary(binItem) {
    if (!binItem?.mItemCalculations) return '';

    const resolver = buildItemResolver(binItem);
    const formulas = Object.keys(binItem.mItemCalculations)
        .map((calcName, index) => {
            const expression = resolver[calcName.toLowerCase()];
            if (!expression) return '';
            const displayName = isHashToken(calcName)
                ? `Calc_${index + 1}`
                : calcName;
            return `${displayName} = ${expression}`;
        })
        .filter(Boolean);

    if (formulas.length) {
        return formulas.join(' ; ');
    }

    const fallbackDataValues = (binItem.mDataValues || [])
        .filter(value => value?.mName && typeof value.mValue === 'number')
        .map(value => `${value.mName}=${formatNumber(value.mValue)}`)
        .slice(0, 8);

    return fallbackDataValues.length ? `DataValues: ${fallbackDataValues.join(' ; ')}` : '';
}

function buildHybridDescription(ddItem, cdItem, binTooltipDescription, formulaSummary) {
    const ddRaw = ddItem?.description || '';
    const cdRaw = cdItem?.description || '';
    const binRaw = binTooltipDescription || '';

    const ddClean = normalizeText(ddRaw);
    const cdClean = normalizeText(cdRaw);
    const binClean = normalizeText(binRaw);
    const plain = normalizeText(ddItem?.plaintext || '');

    const candidates = [
        { raw: ddRaw, clean: ddClean },
        { raw: cdRaw, clean: cdClean },
        { raw: binRaw, clean: binClean }
    ].filter(candidate => candidate.clean);

    candidates.sort((a, b) => descriptionScore(b.raw, b.clean) - descriptionScore(a.raw, a.clean));
    let bestDetailed = candidates[0]?.clean || '';

    if (bestDetailed && plain && !bestDetailed.toLowerCase().includes(plain.toLowerCase())) {
        bestDetailed = `${bestDetailed} — ${plain}`;
    }

    if (formulaSummary && !bestDetailed.toLowerCase().includes('formulas:')) {
        bestDetailed = bestDetailed
            ? `${bestDetailed} | Formulas: ${formulaSummary}`
            : `Formulas: ${formulaSummary}`;
    }

    return bestDetailed || plain || 'No description';
}

function isQueueLimitedTooltip(text) {
    const normalized = String(text || '').toLowerCase();
    return normalized.includes('only mid lane') || normalized.includes('locked until quest is completed');
}

function isRankedDraftEligible(ddItem, binItem, stringEntries) {
    if (!ddItem) return false;

    const tooltipKeys = [
        binItem?.mItemDataClient?.mDynamicTooltip,
        binItem?.mItemDataClient?.mShopTooltip,
        binItem?.mItemDataClient?.mDescription,
        binItem?.mItemDataClient?.mTooltipData?.mLocKeys?.keyTooltipExternal,
        binItem?.mItemDataClient?.mTooltipData?.mLocKeys?.keyTooltip
    ].filter(Boolean);

    for (const key of tooltipKeys) {
        const value = getLocalizedString(stringEntries, key);
        if (isQueueLimitedTooltip(value)) {
            return false;
        }
    }

    return true;
}

// ─── Token minifier ───────────────────────────────────────────────────────────

/**
 * Minify an item stats string to reduce token usage for LLM payloads.
 * Abbreviates verbose stat names and cleans up loose syntax.
 * @param {string} itemString
 * @returns {string}
 */
function minifyItem(itemString) {
    let cleaned = itemString;

    // Abbreviate verbose stats to save tokens
    cleaned = cleaned
        .replace(/Attack Damage/gi, 'AD')
        .replace(/Ability Power/gi, 'AP')
        .replace(/Ability Haste/gi, 'AH')
        .replace(/Magic Resist/gi, 'MR')
        .replace(/Move Speed/gi, 'MS')
        .replace(/Attack Speed/gi, 'AS')
        .replace(/Critical Strike Chance/gi, 'Crit')
        .replace(/Health Regen/gi, 'HP Regen')
        .replace(/Mana Regen/gi, 'MP Regen');

    // Clean up loose syntax
    cleaned = cleaned.replace(/\|/g, '-').replace(/\s+/g, ' ').trim();

    return cleaned;
}

// ─── Main export ────────────────────────────────────────────────────────────────

/**
 * Build an items toon payload string.
 * @param {Function} encodeToon - The @toon-format/toon encode function
 * @param {object} logger - Logger with .info / .error methods
 * @returns {Promise<string>} The encoded toon string
 */
async function buildItemsToon(encodeToon, logger) {
    logger.info('[items_builder] Fetching latest Data Dragon version');

    const versionsRes = await axios.get(DDRAGON_VERSIONS_URL, { timeout: 30000 });
    const latestVersion = versionsRes.data[0];
    const cdragonPatchTag = toCDragonPatchTag(latestVersion);
    const cdragonUrls = buildCDragonUrls(cdragonPatchTag);

    const ddragonItemsUrl = `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/item.json`;
    const ddragonRes = await axios.get(ddragonItemsUrl, { timeout: 30000 });
    const ddragonData = ddragonRes.data.data;

    const validSrIds = new Set();
    for (const [id, itemData] of Object.entries(ddragonData)) {
        const isPurchasableOnSR = itemData.maps['11'] === true && itemData.gold.purchasable === true;
        const numericId = parseInt(id, 10);
        const isBuildableBoot = itemData.tags?.includes('Boots') && numericId !== 1001;
        const isFinalItem = !itemData.into || itemData.into.length === 0 || isBuildableBoot;
        const isConsumable = itemData.tags?.includes('Consumable');
        const isTrinket = itemData.tags?.includes('Trinket') || itemData.tags?.includes('Vision');

        // Fix 1: Swiftplay/Arena/ARAM variants use 6-digit IDs. Standard SR items are under 100,000.
        const isStandardId = numericId < 100000;

        // Fix 2: Starter items, Jungle Pets, and ARAM items don't build into anything.
        // True Legendaries cost 1500g or more. Boots are the only exception.
        const isTrueLegendary = itemData.gold.total >= 1500 || itemData.tags?.includes('Boots');

        if (
            isPurchasableOnSR &&
            isFinalItem &&
            !isConsumable &&
            !isTrinket &&
            isStandardId &&
            isTrueLegendary &&
            !itemData.requiredChampion &&
            !RIOT_API_BUG_BLACKLIST.has(itemData.name)
        ) {
            validSrIds.add(numericId);
        }
    }

    const [cdragonRes, itemsBinRes, stringTableRes] = await Promise.all([
        axios.get(cdragonUrls.items, { timeout: 30000 }),
        axios.get(cdragonUrls.itemsBin, { timeout: 30000 }),
        axios.get(cdragonUrls.stringtable, { timeout: 30000 })
    ]);

    const rawItems = cdragonRes.data;
    const itemsBinData = itemsBinRes.data;
    const stringEntries = stringTableRes.data?.entries || {};
    const cdragonById = new Map(rawItems.map(item => [item.id, item]));

    const cleanItems = [...validSrIds]
        .map(id => {
            const ddItem = ddragonData[String(id)];
            const cdItem = cdragonById.get(id);
            const binItem = getBinItemEntry(itemsBinData, id);

            if (!isRankedDraftEligible(ddItem, binItem, stringEntries)) {
                return null;
            }

            const binTooltipDescription = buildBinTooltipDescription(binItem, stringEntries);
            const formulaSummary = buildFormulaSummary(binItem);
            const hybridDescription = buildHybridDescription(ddItem, cdItem, binTooltipDescription, formulaSummary);

            return {
                name: ddItem?.name || cdItem?.name || `Item ${id}`,
                cost: ddItem?.gold?.total ?? cdItem?.priceTotal ?? 0,
                stats: minifyItem(hybridDescription)
            };
        })
        .filter(Boolean);

    logger.info('[items_builder] Item toon payload built', {
        itemCount: cleanItems.length,
        version: latestVersion,
        cdragonPatchTag
    });

    return encodeToon({ items: cleanItems });
}

module.exports = { buildItemsToon };
