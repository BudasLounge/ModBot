const data = require('./modules/league/mayhem_wiki_data.json');
const tests = [
  'Overflow',         // {{fd}} nested in {{as|...|mana}}
  'First-Aid Kit',   // {{stil|...}}
  'Glass Cannon',    // {{tt|...}}, [[link|display]]
  'Holy Fire',       // {{fd|0.32}} inside {{as}}
  'Firefox',         // {{cai|...}}, {{pp|...}}
  'Poro Blaster',    // [[File:...]], tip|airborne
  'Kindred Spirits', // if it exists
  'Flash Zone',
  'Shaco in a Box',
];

// Also test one of each new template type
const newTplTests = {
  adaptive:   'you {{adaptive|10}}, stacking',
  ai_ais:     '{{ai|Backstab|Shaco}}, {{ais|Hallucinate|Shaco}} explosion',
  bi:         'grants {{bi|Crest of Cinders}} and {{bi|Crest of Insight}}',
  ci_cis:     'Gain {{cis|Shaco}} {{ci|Teemo}}',
  ccs:        '{{ccs|{{as|bonus physical damage}}|physical}} on-hit',
  csl:        'with {{csl|Teemo|Little Devil}}, who drains',
  g:          'gain {{g|25}} (total {{g|50}}) from kills, gain {{g|250}}',
  ii_iis:     'from {{ii|Cappa Juice}} and {{iis|Zhonya\'s Hourglass}} Stasis',
  nie:        'causing {{nie|Death}} threshold increased by 0.5%',
  rd:         'Gain {{rd|75|50}} bonus attack range',
  recurring:  '{{fd|0.3{{recurring|3}}}}% of the target\'s maximum health',
  ri:         'the {{ri|Fleet Footwork}} and {{ri|Grasp of the Undying}} runes',
  rutngt:     'for {{rutngt|2.25}}, rapidly shoot over {{rutngt|2}}',
  sbc:        '{{sbc|Eligible Items:}} {{ii|Abyssal Mask}}, {{ii|Cosmic Drive}}',
  si_sis:     'by {{si|Mark}}. Your {{sis|Mark}} cooldown reduced',
  times:      '(+ 10% AD) {{times}} (1 + {{fd|0.3}} per 100% bonus attack speed)',
};

console.log('=== EXISTING AUGMENTS ===\n');
for (const name of tests) {
  const e = data[name];
  if (!e) { console.log(name + ': NOT FOUND\n'); continue; }
  console.log(`[${e.tier}] ${name}`);
  console.log(stripWikiMarkup(e.description));
  console.log();
}

console.log('=== NEW TEMPLATE UNIT TESTS ===\n');
for (const [label, raw] of Object.entries(newTplTests)) {
  console.log(`--- ${label} ---`);
  console.log('IN: ', raw.slice(0, 120));
  console.log('OUT:', stripWikiMarkup(raw));
  console.log();
}
