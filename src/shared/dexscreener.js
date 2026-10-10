/*
 * DexScreener response normalisation. Shared by the service worker
 * (importScripts) and node tests.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else { root.MCT = root.MCT || {}; root.MCT.dexscreener = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 200) : undefined; }
  function fin(v) { var n = Number(v); return v != null && v !== '' && isFinite(n) ? n : null; }
  function objArray(v) { return Array.isArray(v) ? v.filter(function (o) { return o && typeof o === 'object'; }).slice(0, 20) : []; }

  function bestPair(pairs) {
    if (!Array.isArray(pairs)) return null;
    pairs = pairs.filter(function (p) { return p && typeof p === 'object'; });
    if (!pairs.length) return null;
    return pairs.slice().sort(function (a, b) {
      var la = (a.liquidity && a.liquidity.usd) || 0, lb = (b.liquidity && b.liquidity.usd) || 0;
      return lb - la;
    })[0];
  }

  function normalize(pair, now) {
    if (!pair) return null;
    now = now || Date.now();
    var created = fin(pair.pairCreatedAt);
    var mcap = fin(pair.marketCap); if (mcap == null) mcap = fin(pair.fdv);
    var vol = pair.volume && typeof pair.volume === 'object' ? pair.volume : {};
    var vol1h = fin(vol.h1), vol24 = fin(vol.h24);
    var liq = pair.liquidity && typeof pair.liquidity === 'object' ? fin(pair.liquidity.usd) : null;
    var tx = pair.txns && pair.txns.h1 && typeof pair.txns.h1 === 'object' ? pair.txns.h1 : null;
    var txns1h = tx ? (fin(tx.buys) || 0) + (fin(tx.sells) || 0) : null;
    var base = pair.baseToken && typeof pair.baseToken === 'object' ? pair.baseToken : {};
    var pc = pair.priceChange && typeof pair.priceChange === 'object' ? pair.priceChange : {};
    var info = pair.info && typeof pair.info === 'object' ? pair.info : {};
    var ageHours = created != null && created > 0 && created <= now ? (now - created) / 36e5 : undefined;
    return {
      source: 'dexscreener',
      fetchedAt: now,
      chainId: str(pair.chainId, 32),
      dexId: str(pair.dexId, 64),
      labels: Array.isArray(pair.labels) ? pair.labels.filter(function (x) { return typeof x === 'string'; }).slice(0, 10) : [],
      pairAddress: str(pair.pairAddress, 128),
      tokenAddress: str(base.address, 128),
      symbol: str(base.symbol, 32),
      name: str(base.name, 120),
      priceUsd: fin(pair.priceUsd),
      priceChange: { m5: fin(pc.m5), h1: fin(pc.h1), h6: fin(pc.h6), h24: fin(pc.h24) },
      url: str(pair.url, 512),
      socials: objArray(info.socials),
      websites: objArray(info.websites).map(function (w) { return { label: str(w.label, 80), url: str(w.url, 512) }; }),
      metrics: {
        ageHours: ageHours,
        marketCap: mcap != null && mcap >= 0 ? mcap : undefined,
        liquidityUsd: liq != null && liq >= 0 ? liq : undefined,
        volume1h: vol1h != null && vol1h >= 0 ? vol1h : undefined,
        volume24h: vol24 != null && vol24 >= 0 ? vol24 : undefined,
        volMcap1h: vol1h != null && mcap ? vol1h / mcap : undefined,
        txns1h: txns1h != null ? txns1h : undefined
      }
    };
  }

  function tokenUrl(address) { return 'https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(address); }
  function pairUrl(chain, address) { return 'https://api.dexscreener.com/latest/dex/pairs/' + encodeURIComponent(chain) + '/' + encodeURIComponent(address); }

  return { bestPair: bestPair, normalize: normalize, tokenUrl: tokenUrl, pairUrl: pairUrl };
});
