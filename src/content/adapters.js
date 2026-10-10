/*
 * Site adapters — turn a URL (+ optional page text) into a token context.
 * UMD so node tests can exercise URL parsing without a DOM.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else { root.MCT = root.MCT || {}; root.MCT.adapters = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOL_ADDR = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  var EVM_ADDR = /0x[a-fA-F0-9]{40}/g;
  var TON_ADDR = /[EU]Q[A-Za-z0-9_-]{46}/g;

  function first(re, s) { re.lastIndex = 0; var m = re.exec(s || ''); return m ? m[0] : null; }
  function all(re, s) { re.lastIndex = 0; var out = [], m; while ((m = re.exec(s || ''))) out.push(m[0]); return out; }
  function num(v) { var n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : undefined; }

  // Chain id maps used by various terminals.
  var CHAIN_IDS = { '1399811149': 'solana', '1': 'ethereum', '56': 'bsc', '8453': 'base', '-239': 'ton' };
  var CHAIN_SLUGS = {
    sol: 'solana', solana: 'solana', eth: 'ethereum', ether: 'ethereum', ethereum: 'ethereum',
    bsc: 'bsc', bnb: 'bsc', base: 'base', ton: 'ton', 'the-open-network': 'ton'
  };

  function chainFromSlug(s) { return CHAIN_SLUGS[String(s || '').toLowerCase()] || null; }

  var KNOWN_CHAINS = ['solana', 'ethereum', 'bsc', 'base', 'ton'];
  /** Strict shape check for anything used as a storage key or API path. */
  function isValidAddress(a) {
    if (typeof a !== 'string' || a.length > 64) return false;
    return /^0x[a-fA-F0-9]{40}$/.test(a) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) || /^[EU]Q[A-Za-z0-9_-]{46}$/.test(a);
  }
  function isValidChain(c) { return c == null || KNOWN_CHAINS.indexOf(c) >= 0; }

  function addressFromText(text, preferredChain) {
    var evm = first(EVM_ADDR, text);
    var ton = first(TON_ADDR, text);
    var sol = all(SOL_ADDR, text).filter(function (a) { return !/^0x/.test(a) && a.length >= 32; })[0] || null;
    if (preferredChain === 'solana' && sol) return { address: sol, chain: 'solana' };
    if (preferredChain === 'ton' && ton) return { address: ton, chain: 'ton' };
    if ((preferredChain === 'ethereum' || preferredChain === 'bsc' || preferredChain === 'base') && evm) return { address: evm, chain: preferredChain };
    if (evm) return { address: evm, chain: preferredChain || null };
    if (ton) return { address: ton, chain: 'ton' };
    if (sol) return { address: sol, chain: preferredChain || 'solana' };
    return null;
  }

  /** Scrape loosely-structured page text for curve / holder metrics. */
  function scrapeText(text) {
    var t = String(text || '');
    var out = {};
    var m;
    if ((m = /bonding\s*curve\s*progress[^0-9]{0,20}([\d.]+)\s*%/i.exec(t))) out.curveFillPct = num(m[1]);
    else if ((m = /progress[^0-9%]{0,20}([\d.]+)\s*%/i.exec(t)) && /curve|graduat|launch/i.test(t)) out.curveFillPct = num(m[1]);
    if ((m = /(?:dev|creator)[^0-9%]{0,30}([\d.]+)\s*%/i.exec(t))) out.devPct = num(m[1]);
    if ((m = /top\s*10[^0-9%]{0,30}([\d.]+)\s*%/i.exec(t))) out.top10Pct = num(m[1]);
    if (/lp\s*(?:burn(?:ed|t)?|locked)/i.test(t) || /liquidity\s*(?:burn(?:ed|t)?|locked)/i.test(t)) out.lpLocked = true;
    if (/lp\s*(?:unlocked|not\s*locked)/i.test(t) || /liquidity\s*(?:unlocked|not\s*locked)/i.test(t)) out.lpLocked = false;
    if (/mint(?:able)?(?:\s*authority)?\s*(?:disabled|revoked|renounced)/i.test(t) || /renounced/i.test(t)) out.renounced = true;
    var hre = /holders?\s*[:\-]?\s*([\d,]+)(?![\w%])/ig, hm;
    while ((hm = hre.exec(t))) {
      if (/^[\d,.]*\s*%/.test(t.slice(hm.index + hm[0].length, hm.index + hm[0].length + 6))) continue;
      out.holders = num(hm[1]); break;
    }
    return out;
  }

  /**
   * Best-effort token name / symbol from page title + first heading.
   * Strips site branding and picks "NAME (SYMBOL)" / "NAME | SYMBOL" shapes.
   */
  function pageName(title, h1) {
    var out = {};
    var cands = [h1, title].map(function (x) { return String(x || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i].replace(/^\$?([A-Za-z0-9_]{1,15})\/(SOL|WSOL|USDC|USDT|ETH|WETH|BNB|WBNB|TON|VIRTUAL)\b/i, '$1').replace(/\s*[|\-–—·]\s*(pump\.fun|dexscreener|gmgn|photon|bullx|axiom|birdeye|four\.meme|solscan|basescan|bscscan|geckoterminal|rugcheck|jupiter|raydium|meteora|uniswap|dextools).*$/i, '').trim();
      var m = /^(.+?)\s*\(\$?([A-Za-z0-9_]{1,15})\)/.exec(c) || /^\$?([A-Z0-9_]{2,15})\s*[\/|·-]\s*(.+)$/.exec(c);
      if (m) {
        if (/^\$?[A-Z0-9_]{2,15}$/.test(m[1]) && m[2].length > m[1].length) { out.symbol = m[1].replace('$', ''); out.name = m[2]; }
        else { out.name = m[1]; out.symbol = m[2]; }
        return out;
      }
      if (!out.name && c.length <= 60 && c.length >= 2) out.name = c;
    }
    return out.name ? out : null;
  }

  /**
   * Parse a URL into { site, chain, launchpad, address, kind:'token'|'pair', supported }.
   * `kind` tells the fetcher which DexScreener endpoint to call.
   */
  function parseUrl(urlStr) {
    var u;
    try { u = new URL(urlStr); } catch (e) { return { supported: false }; }
    var host = u.hostname.replace(/^www\./, '');
    var path = u.pathname;
    var q = u.searchParams;
    var ctx = { site: host, chain: null, launchpad: null, address: null, kind: 'token', supported: true };
    var seg = path.split('/').filter(Boolean);
    var m;

    if (/(^|\.)pump\.fun$/.test(host)) {
      ctx.chain = 'solana'; ctx.launchpad = 'pumpfun';
      if ((m = /\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(path))) ctx.address = m[1];
    } else if (host === 'dexscreener.com') {
      if (seg.length >= 2 && chainFromSlug(seg[0])) {
        ctx.chain = chainFromSlug(seg[0]); ctx.address = seg[1]; ctx.kind = 'pair';
      }
    } else if (host === 'dextools.io') {
      if ((m = /\/app\/[a-z-]+\/([a-z-]+)\/pair-explorer\/([A-Za-z0-9]+)/.exec(path))) {
        ctx.chain = chainFromSlug(m[1]); ctx.address = m[2]; ctx.kind = 'pair';
      }
    } else if (host === 'gmgn.ai') {
      if (seg.length >= 3 && seg[1] === 'token') {
        ctx.chain = chainFromSlug(seg[0]);
        var last = seg[2].split('_').pop();
        var a = addressFromText(last, ctx.chain); if (a) ctx.address = a.address;
      }
    } else if (host === 'photon-sol.tinyastro.io') {
      ctx.chain = 'solana';
      if ((m = /\/lp\/([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(path))) { ctx.address = m[1]; ctx.kind = 'pair'; }
    } else if (/(^|\.)bullx\.io$/.test(host)) {
      ctx.chain = CHAIN_IDS[q.get('chainId')] || null;
      if (q.get('address')) ctx.address = q.get('address');
    } else if (/(^|\.)axiom\.trade$/.test(host)) {
      ctx.chain = 'solana';
      if ((m = /\/meme\/([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(path))) { ctx.address = m[1]; ctx.kind = 'pair'; }
    } else if (host === 'birdeye.so') {
      ctx.chain = chainFromSlug(q.get('chain')) || 'solana';
      if ((m = /\/token\/([A-Za-z0-9]+)/.exec(path))) ctx.address = m[1];
    } else if (host === 'four.meme') {
      ctx.chain = 'bsc'; ctx.launchpad = 'fourmeme';
      if ((m = /\/token\/(0x[a-fA-F0-9]{40})/.exec(path))) ctx.address = m[1];
    } else if (host === 'moonshot.cc' || host === 'dexlab.space') {
      ctx.chain = 'solana'; ctx.launchpad = host === 'moonshot.cc' ? 'moonshot' : null;
      var am = addressFromText(path, 'solana'); if (am) ctx.address = am.address;
    } else if (host === 'solscan.io') {
      ctx.chain = 'solana';
      if ((m = /\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(path))) ctx.address = m[1];
    } else if (host === 'basescan.org' || host === 'bscscan.com') {
      ctx.chain = host === 'basescan.org' ? 'base' : 'bsc';
      if ((m = /\/token\/(0x[a-fA-F0-9]{40})/.exec(path))) ctx.address = m[1];
    } else if (host === 'geckoterminal.com') {
      if (seg.length >= 3 && seg[1] === 'pools') { ctx.chain = chainFromSlug(seg[0]); ctx.address = seg[2]; ctx.kind = 'pair'; }
    } else if (host === 'rugcheck.xyz') {
      ctx.chain = 'solana';
      if ((m = /\/tokens\/([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(path))) ctx.address = m[1];
    } else if (host === 'app.meteora.ag') {
      ctx.chain = 'solana'; ctx.launchpad = 'meteora';
      var mm = addressFromText(path, 'solana'); if (mm) { ctx.address = mm.address; ctx.kind = 'pair'; }
    } else if (host === 'jup.ag' || host === 'raydium.io') {
      ctx.chain = 'solana';
      var out = q.get('outputMint') || q.get('outputCurrency') || q.get('outputToken') || null;
      var ins = q.get('inputMint') || q.get('inputCurrency') || null;
      var SOL = 'So11111111111111111111111111111111111111112';
      var pick = out && out !== SOL ? out : ins && ins !== SOL ? ins : null;
      if (pick) ctx.address = pick; else { var jm = addressFromText(path, 'solana'); if (jm) ctx.address = jm.address; }
    } else if (host === 'app.uniswap.org') {
      ctx.chain = chainFromSlug(q.get('chain')) || 'ethereum';
      var oc = q.get('outputCurrency') || q.get('inputCurrency');
      if (oc && /^0x/.test(oc)) ctx.address = oc;
      else { var um = first(EVM_ADDR, path); if (um) ctx.address = um; }
    } else if (/ston\.fi$/.test(host) || host === 'dedust.io') {
      ctx.chain = 'ton';
      var tm = addressFromText(urlStr, 'ton'); if (tm) ctx.address = tm.address;
    } else if (host === 'trojan.app') {
      ctx.chain = 'solana';
      var trm = addressFromText(urlStr, 'solana'); if (trm) ctx.address = trm.address;
    } else {
      ctx.supported = false;
    }

    // Generic fallback: any address in the URL.
    if (!ctx.address) {
      var g = addressFromText(path + ' ' + u.search, ctx.chain);
      if (g) { ctx.address = g.address; ctx.chain = ctx.chain || g.chain; }
    }
    if (ctx.address && !ctx.chain) {
      ctx.chain = /^0x/.test(ctx.address) ? null : /^[EU]Q/.test(ctx.address) ? 'ton' : 'solana';
    }
    if (!isValidAddress(ctx.address)) ctx.address = null;
    if (!isValidChain(ctx.chain)) ctx.chain = null;
    return ctx;
  }

  function dexscreenerChain(chain) {
    return { solana: 'solana', ethereum: 'ethereum', bsc: 'bsc', base: 'base', ton: 'ton' }[chain] || chain;
  }

  function chainFromDexscreener(id) {
    return { solana: 'solana', ethereum: 'ethereum', bsc: 'bsc', base: 'base', ton: 'ton' }[id] || id;
  }

  function launchpadFromDex(dexId, labels) {
    var d = String(dexId || '').toLowerCase();
    var l = (labels || []).join(' ').toLowerCase();
    if (d.indexOf('pumpfun') >= 0 || d.indexOf('pump') >= 0 || l.indexOf('pump') >= 0) return 'pumpfun';
    if (d.indexOf('fourmeme') >= 0 || d.indexOf('four') >= 0) return 'fourmeme';
    if (d.indexOf('meteora') >= 0) return 'meteora';
    if (d.indexOf('moonshot') >= 0) return 'moonshot';
    if (d.indexOf('uniswap') >= 0) return 'uniswap';
    return null;
  }

  return {
    parseUrl: parseUrl,
    isValidAddress: isValidAddress,
    isValidChain: isValidChain,
    pageName: pageName,
    scrapeText: scrapeText,
    addressFromText: addressFromText,
    chainFromSlug: chainFromSlug,
    dexscreenerChain: dexscreenerChain,
    chainFromDexscreener: chainFromDexscreener,
    launchpadFromDex: launchpadFromDex
  };
});
