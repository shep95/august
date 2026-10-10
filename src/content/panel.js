/*
 * Content-script panel. Detects the token on the current page, pulls public
 * market data via the service worker, runs the engine and renders a
 * floating assessment panel in a shadow root.
 */
(function () {
  'use strict';
  if (window.__mctPanelLoaded) return;
  window.__mctPanelLoaded = true;

  var T = window.MCT.taxonomy, E = window.MCT.engine, A = window.MCT.adapters;

  var state = {
    ctx: null,          // parsed URL context
    data: null,         // normalized market data
    scraped: {},        // page-text metrics
    overrides: {},      // manual signal overrides keyed by signal id
    preCollapse: {},    // manual pre-collapse checklist
    settings: { enabled: true, side: 'right', collapsed: false },
    error: null,
    loading: false,
    lastUrl: null
  };

  var host, shadow, rootEl;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
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
  // Only real user input may change state: synthetic events dispatched by the page are ignored.
  function trusted(fn) { return function (ev) { if (ev && ev.isTrusted === false) return; return fn.apply(this, arguments); }; }
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
  var MAX_STORED_TOKENS = 200;
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
    var want = { settings: state.settings };
    if (key) want[key] = null;
    chrome.storage.local.get(want, function (r) {
      if (r.settings) state.settings = Object.assign(state.settings, r.settings);
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
  // Metrics fed to the engine. Page-scraped values are attacker-controlled, so they may
  // only FIRE a signal (make the score worse), never clear one. API metrics are used as-is.
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

  function currentToken() {
    var ctx = state.ctx || {};
    var d = state.data || {};
    var launchpad = ctx.launchpad || (d.dexId ? A.launchpadFromDex(d.dexId, d.labels) : null);
    var chain = ctx.chain || (d.chainId ? A.chainFromDexscreener(d.chainId) : null);
    var m = metrics();
    var curve = state.scraped.curveFillPct;
    // A token that already has a DEX pair on a non-launchpad dex has graduated.
    var graduated = launchpad === 'pumpfun' && d.dexId && !/pump/i.test(d.dexId) ? true : undefined;
    if (graduated && curve == null) curve = 100;
    var pn = state.pageName || {};
    return {
      name: d.name || pn.name, symbol: d.symbol || pn.symbol || (ctx.address ? ctx.address.slice(0, 6) : ''),
      description: (d.websites || []).map(function (w) { return w.label || w.url; }).join(' '),
      chain: chain, launchpad: launchpad, curveFillPct: curve,
      metrics: m,
      overrides: state.overrides,
      preCollapse: state.preCollapse,
      launchCtx: { graduated: graduated, lpLocked: m.lpLocked }
    };
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

  var MAX_SCRAPE_CHARS = 50000;
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
  }

  function setBadge(a) {
    var text = '', color = '#64748b';
    if (a && state.ctx && state.ctx.address) { text = String(a.scoring.score); color = a.scoring.band.color; }
    safeSend({ type: 'mct:badge', text: text, color: color });
  }

  function render() {
    if (!rootEl) return;
    rootEl.innerHTML = '';
    if (!state.settings.enabled) { host.style.display = 'none'; setBadge(null); return; }
    host.style.display = '';
    host.style.left = state.settings.side === 'left' ? '0' : '';
    host.style.right = state.settings.side === 'left' ? '' : '0';

    var tok = currentToken();
    var a = E.assess(tok);
    setBadge(a);

    var panel = h('div', { class: 'panel' + (state.settings.collapsed ? ' collapsed' : '') + ' side-' + state.settings.side });
    panel.appendChild(renderHeader(tok, a));
    if (!state.settings.collapsed) {
      var body = h('div', { class: 'body' });
      if (!state.ctx || !state.ctx.address) {
        body.appendChild(h('div', { class: 'empty' }, [
          h('div', { class: 'empty-title', text: 'No token detected on this page' }),
          h('div', { class: 'muted', text: 'Open a coin / pair page on this site. You can still run the manual checklists below.' })
        ]));
      }
      if (state.error) body.appendChild(h('div', { class: 'error', text: state.error }));
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
  }

  function renderHeader(tok, a) {
    var title = tok.symbol ? '$' + tok.symbol : 'MemeMap';
    var band = a.scoring.band;
    return h('div', { class: 'header', onclick: function (ev) { if (ev.target.closest('button')) return; state.settings.collapsed = !state.settings.collapsed; saveSettings(); render(); } }, [
      h('span', { class: 'score-pill', style: 'background:' + band.color, text: state.ctx && state.ctx.address ? a.scoring.score + '/10' : '—' }),
      h('span', { class: 'title', text: title }),
      tok.chain ? h('span', { class: 'chip', text: (T.CHAINS[tok.chain] || { label: tok.chain }).label }) : null,
      tok.launchpad && T.LAUNCHPADS[tok.launchpad] ? h('span', { class: 'chip chip-lp', text: T.LAUNCHPADS[tok.launchpad].label }) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', title: 'Refresh', onclick: function () { rescrape(); fetchData(); } }, ['↻']),
      h('button', { class: 'icon-btn', title: 'Move to other side', onclick: function () { state.settings.side = state.settings.side === 'left' ? 'right' : 'left'; saveSettings(); render(); } }, ['⇄']),
      h('button', { class: 'icon-btn', title: state.settings.collapsed ? 'Expand' : 'Collapse', onclick: function () { state.settings.collapsed = !state.settings.collapsed; saveSettings(); render(); } }, [state.settings.collapsed ? '▸' : '▾']),
      h('button', { class: 'icon-btn', title: 'Hide panel (re-enable from the toolbar popup)', onclick: function () { state.settings.enabled = false; saveSettings(); render(); } }, ['×'])
    ]);
  }

  function renderWarnings(a) {
    if (!a.warnings.length) return h('div');
    return h('div', { class: 'section warnings' }, a.warnings.map(function (w) { return h('div', { class: 'warn', text: '⚠ ' + w }); }));
  }

  function renderScore(a) {
    var s = a.scoring, b = s.band;
    var unknown = s.unknown.length;
    return h('div', { class: 'section score' }, [
      h('div', { class: 'score-row' }, [
        h('div', { class: 'score-big', style: 'color:' + b.color, text: s.score }),
        h('div', { class: 'score-text' }, [
          h('div', { class: 'band', style: 'color:' + b.color, text: b.label }),
          h('div', { class: 'muted', text: b.note + (unknown ? ' · ' + unknown + ' signal' + (unknown > 1 ? 's' : '') + ' unknown — verify manually' : '') })
        ])
      ]),
      h('div', { class: 'bands' }, T.SCORE_BANDS.map(function (x) {
        return h('div', { class: 'band-seg' + (x.id === b.id ? ' active' : ''), style: 'background:' + x.color, title: x.min + '–' + x.max + ': ' + x.label });
      }))
    ]);
  }

  function renderMetrics(tok, a) {
    var m = tok.metrics;
    var d = state.data;
    var items = [
      ['Age', fmtAge(m.ageHours)],
      ['Mcap', fmtUsd(m.marketCap)],
      ['Liq', fmtUsd(m.liquidityUsd)],
      ['Vol 1h', fmtUsd(m.volume1h)],
      ['Vol/Mcap 1h', m.volMcap1h != null ? fmtPct(m.volMcap1h * 100) : '—'],
      ['Δ1h', d && d.priceChange && d.priceChange.h1 != null ? fmtPct(Number(d.priceChange.h1), 1) : '—']
    ];
    var sc = state.scraped;
    if (sc.holders != null) items.push(['Holders (page)', String(sc.holders)]);
    if (sc.devPct != null) items.push(['Dev (page)', fmtPct(sc.devPct, 1)]);
    if (sc.top10Pct != null) items.push(['Top10 (page)', fmtPct(sc.top10Pct, 1)]);
    var liqRatio = m.liquidityUsd != null && m.marketCap ? m.liquidityUsd / m.marketCap : null;
    if (liqRatio != null) items.push(['Liq/Mcap', fmtPct(liqRatio * 100, 1)]);
    var grid = h('div', { class: 'metrics' }, items.map(function (it) {
      return h('div', { class: 'metric' }, [h('div', { class: 'k', text: it[0] }), h('div', { class: 'v', text: it[1] })]);
    }));
    var thin = liqRatio != null && liqRatio < 0.05 && m.marketCap > 50000;
    return h('div', { class: 'section' }, [
      sectionTitle('Market', state.loading ? 'loading…' : d ? 'DexScreener' : ''),
      grid,
      thin ? h('div', { class: 'note warn-note', text: 'Thin liquidity vs mcap (<5%): LP price inflation (LPI) profile — small buys move price, insiders sell into added depth.' }) : null
    ]);
  }

  function renderSignals(a) {
    var rows = a.scoring.breakdown.map(function (row) {
      var auto = a.autoSignals[row.id];
      var ov = state.overrides[row.id];
      var src = ov !== undefined ? 'manual' : auto !== undefined ? 'auto' : 'unknown';
      var cls = 'sig ' + row.state + ' src-' + src;
      return h('div', { class: cls, title: 'Click to cycle: auto → flagged → clear', onclick: function () { cycleOverride(row.id, auto); } }, [
        h('span', { class: 'sig-state', text: row.state === 'fired' ? '●' : row.state === 'clear' ? '○' : '?' }),
        h('span', { class: 'sig-label', text: row.label }),
        h('span', { class: 'sig-src', text: src === 'manual' ? 'manual' : src === 'auto' ? autoValueText(row.id, a) : unknownHint(row.id) }),
        h('span', { class: 'sig-pts', text: '+' + row.points })
      ]);
    });
    return h('div', { class: 'section' }, [
      sectionTitle('On-chain signals', '7 signals · 10 pts'),
      h('div', { class: 'sigs' }, rows),
      h('div', { class: 'muted small', text: 'Auto-filled where public data allows. Values marked "page:" are read from this site\'s own text and can be spoofed, so they can only raise the score, never clear a signal — verify on-chain and click a row to set it manually.' })
    ]);
  }

  function autoValueText(id, a) {
    var m = metrics();
    switch (id) {
      case 'devHold': return state.scraped.devPct != null ? 'page: ' + fmtPct(state.scraped.devPct, 1) : 'auto';
      case 'top10': return state.scraped.top10Pct != null ? 'page: ' + fmtPct(state.scraped.top10Pct, 1) : 'auto';
      case 'lpUnlocked': return state.scraped.lpLocked === true ? 'page: locked (unverified)' : state.scraped.lpLocked === false ? 'page: unlocked' : 'auto';
      case 'volMcap': return m.volMcap1h != null ? fmtPct(m.volMcap1h * 100) : 'auto';
      case 'age': return fmtAge(m.ageHours);
      case 'devTrade': return m.devLastTradeHours != null ? fmtAge(m.devLastTradeHours) + ' ago' : 'auto';
      default: return 'auto';
    }
  }

  // Page text that would have cleared a signal is shown as a hint only.
  function unknownHint(id) {
    var sc = state.scraped;
    if (id === 'devHold' && sc.devPct != null) return 'page: ' + fmtPct(sc.devPct, 1) + ' (unverified)';
    if (id === 'top10' && sc.top10Pct != null) return 'page: ' + fmtPct(sc.top10Pct, 1) + ' (unverified)';
    if (id === 'lpUnlocked' && sc.lpLocked === true) return 'page: locked (unverified)';
    return 'unknown';
  }

  function cycleOverride(id, auto) {
    var cur = state.overrides[id];
    // auto → true → false → auto
    if (cur === undefined) state.overrides[id] = true;
    else if (cur === true) state.overrides[id] = false;
    else delete state.overrides[id];
    saveToken(); render();
  }

  function renderNarrative(a) {
    var n = a.narrative;
    var rot = a.rotation;
    return h('div', { class: 'section' }, [
      sectionTitle('Narrative', n.confidence + ' confidence'),
      h('div', { class: 'narr' }, [
        h('span', { class: 'chip chip-narr', text: n.label }),
        n.matches.length ? h('span', { class: 'muted small', text: 'matched: ' + n.matches.join(', ') }) : null,
        n.alternatives.length ? h('span', { class: 'muted small', text: ' · alt: ' + n.alternatives.join(', ') }) : null
      ]),
      h('div', { class: 'note', text: n.notes }),
      h('div', { class: 'muted small', text: 'Typical cycle: ' + n.cycle }),
      rot.length ? h('div', { class: 'rot' }, rot.map(function (r) {
        return h('div', { class: 'rot-row' }, [
          h('div', { class: 'rot-title', text: r.rotation + ' · slot ' + r.position + '/' + r.of }),
          h('div', { class: 'small', text: r.prev + ' → [' + r.lag + '] → ' + n.label + ' → ' + r.next }),
          h('div', { class: 'muted small', text: r.notes })
        ]);
      })) : null
    ]);
  }

  function renderLifecycle(a) {
    var p = a.phase;
    var chips = T.LIFECYCLE.map(function (ph) {
      return h('span', { class: 'phase' + (p && p.id === ph.id ? ' active' : ''), text: ph.label, title: ph.window });
    });
    return h('div', { class: 'section' }, [
      sectionTitle('Lifecycle', p ? p.window : 'age unknown'),
      h('div', { class: 'phases' }, chips),
      p ? h('div', { class: 'note', text: p.detail }) : h('div', { class: 'muted small', text: 'Age comes from the DexScreener pair creation time once indexed.' })
    ]);
  }

  function renderLaunchpad(tok, a) {
    var lp = a.launchpad;
    var curve = a.curve;
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
    if (a.chain) kids.push(h('div', { class: 'muted small', text: a.chain.label + ': ' + a.chain.culture + ' Fees ' + a.chain.fee + '. Risk: ' + a.chain.risk + '.' }));
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
    var verdict = c.highestConfidence ? 'HIGHEST-CONFIDENCE EXIT: dev sell + LP reduction' : c.distribution ? 'Distribution phase — ' + c.count + ' signals in window' : c.count + ' / ' + T.PRE_COLLAPSE_SIGNALS.length + ' active';
    var cls = c.highestConfidence ? 'verdict red' : c.distribution ? 'verdict orange' : 'verdict';
    return h('div', { class: 'section' }, [
      sectionTitle('Pre-collapse checklist', '48h window'),
      h('div', { class: cls, text: verdict }),
      h('div', { class: 'checks' }, T.PRE_COLLAPSE_SIGNALS.map(function (s) {
        var on = state.preCollapse[s.id] === true;
        return h('label', { class: 'check' + (on ? ' on' : '') + (s.key ? ' key' : '') }, [
          h('input', { type: 'checkbox', onchange: function (ev) { if (ev.target.checked) state.preCollapse[s.id] = true; else delete state.preCollapse[s.id]; saveToken(); render(); } }),
          h('span', { text: s.label })
        ]);
      })),
      h('div', { class: 'muted small', text: T.PRE_COLLAPSE_RULES.rule + ' ' + T.PRE_COLLAPSE_RULES.highestConfidence })
    ]);
  }

  function renderFooter() {
    var d = state.data;
    return h('div', { class: 'footer' }, [
      h('span', { class: 'muted small', text: d ? 'DexScreener · ' + Math.round((Date.now() - d.fetchedAt) / 1000) + 's ago' : 'No market data' }),
      h('span', { class: 'spacer' }),
      d && safeExternalUrl(d.url) ? h('a', { class: 'small', href: safeExternalUrl(d.url), target: '_blank', rel: 'noopener noreferrer', text: 'open on DexScreener' }) : null,
      h('span', { class: 'muted small', text: ' · research, not advice' })
    ]);
  }

  function sectionTitle(text, right) {
    return h('div', { class: 'stitle' }, [h('span', { text: text }), h('span', { class: 'muted small', text: right || '' })]);
  }

  // Checkbox checked state must be set as a property, patch after render.
  var _render = render;
  render = function () {
    _render();
    if (!shadow) return;
    var inputs = shadow.querySelectorAll('.check input');
    var ids = T.PRE_COLLAPSE_SIGNALS.map(function (s) { return s.id; });
    for (var i = 0; i < inputs.length; i++) inputs[i].checked = state.preCollapse[ids[i]] === true;
  };

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
  }

  // Content scripts live in an isolated world, so patching history.pushState would not see the
  // page's own calls. Poll the URL instead; it is cheap.
  function hookHistory() {
    window.addEventListener('popstate', function () { setTimeout(function () { onNavigate(); }, 50); });
    setInterval(function () { if (!document.hidden) onNavigate(); }, 1500);
    // Re-scrape page text periodically — curve %, holders etc. load async.
    setInterval(function () {
      if (document.hidden || !state.settings.enabled || state.settings.collapsed) return;
      var before = JSON.stringify(state.scraped);
      rescrape();
      if (JSON.stringify(state.scraped) !== before) render();
    }, 5000);
    setInterval(function () { if (!document.hidden && state.settings.enabled && !state.settings.collapsed && state.ctx && state.ctx.address) fetchData(); }, 45000);
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local' || !changes.settings) return;
    state.settings = Object.assign(state.settings, changes.settings.newValue || {});
    render();
  });

  mount();
  loadStored(function () { hookHistory(); onNavigate(true); });
})();
