(function () {
  'use strict';
  var T = window.MCT.taxonomy, E = window.MCT.engine, F = window.MCT.filters;
  var settings = { enabled: true, side: 'right', collapsed: false, listMode: 'hide', filters: {} };
  var content = document.getElementById('content');
  var quick = {};

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style') el.setAttribute('style', attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function card(title, ex, detail, rule) {
    return h('div', { class: 'card' }, [
      h('div', { class: 't', text: title }),
      ex ? h('div', { class: 'ex', text: ex }) : null,
      detail ? h('div', { class: 'd', text: detail }) : null,
      rule ? h('div', { class: 'r', text: rule }) : null
    ]);
  }

  function saveSettings() { chrome.storage.local.set({ settings: settings }); }

  var tabs = {
    filters: function () {
      var frag = document.createDocumentFragment();
      var en = Object.assign(F.defaults(), settings.filters || {});
      frag.appendChild(h('div', { class: 'card' }, [
        h('div', { class: 't', text: 'Filters are applied automatically' }),
        h('div', { class: 'd', text: 'Every coin page gets a verdict card (SKIP / HALF SIZE / BUY) and list pages are screened. The defaults are the research; switch a rule off only if you disagree with it.' })
      ]));
      frag.appendChild(h('div', { class: 'legend' }, Object.keys(F.VERDICTS).map(function (k) { return h('span', { class: 'pill', style: 'background:' + F.VERDICTS[k].color, text: F.VERDICTS[k].label }); })));
      frag.appendChild(h('h3', { text: 'On trending / list pages, coins that fail are' }));
      var modes = [['hide', 'Hidden'], ['dim', 'Dimmed'], ['badge', 'Badged only'], ['off', 'Not screened']];
      frag.appendChild(h('div', { class: 'modes' }, modes.map(function (m) {
        return h('button', { class: 'btn' + (settings.listMode === m[0] ? ' active' : ''), text: m[1], onclick: function () { settings.listMode = m[0]; saveSettings(); show('filters'); } });
      })));
      var groups = {};
      F.RULES.forEach(function (r) { (groups[r.group] = groups[r.group] || []).push(r); });
      Object.keys(groups).forEach(function (g) {
        frag.appendChild(h('h3', { text: g }));
        groups[g].forEach(function (r) {
          var cb = h('input', { type: 'checkbox', onchange: function (ev) { settings.filters = settings.filters || {}; settings.filters[r.id] = ev.target.checked; saveSettings(); show('filters'); } });
          cb.checked = en[r.id] !== false;
          frag.appendChild(h('label', { class: 'rule' + (en[r.id] === false ? ' off' : '') }, [cb, h('div', {}, [
            h('div', { class: 'l' }, [r.label, h('span', { class: 'sev ' + r.severity, text: r.severity })]),
            h('div', { class: 'w', text: r.why })
          ])]));
        });
      });
      frag.appendChild(h('div', { class: 'row' }, [h('button', { class: 'btn', text: 'Reset to research defaults', onclick: function () { settings.filters = {}; saveSettings(); show('filters'); } })]));
      return frag;
    },
    score: function () {
      var frag = document.createDocumentFragment();
      var s = E.scoreSignals(quick);
      frag.appendChild(h('div', { class: 'score-box' }, [
        h('div', { class: 'score-big', style: 'color:' + s.band.color, text: s.score }),
        h('div', {}, [h('div', { class: 'band', style: 'color:' + s.band.color, text: s.band.label }), h('div', { class: 'muted', text: s.band.note })])
      ]));
      frag.appendChild(h('div', { class: 'bands' }, T.SCORE_BANDS.map(function (b) { return h('div', { class: b.id === s.band.id ? 'active' : '', style: 'background:' + b.color, title: b.min + '–' + b.max + ' ' + b.label }); })));
      frag.appendChild(h('h3', { text: 'Quick scorer — tick what you observe' }));
      T.SIGNALS.forEach(function (sig) {
        var cb = h('input', { type: 'checkbox', onchange: function (ev) { if (ev.target.checked) quick[sig.id] = true; else delete quick[sig.id]; show('score'); } });
        cb.checked = quick[sig.id] === true;
        frag.appendChild(h('label', { class: 'sig' }, [cb, h('span', { text: sig.label }), h('span', { class: 'pts', text: '+' + sig.points })]));
      });
      frag.appendChild(h('h3', { text: 'Score bands' }));
      var tbl = h('table', {}, [h('tr', {}, [h('th', { text: 'Score' }), h('th', { text: 'Action' }), h('th', { text: 'Meaning' })])]);
      T.SCORE_BANDS.forEach(function (b) { tbl.appendChild(h('tr', {}, [h('td', { style: 'color:' + b.color + ';font-weight:700', text: b.min + '–' + b.max }), h('td', { text: b.label }), h('td', { text: b.note })])); });
      frag.appendChild(tbl);
      frag.appendChild(h('h3', { text: 'Narrative classifier' }));
      var inp = h('input', { type: 'text', placeholder: 'token name / ticker, e.g. "dogwifhat WIF"' });
      var out = h('div', { class: 'card', style: 'margin-top:6px' });
      function classify() {
        var n = E.classifyNarrative({ name: inp.value });
        out.innerHTML = '';
        out.appendChild(h('div', { class: 't', text: n.label + ' · ' + n.confidence }));
        out.appendChild(h('div', { class: 'd', text: n.notes }));
        E.rotationContext(n.id).forEach(function (r) { out.appendChild(h('div', { class: 'ex', text: r.rotation + ': ' + r.prev + ' → ' + n.label + ' → ' + r.next + ' (' + r.lag + ')' })); });
      }
      frag.appendChild(h('div', { class: 'row' }, [inp, h('button', { class: 'btn', text: 'Classify', onclick: classify })]));
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') classify(); });
      frag.appendChild(out);
      return frag;
    },
    narratives: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(h('h3', { text: 'Domain I — 9 sub-domains' }));
      Object.keys(T.NARRATIVES).forEach(function (id) {
        var n = T.NARRATIVES[id];
        if (id === 'animal.other') return;
        frag.appendChild(card(n.label, n.examples.join(', '), n.notes, 'Cycle: ' + n.cycle));
      });
      frag.appendChild(h('h3', { text: 'Rotation sequences' }));
      Object.keys(T.ROTATIONS).forEach(function (id) {
        var r = T.ROTATIONS[id];
        frag.appendChild(h('div', { class: 'card' }, [
          h('div', { class: 't', text: r.label }),
          h('div', { class: 'seq', text: r.sequence.map(function (s) { return (T.NARRATIVES[s] || T.CHAINS[s] || { label: s }).label; }).join(' → ') + ' → …' }),
          h('div', { class: 'd', text: r.notes })
        ]));
      });
      return frag;
    },
    chains: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(h('h3', { text: 'Domain II — chains' }));
      var tbl = h('table', {}, [h('tr', {}, [h('th', { text: 'Chain' }), h('th', { text: 'Launchpad' }), h('th', { text: 'Fees' }), h('th', { text: 'Risk' })])]);
      Object.keys(T.CHAINS).forEach(function (id) {
        var c = T.CHAINS[id];
        var cls = c.risk === 'very high' ? 'risk-very' : c.risk === 'high' ? 'risk-high' : 'risk-medium';
        tbl.appendChild(h('tr', {}, [h('td', { text: c.label }), h('td', { text: c.launchpad }), h('td', { text: c.fee }), h('td', { class: cls, text: c.risk })]));
      });
      frag.appendChild(tbl);
      Object.keys(T.CHAINS).forEach(function (id) { var c = T.CHAINS[id]; frag.appendChild(card(c.label, c.finality + ' finality', c.culture)); });
      frag.appendChild(h('h3', { text: 'Launchpads' }));
      Object.keys(T.LAUNCHPADS).forEach(function (id) { var l = T.LAUNCHPADS[id]; frag.appendChild(card(l.label, l.chain, l.mechanics, l.rule)); });
      frag.appendChild(h('h3', { text: 'Survival signals' }));
      frag.appendChild(h('ul', {}, T.LAUNCHPAD_SURVIVAL_SIGNALS.map(function (s) { return h('li', { text: s }); })));
      frag.appendChild(h('h3', { text: 'Red flags' }));
      frag.appendChild(h('ul', {}, T.LAUNCHPAD_RED_FLAGS.map(function (s) { return h('li', { text: s }); })));
      return frag;
    },
    manip: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(h('h3', { text: 'Domain III — ' + T.MANIPULATION.source }));
      frag.appendChild(h('div', { class: 'muted', text: T.MANIPULATION.stats }));
      T.MANIPULATION.types.forEach(function (t) { frag.appendChild(card(t.label, null, t.detail)); });
      frag.appendChild(h('h3', { text: 'Signal weights' }));
      frag.appendChild(h('ul', {}, T.SIGNALS.map(function (s) { return h('li', { text: s.label + ' → +' + s.points + 'pt' + (s.points > 1 ? 's' : '') }); })));
      return frag;
    },
    lifecycle: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(h('h3', { text: 'Domain IV — token lifecycle' }));
      T.LIFECYCLE.forEach(function (p) { frag.appendChild(card(p.label, p.window, p.detail)); });
      frag.appendChild(h('h3', { text: '4 terminal states' }));
      T.TERMINAL_STATES.forEach(function (s) { frag.appendChild(card(s.label, null, s.detail)); });
      frag.appendChild(h('h3', { text: '10 pre-collapse signals' }));
      frag.appendChild(h('ul', {}, T.PRE_COLLAPSE_SIGNALS.map(function (s) { return h('li', { text: s.label }); })));
      frag.appendChild(h('div', { class: 'card' }, [h('div', { class: 'r', text: T.PRE_COLLAPSE_RULES.rule }), h('div', { class: 'r', text: T.PRE_COLLAPSE_RULES.highestConfidence })]));
      return frag;
    },
    archetypes: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(h('h3', { text: '5 behavioral archetypes' }));
      T.ARCHETYPES.forEach(function (a) { frag.appendChild(card(a.label, a.examples.join(', '), a.detail, a.rule)); });
      return frag;
    },
    kol: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(h('h3', { text: 'KOL tier classification' }));
      T.KOL_TIERS.forEach(function (k) {
        frag.appendChild(h('div', { class: 'card' }, [
          h('div', { class: 't', text: k.label }),
          h('ul', {}, k.criteria.map(function (c) { return h('li', { text: c }); })),
          h('div', { class: 'r', text: k.action })
        ]));
      });
      return frag;
    }
  };

  function show(id) {
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === id); });
    content.innerHTML = '';
    content.appendChild(tabs[id]());
  }
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });

  var enabled = document.getElementById('enabled');
  enabled.addEventListener('change', function () { settings.enabled = enabled.checked; saveSettings(); });
  chrome.storage.local.get({ settings: null }, function (r) {
    settings = Object.assign(settings, r.settings || {});
    enabled.checked = settings.enabled !== false;
    show('filters');
  });
})();
