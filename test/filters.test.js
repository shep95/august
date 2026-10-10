'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/shared/engine.js');
const F = require('../src/shared/filters.js');

const ids = r => r.map(x => x.id);

test('defaults come from the research', () => {
  const d = F.defaults();
  assert.equal(d.celebrity, true); assert.equal(d.political, true); assert.equal(d.lp, true);
  assert.equal(d.fresh, false, 'strict <1h rule is opt-in');
  assert.equal(F.RULES.length, Object.keys(d).length);
});

test('celebrity pump.fun token at 96% is rejected for several reasons', () => {
  const tok = { name: 'Hawk Tuah', symbol: 'HAWK', chain: 'solana', launchpad: 'pumpfun', curveFillPct: 96, metrics: { ageHours: 3, devPct: 15, lpLocked: false, marketCap: 100000, liquidityUsd: 2000 } };
  const r = F.evaluate(E.assess(tok), tok);
  assert.equal(r.verdict, 'reject');
  for (const id of ['band', 'celebrity', 'curve95', 'lp', 'dev', 'thinlp', 'flags']) assert.ok(ids(r.rejects).includes(id), id);
  assert.ok(ids(r.cautions).includes('launch'));
});

test('clean organic dog coin passes', () => {
  const tok = { name: 'dogwifhat', symbol: 'WIF', chain: 'solana', metrics: { ageHours: 24 * 20, devPct: 2, top10Pct: 20, lpLocked: true, volMcap1h: 0.1, marketCap: 5e6, liquidityUsd: 1e6, devLastTradeHours: 100, socialSpike: false } };
  const r = F.evaluate(E.assess(tok), tok);
  assert.equal(r.verdict, 'pass', JSON.stringify(r.rejects.concat(r.cautions)));
  assert.equal(r.unknown.length, 0);
});

test('unknown data is reported, not treated as pass or reject', () => {
  const tok = { name: 'Popcat', symbol: 'POPCAT', metrics: {} };
  const r = F.evaluate(E.assess(tok), tok);
  assert.equal(r.verdict, 'pass');
  for (const id of ['lp', 'dev', 'top10', 'wash', 'launch', 'thinlp']) assert.ok(ids(r.unknown).includes(id), id);
  assert.ok(ids(r.passed).includes('curve95'), 'no curve outside pump.fun is a pass');
  const pf = { name: 'Popcat', launchpad: 'pumpfun', metrics: {} };
  assert.ok(ids(F.evaluate(E.assess(pf), pf).unknown).includes('curve95'), 'pump.fun without a curve reading is unknown');
});

test('caution-only cases and disabling rules', () => {
  const tok = { name: 'Mog', symbol: 'MOG', chain: 'bsc', metrics: { ageHours: 5, marketCap: 1e6, liquidityUsd: 2e5 } };
  let r = F.evaluate(E.assess(tok), tok);
  assert.equal(r.verdict, 'caution');
  assert.deepEqual(ids(r.cautions).sort(), ['bsc', 'launch']);
  r = F.evaluate(E.assess(tok), tok, { bsc: false, launch: false });
  assert.equal(r.verdict, 'pass');
  assert.deepEqual(ids(r.disabled).sort(), ['bsc', 'fresh', 'launch']);
  // turning on the strict fresh rule
  const fresh = { name: 'x', metrics: { ageHours: 0.5 } };
  assert.equal(F.evaluate(E.assess(fresh), fresh).verdict, 'caution');
  assert.equal(F.evaluate(E.assess(fresh), fresh, { fresh: true }).verdict, 'reject');
});

test('political and distribution-phase tokens are rejected', () => {
  const pol = { name: 'OFFICIAL TRUMP', symbol: 'TRUMP', metrics: { ageHours: 48 } };
  assert.ok(ids(F.evaluate(E.assess(pol), pol).rejects).includes('political'));
  const dist = { name: 'Pepe', metrics: { ageHours: 24 * 10 }, preCollapse: { devSell5: true, lpRemoval: true, migration: true } };
  assert.ok(ids(F.evaluate(E.assess(dist), dist).rejects).includes('distribution'));
});
