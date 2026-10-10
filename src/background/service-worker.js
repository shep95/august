/*
 * Background service worker: fetches public DexScreener data for the
 * content panel (content scripts cannot call cross-origin APIs on every
 * site), keeps a short cache and drives the toolbar badge.
 */
importScripts('../shared/dexscreener.js', '../content/adapters.js');
var DS = self.MCT.dexscreener, AD = self.MCT.adapters;
var CACHE = {};
var PENDING = {};
var TTL_MS = 20 * 1000;
var FETCH_TIMEOUT_MS = 10 * 1000;
var MAX_BODY_BYTES = 2 * 1024 * 1024;

async function getJson(url) {
  var res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error('DexScreener HTTP ' + res.status);
  var len = Number(res.headers.get('content-length'));
  if (isFinite(len) && len > MAX_BODY_BYTES) throw new Error('response too large');
  var reader = res.body.getReader(), chunks = [], total = 0;
  for (;;) {
    var r = await reader.read();
    if (r.done) break;
    total += r.value.byteLength;
    if (total > MAX_BODY_BYTES) { reader.cancel(); throw new Error('response too large'); }
    chunks.push(r.value);
  }
  var buf = new Uint8Array(total), off = 0;
  chunks.forEach(function (c) { buf.set(c, off); off += c.byteLength; });
  var json = JSON.parse(new TextDecoder().decode(buf));
  if (!json || typeof json !== 'object') throw new Error('bad response');
  return json;
}

async function fetchDex(kind, chain, address) {
  if (!AD.isValidAddress(address)) throw new Error('invalid address');
  if (kind !== 'token' && kind !== 'pair') throw new Error('invalid kind');
  if (chain != null && !AD.isValidChain(chain)) throw new Error('invalid chain');
  var keys = Object.keys(CACHE);
  if (keys.length > 200) keys.slice(0, 100).forEach(function (k) { delete CACHE[k]; });
  var key = kind + ':' + (chain || '') + ':' + address;
  var hit = CACHE[key];
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  if (PENDING[key]) return PENDING[key];
  PENDING[key] = (async function () {
    var json = await getJson(kind === 'pair' && chain ? DS.pairUrl(chain, address) : DS.tokenUrl(address));
    var pair = DS.bestPair(json.pairs || (json.pair ? [json.pair] : []));
    // A pair lookup that misses may still be a token address on this chain.
    if (!pair && kind === 'pair') {
      try { var j2 = await getJson(DS.tokenUrl(address)); pair = DS.bestPair(j2.pairs || []); } catch (e) { /* keep null */ }
    }
    var data = DS.normalize(pair);
    CACHE[key] = { at: Date.now(), data: data };
    return data;
  })();
  try { return await PENDING[key]; } finally { delete PENDING[key]; }
}

// Batch lookup for list pages: DexScreener accepts up to 30 comma-separated addresses.
async function fetchMany(kind, chain, addresses) {
  if (!Array.isArray(addresses)) throw new Error('invalid addresses');
  if (kind !== 'token' && kind !== 'pair') throw new Error('invalid kind');
  if (chain != null && !AD.isValidChain(chain)) throw new Error('invalid chain');
  var want = [], out = {};
  addresses.slice(0, 30).forEach(function (a) {
    if (!AD.isValidAddress(a)) return;
    var hit = CACHE[kind + ':' + (chain || '') + ':' + a];
    if (hit && Date.now() - hit.at < TTL_MS * 3) out[a] = hit.data; else want.push(a);
  });
  if (want.length) {
    var url = kind === 'pair' && chain ? DS.pairUrl(chain, want.join(',')) : DS.tokenUrl(want.join(','));
    var json = await getJson(url);
    var pairs = Array.isArray(json.pairs) ? json.pairs.filter(function (p) { return p && typeof p === 'object'; }) : [];
    var byAddr = {};
    pairs.forEach(function (p) {
      var key = kind === 'pair' ? p.pairAddress : (p.baseToken && p.baseToken.address);
      if (typeof key !== 'string') return;
      var k = want.find(function (w) { return w.toLowerCase() === key.toLowerCase(); });
      if (!k) return;
      (byAddr[k] = byAddr[k] || []).push(p);
    });
    want.forEach(function (a) {
      var data = DS.normalize(DS.bestPair(byAddr[a] || []));
      CACHE[kind + ':' + (chain || '') + ':' + a] = { at: Date.now(), data: data };
      out[a] = data;
    });
  }
  return out;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
  if (msg.type === 'mct:fetchMany') {
    fetchMany(msg.kind, msg.chain, msg.addresses)
      .then(function (data) { sendResponse({ ok: true, data: data }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err && err.message || err) }); });
    return true;
  }
  if (msg.type === 'mct:fetch') {
    fetchDex(msg.kind, msg.chain, msg.address)
      .then(function (data) { sendResponse({ ok: true, data: data }); })
      .catch(function (err) { sendResponse({ ok: false, error: String(err && err.message || err) }); });
    return true;
  }
  if (msg.type === 'mct:badge') {
    var tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) return;
    var text = String(msg.text || '').slice(0, 4);
    var swallow = function () {};
    Promise.resolve(chrome.action.setBadgeText({ tabId: tabId, text: text })).catch(swallow);
    if (typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color)) Promise.resolve(chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: msg.color })).catch(swallow);
  }
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get({ settings: null }, function (r) {
    if (!r.settings) chrome.storage.local.set({ settings: { enabled: true, side: 'right', collapsed: false } });
  });
});
