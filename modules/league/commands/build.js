const axios = require('axios');

let encodeToon = null;
try {
    ({ encode: encodeToon } = require('@toon-format/toon'));
} catch (error) {
    console.error("Detailed Load Error:", error);
    encodeToon = null;
}

const CDRAGON_SUMMARY_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json';
const CDRAGON_CHAMPION_URL = (championId) => `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/${championId}.json`;
const DDRAGON_VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';
const DDRAGON_ITEMS_URL = (version) => `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`;
const DIFY_BASE_URL = process.env.DIFY_BASE_URL || 'http://192.168.1.10/v1';
const KEY_LOL_THEORYCRAFT_BUILDER = process.env.KEY_LOL_THEORYCRAFT_BUILDER;

const RIOT_API_BUG_BLACKLIST = new Set([
    'Cruelty', 'Flesheater', 'Demon King\'s Crown', 'Shield of Molten Stone',
    'Cloak of Starry Night', 'Sword of the Divine', 'Veigar\'s Talisman of Ascension',
    'Gargoyle Stoneplate', 'Sword of Blossoming Dawn', 'Crown of the Shattered Queen',
    'Gambler\'s Blade', 'Atma\'s Reckoning', 'Zephyr'
]);

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

function normalizeItemText(text) {
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
            ? calc.mSubparts.map((p) => parseItemCalculation(p, dataValues, calculations, seen)).filter(Boolean)
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
            ? calc.mFormulaParts.map((p) => parseItemCalculation(p, dataValues, calculations, seen)).filter(Boolean)
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
            const clean = normalizeItemText(focused);
            const priorityBonus = (tooltipKeys.length - index) * 15;
            const score = descriptionScore(focused, clean) + priorityBonus;

            return { score, clean };
        })
        .filter(Boolean)
        .filter((candidate) => candidate.clean);

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
        .filter((value) => value?.mName && typeof value.mValue === 'number')
        .map((value) => `${value.mName}=${formatNumber(value.mValue)}`)
        .slice(0, 8);

    return fallbackDataValues.length ? `DataValues: ${fallbackDataValues.join(' ; ')}` : '';
}

function buildHybridDescription(ddItem, cdItem, binTooltipDescription, formulaSummary) {
    const ddRaw = ddItem?.description || '';
    const cdRaw = cdItem?.description || '';
    const binRaw = binTooltipDescription || '';

    const ddClean = normalizeItemText(ddRaw);
    const cdClean = normalizeItemText(cdRaw);
    const binClean = normalizeItemText(binRaw);
    const plain = normalizeItemText(ddItem?.plaintext || '');

    const candidates = [
        { raw: ddRaw, clean: ddClean },
        { raw: cdRaw, clean: cdClean },
        { raw: binRaw, clean: binClean }
    ].filter((candidate) => candidate.clean);

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

function normalizeChampionName(name) {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

function formatDesc(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s*\n\s*/g, ' | ')
        .replace(/\s+/g, ' ')
        .trim();
}

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

const KNOWN_HASH_MAPPINGS_BY_CHAMPION = {
    yunara: {
        '9e3635ce': 'Spread_AD_Ratio',
        '62fc6412': 'DPS_Modifier',
        'c5483e4c': 'Move_Speed_Modifier',
        '669adf33': 'Calc_Damage_Initial_Minion',
        '42964db5': 'Calc_RE_Dash_Speed',
        '96806f45': 'RW_ADRatio',
        '7edb0429': 'RW_APRatio',
        'df09786b': 'RW_Slow_Amount',
        'cc1c79e2': 'RW_CDR'
    }
};

function championFormatDesc(text) {
    return text ? text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : 'No description';
}

function extractDataValues(obj, results = {}) {
    if (Array.isArray(obj)) {
        obj.forEach((item) => extractDataValues(item, results));
    } else if (obj && typeof obj === 'object') {
        if (obj.mName && obj.mValues && Array.isArray(obj.mValues)) {
            if (obj.mValues.some((val) => val !== 0)) {
                const valueName = obj.mName === 'UnmappedValue'
                    ? `UnmappedDataValue_${Object.keys(results).length + 1}`
                    : obj.mName;
                results[valueName] = obj.mValues.slice(1, 6).map((v) => Number(v.toFixed(3))).join('/');
            }
        }
        for (const key of Object.keys(obj)) {
            extractDataValues(obj[key], results);
        }
    }
    return results;
}

function parseChampionCalculation(calc) {
    if (!calc) return '';

    const statMap = {
        1: 'Armor', 2: 'Attack Damage', 3: 'Ability Power',
        4: 'Armor', 5: 'Magic Resist', 6: 'Health',
        7: 'Max Health', 8: 'Bonus Health', 9: 'Bonus AD', 11: 'Max Mana', 12: 'Bonus Health'
    };

    if (calc.__type === 'GameCalculationModified') {
        const base = calc.mModifiedGameCalculation;
        const mult = parseChampionCalculation(calc.mMultiplier) || parseChampionCalculation(calc.mCoefficient);
        return mult ? `(${base} * ${mult})` : base;
    }

    if (calc.__type === 'GameCalculation') {
        const base = calc.mFormulaParts ? calc.mFormulaParts.map(parseChampionCalculation).filter(Boolean).join(' + ') : '0';
        if (calc.mMultiplier) {
            const mult = parseChampionCalculation(calc.mMultiplier);
            return `(${base}) * ${mult}`;
        }
        return base;
    }

    if (calc.__type === 'SumOfSubPartsCalculationPart') {
        return calc.mSubparts ? calc.mSubparts.map(parseChampionCalculation).filter(Boolean).join(' + ') : '';
    }

    if (calc.__type === 'NamedDataValueCalculationPart') {
        return calc.mDataValue;
    }

    if (calc.__type === 'StatByNamedDataValueCalculationPart' || calc.__type === 'StatBySubPartCalculationPart') {
        const stat = statMap[calc.mStat] || `Stat[${calc.mStat}]`;
        const val = calc.mDataValue || parseChampionCalculation(calc.mSubpart);
        return `(${val} * ${stat})`;
    }

    if (calc.__type === 'ByCharLevelInterpolationCalculationPart') {
        return `[${calc.mStartValue} to ${calc.mEndValue} based on Level]`;
    }

    if (calc.__type === 'StatByCoefficientCalculationPart') {
        const stat = statMap[calc.mStat] || 'Ability Power';
        const coeff = Number(calc.mCoefficient.toFixed(3));
        return `(${coeff} * ${stat})`;
    }

    if (calc.__type === 'ByCharLevelBreakpointsCalculationPart') {
        const base = calc.mLevel1Value ? Number(calc.mLevel1Value.toFixed(3)) : 0;
        return `[Base: ${base}, scales at specific level breakpoints]`;
    }

    if (calc.__type === 'GameCalculationConditional') {
        const conditional = calc.mConditionalGameCalculation || 'ConditionalCalc';
        const fallback = calc.mDefaultGameCalculation || 'DefaultCalc';
        return `(${conditional} or ${fallback})`;
    }

    if (calc.__type === 'BuffCounterByCoefficientCalculationPart') {
        const coeff = Number((calc.mCoefficient ?? 1).toFixed(3));
        const buff = calc.mBuffName || calc.buffName || 'BuffCounter';
        return `(${coeff} * ${buff})`;
    }

    if (calc.__type === 'PercentageOfBuffNameElapsed') {
        const coeff = Number((calc.Coefficient ?? calc.mCoefficient ?? 1).toFixed(3));
        const buff = calc.buffName || calc.mBuffName || 'BuffElapsed';
        return `(${coeff} * ${buff}_ElapsedPercent)`;
    }

    if (calc.__type === 'ClampSubPartsCalculationPart') {
        const floor = typeof calc.mFloor === 'number' ? Number(calc.mFloor.toFixed(3)) : null;
        const ceiling = typeof calc.mCeiling === 'number' ? Number(calc.mCeiling.toFixed(3)) : null;
        const subparts = Array.isArray(calc.mSubparts)
            ? calc.mSubparts.map(parseChampionCalculation).filter(Boolean).join(' + ')
            : '';
        const valueExpr = subparts || '0';
        const floorExpr = floor !== null ? floor : '-inf';
        const ceilingExpr = ceiling !== null ? ceiling : 'inf';
        return `clamp(${valueExpr}, ${floorExpr}, ${ceilingExpr})`;
    }

    if (calc.__type === 'NumberCalculationPart') {
        return Number(calc.mNumber.toFixed(3));
    }

    return '';
}

function toHashId(token) {
    return token.replace(/[{}]/g, '').toLowerCase();
}

function sanitizeIdentifier(name) {
    const cleaned = String(name)
        .replace(/[{}]/g, '')
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!cleaned) return 'Unknown';
    return /^\d/.test(cleaned) ? `_${cleaned}` : cleaned;
}

function makeUniqueName(baseName, usedNames) {
    let candidate = baseName;
    let suffix = 2;
    while (usedNames.has(candidate)) {
        candidate = `${baseName}_${suffix}`;
        suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
}

function collectCalcSignals(node, signals = { dataValues: new Set(), calcRefs: new Set(), partTypes: new Set(), stats: new Set() }) {
    if (Array.isArray(node)) {
        node.forEach((item) => collectCalcSignals(item, signals));
        return signals;
    }

    if (!node || typeof node !== 'object') return signals;

    if (typeof node.__type === 'string') {
        signals.partTypes.add(node.__type);
    }

    if (typeof node.mDataValue === 'string' && !isHashToken(node.mDataValue) && node.mDataValue !== 'UnmappedValue') {
        signals.dataValues.add(node.mDataValue);
    }

    if (typeof node.mStat === 'number') {
        signals.stats.add(node.mStat);
    }

    if (typeof node.mSpellCalculationKey === 'string' && !isHashToken(node.mSpellCalculationKey)) {
        signals.calcRefs.add(node.mSpellCalculationKey);
    }

    if (typeof node.mModifiedGameCalculation === 'string' && !isHashToken(node.mModifiedGameCalculation)) {
        signals.calcRefs.add(node.mModifiedGameCalculation);
    }

    Object.values(node).forEach((value) => collectCalcSignals(value, signals));
    return signals;
}

function championStatIdToLabel(statId) {
    const statMap = {
        1: 'Armor',
        2: 'AttackDamage',
        3: 'AbilityPower',
        4: 'Armor',
        5: 'MagicResist',
        6: 'Health',
        7: 'MaxHealth',
        8: 'BonusHealth',
        9: 'BonusAD',
        11: 'MaxMana',
        12: 'BonusHealth'
    };

    return statMap[statId] || `Stat${statId}`;
}

function normalizeCalcName(calcName) {
    return String(calcName)
        .replace(/_Derived(_\d+)?/gi, '_Scaled$1')
        .replace(/__+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function deriveSemanticCalcName(calcObj, spellName, calcIndex) {
    const signals = collectCalcSignals(calcObj);
    const firstCalcRef = [...signals.calcRefs][0];
    const firstDataValue = [...signals.dataValues][0];
    const firstStat = [...signals.stats][0];
    const firstStatLabel = typeof firstStat === 'number' ? championStatIdToLabel(firstStat) : null;

    if (firstCalcRef) {
        return `Calc_${sanitizeIdentifier(firstCalcRef)}_Scaled`;
    }

    if (firstDataValue && signals.dataValues.size === 1 && firstStatLabel) {
        return `Calc_${sanitizeIdentifier(firstDataValue)}_${sanitizeIdentifier(firstStatLabel)}Scaling`;
    }

    if (firstDataValue && signals.dataValues.size === 1) {
        return `Calc_${sanitizeIdentifier(firstDataValue)}`;
    }

    if (firstDataValue && signals.dataValues.size > 1) {
        return `Calc_${sanitizeIdentifier(firstDataValue)}_Composite`;
    }

    if (signals.partTypes.has('ByCharLevelInterpolationCalculationPart')) {
        return `Calc_${sanitizeIdentifier(spellName)}_LevelScaling`;
    }

    if (signals.partTypes.has('ByCharLevelBreakpointsCalculationPart')) {
        return `Calc_${sanitizeIdentifier(spellName)}_BreakpointScaling`;
    }
    if (signals.partTypes.has('GameCalculationConditional')) {
        return `Calc_${sanitizeIdentifier(spellName)}_ConditionalValue`;
    }
    if (signals.partTypes.has('PercentageOfBuffNameElapsed') || signals.partTypes.has('ClampSubPartsCalculationPart')) {
        return `Calc_${sanitizeIdentifier(spellName)}_BuffElapsedScaling`;
    }
    if (signals.partTypes.has('BuffCounterByCoefficientCalculationPart')) {
        return `Calc_${sanitizeIdentifier(spellName)}_BuffCounterScaling`;
    }

    if (signals.partTypes.has('StatByCoefficientCalculationPart')) {
        if (firstStatLabel) {
            return `Calc_${sanitizeIdentifier(spellName)}_${sanitizeIdentifier(firstStatLabel)}Scaling`;
        }
        return `Calc_${sanitizeIdentifier(spellName)}_AbilityPowerScaling`;
    }

    if (firstStatLabel && signals.stats.size === 1) {
        return `Calc_${sanitizeIdentifier(spellName)}_${sanitizeIdentifier(firstStatLabel)}Scaling`;
    }

    if (signals.partTypes.has('NumberCalculationPart')) {
        return `Calc_${sanitizeIdentifier(spellName)}_FlatValue`;
    }

    return `Calc_${sanitizeIdentifier(spellName)}_Generated_${calcIndex}`;
}

function buildSpellHashMappings(spell, spellName, championAlias) {
    const mappings = new Map();
    const calcEntries = Object.entries(spell?.mSpellCalculations || {});
    const dataValues = Array.isArray(spell?.DataValues) ? spell.DataValues : [];
    const dataValueHashSet = new Set(
        dataValues
            .map((d) => d?.mName)
            .filter(isHashToken)
            .map(toHashId)
    );
    const championKnownMappings = KNOWN_HASH_MAPPINGS_BY_CHAMPION[championAlias] || {};
    const usedNames = new Set(Object.values(championKnownMappings));

    const register = (hashId, readableName) => {
        if (!mappings.has(hashId) && readableName) {
            const uniqueName = makeUniqueName(readableName, usedNames);
            mappings.set(hashId, uniqueName);
        }
    };

    for (const [hashId, readableName] of Object.entries(championKnownMappings)) {
        register(hashId, readableName);
    }

    for (const [calcName, calcObj] of calcEntries) {
        if (!isHashToken(calcName)) continue;

        const hashId = toHashId(calcName);
        const derivedName = deriveSemanticCalcName(calcObj, spellName, mappings.size + 1);
        register(hashId, derivedName);
    }

    const hashUsage = new Map();
    const walkNode = (node, calcName) => {
        if (Array.isArray(node)) {
            node.forEach((item) => walkNode(item, calcName));
            return;
        }

        if (node && typeof node === 'object') {
            if (isHashToken(node.mDataValue)) {
                const hashId = toHashId(node.mDataValue);
                if (!hashUsage.has(hashId)) hashUsage.set(hashId, new Set());
                if (calcName) hashUsage.get(hashId).add(calcName);
            }

            Object.values(node).forEach((value) => walkNode(value, calcName));
        }
    };

    for (const [calcName, calcObj] of calcEntries) {
        walkNode(calcObj, calcName);
    }

    for (const [hashId, calcNames] of hashUsage.entries()) {
        if (mappings.has(hashId)) continue;

        const readableCalcName = [...calcNames].find((name) => !isHashToken(name));
        if (readableCalcName) {
            const suffix = dataValueHashSet.has(hashId) ? 'Value' : 'Ref';
            register(hashId, `${sanitizeIdentifier(readableCalcName)}_${suffix}`);
        } else {
            register(hashId, `Value_${sanitizeIdentifier(spellName)}_Ref`);
        }
    }

    let dataValueIndex = 1;
    for (const value of dataValues) {
        if (!isHashToken(value?.mName)) continue;
        const hashId = toHashId(value.mName);
        if (!mappings.has(hashId)) {
            register(hashId, `Value_${sanitizeIdentifier(spellName)}_${dataValueIndex}`);
            dataValueIndex += 1;
        }
    }

    return mappings;
}

function applySpellHashMappings(text, mappings) {
    let unknownIndex = 1;
    const unknownRefMap = new Map();
    return text.replace(/\{([0-9a-f]{8})\}/gi, (_, hashId) => {
        const key = hashId.toLowerCase();
        if (mappings.has(key)) return mappings.get(key);
        if (unknownRefMap.has(key)) return unknownRefMap.get(key);

        const fallbackName = `ValueRef_${unknownIndex}`;
        unknownRefMap.set(key, fallbackName);
        unknownIndex += 1;
        return fallbackName;
    });
}

function resolveCalcDisplayName(calcName, spellName, calcIndex, hashMappings) {
    if (calcName === 'UnmappedValue') {
        return `Calc_${sanitizeIdentifier(spellName)}_Unmapped_${calcIndex}`;
    }

    if (isHashToken(calcName)) {
        const hashId = toHashId(calcName);
        return hashMappings.get(hashId) || `Calc_${sanitizeIdentifier(spellName)}_Generated_${calcIndex}`;
    }

    return normalizeCalcName(calcName);
}

function contextualizeUnmappedEquationTerms(equation, calcDisplayName) {
    let termIndex = 0;
    const calcBaseName = sanitizeIdentifier(calcDisplayName);
    return equation.replace(/\bUnmappedValue\b/g, () => {
        termIndex += 1;
        return `${calcBaseName}_Value${termIndex}`;
    });
}

function replaceBuffNameHashes(text, spellName) {
    let buffIndex = 0;
    const spellBaseName = sanitizeIdentifier(spellName);
    const buffMap = new Map();
    return text.replace(/\{([0-9a-f]{8})\}/gi, (full, hashId) => {
        const key = hashId.toLowerCase();
        if (buffMap.has(key)) return buffMap.get(key);
        buffIndex += 1;
        const label = `${spellBaseName}_BuffRef${buffIndex}`;
        buffMap.set(key, label);
        return label;
    });
}

function resolveBestSpellMathKey(keys, expectedKey) {
    if (!keys || keys.length === 0) return null;

    const exact = keys.find((k) => k === expectedKey);
    if (exact) return exact;

    const prefixed = keys
        .filter((k) => k.startsWith(expectedKey))
        .sort((a, b) => a.length - b.length);
    if (prefixed.length > 0) return prefixed[0];

    const contains = keys.find((k) => k.includes(expectedKey));
    return contains || null;
}

async function buildChampionToon(championName, logger) {
    logger.info('[build] Resolving champion for toon payload', { championName });
    const summaryRes = await axios.get(CDRAGON_SUMMARY_URL, { timeout: 30000 });
    const champSummary = summaryRes.data.find((c) => c.name.toLowerCase() === championName.toLowerCase());

    if (!champSummary) {
        throw new Error(`Champion '${championName}' not found.`);
    }

    const detailRes = await axios.get(CDRAGON_CHAMPION_URL(champSummary.id), { timeout: 30000 });
    const champ = detailRes.data;
    const alias = champ.alias.toLowerCase();

    const binUrl = `https://raw.communitydragon.org/latest/game/data/characters/${alias}/${alias}.bin.json`;
    const binRes = await axios.get(binUrl, { timeout: 30000 });
    const binData = binRes.data;

    const rawMathBlocks = {};
    for (const [path, obj] of Object.entries(binData)) {
        if (path.includes('Spells/') && obj.mSpell) {
            const spellName = path.split('/').pop().toLowerCase();
            let mathDump = '';

            if (obj.mSpell.cooldownTime && Array.isArray(obj.mSpell.cooldownTime)) {
                const cds = obj.mSpell.cooldownTime.slice(1, 6).map((v) => Number(v.toFixed(2)));
                if (cds.some((v) => v !== 0)) mathDump += `COOLDOWNS: [${cds.join('/')}] | `;
            }

            const variables = extractDataValues(obj.mSpell);
            const varStrings = Object.entries(variables).map(([name, values]) => `${name}: [${values}]`);
            if (varStrings.length > 0) mathDump += `VALUES: ${varStrings.join(', ')} | `;

            if (obj.mSpell.mSpellCalculations) {
                const mappedFormulas = [];
                let calcIndex = 0;
                const spellHashMappings = buildSpellHashMappings(obj.mSpell, spellName, alias);

                for (const [calcName, calcObj] of Object.entries(obj.mSpell.mSpellCalculations)) {
                    calcIndex += 1;
                    const resolvedCalcName = resolveCalcDisplayName(calcName, spellName, calcIndex, spellHashMappings);
                    const equation = parseChampionCalculation(calcObj);
                    if (equation) {
                        const contextualEquation = contextualizeUnmappedEquationTerms(equation, resolvedCalcName);
                        const buffAwareEquation = replaceBuffNameHashes(contextualEquation, spellName);
                        mappedFormulas.push(`${resolvedCalcName} = ${buffAwareEquation}`);
                    }
                }
                if (mappedFormulas.length > 0) {
                    mathDump += `FORMULAS: ${mappedFormulas.join(', ')}`;
                }
            }

            const spellHashMappings = buildSpellHashMappings(obj.mSpell, spellName, alias);
            const finalMathDump = applySpellHashMappings(mathDump, spellHashMappings)
                .replace(/Stat\[undefined\]/g, 'Ability Power');

            if (finalMathDump) rawMathBlocks[spellName] = finalMathDump;
        }
    }

    const abilities = [];

    let passiveDesc = championFormatDesc(champ.passive.dynamicDescription || champ.passive.description);
    const passiveBinKey = resolveBestSpellMathKey(Object.keys(rawMathBlocks), alias + 'passive');
    if (passiveBinKey && rawMathBlocks[passiveBinKey]) {
        passiveDesc += ` | ENGINE MATH: ${rawMathBlocks[passiveBinKey]}`;
    }
    abilities.push({
        key: 'Passive',
        name: champ.passive.name,
        description: passiveDesc
    });

    champ.spells.forEach((spell) => {
        let desc = championFormatDesc(spell.dynamicDescription || spell.description);
        const spellKey = spell.spellKey.toLowerCase();
        const binSpellKey = resolveBestSpellMathKey(Object.keys(rawMathBlocks), alias + spellKey);

        if (binSpellKey && rawMathBlocks[binSpellKey]) {
            desc += ` | ENGINE MATH: ${rawMathBlocks[binSpellKey]}`;
        }

        abilities.push({
            key: spell.spellKey.toUpperCase(),
            name: spell.name,
            description: desc
        });
    });

    return encodeToon({
        champion: [{
            name: champ.name,
            roles: champ.roles.join(', '),
            abilities
        }]
    });
}

async function buildItemsToon(logger) {
    logger.info('[build] Fetching latest Data Dragon item dataset');
    const versionsResponse = await axios.get(DDRAGON_VERSIONS_URL, { timeout: 30000 });
    const latestVersion = versionsResponse?.data?.[0];
    if (!latestVersion) {
        throw new Error('Could not resolve latest Data Dragon version');
    }
    const cdragonPatchTag = toCDragonPatchTag(latestVersion);
    const cdragonUrls = buildCDragonUrls(cdragonPatchTag);

    const itemsResponse = await axios.get(DDRAGON_ITEMS_URL(latestVersion), { timeout: 30000 });
    const itemsData = itemsResponse?.data?.data;
    if (!itemsData || typeof itemsData !== 'object') {
        throw new Error('Could not parse Data Dragon item payload');
    }

    const validSrIds = new Set();
    for (const [id, itemData] of Object.entries(itemsData)) {
        const isPurchasableOnSR = itemData.maps['11'] === true && itemData.gold.purchasable === true;
        const numericId = parseInt(id, 10);
        const isBuildableBoot = itemData.tags?.includes('Boots') && numericId !== 1001;
        const isFinalItem = !itemData.into || itemData.into.length === 0 || isBuildableBoot;
        const isConsumable = itemData.tags?.includes('Consumable');
        const isTrinket = itemData.tags?.includes('Trinket') || itemData.tags?.includes('Vision');
        const isStandardId = numericId < 100000;
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
    const cdragonById = new Map(rawItems.map((item) => [item.id, item]));

    const cleanItems = [...validSrIds]
        .map((id) => {
            const ddItem = itemsData[String(id)];
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
                stats: hybridDescription
            };
        })
        .filter(Boolean);

    logger.info('[build] Item toon payload built', {
        itemCount: cleanItems.length,
        version: latestVersion,
        cdragonPatchTag
    });
    return encodeToon({ items: cleanItems });
}

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

function stripThinkingBlocks(text) {
    return String(text || '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^\s*think\s*>/i, '')
        .trim();
}

module.exports = {
    name: 'build',
    description: 'Generate champion + item toon payloads and send them to the LoL theorycraft workflow',
    syntax: 'build [champion name] [build type]',
    num_args: 2,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        this.logger.info('[build] Execute called', { userId: message.member?.id, argsLength: args.length });

        if (!encodeToon) {
            this.logger.error('[build] Missing dependency @toon-format/toon');
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

            const [championToon, itemsToon] = await Promise.all([
                buildChampionToon(match.name, this.logger),
                buildItemsToon(this.logger)
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