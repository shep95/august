'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../src/shared/dexscreener.js');

const NOW = 1_760_000_000_000;
const pair = {
  chainId: 'solana', dexId: 'raydium', labels: [], pairAddress: 'PAIR', url: 'https://dexscreener.com/solana/PAIR',
  baseToken: { address: 'TOKEN', symbol: 'HAWK', name: 'Hawk Tuah' },
  priceUsd: '0.0123', priceChange: { h1: -12.5 },
  volume: { h1: 150000, h24: 900000 }, liquidity: { usd: 40000 }, marketCap: 100000,
  txns: { h1: { buys: 120, sells: 80 } }, pairCreatedAt: NOW - 3 * 36e5
};

test('normalize', () => {
  const n = DS.normalize(pair, NOW);
  assert.equal(n.symbol, 'HAWK');
  assert.equal(n.metrics.ageHours, 3);
  assert.equal(n.metrics.volMcap1h, 1.5);
  assert.equal(n.metrics.txns1h, 200);
  assert.equal(n.metrics.liquidityUsd, 40000);
  assert.equal(n.priceUsd, 0.0123);
  assert.equal(DS.normalize(null), null);
  const noMcap = DS.normalize(Object.assign({}, pair, { marketCap: undefined, fdv: 200000 }), NOW);
  assert.equal(noMcap.metrics.marketCap, 200000, 'falls back to fdv');
  const bare = DS.normalize({ chainId: 'base' }, NOW);
  assert.equal(bare.metrics.ageHours, undefined);
  assert.equal(bare.metrics.volMcap1h, undefined);
});

test('bestPair picks deepest liquidity', () => {
  const p = DS.bestPair([{ liquidity: { usd: 10 }, id: 'a' }, { liquidity: { usd: 500 }, id: 'b' }, { id: 'c' }]);
  assert.equal(p.id, 'b');
  assert.equal(DS.bestPair([]), null);
  assert.equal(DS.bestPair(undefined), null);
});

test('urls', () => {
  assert.equal(DS.tokenUrl('abc'), 'https://api.dexscreener.com/latest/dex/tokens/abc');
  assert.equal(DS.pairUrl('solana', 'p/1'), 'https://api.dexscreener.com/latest/dex/pairs/solana/p%2F1');
});
