'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/content/adapters.js');

const SOL = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr';
const EVM = '0x1234567890abcdef1234567890abcdef12345678';

test('parseUrl — launchpads', () => {
  let c = A.parseUrl('https://pump.fun/coin/' + SOL);
  assert.deepEqual([c.chain, c.launchpad, c.address, c.kind], ['solana', 'pumpfun', SOL, 'token']);
  c = A.parseUrl('https://four.meme/token/' + EVM);
  assert.deepEqual([c.chain, c.launchpad, c.address], ['bsc', 'fourmeme', EVM]);
  c = A.parseUrl('https://moonshot.cc/' + SOL);
  assert.deepEqual([c.chain, c.launchpad, c.address], ['solana', 'moonshot', SOL]);
});

test('parseUrl — charting / terminals', () => {
  let c = A.parseUrl('https://dexscreener.com/solana/' + SOL);
  assert.deepEqual([c.chain, c.address, c.kind], ['solana', SOL, 'pair']);
  c = A.parseUrl('https://dexscreener.com/base/' + EVM);
  assert.deepEqual([c.chain, c.kind], ['base', 'pair']);
  c = A.parseUrl('https://www.dextools.io/app/en/solana/pair-explorer/' + SOL);
  assert.deepEqual([c.chain, c.address, c.kind], ['solana', SOL, 'pair']);
  c = A.parseUrl('https://www.dextools.io/app/en/bnb/pair-explorer/' + EVM);
  assert.equal(c.chain, 'bsc');
  c = A.parseUrl('https://gmgn.ai/sol/token/' + SOL);
  assert.deepEqual([c.chain, c.address], ['solana', SOL]);
  c = A.parseUrl('https://gmgn.ai/sol/token/abc123_' + SOL);
  assert.equal(c.address, SOL, 'gmgn referral slug prefix stripped');
  c = A.parseUrl('https://gmgn.ai/base/token/' + EVM);
  assert.deepEqual([c.chain, c.address], ['base', EVM]);
  c = A.parseUrl('https://photon-sol.tinyastro.io/en/lp/' + SOL);
  assert.deepEqual([c.chain, c.address, c.kind], ['solana', SOL, 'pair']);
  c = A.parseUrl('https://neo.bullx.io/terminal?chainId=1399811149&address=' + SOL);
  assert.deepEqual([c.chain, c.address], ['solana', SOL]);
  c = A.parseUrl('https://bullx.io/terminal?chainId=56&address=' + EVM);
  assert.deepEqual([c.chain, c.address], ['bsc', EVM]);
  c = A.parseUrl('https://axiom.trade/meme/' + SOL);
  assert.deepEqual([c.chain, c.address, c.kind], ['solana', SOL, 'pair']);
  c = A.parseUrl('https://birdeye.so/token/' + SOL + '?chain=solana');
  assert.deepEqual([c.chain, c.address], ['solana', SOL]);
  c = A.parseUrl('https://www.geckoterminal.com/solana/pools/' + SOL);
  assert.deepEqual([c.chain, c.address, c.kind], ['solana', SOL, 'pair']);
  c = A.parseUrl('https://rugcheck.xyz/tokens/' + SOL);
  assert.equal(c.address, SOL);
});

test('parseUrl — explorers and DEXes', () => {
  let c = A.parseUrl('https://solscan.io/token/' + SOL);
  assert.deepEqual([c.chain, c.address], ['solana', SOL]);
  c = A.parseUrl('https://basescan.org/token/' + EVM);
  assert.deepEqual([c.chain, c.address], ['base', EVM]);
  c = A.parseUrl('https://bscscan.com/token/' + EVM);
  assert.deepEqual([c.chain, c.address], ['bsc', EVM]);
  c = A.parseUrl('https://jup.ag/swap?inputMint=So11111111111111111111111111111111111111112&outputMint=' + SOL);
  assert.equal(c.address, SOL, 'picks the non-SOL side');
  c = A.parseUrl('https://raydium.io/swap/?inputMint=' + SOL + '&outputMint=So11111111111111111111111111111111111111112');
  assert.equal(c.address, SOL);
  c = A.parseUrl('https://app.uniswap.org/swap?chain=base&outputCurrency=' + EVM);
  assert.deepEqual([c.chain, c.address], ['base', EVM]);
  c = A.parseUrl('https://app.meteora.ag/dlmm/' + SOL);
  assert.deepEqual([c.chain, c.launchpad, c.kind], ['solana', 'meteora', 'pair']);
});

test('parseUrl — no token / unsupported', () => {
  let c = A.parseUrl('https://pump.fun/board');
  assert.equal(c.address, null);
  assert.equal(c.supported, true);
  c = A.parseUrl('https://example.com/' + SOL);
  assert.equal(c.supported, false);
  assert.equal(c.address, SOL, 'generic fallback still finds an address');
  assert.equal(A.parseUrl('not a url').supported, false);
});

test('scrapeText', () => {
  const s = A.scrapeText('Bonding curve progress: 42.5%\nKing of the hill\nHolders: 1,234\ndev 11.2%\nTop 10 holders 55%\nLP burned');
  assert.equal(s.curveFillPct, 42.5);
  assert.equal(s.holders, 1234);
  assert.equal(s.devPct, 11.2);
  assert.equal(s.top10Pct, 55);
  assert.equal(s.lpLocked, true);
  assert.equal(A.scrapeText('').curveFillPct, undefined);
  assert.equal(A.scrapeText('liquidity unlocked').lpLocked, false);
  assert.equal(A.scrapeText('Mint authority revoked').renounced, true);
});

test('launchpadFromDex', () => {
  assert.equal(A.launchpadFromDex('pumpfun'), 'pumpfun');
  assert.equal(A.launchpadFromDex('raydium', ['pump']), 'pumpfun');
  assert.equal(A.launchpadFromDex('meteora'), 'meteora');
  assert.equal(A.launchpadFromDex('uniswap'), 'uniswap');
  assert.equal(A.launchpadFromDex('raydium'), null);
});

test('scrapeText — holders must not match wallet address prefixes', () => {
  const s = A.scrapeText('Holder distribution\n7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr (dev) 14.8%\nTop 10 holders 61.2%\nHolders: 812');
  assert.equal(s.holders, 812);
  assert.equal(s.devPct, 14.8);
  assert.equal(s.top10Pct, 61.2);
});

test('pageName', () => {
  assert.deepEqual(A.pageName('Hawk Tuah (HAWK) | pump.fun', ''), { name: 'Hawk Tuah', symbol: 'HAWK' });
  assert.deepEqual(A.pageName('', 'dogwifhat ($WIF)'), { name: 'dogwifhat', symbol: 'WIF' });
  assert.deepEqual(A.pageName('WIF/SOL - dogwifhat - DexScreener', ''), { name: 'dogwifhat', symbol: 'WIF' });
  assert.equal(A.pageName('', ''), null);
  assert.deepEqual(A.pageName('Popcat - Photon', ''), { name: 'Popcat' });
});

test('isValidAddress / isValidChain', () => {
  assert.equal(A.isValidAddress(SOL), true);
  assert.equal(A.isValidAddress(EVM), true);
  assert.equal(A.isValidAddress('EQ' + 'A'.repeat(46)), true);
  assert.equal(A.isValidAddress('../../etc/passwd'), false);
  assert.equal(A.isValidAddress('<script>alert(1)</script>'), false);
  assert.equal(A.isValidAddress('x'.repeat(100)), false);
  assert.equal(A.isValidAddress(null), false);
  assert.equal(A.isValidChain('solana'), true);
  assert.equal(A.isValidChain(null), true);
  assert.equal(A.isValidChain('../pairs'), false);
});

test('parseUrl rejects hostile query addresses', () => {
  let c = A.parseUrl('https://neo.bullx.io/terminal?chainId=1399811149&address=javascript:alert(1)');
  assert.equal(c.address, null);
  c = A.parseUrl('https://neo.bullx.io/terminal?chainId=1399811149&address=' + encodeURIComponent('../../x'));
  assert.equal(c.address, null);
  c = A.parseUrl('https://birdeye.so/token/' + 'A'.repeat(300) + '?chain=solana');
  assert.equal(c.address, null);
  c = A.parseUrl('https://birdeye.so/token/' + SOL + '?chain=<img>');
  assert.equal(c.chain, 'solana', 'bad chain slug falls back');
});

test('scrapeText is bounded on hostile input', () => {
  const big = 'holders '.repeat(50000) + '%'.repeat(1000) + 'dev ' + '9'.repeat(5000) + '%';
  const t0 = Date.now();
  A.scrapeText(big);
  assert.ok(Date.now() - t0 < 2000, 'no catastrophic backtracking');
});
