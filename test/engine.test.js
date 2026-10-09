'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/shared/taxonomy.js');
const E = require('../src/shared/engine.js');

test('taxonomy integrity', () => {
  assert.equal(T.SIGNALS.reduce((a, s) => a + s.points, 0), 10, '7 signals sum to 10 points');
  assert.equal(T.SIGNALS.length, 7);
  assert.equal(T.PRE_COLLAPSE_SIGNALS.length, 10);
  assert.equal(T.TERMINAL_STATES.length, 4);
  assert.equal(T.ARCHETYPES.length, 5);
  assert.equal(T.MANIPULATION.types.length, 5);
  assert.equal(T.KOL_TIERS.length, 3);
  // score bands cover 0..10 contiguously
  for (let s = 0; s <= 10; s++) assert.ok(E.bandForScore(s), 'band for ' + s);
  assert.equal(E.bandForScore(0).id, 'full');
  assert.equal(E.bandForScore(2).id, 'full');
  assert.equal(E.bandForScore(3).id, 'half');
  assert.equal(E.bandForScore(4).id, 'half');
  assert.equal(E.bandForScore(5).id, 'skip');
  assert.equal(E.bandForScore(7).id, 'skip');
  assert.equal(E.bandForScore(8).id, 'avoid');
  assert.equal(E.bandForScore(10).id, 'avoid');
  // rotations reference real narratives
  for (const id of T.ROTATIONS.animal.sequence) assert.ok(T.NARRATIVES[id]);
  for (const id of T.ROTATIONS.macro.sequence) assert.ok(T.NARRATIVES[id]);
  for (const id of T.ROTATIONS.chain.sequence) assert.ok(T.CHAINS[id]);
});

test('classifyNarrative', () => {
  assert.equal(E.classifyNarrative({ name: 'dogwifhat', symbol: 'WIF' }).id, 'animal.canine');
  assert.equal(E.classifyNarrative({ name: 'Shiba Inu', symbol: 'SHIB' }).id, 'animal.canine');
  assert.equal(E.classifyNarrative({ name: 'cat in a dogs world', symbol: 'MEW' }).id, 'animal.feline');
  assert.equal(E.classifyNarrative({ name: 'Popcat', symbol: 'POPCAT' }).id, 'animal.feline');
  assert.equal(E.classifyNarrative({ name: 'Pepe', symbol: 'PEPE' }).id, 'animal.frog');
  assert.equal(E.classifyNarrative({ name: 'OFFICIAL TRUMP', symbol: 'TRUMP' }).id, 'political');
  assert.equal(E.classifyNarrative({ name: 'Goatseus Maximus', symbol: 'GOAT' }).id, 'ai');
  assert.equal(E.classifyNarrative({ name: 'ai16z', symbol: 'AI16Z' }).id, 'ai');
  assert.equal(E.classifyNarrative({ name: 'Hawk Tuah', symbol: 'HAWK' }).id, 'celebrity');
  assert.equal(E.classifyNarrative({ name: 'Mog Coin', symbol: 'MOG' }).id, 'cultural.meme');
  assert.equal(E.classifyNarrative({ name: 'Peanut the Squirrel', symbol: 'PNUT' }).id, 'animal.other');
  const none = E.classifyNarrative({ name: 'xqzv', symbol: 'XQZV' });
  assert.equal(none.id, 'absurdist');
  assert.equal(none.confidence, 'low');
  assert.equal(E.classifyNarrative({}).id, 'absurdist');
});

test('rotationContext', () => {
  const r = E.rotationContext('animal.feline');
  assert.equal(r.length, 1);
  assert.equal(r[0].position, 2);
  assert.equal(r[0].prev, 'Animal · canine');
  assert.equal(r[0].next, 'Animal · frog');
  const frog = E.rotationContext('animal.frog')[0];
  assert.equal(frog.next, 'Animal · canine', 'frog wraps back to dog');
  const pol = E.rotationContext('political')[0];
  assert.equal(pol.next, 'Celebrity derivative');
  assert.equal(E.rotationContext('absurdist').length, 0);
});

test('deriveSignals thresholds', () => {
  const s = E.deriveSignals({ devPct: 10.1, top10Pct: 50.1, lpLocked: false, volMcap1h: 1.01, ageHours: 23.9, devLastTradeHours: 1.9, socialSpike: true });
  assert.deepEqual(s, { devHold: true, top10: true, lpUnlocked: true, volMcap: true, socialSpike: true, age: true, devTrade: true });
  const c = E.deriveSignals({ devPct: 10, top10Pct: 50, lpLocked: true, volMcap1h: 1, ageHours: 24, devLastTradeHours: 2, socialSpike: false });
  assert.deepEqual(c, { devHold: false, top10: false, lpUnlocked: false, volMcap: false, socialSpike: false, age: false, devTrade: false });
  const u = E.deriveSignals({});
  assert.ok(Object.values(u).every(v => v === undefined));
});

test('scoreSignals', () => {
  const all = {};
  T.SIGNALS.forEach(s => { all[s.id] = true; });
  const full = E.scoreSignals(all);
  assert.equal(full.score, 10);
  assert.equal(full.band.id, 'avoid');
  assert.equal(full.unknown.length, 0);

  const partial = E.scoreSignals({ devHold: true, age: true });
  assert.equal(partial.score, 3);
  assert.equal(partial.band.id, 'half');
  assert.equal(partial.unknown.length, 5);

  const none = E.scoreSignals({});
  assert.equal(none.score, 0);
  assert.equal(none.band.id, 'full');
  assert.equal(none.unknown.length, 7);
});

test('lifecyclePhase', () => {
  assert.equal(E.lifecyclePhase(0).id, 'launch');
  assert.equal(E.lifecyclePhase(23.9).id, 'launch');
  assert.equal(E.lifecyclePhase(24).id, 'accumulation');
  assert.equal(E.lifecyclePhase(24 * 7 - 1).id, 'accumulation');
  assert.equal(E.lifecyclePhase(24 * 7).id, 'distribution');
  assert.equal(E.lifecyclePhase(24 * 30).id, 'terminal');
  assert.equal(E.lifecyclePhase(24 * 365).id, 'terminal');
  assert.equal(E.lifecyclePhase(undefined), null);
  assert.equal(E.lifecyclePhase(-1), null);
});

test('preCollapseCheck', () => {
  assert.equal(E.preCollapseCheck({}).count, 0);
  const two = E.preCollapseCheck({ volDrop70: true, socialDrop: true });
  assert.equal(two.distribution, false);
  const three = E.preCollapseCheck({ volDrop70: true, socialDrop: true, migration: true });
  assert.equal(three.distribution, true);
  assert.equal(three.highestConfidence, false);
  const hc = E.preCollapseCheck({ devSell5: true, lpRemoval: true });
  assert.equal(hc.highestConfidence, true);
  assert.equal(hc.distribution, false, 'two signals alone are not yet 3+');
});

test('bondingCurveAssessment', () => {
  assert.equal(E.bondingCurveAssessment(undefined), null);
  assert.equal(E.bondingCurveAssessment(10).level, 'ok');
  assert.equal(E.bondingCurveAssessment(59.9).level, 'ok');
  assert.equal(E.bondingCurveAssessment(60).level, 'poor');
  assert.equal(E.bondingCurveAssessment(94.9).level, 'poor');
  assert.equal(E.bondingCurveAssessment(95).level, 'red');
  assert.equal(E.bondingCurveAssessment(100).level, 'graduated');
  assert.equal(E.bondingCurveAssessment(140).fillPct, 100, 'clamped');
});

test('launchpadFlags', () => {
  const f = E.launchpadFlags({ launchpad: 'pumpfun', curveFillPct: 97, ageHours: 50, renounced: false, lpLocked: false, duplicateTicker: true });
  assert.ok(f.red.includes('pump.fun token at 95%+ curve fill'));
  assert.ok(f.red.includes('Contract not renounced 48h post-launch'));
  assert.ok(f.red.includes('No LP lock at launch'));
  assert.ok(f.red.includes('Duplicate ticker copy'));
  assert.equal(f.green.length, 0);

  const fm = E.launchpadFlags({ launchpad: 'fourmeme', devKnown: false, hasCommunity: false });
  assert.ok(fm.red.includes('four.meme + unknown dev + no community'));

  const g = E.launchpadFlags({ launchpad: 'meteora', lpLockDays: 45, renounced: true, graduated: true, curveFillPct: 100 });
  assert.ok(g.green.includes('Meteora LP burn at launch'));
  assert.ok(g.green.includes('Liquidity lock >30 days'));
  assert.ok(g.green.includes('Renounced contract post-graduation'));
  assert.ok(g.green.includes('pump.fun graduation'));
  assert.equal(g.red.length, 0);

  // 100% fill is graduation, not the 95% red flag
  assert.equal(E.launchpadFlags({ launchpad: 'pumpfun', curveFillPct: 100 }).red.length, 0);
  // renounce flag only after 48h
  assert.equal(E.launchpadFlags({ renounced: false, ageHours: 47 }).red.length, 0);
});

test('kolTier', () => {
  assert.equal(E.kolTier({ followers: 2e6 }).id, 'C');
  assert.equal(E.kolTier({ followers: 1000, coordinatedCall: true }).id, 'C');
  assert.equal(E.kolTier({ followers: 1000, priceUpPctBeforeCall: 350 }).id, 'C');
  assert.equal(E.kolTier({ followers: 20000, onChainVerified: true, trackRecordMonths: 12 }).id, 'A');
  assert.equal(E.kolTier({ followers: 20000, onChainVerified: false, trackRecordMonths: 12 }).id, 'B');
  assert.equal(E.kolTier({ followers: 200000, onChainVerified: true, trackRecordMonths: 12 }).id, 'B', 'audience too large for tier A');
});

test('terminalState', () => {
  assert.equal(E.terminalState({}), null);
  assert.equal(E.terminalState({ volume24h: 10, holders: 0 }).id, 'dead');
  assert.equal(E.terminalState({ volume24h: 10, holders: 500 }).id, 'sleeping');
  assert.equal(E.terminalState({ volume24h: 10, holders: 100, holdersPrev: 1000 }).id, 'dead');
  assert.equal(E.terminalState({ volume24h: 50000, cto: true }).id, 'evolving');
  assert.equal(E.terminalState({ volume24h: 50000 }).id, 'recovery');
});

test('assess end-to-end: fresh pump.fun celebrity coin', () => {
  const a = E.assess({
    name: 'Hawk Tuah', symbol: 'HAWK', chain: 'solana', launchpad: 'pumpfun', curveFillPct: 96,
    metrics: { ageHours: 3, devPct: 15, lpLocked: false, volMcap1h: 2.5 },
    preCollapse: {}
  });
  assert.equal(a.narrative.id, 'celebrity');
  assert.equal(a.phase.id, 'launch');
  assert.equal(a.curve.level, 'red');
  // devHold(2) + lpUnlocked(2) + volMcap(1) + age(1) = 6 → skip
  assert.equal(a.scoring.score, 6);
  assert.equal(a.scoring.band.id, 'skip');
  assert.ok(a.flags.red.includes('pump.fun token at 95%+ curve fill'));
  assert.ok(a.warnings.some(w => /Celebrity/.test(w)));
  assert.ok(a.warnings.some(w => /Launch phase/.test(w)));
});

test('assess: manual overrides beat auto signals', () => {
  const a = E.assess({ metrics: { ageHours: 2 }, overrides: { age: false, top10: true } });
  assert.equal(a.autoSignals.age, true);
  assert.equal(a.signals.age, false);
  assert.equal(a.scoring.score, 2);
});

test('assess: BSC very-high risk warning and distribution verdict', () => {
  const a = E.assess({ chain: 'bsc', launchpad: 'fourmeme', metrics: { ageHours: 24 * 10 }, preCollapse: { devSell5: true, lpRemoval: true, migration: true } });
  assert.equal(a.phase.id, 'distribution');
  assert.ok(a.warnings.some(w => /BSC chain risk/.test(w)));
  assert.ok(a.warnings.some(w => /highest-confidence exit/.test(w)));
  assert.equal(a.collapse.distribution, true);
});
