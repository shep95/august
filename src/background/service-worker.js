/*
 * Background service worker: fetches public DexScreener data for the
 * content panel (content scripts cannot call cross-origin APIs on every
 * site), keeps a short cache and drives the toolbar badge.
 */
importScripts('../shared/dexscreener.js', '../content/adapters.js');
var DS = self.MCT.dexscreener, AD = self.MCT.adapters;
var CACHE = {};
var TTL_MS = 20 * 1000;

async function getJson(url) {
  var res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('DexScreener HTTP ' + res.status);
  return res.json();
}

async function fetchDex(kind, chain, address) {
  if (!AD.isValidAddress(address)) throw new Error('invalid address');
  if (kind !== 'token' && kind !== 'pair') throw new Error('invalid kind');
  if (chain != null && !AD.isValidChain(chain)) throw new Error('invalid chain');
  var keys = Object.keys(CACHE);
  if (keys.length > 200) keys.slice(0, 100).forEach(function (k) { delete CACHE[k]; });
  var key = kind + ':' + chain + ':' + address;
  var hit = CACHE[key];
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  var json = await getJson(kind === 'pair' && chain ? DS.pairUrl(chain, address) : DS.tokenUrl(address));
  var pair = DS.bestPair(json.pairs || (json.pair ? [json.pair] : []));
  // A pair lookup that misses may still be a token address on this chain.
  if (!pair && kind === 'pair') {
    try { var j2 = await getJson(DS.tokenUrl(address)); pair = DS.bestPair(j2.pairs || []); } catch (e) { /* keep null */ }
  }
  var data = DS.normalize(pair);
  CACHE[key] = { at: Date.now(), data: data };
  return data;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
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
    chrome.action.setBadgeText({ tabId: tabId, text: text });
    if (typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color)) chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: msg.color });
  }
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get({ settings: null }, function (r) {
    if (!r.settings) chrome.storage.local.set({ settings: { enabled: true, side: 'right', collapsed: false } });
  });
});
