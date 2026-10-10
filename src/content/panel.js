/*
 * Content-script panel + list scanner.
 * Detects the token on the current page, pulls public market data via the service worker,
 * runs the engine and research filters, and renders a floating assessment panel in a
 * closed shadow root. On list pages it badges / dims / hides tokens that fail the filters.
 */
(function () {
  'use strict';
  if (window.__mctPanelLoaded) return;
  window.__mctPanelLoaded = true;

  var T = window.MCT.taxonomy, E = window.MCT.engine, A = window.MCT.adapters, F = window.MCT.filters;

  var DEFAULT_SETTINGS = { enabled: true, side: 'right', collapsed: false, listMode: 'hide', filters: {} };
  var state = {
    ctx: null, data: null, scraped: {}, pageName: null,
    overrides: {}, preCollapse: {},
    settings: Object.assign({}, DEFAULT_SETTINGS),
    error: null, loading: false, lastUrl: null
  };
  var MAX_SCRAPE_CHARS = 50000;
  var MAX_STORED_TOKENS = 200;
  var host, shadow, rootEl;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function trusted(fn) { return function (ev) { if (ev && ev.isTrusted === false) return; return fn.apply(this, arguments); }; }
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), trusted(attrs[k]));
      else if (k === 'style') el.setAttribute('style', attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function svg(tag, attrs, children) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { el.appendChild(c); });
    return el;
  }
  function fmtUsd(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(n < 1 ? 4 : 2);
  }
  function fmtAge(hours) {
    if (hours == null || !isFinite(hours)) return '—';
    if (hours < 1) return Math.round(hours * 60) + 'm';
    if (hours < 48) return hours.toFixed(1) + 'h';
    return (hours / 24).toFixed(1) + 'd';
  }
  function fmtPct(n, digits) { return n == null || !isFinite(n) ? '—' : n.toFixed(digits == null ? 0 : digits) + '%'; }
  function storageKey() { return state.ctx && A.isValidAddress(state.ctx.address) ? 'mct:tok:' + state.ctx.address : null; }
  function safeSend(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) { cb && cb(null, chrome.runtime.lastError.message); return; }
        cb && cb(res, null);
      });
    } catch (e) { cb && cb(null, 'extension reloaded — refresh the page'); }
  }
  function safeExternalUrl(u) {
    try { var p = new URL(String(u)); return p.protocol === 'https:' && (p.hostname === 'dexscreener.com' || p.hostname === 'www.dexscreener.com') ? p.href : null; } catch (e) { return null; }
  }
  function pruneStorage() {
    chrome.storage.local.get(null, function (all) {
      var keys = Object.keys(all).filter(function (k) { return k.indexOf('mct:tok:') === 0; });
      if (keys.length <= MAX_STORED_TOKENS) return;
      keys.sort(function (a, b) { return ((all[a] && all[a].at) || 0) - ((all[b] && all[b].at) || 0); });
      chrome.storage.local.remove(keys.slice(0, keys.length - MAX_STORED_TOKENS));
    });
  }
  function loadStored(cb) {
    var key = storageKey();
    var want = { settings: null };
    if (key) want[key] = null;
    chrome.storage.local.get(want, function (r) {
      state.settings = Object.assign({}, DEFAULT_SETTINGS, r.settings || {});
      if (key && r[key]) { state.overrides = r[key].overrides || {}; state.preCollapse = r[key].preCollapse || {}; }
      else { state.overrides = {}; state.preCollapse = {}; }
      cb && cb();
    });
  }
  function saveToken() {
    var key = storageKey(); if (!key) return;
    var obj = {}; obj[key] = { overrides: state.overrides, preCollapse: state.preCollapse, at: Date.now() };
    chrome.storage.local.set(obj, pruneStorage);
  }
  function saveSettings() { chrome.storage.local.set({ settings: state.settings }); }

  // ------------------------------------------------------------------
  // Data
  // ------------------------------------------------------------------
  // Page-scraped values are attacker-controlled: they may only FIRE a signal, never clear one.
  function metrics() {
    var sc = state.scraped, m = {};
    if (sc.devPct > 10) m.devPct = sc.devPct;
    if (sc.top10Pct > 50) m.top10Pct = sc.top10Pct;
    if (sc.lpLocked === false) m.lpLocked = false;
    if (sc.holders != null) m.holders = sc.holders;
    if (state.data && state.data.metrics) Object.keys(state.data.metrics).forEach(function (k) {
      if (state.data.metrics[k] !== undefined) m[k] = state.data.metrics[k];
    });
    return m;
  }
  function tokenFromData(ctx, d, scraped, pageName, overrides, preCollapse) {
    var launchpad = (ctx && ctx.launchpad) || (d && d.dexId ? A.launchpadFromDex(d.dexId, d.labels) : null);
    var chain = (ctx && ctx.chain) || (d && d.chainId ? A.chainFromDexscreener(d.chainId) : null);
    var graduated = launchpad === 'pumpfun' && d && d.dexId && !/pump/i.test(d.dexId) ? true : undefined;
    var curve = scraped && scraped.curveFillPct;
    if (graduated && curve == null) curve = 100;
    var pn = pageName || {};
    return {
      name: (d && d.name) || pn.name, symbol: (d && d.symbol) || pn.symbol || (ctx && ctx.address ? ctx.address.slice(0, 6) : ''),
      description: ((d && d.websites) || []).map(function (w) { return w.label || w.url; }).join(' '),
      chain: chain, launchpad: launchpad, curveFillPct: curve,
      overrides: overrides || {}, preCollapse: preCollapse || {},
      launchCtx: { graduated: graduated }
    };
  }
  function currentToken() {
    var tok = tokenFromData(state.ctx, state.data, state.scraped, state.pageName, state.overrides, state.preCollapse);
    var m = metrics();
    tok.metrics = m;
    tok.launchCtx.lpLocked = m.lpLocked;
    return tok;
  }
  function fetchData() {
    var ctx = state.ctx;
    if (!ctx || !ctx.address) { state.data = null; render(); return; }
    state.loading = true; state.error = null; render();
    var addr = ctx.address;
    safeSend({ type: 'mct:fetch', kind: ctx.kind, chain: A.dexscreenerChain(ctx.chain), address: ctx.address }, function (res, err) {
      if (!state.ctx || state.ctx.address !== addr) return; // navigated away: drop stale response
      state.loading = false;
      if (err) { state.error = 'Market data unavailable: ' + err; state.data = null; }
      else if (!res || !res.ok) { state.error = 'Market data unavailable: ' + ((res && res.error) || 'no response') + '. Signals from the page and manual input still apply.'; state.data = null; }
      else { state.data = res.data; if (!res.data) state.error = 'No DexScreener pair found (pre-graduation tokens may not be indexed yet).'; }
      render();
    });
  }
  function sanitizeScraped(sc) {
    var o = {};
    ['curveFillPct', 'devPct', 'top10Pct'].forEach(function (k) { if (typeof sc[k] === 'number' && sc[k] >= 0 && sc[k] <= 100) o[k] = sc[k]; });
    if (typeof sc.holders === 'number' && sc.holders >= 0 && sc.holders < 1e8) o.holders = sc.holders;
    if (typeof sc.lpLocked === 'boolean') o.lpLocked = sc.lpLocked;
    if (typeof sc.renounced === 'boolean') o.renounced = sc.renounced;
    return o;
  }
  function rescrape() {
    try {
      var txt = document.body ? document.body.innerText : '';
      state.scraped = sanitizeScraped(A.scrapeText(txt.length > MAX_SCRAPE_CHARS ? txt.slice(0, MAX_SCRAPE_CHARS) : txt));
    } catch (e) { state.scraped = {}; }
    try { state.pageName = A.pageName(document.title, document.querySelector('h1') ? document.querySelector('h1').textContent : ''); } catch (e) { state.pageName = null; }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'mct-host';
    host.setAttribute('style', 'all:initial; position:fixed; z-index:2147483646; top:0; right:0;');
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = window.MCT.panelCss || '';
    shadow.appendChild(style);
    rootEl = document.createElement('div');
    rootEl.id = 'mct-root';
    shadow.appendChild(rootEl);
    (document.body || document.documentElement).appendChild(host);
    var listStyle = document.createElement('style');
    listStyle.id = 'mct-list-style';
    listStyle.textContent = window.MCT.listCss || '';
    (document.head || document.documentElement).appendChild(listStyle);
  }
  function setBadge(a, verdict) {
    var text = '', color = '#64748b';
    if (a && state.ctx && state.ctx.address) { text = verdict && verdict.verdict === 'reject' ? '✖' : String(a.scoring.score); color = verdict ? F.VERDICTS[verdict.verdict].color : a.scoring.band.color; }
    safeSend({ type: 'mct:badge', text: text, color: color });
  }

  var _render = function () {
    if (!rootEl) return;
    rootEl.innerHTML = '';
    if (!state.settings.enabled) { host.style.display = 'none'; setBadge(null); return; }
    host.style.display = '';
    host.style.left = state.settings.side === 'left' ? '0' : '';
    host.style.right = state.settings.side === 'left' ? '' : '0';

    var tok = currentToken();
    var a = E.assess(tok);
    var hasToken = !!(state.ctx && state.ctx.address);
    var verdict = hasToken ? F.evaluate(a, tok, state.settings.filters) : null;
    setBadge(a, verdict);

    var panel = h('div', { class: 'panel' + (state.settings.collapsed ? ' collapsed' : '') + ' side-' + state.settings.side });
    panel.appendChild(renderHeader(tok, a, verdict));
    if (!state.settings.collapsed) {
      var body = h('div', { class: 'body' });
      if (!hasToken) {
        body.appendChild(renderListSummary());
        body.appendChild(renderFooter());
        panel.appendChild(body);
        rootEl.appendChild(panel);
        return;
      }
      if (state.error) body.appendChild(h('div', { class: 'error', text: state.error }));
      if (verdict) body.appendChild(renderVerdict(verdict));
      body.appendChild(renderWarnings(a));
      body.appendChild(renderScore(a));
      body.appendChild(renderMetrics(tok, a));
      body.appendChild(renderSignals(a));
      body.appendChild(renderNarrative(a));
      body.appendChild(renderLifecycle(a));
      body.appendChild(renderLaunchpad(tok, a));
      body.appendChild(renderPreCollapse(a));
      body.appendChild(renderFooter());
      panel.appendChild(body);
    }
    rootEl.appendChild(panel);
  };
  // Checkbox checked state must be set as a property, patched after render.
  function render() {
    _render();
    if (!shadow) return;
    var inputs = shadow.querySelectorAll('.check input');
    var ids = T.PRE_COLLAPSE_SIGNALS.map(function (s) { return s.id; });
    for (var i = 0; i < inputs.length; i++) inputs[i].checked = state.preCollapse[ids[i]] === true;
  }

  function renderHeader(tok, a, verdict) {
    var title = tok.symbol ? '$' + tok.symbol : 'MemeMap';
    var color = verdict ? F.VERDICTS[verdict.verdict].color : a.scoring.band.color;
    var toggle = function () { state.settings.collapsed = !state.settings.collapsed; saveSettings(); render(); };
    return h('div', { class: 'header', onclick: function (ev) { if (ev.target.closest('button')) return; toggle(); } }, [
      h('div', { class: 'logo', text: 'M' }),
      h('span', { class: 'score-pill', style: 'background:' + color, text: verdict ? (verdict.verdict === 'reject' ? '✖ ' : verdict.verdict === 'caution' ? '! ' : '✔ ') + a.scoring.score + '/10' : '—' }),
      h('span', { class: 'title', text: title }),
      tok.chain ? h('span', { class: 'chip', text: (T.CHAINS[tok.chain] || { label: tok.chain }).label }) : null,
      tok.launchpad && T.LAUNCHPADS[tok.launchpad] ? h('span', { class: 'chip chip-lp', text: T.LAUNCHPADS[tok.launchpad].label }) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: 'Refresh', onclick: function () { rescrape(); fetchData(); } }, ['↻']),
      h('button', { class: 'icon-btn', title: 'Move to other side', onclick: function () { state.settings.side = state.settings.side === 'left' ? 'right' : 'left'; saveSettings(); render(); } }, ['⇄']),
      h('button', { class: 'icon-btn', title: state.settings.collapsed ? 'Expand' : 'Collapse', onclick: toggle }, [state.settings.collapsed ? '▸' : '▾']),
      h('button', { class: 'icon-btn', title: 'Hide panel (re-enable from the toolbar popup)', onclick: function () { state.settings.enabled = false; saveSettings(); render(); } }, ['×'])
    ]);
  }

  function renderVerdict(v) {
    var meta = F.VERDICTS[v.verdict];
    var items = v.rejects.concat(v.cautions);
    var kids = [
      h('div', { class: 'verdict-head' }, [
        h('div', { class: 'verdict-mark', text: v.verdict === 'reject' ? '✖' : v.verdict === 'caution' ? '!' : '✔' }),
        h('div', {}, [h('div', { class: 'verdict-label', text: meta.label }), h('div', { class: 'verdict-sub', text: meta.note })])
      ])
    ];
    if (items.length) kids.push(h('div', { class: 'reasons' }, items.map(function (r) {
      return h('div', { class: 'reason ' + r.severity }, [h('span', { class: 'dot' }), h('span', {}, [h('b', { text: r.label }), h('span', { class: 'why', text: ' — ' + r.why })])]);
    })));
    if (v.unknown.length) kids.push(h('div', { class: 'unknown-note', text: 'Not checkable yet: ' + v.unknown.map(function (r) { return r.label; }).join(' · ') + '. Set them manually in On-chain signals.' }));
    return h('div', { class: 'verdict-banner ' + v.verdict }, kids);
  }

  function renderListSummary() {
    var mode = state.settings.listMode;
    var counts = listStats();
    var modeText = mode === 'hide' ? 'hidden' : mode === 'dim' ? 'dimmed' : mode === 'badge' ? 'badged' : 'not screened';
    var kids = [
      h('div', { class: 'empty-title', text: counts.total ? 'Screening this list' : 'No token on this page' }),
      h('div', { class: 'muted small', text: counts.total ? 'Research filters run on every coin link here. Coins that fail are ' + modeText + '; badges show the verdict and score.' : 'Open a coin / pair page for a verdict card. Trending and board pages are screened automatically.' })
    ];
    if (counts.total) kids.push(h('div', { class: 'listsum' }, [
      h('div', { class: 'metric reject' }, [h('div', { class: 'k', text: 'Skip' }), h('div', { class: 'v', text: String(counts.reject) })]),
      h('div', { class: 'metric caution' }, [h('div', { class: 'k', text: 'Half' }), h('div', { class: 'v', text: String(counts.caution) })]),
      h('div', { class: 'metric pass' }, [h('div', { class: 'k', text: 'Buy' }), h('div', { class: 'v', text: String(counts.pass) })]),
      h('div', { class: 'metric' }, [h('div', { class: 'k', text: 'No data' }), h('div', { class: 'v', text: String(counts.unknown) })])
    ]));
    return h('div', { class: 'section empty' }, kids);
  }
  function listStats() {
    var c = { total: 0, reject: 0, caution: 0, pass: 0, unknown: 0 };
    document.querySelectorAll('.mct-badge').forEach(function (b) {
      c.total++;
      if (b.classList.contains('reject')) c.reject++; else if (b.classList.contains('caution')) c.caution++; else if (b.classList.contains('pass')) c.pass++; else c.unknown++;
    });
    return c;
  }

  function renderWarnings(a) {
    if (!a.warnings.length) return h('div');
    return h('div', { class: 'section warnings' }, a.warnings.map(function (w) { return h('div', { class: 'warn', text: w }); }));
  }

  function renderScore(a) {
    var s = a.scoring, b = s.band;
    var unknown = s.unknown.length;
    var r = 26, c = 2 * Math.PI * r, frac = s.score / s.max;
    var ring = svg('svg', { class: 'ring', viewBox: '0 0 64 64' }, [
      svg('circle', { cx: 32, cy: 32, r: r, fill: 'none', stroke: 'rgba(148,163,184,.15)', 'stroke-width': 6 }),
      svg('circle', { cx: 32, cy: 32, r: r, fill: 'none', stroke: b.color, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': (c * frac).toFixed(1) + ' ' + c.toFixed(1), transform: 'rotate(-90 32 32)' }),
      svg('text', { x: 32, y: 40, 'text-anchor': 'middle', text: String(s.score) })
    ]);
    return h('div', { class: 'section score' }, [
      sectionTitle('Manipulation score', s.score + ' / ' + s.max),
      h('div', { class: 'score-row' }, [ring, h('div', {}, [
        h('div', { class: 'band', style: 'color:' + b.color, text: b.label }),
        h('div', { class: 'muted small', text: b.note + (unknown ? ' · ' + unknown + ' signal' + (unknown > 1 ? 's' : '') + ' unknown' : '') })
      ])]),
      h('div', { class: 'bands' }, T.SCORE_BANDS.map(function (x) {
        return h('div', { class: 'band-seg' + (x.id === b.id ? ' active' : ''), style: 'background:' + x.color + ';color:' + x.color, title: x.min + '–' + x.max + ': ' + x.label });
      }))
    ]);
  }

  function renderMetrics(tok, a) {
    var m = tok.metrics, d = state.data, sc = state.scraped;
    var items = [
      ['Age', fmtAge(m.ageHours)], ['Mcap', fmtUsd(m.marketCap)], ['Liq', fmtUsd(m.liquidityUsd)],
      ['Vol 1h', fmtUsd(m.volume1h)], ['Vol/Mcap 1h', m.volMcap1h != null ? fmtPct(m.volMcap1h * 100) : '—'],
      ['Δ 1h', d && d.priceChange && d.priceChange.h1 != null ? fmtPct(Number(d.priceChange.h1), 1) : '—']
    ];
    var liqRatio = m.liquidityUsd != null && m.marketCap ? m.liquidityUsd / m.marketCap : null;
    if (liqRatio != null) items.push(['Liq/Mcap', fmtPct(liqRatio * 100, 1)]);
    if (sc.holders != null) items.push(['Holders ·pg', String(sc.holders), 'page']);
    if (sc.devPct != null) items.push(['Dev ·pg', fmtPct(sc.devPct, 1), 'page']);
    if (sc.top10Pct != null) items.push(['Top10 ·pg', fmtPct(sc.top10Pct, 1), 'page']);
    var grid = h('div', { class: 'metrics' }, items.map(function (it) {
      return h('div', { class: 'metric' + (it[2] ? ' page' : '') }, [h('div', { class: 'k', text: it[0] }), h('div', { class: 'v', text: it[1] })]);
    }));
    var thin = liqRatio != null && liqRatio < 0.05 && m.marketCap > 50000;
    return h('div', { class: 'section' }, [
      sectionTitle('Market', state.loading ? 'loading…' : d ? 'DexScreener' : 'no data'),
      grid,
      thin ? h('div', { class: 'note warn-note', text: 'Thin liquidity vs mcap (<5%): LP price inflation profile — small buys move price, insiders sell into added depth.' }) : null
    ]);
  }

  function renderSignals(a) {
    var rows = a.scoring.breakdown.map(function (row) {
      var auto = a.autoSignals[row.id];
      var ov = state.overrides[row.id];
      var src = ov !== undefined ? 'manual' : auto !== undefined ? 'auto' : 'unknown';
      return h('div', { class: 'sig ' + row.state + ' src-' + src, title: 'Click to cycle: auto → flagged → clear', onclick: function () { cycleOverride(row.id); } }, [
        h('span', { class: 'sig-state', text: row.state === 'fired' ? '!' : row.state === 'clear' ? '✓' : '?' }),
        h('span', { class: 'sig-label', text: row.label }),
        h('span', { class: 'sig-src', text: src === 'manual' ? 'manual' : src === 'auto' ? autoValueText(row.id) : unknownHint(row.id) }),
        h('span', { class: 'sig-pts', text: '+' + row.points })
      ]);
    });
    return h('div', { class: 'section' }, [
      sectionTitle('On-chain signals', '7 signals · 10 pts'),
      h('div', { class: 'sigs' }, rows),
      h('div', { class: 'note faint small', text: 'Auto-filled where public data allows. "page:" values come from this site\'s own text and can only raise the score, never clear a signal. Click a row to set it manually.' })
    ]);
  }
  function autoValueText(id) {
    var m = metrics(), sc = state.scraped;
    switch (id) {
      case 'devHold': return sc.devPct != null ? 'page: ' + fmtPct(sc.devPct, 1) : 'auto';
      case 'top10': return sc.top10Pct != null ? 'page: ' + fmtPct(sc.top10Pct, 1) : 'auto';
      case 'lpUnlocked': return sc.lpLocked === false ? 'page: unlocked' : 'auto';
      case 'volMcap': return m.volMcap1h != null ? fmtPct(m.volMcap1h * 100) : 'auto';
      case 'age': return fmtAge(m.ageHours);
      case 'devTrade': return m.devLastTradeHours != null ? fmtAge(m.devLastTradeHours) + ' ago' : 'auto';
      default: return 'auto';
    }
  }
  function unknownHint(id) {
    var sc = state.scraped;
    if (id === 'devHold' && sc.devPct != null) return 'page: ' + fmtPct(sc.devPct, 1) + ' (unverified)';
    if (id === 'top10' && sc.top10Pct != null) return 'page: ' + fmtPct(sc.top10Pct, 1) + ' (unverified)';
    if (id === 'lpUnlocked' && sc.lpLocked === true) return 'page: locked (unverified)';
    return 'unknown';
  }
  function cycleOverride(id) {
    var cur = state.overrides[id];
    if (cur === undefined) state.overrides[id] = true;
    else if (cur === true) state.overrides[id] = false;
    else delete state.overrides[id];
    saveToken(); render();
  }

  function renderNarrative(a) {
    var n = a.narrative, rot = a.rotation;
    return h('div', { class: 'section' }, [
      sectionTitle('Narrative', n.confidence + ' confidence'),
      h('div', { class: 'narr' }, [
        h('span', { class: 'chip chip-narr', text: n.label }),
        n.matches.length ? h('span', { class: 'faint small', text: 'matched: ' + n.matches.join(', ') }) : null,
        n.alternatives.length ? h('span', { class: 'faint small', text: '· alt: ' + n.alternatives.join(', ') }) : null
      ]),
      h('div', { class: 'note', text: n.notes }),
      h('div', { class: 'faint small', text: 'Typical cycle: ' + n.cycle }),
      rot.length ? h('div', { class: 'rot' }, rot.map(function (r) {
        return h('div', { class: 'rot-row' }, [
          h('div', { class: 'rot-title', text: r.rotation + ' · slot ' + r.position + '/' + r.of }),
          h('div', { class: 'rot-seq', text: r.prev + ' → [' + r.lag + '] → ' + n.label + ' → ' + r.next }),
          h('div', { class: 'muted small', text: r.notes })
        ]);
      })) : null
    ]);
  }

  function renderLifecycle(a) {
    var p = a.phase;
    return h('div', { class: 'section' }, [
      sectionTitle('Lifecycle', p ? p.window : 'age unknown'),
      h('div', { class: 'phases' }, T.LIFECYCLE.map(function (ph) { return h('span', { class: 'phase' + (p && p.id === ph.id ? ' active' : ''), text: ph.label, title: ph.window }); })),
      p ? h('div', { class: 'note', text: p.detail }) : h('div', { class: 'faint small', text: 'Age comes from the DexScreener pair creation time once indexed.' })
    ]);
  }

  function renderLaunchpad(tok, a) {
    var lp = a.launchpad, curve = a.curve;
    var kids = [sectionTitle('Launchpad & LP', lp ? lp.label : (tok.chain ? (T.CHAINS[tok.chain] || {}).launchpad || '' : ''))];
    if (curve) {
      kids.push(h('div', { class: 'curve' }, [
        h('div', { class: 'curve-bar' }, [h('div', { class: 'curve-fill lvl-' + curve.level, style: 'width:' + curve.fillPct + '%' })]),
        h('div', { class: 'small' }, [h('b', { text: curve.label + ' · ' + fmtPct(curve.fillPct, 1) }), ' — ' + curve.note])
      ]));
    } else if (lp && lp.id === 'pumpfun') {
      kids.push(h('div', { class: 'muted small', text: 'Curve fill not found on page. Rule: >60% fill = poor R/R, 95%+ = red flag. Graduation at ~85 SOL, <2% graduate.' }));
    }
    if (lp) kids.push(h('div', { class: 'note', text: lp.mechanics + ' ' + lp.rule }));
    if (a.chain) kids.push(h('div', { class: 'faint small', text: a.chain.label + ': ' + a.chain.culture + ' Fees ' + a.chain.fee + '. Risk: ' + a.chain.risk + '.' }));
    if (a.flags.red.length) kids.push(h('div', { class: 'flags' }, a.flags.red.map(function (f) { return h('div', { class: 'flag red', text: '✖ ' + f }); })));
    if (a.flags.green.length) kids.push(h('div', { class: 'flags' }, a.flags.green.map(function (f) { return h('div', { class: 'flag green', text: '✔ ' + f }); })));
    kids.push(h('details', { class: 'ref' }, [
      h('summary', { text: 'Survival signals / red flags reference' }),
      h('div', { class: 'small' }, [h('b', { text: 'Survival: ' }), T.LAUNCHPAD_SURVIVAL_SIGNALS.join(' · ')]),
      h('div', { class: 'small' }, [h('b', { text: 'Red flags: ' }), T.LAUNCHPAD_RED_FLAGS.join(' · ')])
    ]));
    return h('div', { class: 'section' }, kids);
  }

  function renderPreCollapse(a) {
    var c = a.collapse;
    var text = c.highestConfidence ? 'HIGHEST-CONFIDENCE EXIT: dev sell + LP reduction' : c.distribution ? 'Distribution phase — ' + c.count + ' signals in window' : c.count + ' / ' + T.PRE_COLLAPSE_SIGNALS.length + ' active';
    var cls = c.highestConfidence ? 'verdict red' : c.distribution ? 'verdict orange' : 'verdict';
    return h('div', { class: 'section' }, [
      sectionTitle('Pre-collapse checklist', '48h window'),
      h('div', { class: cls, text: text }),
      h('div', { class: 'checks' }, T.PRE_COLLAPSE_SIGNALS.map(function (s) {
        var on = state.preCollapse[s.id] === true;
        return h('label', { class: 'check' + (on ? ' on' : '') + (s.key ? ' key' : '') }, [
          h('input', { type: 'checkbox', onchange: function (ev) { if (ev.target.checked) state.preCollapse[s.id] = true; else delete state.preCollapse[s.id]; saveToken(); render(); } }),
          h('span', { text: s.label })
        ]);
      })),
      h('div', { class: 'faint small note', text: T.PRE_COLLAPSE_RULES.rule + ' ' + T.PRE_COLLAPSE_RULES.highestConfidence })
    ]);
  }

  function renderFooter() {
    var d = state.data;
    return h('div', { class: 'footer' }, [
      h('span', { class: 'faint small', text: d ? 'DexScreener · ' + Math.round((Date.now() - d.fetchedAt) / 1000) + 's ago' : 'No market data' }),
      h('span', { class: 'spacer' }),
      d && safeExternalUrl(d.url) ? h('a', { class: 'small', href: safeExternalUrl(d.url), target: '_blank', rel: 'noopener noreferrer', text: 'open on DexScreener' }) : null,
      h('span', { class: 'faint small', text: ' · research, not advice' })
    ]);
  }
  function sectionTitle(text, right) {
    return h('div', { class: 'stitle' }, [h('span', { text: text }), h('span', { class: 'faint', text: right || '' })]);
  }

  // ------------------------------------------------------------------
  // List scanner: badge / dim / hide tokens on board & list pages.
  // ------------------------------------------------------------------
  var listCache = {};     // address -> { data, at }
  var listPending = {};
  var MAX_LIST_LINKS = 60;

  function linkTargets() {
    var cur = state.ctx && state.ctx.address;
    var anchors = document.querySelectorAll('a[href]');
    var seen = {}, out = [];
    for (var i = 0; i < anchors.length && out.length < MAX_LIST_LINKS; i++) {
      var a = anchors[i];
      if (a.closest('#mct-host')) continue;
      var href;
      try { href = new URL(a.getAttribute('href'), location.href).href; } catch (e) { continue; }
      var ctx = A.parseUrl(href);
      if (!ctx.supported || !ctx.address || ctx.address === cur) continue;
      var key = ctx.kind + ':' + ctx.address;
      if (seen[key]) { out.push({ el: a, ctx: ctx }); continue; }
      seen[key] = true;
      out.push({ el: a, ctx: ctx });
    }
    return out;
  }

  function scanList() {
    if (document.hidden || !state.settings.enabled || state.settings.listMode === 'off') return;
    var targets = linkTargets();
    if (!targets.length) return;
    var groups = {};
    targets.forEach(function (t) {
      var c = listCache[t.ctx.address];
      if (c && Date.now() - c.at < 60000) return;
      if (listPending[t.ctx.address]) return;
      var g = t.ctx.kind + '|' + (A.dexscreenerChain(t.ctx.chain) || '');
      (groups[g] = groups[g] || []).push(t.ctx.address);
    });
    Object.keys(groups).forEach(function (g) {
      var parts = g.split('|'), kind = parts[0], chain = parts[1] || null;
      var addrs = groups[g].filter(function (a, i, arr) { return arr.indexOf(a) === i; }).slice(0, 30);
      addrs.forEach(function (a) { listPending[a] = true; });
      safeSend({ type: 'mct:fetchMany', kind: kind, chain: chain, addresses: addrs }, function (res) {
        addrs.forEach(function (a) { delete listPending[a]; });
        if (!res || !res.ok) return;
        addrs.forEach(function (a) { listCache[a] = { data: res.data[a] || null, at: Date.now() }; });
        decorate(targets);
        if (!(state.ctx && state.ctx.address)) render();
      });
    });
    decorate(targets);
  }

  function quickVerdict(ctx, data) {
    var tok = tokenFromData(ctx, data, null, null, {}, {});
    tok.metrics = data && data.metrics ? data.metrics : {};
    var a = E.assess(tok);
    return { a: a, v: F.evaluate(a, tok, state.settings.filters) };
  }

  function rowOf(el) {
    return el.closest('tr, li, [role=row], article') || (el.parentElement && el.parentElement.children.length > 1 ? el : el.parentElement) || el;
  }

  function decorate(targets) {
    var mode = state.settings.listMode;
    targets.forEach(function (t) {
      var c = listCache[t.ctx.address];
      var el = t.el;
      var badge = el.querySelector(':scope > .mct-badge') || (el.nextElementSibling && el.nextElementSibling.classList && el.nextElementSibling.classList.contains('mct-badge') ? el.nextElementSibling : null);
      var cls, text, title;
      if (!c) return;
      if (!c.data) { cls = 'unknown'; text = '?'; title = 'Not on DexScreener yet (pre-graduation) — no filter data.'; }
      else {
        var q = quickVerdict(t.ctx, c.data);
        cls = q.v.verdict;
        var reasons = q.v.rejects.concat(q.v.cautions).map(function (r) { return r.label; });
        text = (cls === 'reject' ? '✖ ' : cls === 'caution' ? '! ' : '✔ ') + q.a.scoring.score;
        title = F.VERDICTS[cls].label + ' · ' + (q.a.narrative.label) + (reasons.length ? ' · ' + reasons.join(' · ') : '') + (q.v.unknown.length ? ' · unchecked: ' + q.v.unknown.length : '');
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'mct-badge';
        if (el.children.length && getComputedStyle(el).display !== 'inline') el.appendChild(badge); else el.insertAdjacentElement('afterend', badge);
      }
      badge.className = 'mct-badge ' + cls;
      badge.textContent = text;
      badge.title = title;
      var row = rowOf(el);
      row.classList.remove('mct-dim', 'mct-hide');
      if (cls === 'reject' && mode === 'dim') row.classList.add('mct-dim');
      if (cls === 'reject' && mode === 'hide') row.classList.add('mct-hide');
    });
  }

  function undecorate() {
    document.querySelectorAll('.mct-badge').forEach(function (b) { b.remove(); });
    document.querySelectorAll('.mct-dim, .mct-hide').forEach(function (r) { r.classList.remove('mct-dim', 'mct-hide'); });
  }

  // ------------------------------------------------------------------
  // Navigation / lifecycle
  // ------------------------------------------------------------------
  function onNavigate(force) {
    var url = location.href;
    if (!force && url === state.lastUrl) return;
    state.lastUrl = url;
    var ctx = A.parseUrl(url);
    var changed = !state.ctx || ctx.address !== state.ctx.address;
    state.ctx = ctx;
    rescrape();
    if (changed) { state.data = null; state.error = null; loadStored(function () { render(); fetchData(); }); }
    else render();
    setTimeout(scanList, 800);
  }
  // Content scripts live in an isolated world, so patching history.pushState would not see the
  // page's own calls. Poll the URL instead; it is cheap.
  function hookHistory() {
    window.addEventListener('popstate', function () { setTimeout(function () { onNavigate(); }, 50); });
    setInterval(function () { if (!document.hidden) onNavigate(); }, 1500);
    setInterval(function () {
      if (document.hidden || !state.settings.enabled || state.settings.collapsed) return;
      var before = JSON.stringify(state.scraped);
      rescrape();
      if (JSON.stringify(state.scraped) !== before) render();
    }, 5000);
    setInterval(function () { if (!document.hidden && state.settings.enabled && !state.settings.collapsed && state.ctx && state.ctx.address) fetchData(); }, 45000);
    setInterval(scanList, 4000);
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.settings) return;
    var prev = state.settings;
    state.settings = Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue || {});
    if (prev.listMode !== state.settings.listMode || JSON.stringify(prev.filters) !== JSON.stringify(state.settings.filters)) { undecorate(); scanList(); }
    render();
  });

  mount();
  loadStored(function () { hookHistory(); onNavigate(true); });
})();
