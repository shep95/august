/*
 * DexScreener response normalisation. Shared by the service worker
 * (importScripts) and node tests.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else { root.MCT = root.MCT || {}; root.MCT.dexscreener = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function bestPair(pairs) {
    if (!Array.isArray(pairs) || !pairs.length) return null;
    return pairs.slice().sort(function (a, b) {
      var la = (a.liquidity && a.liquidity.usd) || 0, lb = (b.liquidity && b.liquidity.usd) || 0;
      return lb - la;
    })[0];
  }

  function normalize(pair, now) {
    if (!pair) return null;
    now = now || Date.now();
    var created = pair.pairCreatedAt ? Number(pair.pairCreatedAt) : null;
    var mcap = pair.marketCap != null ? pair.marketCap : pair.fdv != null ? pair.fdv : null;
    var vol1h = pair.volume && pair.volume.h1 != null ? Number(pair.volume.h1) : null;
    var vol24 = pair.volume && pair.volume.h24 != null ? Number(pair.volume.h24) : null;
    var liq = pair.liquidity && pair.liquidity.usd != null ? Number(pair.liquidity.usd) : null;
    var txns1h = pair.txns && pair.txns.h1 ? (pair.txns.h1.buys || 0) + (pair.txns.h1.sells || 0) : null;
    return {
      source: 'dexscreener',
      fetchedAt: now,
      chainId: pair.chainId,
      dexId: pair.dexId,
      labels: pair.labels || [],
      pairAddress: pair.pairAddress,
      tokenAddress: pair.baseToken && pair.baseToken.address,
      symbol: pair.baseToken && pair.baseToken.symbol,
      name: pair.baseToken && pair.baseToken.name,
      priceUsd: pair.priceUsd != null ? Number(pair.priceUsd) : null,
      priceChange: pair.priceChange || {},
      url: pair.url,
      socials: (pair.info && pair.info.socials) || [],
      websites: (pair.info && pair.info.websites) || [],
      metrics: {
        ageHours: created ? (now - created) / 36e5 : undefined,
        marketCap: mcap != null ? Number(mcap) : undefined,
        liquidityUsd: liq != null ? liq : undefined,
        volume1h: vol1h != null ? vol1h : undefined,
        volume24h: vol24 != null ? vol24 : undefined,
        volMcap1h: vol1h != null && mcap ? vol1h / Number(mcap) : undefined,
        txns1h: txns1h != null ? txns1h : undefined
      }
    };
  }

  function tokenUrl(address) { return 'https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(address); }
  function pairUrl(chain, address) { return 'https://api.dexscreener.com/latest/dex/pairs/' + encodeURIComponent(chain) + '/' + encodeURIComponent(address); }

  return { bestPair: bestPair, normalize: normalize, tokenUrl: tokenUrl, pairUrl: pairUrl };
});
