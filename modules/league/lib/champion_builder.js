'use strict';

/**
 * Champion toon builder — exact port of get-champion.js logic.
 * Exported: buildChampionToon(championName, encodeToon, logger)
 */

const axios = require('axios');

const CDRAGON_SUMMARY_URL = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json';

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatDesc(text) {
    return text ? text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : 'No description';
}

// ─── Deep data value extractor ─────────────────────────────────────────────────

function extractDataValues(obj, results = {}) {
    if (Array.isArray(obj)) {
        obj.forEach(item => extractDataValues(item, results));
    } else if (obj && typeof obj === 'object') {
        if (obj.mName && obj.mValues && Array.isArray(obj.mValues)) {
            if (obj.mValues.some(val => val !== 0)) {
                const valueName = obj.mName === 'UnmappedValue'
                    ? `UnmappedDataValue_${Object.keys(results).length + 1}`
                    : obj.mName;
                results[valueName] = obj.mValues.slice(1, 6).map(v => Number(v.toFixed(3))).join('/');
            }
        }
        for (const key of Object.keys(obj)) {
            extractDataValues(obj[key], results);
        }
    }
    return results;
}

// ─── AST engine-math parser ────────────────────────────────────────────────────

function parseCalculation(calc) {
    if (!calc) return '';

    const statMap = {
        1: 'Armor', 2: 'Attack Damage', 3: 'Ability Power',
        4: 'Armor', 5: 'Magic Resist', 6: 'Health',
        7: 'Max Health', 8: 'Bonus Health', 9: 'Bonus AD', 11: 'Max Mana', 12: 'Bonus Health'
    };

    if (calc.__type === 'GameCalculationModified') {
        const base = calc.mModifiedGameCalculation;
        const mult = parseCalculation(calc.mMultiplier) || parseCalculation(calc.mCoefficient);
        return mult ? `(${base} * ${mult})` : base;
    }

    if (calc.__type === 'GameCalculation') {
        let base = calc.mFormulaParts ? calc.mFormulaParts.map(parseCalculation).filter(Boolean).join(' + ') : '0';
        if (calc.mMultiplier) {
            const mult = parseCalculation(calc.mMultiplier);
            return `(${base}) * ${mult}`;
        }
        return base;
    }

    if (calc.__type === 'SumOfSubPartsCalculationPart') {
        return calc.mSubparts ? calc.mSubparts.map(parseCalculation).filter(Boolean).join(' + ') : '';
    }

    if (calc.__type === 'NamedDataValueCalculationPart') {
        return calc.mDataValue;
    }

    if (calc.__type === 'EffectValueCalculationPart') {
        return `Effect${calc.mEffectIndex}Amount`;
    }

    if (calc.__type === 'StatByNamedDataValueCalculationPart' || calc.__type === 'StatBySubPartCalculationPart') {
        const stat = statMap[calc.mStat] || `Stat[${calc.mStat}]`;
        const val = calc.mDataValue || parseCalculation(calc.mSubpart);
        return `(${val} * ${stat})`;
    }

    if (calc.__type === 'ByCharLevelInterpolationCalculationPart') {
        return `[${calc.mStartValue} to ${calc.mEndValue} based on Level]`;
    }

    if (calc.__type === 'ByCharLevelFormulaCalculationPart') {
        const mValues = Array.isArray(calc.mValues) ? calc.mValues : [];
        const startVal = mValues[1] !== undefined ? Number(mValues[1].toFixed(3)) : 0;
        const endVal = mValues[18] !== undefined
            ? Number(mValues[18].toFixed(3))
            : (mValues.length > 1 ? Number(mValues[mValues.length - 1].toFixed(3)) : 0);
        return `[${startVal} to ${endVal} based on Level]`;
    }

    if (calc.__type === 'ProductOfSubPartsCalculationPart') {
        const p1 = parseCalculation(calc.mPart1);
        const p2 = parseCalculation(calc.mPart2);
        const parts = [p1, p2].filter(Boolean);
        return parts.length > 0 ? `(${parts.join(' * ')})` : '';
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
            ? calc.mSubparts.map(parseCalculation).filter(Boolean).join(' + ')
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

// ─── Known hash maps ───────────────────────────────────────────────────────────

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

const KNOWN_ABILITY_SPELL_OVERRIDES_BY_CHAMPION = {
    ashe: {
        e: 'ashespiritofthehawk',
        r: 'enchantedcrystalarrow'
    },
    corki: {
        passive: 'rapidreload',
        w: 'carpetbomb'
    },
    draven: {
        r: 'dravenrcast'
    },
    karthus: {
        q: 'karthuslaywastea1'
    },
    leesin: {
        w: 'leesinwone',
        e: 'leesineone'
    },
    rammus: {
        r: 'tremors2'
    },
    riven: {
        w: 'rivenmartyr',
        r: 'rivenfengshuiengine'
    },
    renekton: {
        q: 'renektoncleave',
        w: 'renektonpreexecute',
        r: 'renektonreignofthetyrant'
    },
    shaco: {
        r: 'hallucinatefull'
    },
    xerath: {
        w: 'xeratharcanebarrage2',
        r: 'xerathlocusofpower2'
    },
    graves: {
        q: 'gravesqlinespell',
        w: 'gravessmokegrenade',
        e: 'gravesmove',
        r: 'graveschargeshot'
    },
    janna: {
        q: 'howlinggale',
        w: 'sowthewind',
        e: 'eyeofthestorm',
        r: 'reapthewhirlwind'
    },
    malphite: {
        passive: 'malphiteshield',
        q: 'seismicshard',
        w: 'obduracy',
        e: 'landslide',
        r: 'ufslash'
    },
    monkeyking: {
        q: 'monkeykingdoubleattack',
        r: 'monkeykingspintowin'
    },
    nautilus: {
        q: 'nautilusanchordrag',
        w: 'nautiluspiercinggaze',
        e: 'nautilussplashzone',
        r: 'nautilusgrandline'
    },
    orianna: {
        q: 'orianaizunacommand',
        w: 'orianadissonancecommand',
        e: 'orianaredactcommand',
        r: 'orianadetonatecommand'
    },
    rumble: {
        q: 'rumbleflamethrower',
        w: 'rumbleshield',
        e: 'rumblegrenade',
        r: 'rumblecarpetbomb'
    },
    shyvana: {
        q: 'shyvanadoubleattack',
        w: 'shyvanaimmolationaura',
        e: 'shyvanafireball',
        r: 'shyvanatransformcast'
    },
    trundle: {
        q: 'trundletrollsmash',
        w: 'trundledesecrate',
        e: 'trundlecircle',
        r: 'trundlepain'
    },
    twistedfate: {
        passive: 'cardmasterstack'
    }
};

// ─── Hash utility helpers ───────────────────────────────────────────────────────

function isHashToken(token) {
    return typeof token === 'string' && /^\{[0-9a-f]{8}\}$/i.test(token);
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
        node.forEach(item => collectCalcSignals(item, signals));
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

    Object.values(node).forEach(value => collectCalcSignals(value, signals));
    return signals;
}

function statIdToLabel(statId) {
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
    const firstStatLabel = typeof firstStat === 'number' ? statIdToLabel(firstStat) : null;

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
            .map(d => d?.mName)
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
            node.forEach(item => walkNode(item, calcName));
            return;
        }

        if (node && typeof node === 'object') {
            if (isHashToken(node.mDataValue)) {
                const hashId = toHashId(node.mDataValue);
                if (!hashUsage.has(hashId)) hashUsage.set(hashId, new Set());
                if (calcName) hashUsage.get(hashId).add(calcName);
            }

            Object.values(node).forEach(value => walkNode(value, calcName));
        }
    };

    for (const [calcName, calcObj] of calcEntries) {
        walkNode(calcObj, calcName);
    }

    for (const [hashId, calcNames] of hashUsage.entries()) {
        if (mappings.has(hashId)) continue;

        const readableCalcName = [...calcNames].find(name => !isHashToken(name));
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

// ─── Spell resolution helpers ───────────────────────────────────────────────────

function normalizeSpellLookupToken(token) {
    return String(token || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function tokenizeIdentifier(value) {
    if (!value) return [];

    const spaced = String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .toLowerCase()
        .trim();

    if (!spaced) return [];
    return spaced.split(/\s+/).filter(Boolean);
}

function extractTooltipSpellToken(spell) {
    const keyName = spell?.mClientData?.mTooltipData?.mLocKeys?.keyName;
    if (typeof keyName !== 'string') return null;

    const match = keyName.match(/^Spell_(.+)_Name$/);
    return match ? match[1] : null;
}

function resolvePassiveSpellMathKey(keys, rawSpellMeta, championAlias, passiveName) {
    if (!Array.isArray(keys) || keys.length === 0) return null;

    const aliasToken = normalizeSpellLookupToken(championAlias);
    const passiveToken = normalizeSpellLookupToken(passiveName || '');

    const entries = keys
        .map(key => ({ key, meta: rawSpellMeta[key] || {} }))
        .filter(entry => {
            const keyName = String(entry.meta.keyName || '');
            const keyTooltip = String(entry.meta.keyTooltip || '');
            const normalizedKey = normalizeSpellLookupToken(entry.key);

            if (entry.meta.spellSlot === 'p') return true;
            if (/game_character_passivename_/i.test(keyName)) return true;
            if (/passive/i.test(keyName)) return true;
            if (/passive/i.test(keyTooltip)) return true;
            if (aliasToken && normalizedKey.includes(`${aliasToken}passive`)) return true;
            if (passiveToken && normalizedKey.includes(passiveToken)) return true;

            return false;
        })
        .sort((a, b) => {
            const aName = String(a.meta.keyName || '');
            const bName = String(b.meta.keyName || '');

            const aExplicitPassive = /game_character_passivename_/i.test(aName) ? 1 : 0;
            const bExplicitPassive = /game_character_passivename_/i.test(bName) ? 1 : 0;
            if (bExplicitPassive !== aExplicitPassive) return bExplicitPassive - aExplicitPassive;

            const aSlotPassive = a.meta.spellSlot === 'p' ? 1 : 0;
            const bSlotPassive = b.meta.spellSlot === 'p' ? 1 : 0;
            if (bSlotPassive !== aSlotPassive) return bSlotPassive - aSlotPassive;

            const calcDelta = (b.meta.calcCount || 0) - (a.meta.calcCount || 0);
            if (calcDelta !== 0) return calcDelta;

            const dataValueDelta = (b.meta.dataValueCount || 0) - (a.meta.dataValueCount || 0);
            if (dataValueDelta !== 0) return dataValueDelta;

            return a.key.length - b.key.length;
        });

    return entries.length > 0 ? entries[0].key : null;
}

function toCooldownSignature(values, startIndex = 0) {
    if (!Array.isArray(values)) return null;

    const window = values.slice(startIndex, startIndex + 5)
        .filter(v => typeof v === 'number')
        .map(v => Number(v.toFixed(2)));

    if (window.length === 0) return null;
    return window.join('/');
}

function extractSpellSlotFromTooltip(spell) {
    const keyName = spell?.mClientData?.mTooltipData?.mLocKeys?.keyName;
    if (typeof keyName !== 'string') return null;

    const directSlotMatch = keyName.match(/([PQWER])_Name$/);
    if (directSlotMatch) return directSlotMatch[1].toLowerCase();

    // Wrapper spells use names like "Spell_KatarinaEWrapper_Name", "Spell_YasuoQ1Wrapper_Name"
    // The slot letter precedes optional digits and the literal "Wrapper"
    const wrapperSlotMatch = keyName.match(/([QWER])\d*Wrapper_Name$/);
    if (wrapperSlotMatch) return wrapperSlotMatch[1].toLowerCase();

    if (/Passive_Name$/i.test(keyName)) return 'p';
    if (/_Passive_/i.test(keyName)) return 'p';

    return null;
}

function formatNumericList(values) {
    const nums = Array.isArray(values)
        ? values.filter(v => typeof v === 'number')
        : [];

    if (nums.length === 0) return null;
    return nums.map(v => Number(v.toFixed(3))).join('/');
}

function extractDescriptionTokens(description) {
    if (typeof description !== 'string') return [];
    const matches = description.match(/@([A-Za-z0-9_]+)@/g) || [];
    const tokens = matches.map(token => token.replace(/@/g, ''));
    return [...new Set(tokens)].slice(0, 20);
}

function buildTooltipFallbackMath(ability) {
    const sections = [];

    const cooldownValues = formatNumericList(ability?.cooldownCoefficients);
    if (cooldownValues) {
        sections.push(`COOLDOWNS: [${cooldownValues}]`);
    }

    const effectAmounts = ability?.effectAmounts && typeof ability.effectAmounts === 'object'
        ? ability.effectAmounts
        : {};
    const effectEntries = Object.entries(effectAmounts)
        .map(([name, value]) => {
            if (Array.isArray(value)) {
                const formatted = formatNumericList(value);
                return formatted ? `${name}: [${formatted}]` : null;
            }

            if (typeof value === 'number') {
                return `${name}: [${Number(value.toFixed(3))}]`;
            }

            return null;
        })
        .filter(Boolean);

    if (effectEntries.length > 0) {
        sections.push(`VALUES: ${effectEntries.join(', ')}`);
    }

    const coefficients = ability?.coefficients && typeof ability.coefficients === 'object'
        ? ability.coefficients
        : {};
    const coefficientEntries = Object.entries(coefficients)
        .filter(([, value]) => typeof value === 'number')
        .map(([name, value]) => `${name}: ${Number(value.toFixed(3))}`);

    if (coefficientEntries.length > 0) {
        sections.push(`COEFFICIENTS: ${coefficientEntries.join(', ')}`);
    }

    const tokenSource = ability?.dynamicDescription || ability?.description || '';
    const tokens = extractDescriptionTokens(tokenSource);
    if (tokens.length > 0) {
        sections.push(`TOKENS: ${tokens.join(', ')}`);
    }

    if (sections.length === 0) {
        sections.push('FORMULAS: NoEngineDataAvailable');
    }

    return sections.join(' | ');
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a champion toon payload string.
 * @param {string} championName - Champion display name or alias
 * @param {Function} encodeToon - The @toon-format/toon encode function
 * @param {object} logger - Logger with .info / .error methods
 * @returns {Promise<string>} The encoded toon string
 */
async function buildChampionToon(championName, encodeToon, logger) {
    logger.info('[champion_builder] Resolving champion', { championName });

    const summaryRes = await axios.get(CDRAGON_SUMMARY_URL, { timeout: 30000 });
    const champSummary = summaryRes.data.find(c => c.name.toLowerCase() === championName.toLowerCase());

    if (!champSummary) {
        throw new Error(`Champion '${championName}' not found.`);
    }

    logger.info('[champion_builder] Fetching champion detail + bin JSON', { id: champSummary.id });

    const detailUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/${champSummary.id}.json`;
    const detailRes = await axios.get(detailUrl, { timeout: 30000 });
    const champ = detailRes.data;
    const alias = champ.alias.toLowerCase();

    const binUrl = `https://raw.communitydragon.org/latest/game/data/characters/${alias}/${alias}.bin.json`;
    const binRes = await axios.get(binUrl, { timeout: 30000 });
    const binData = binRes.data;

    logger.info('[champion_builder] Translating AST engine formulas', { alias });

    const rawMathBlocks = {};
    const rawSpellMeta = {};

    for (const [path, obj] of Object.entries(binData)) {
        const isSpellsPath = path.includes('Spells/');
        const isHashedSpell = /^\{[0-9a-f]+\}$/i.test(path) && (obj.ObjectName || obj.mScriptName) && obj.mSpell;

        if ((isSpellsPath || isHashedSpell) && obj.mSpell) {
            const spellName = isSpellsPath
                ? path.split('/').pop().toLowerCase()
                : (obj.ObjectName || obj.mScriptName).toLowerCase();

            const cooldownSignature = toCooldownSignature(obj.mSpell.cooldownTime, 1);
            const spellSlot = extractSpellSlotFromTooltip(obj.mSpell);
            const tooltipSpellToken = extractTooltipSpellToken(obj.mSpell);
            const keyName = obj.mSpell?.mClientData?.mTooltipData?.mLocKeys?.keyName || null;
            const keyTooltip = obj.mSpell?.mClientData?.mTooltipData?.mLocKeys?.keyTooltip || null;
            const calcCount = Object.keys(obj.mSpell.mSpellCalculations || {}).length;
            const dataValueCount = Array.isArray(obj.mSpell.DataValues) ? obj.mSpell.DataValues.length : 0;
            let mathDump = '';

            // 1. Cooldowns
            if (obj.mSpell.cooldownTime && Array.isArray(obj.mSpell.cooldownTime)) {
                const cds = obj.mSpell.cooldownTime.slice(1, 6).map(v => Number(v.toFixed(2)));
                if (cds.some(v => v !== 0)) mathDump += `COOLDOWNS: [${cds.join('/')}] | `;
            }

            // 2. Base Values & Ratios
            const variables = extractDataValues(obj.mSpell);

            // Also extract mEffectAmount (positional Effect1Amount..Effect10Amount values)
            // These are the @Effect1Amount@ etc. tokens referenced in ability descriptions.
            const effectAmountArr = Array.isArray(obj.mSpell.mEffectAmount) ? obj.mSpell.mEffectAmount : [];
            effectAmountArr.forEach((entry, idx) => {
                if (!Array.isArray(entry?.value)) return;
                const name = `Effect${idx + 1}Amount`;
                if (variables[name]) return; // already present from DataValues
                const vals = entry.value.slice(1, 6).map(v => Number(v.toFixed(3)));
                if (vals.some(v => v !== 0)) {
                    variables[name] = vals.join('/');
                }
            });

            const varStrings = Object.entries(variables).map(([name, values]) => `${name}: [${values}]`);
            if (varStrings.length > 0) mathDump += `VALUES: ${varStrings.join(', ')} | `;

            // 3. TRANSLATE FORMULAS
            if (obj.mSpell.mSpellCalculations) {
                const mappedFormulas = [];
                let calcIndex = 0;
                const spellHashMappings = buildSpellHashMappings(obj.mSpell, spellName, alias);

                for (const [calcName, calcObj] of Object.entries(obj.mSpell.mSpellCalculations)) {
                    calcIndex += 1;
                    const resolvedCalcName = resolveCalcDisplayName(calcName, spellName, calcIndex, spellHashMappings);
                    const equation = parseCalculation(calcObj);
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

            if (finalMathDump) {
                rawMathBlocks[spellName] = finalMathDump;
                rawSpellMeta[spellName] = {
                    cooldownSignature,
                    spellSlot,
                    tooltipSpellToken,
                    keyName,
                    keyTooltip,
                    calcCount,
                    dataValueCount
                };
            }
        }
    }

    // ─── resolveBestSpellMathKey (closure over rawSpellMeta + alias) ──────────

    const resolveBestSpellMathKey = (keys, candidateKeys, cooldownSignature = null, spellSlot = null) => {
        if (!keys || keys.length === 0) return null;
        const expectedKeys = Array.isArray(candidateKeys) ? candidateKeys : [candidateKeys];
        const normalizedExpected = expectedKeys
            .map(normalizeSpellLookupToken)
            .filter(Boolean);
        const expectedTokens = new Set(
            expectedKeys.flatMap(tokenizeIdentifier)
        );

        // When resolving an active spell slot (Q/W/E/R), exclude entries that look like
        // passive spells to prevent passive-named keys (e.g. kalistapassivebuff) from
        // being picked for active slots and then corrupting the duplicate-active check.
        const activeSlots = new Set(['q', 'w', 'e', 'r']);
        const isPassiveLookingKey = (k) => {
            const meta = rawSpellMeta[k] || {};
            return meta.spellSlot === 'p'
                || /passive/i.test(meta.keyName || '')
                || /passive/i.test(k);
        };
        const normalizedKeyEntries = keys
            .filter(k => !activeSlots.has(spellSlot) || !isPassiveLookingKey(k))
            .map(k => ({
                original: k,
                normalized: normalizeSpellLookupToken(k)
            }));

        const rankByQuality = entries => entries
            .slice()
            .sort((a, b) => {
                const qa = rawSpellMeta[a.original] || {};
                const qb = rawSpellMeta[b.original] || {};
                const calcDelta = (qb.calcCount || 0) - (qa.calcCount || 0);
                if (calcDelta !== 0) return calcDelta;
                const dataValueDelta = (qb.dataValueCount || 0) - (qa.dataValueCount || 0);
                if (dataValueDelta !== 0) return dataValueDelta;
                return a.original.length - b.original.length;
            });

        if (spellSlot) {
            const slotMatches = rankByQuality(
                normalizedKeyEntries.filter(entry => rawSpellMeta[entry.original]?.spellSlot === spellSlot)
            );

            if (slotMatches.length > 0) {
                if (normalizedExpected.length > 0) {
                    const preferred = slotMatches.find(entry => normalizedExpected.some(expected => entry.normalized.includes(expected)));
                    if (preferred) return preferred.original;
                }
                return slotMatches[0].original;
            }
        }

        if (normalizedExpected.length > 0) {
            const exact = normalizedKeyEntries.find(entry => normalizedExpected.includes(entry.normalized));
            if (exact) return exact.original;

            const prefixed = normalizedKeyEntries
                .filter(entry => normalizedExpected.some(expected => entry.normalized.startsWith(expected)))
                .sort((a, b) => a.original.length - b.original.length);
            if (prefixed.length > 0) return prefixed[0].original;
        }

        if (cooldownSignature) {
            const cooldownMatches = rankByQuality(
                normalizedKeyEntries.filter(entry => rawSpellMeta[entry.original]?.cooldownSignature === cooldownSignature)
            );
            if (cooldownMatches.length === 1) return cooldownMatches[0].original;
            if (cooldownMatches.length > 1 && normalizedExpected.length > 0) {
                const prioritized = cooldownMatches.find(entry => normalizedExpected.some(expected => entry.normalized.includes(expected)));
                if (prioritized) return prioritized.original;
            }
            if (cooldownMatches.length > 0) return cooldownMatches[0].original;
        }

        if (normalizedExpected.length === 0) return null;

        if (spellSlot !== 'p' && expectedTokens.size > 0) {
            // Compute alias-derived tokens so we can exclude them from the
            // "meaningful overlap" test. A match on the champion name alone
            // is not informative — every bin spell starts with the alias.
            const aliasOnlyTokens = new Set(tokenizeIdentifier(alias || '').map(t => t.toLowerCase()));

            const fuzzyMatches = normalizedKeyEntries
                .map(entry => {
                    const tooltipTokens = new Set(tokenizeIdentifier(rawSpellMeta[entry.original]?.tooltipSpellToken));
                    const sharedAll = [...tooltipTokens].filter(token => expectedTokens.has(token));
                    const sharedMeaningful = sharedAll.filter(token => !aliasOnlyTokens.has(token.toLowerCase()));
                    return { entry, shared: sharedAll.length, meaningfulShared: sharedMeaningful.length };
                })
                .filter(item => item.meaningfulShared > 0) // require at least one non-alias overlap
                .sort((a, b) => {
                    if (b.meaningfulShared !== a.meaningfulShared) return b.meaningfulShared - a.meaningfulShared;
                    if (b.shared !== a.shared) return b.shared - a.shared;
                    const qa = rawSpellMeta[a.entry.original] || {};
                    const qb = rawSpellMeta[b.entry.original] || {};
                    const calcDelta = (qb.calcCount || 0) - (qa.calcCount || 0);
                    if (calcDelta !== 0) return calcDelta;
                    const dataValueDelta = (qb.dataValueCount || 0) - (qa.dataValueCount || 0);
                    if (dataValueDelta !== 0) return dataValueDelta;
                    return a.entry.original.length - b.entry.original.length;
                });

            if (fuzzyMatches.length > 0) {
                return fuzzyMatches[0].entry.original;
            }
        }

        // Substring contains — require expected string to be at least 3 chars
        // to avoid single-letter slot keys ('e','w','q','r') matching anything
        const contains = normalizedKeyEntries
            .find(entry => normalizedExpected.some(expected => expected.length >= 3 && entry.normalized.includes(expected)));
        return contains ? contains.original : null;
    };

    // ─── Resolve active spell keys first ─────────────────────────────────────

    const championAbilityOverrides = KNOWN_ABILITY_SPELL_OVERRIDES_BY_CHAMPION[alias] || {};
    const selectedActiveSpellMathKeys = {};

    for (const spell of champ.spells) {
        const spellKey = spell.spellKey.toLowerCase();
        const spellCooldownSignature = toCooldownSignature(spell.cooldown, 0);
        const overrideSpellKey = championAbilityOverrides[spellKey];
        const resolvedSpellKey =
            (overrideSpellKey && rawMathBlocks[overrideSpellKey] ? overrideSpellKey : null)
            || resolveBestSpellMathKey(Object.keys(rawMathBlocks), [
                alias + spellKey,
                spellKey,
                spell.name,
                alias + spell.name
            ], spellCooldownSignature, spellKey);

        selectedActiveSpellMathKeys[spellKey] = resolvedSpellKey;
    }

    // ─── 1. Passive ──────────────────────────────────────────────────────────

    const abilities = [];

    let passiveDesc = formatDesc(champ.passive.dynamicDescription || champ.passive.description);
    const overridePassiveKey = championAbilityOverrides.passive;
    // Resolve passive using passive-only matching; do not reuse active resolver.
    const passiveBinKey =
        (overridePassiveKey && rawMathBlocks[overridePassiveKey] ? overridePassiveKey : null)
        || resolvePassiveSpellMathKey(Object.keys(rawMathBlocks), rawSpellMeta, alias, champ.passive?.name);

    const passiveMath = passiveBinKey ? rawMathBlocks[passiveBinKey] : null;
    const duplicateActiveMath = Object.values(selectedActiveSpellMathKeys)
        .some(activeKey => activeKey && rawMathBlocks[activeKey] && rawMathBlocks[activeKey] === passiveMath);
    const passiveFallbackMath = buildTooltipFallbackMath(champ.passive);
    const finalPassiveMath = passiveMath && !duplicateActiveMath
        ? passiveMath
        : passiveFallbackMath;

    if (finalPassiveMath) {
        passiveDesc += ` | ENGINE MATH: ${finalPassiveMath}`;
    }

    abilities.push({
        key: 'Passive',
        name: champ.passive.name,
        description: passiveDesc
    });

    // ─── 2. Q, W, E, R ───────────────────────────────────────────────────────

    champ.spells.forEach(spell => {
        let desc = formatDesc(spell.dynamicDescription || spell.description);
        const spellKey = spell.spellKey.toLowerCase();
        const binSpellKey = selectedActiveSpellMathKeys[spellKey];
        const fallbackMath = buildTooltipFallbackMath(spell);
        const finalSpellMath = (binSpellKey && rawMathBlocks[binSpellKey])
            ? rawMathBlocks[binSpellKey]
            : fallbackMath;

        if (finalSpellMath) {
            desc += ` | ENGINE MATH: ${finalSpellMath}`;
        }

        abilities.push({
            key: spell.spellKey.toUpperCase(),
            name: spell.name,
            description: desc
        });
    });

    logger.info('[champion_builder] Encoding champion toon', { champion: champ.name, abilityCount: abilities.length });

    return encodeToon({
        champion: [{
            name: champ.name,
            roles: champ.roles.join(', '),
            abilities
        }]
    });
}

module.exports = { buildChampionToon };
