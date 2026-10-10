/*
 * Research-derived filter rules. Each rule looks at a full assessment (engine.assess)
 * and says reject / caution / pass / unknown with a reason taken from the research.
 * Users can switch individual rules off in the popup; the defaults are the research.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./taxonomy.js'));
  else { root.MCT = root.MCT || {}; root.MCT.filters = factory(root.MCT.taxonomy); }
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  // severity: 'reject' removes the token, 'caution' flags it. `on` is the research default.
  var RULES = [
    { id: 'band', group: 'Score', label: 'Score band is Skip or Do-not-engage (5+)', severity: 'reject', on: true,
      why: 'Score 5–7 = manipulation profile too high; 8–10 = confirmed anomaly cluster.',
      test: function (a) { var b = a.scoring.band.id; return b === 'skip' || b === 'avoid' ? 'reject' : 'pass'; } },
    { id: 'band-half', group: 'Score', label: 'Score band is Half-size (3–4)', severity: 'caution', on: true,
      why: 'Elevated caution band: half size only.',
      test: function (a) { return a.scoring.band.id === 'half' ? 'caution' : 'pass'; } },
    { id: 'celebrity', group: 'Narrative', label: 'Celebrity derivative', severity: 'reject', on: true,
      why: 'Celebrity announcement = exit signal, not entry. Median loss from peak -95% (HAWK, JENNER).',
      test: function (a) { return a.narrative.id === 'celebrity' ? 'reject' : 'pass'; } },
    { id: 'political', group: 'Narrative', label: 'Political narrative', severity: 'reject', on: true,
      why: 'Event-timed, very short window, heavy insider pre-positioning. LIBRA -95% in 12h, $9M+ losses.',
      test: function (a) { return a.narrative.id === 'political' ? 'reject' : 'pass'; } },
    { id: 'absurdist', group: 'Narrative', label: 'No narrative anchor (absurdist / unclassified)', severity: 'caution', on: true,
      why: 'Highest manipulation rate, no organic recovery pathway.',
      test: function (a) { return a.narrative.id === 'absurdist' ? 'caution' : 'pass'; } },
    { id: 'curve95', group: 'Launchpad', label: 'pump.fun curve ≥95% filled', severity: 'reject', on: true,
      why: 'Documented red flag entry: pump.fun token at 95%+ curve fill.',
      test: function (a, t) { if (a.curve) return a.curve.level === 'red' ? 'reject' : 'pass'; return t.launchpad === 'pumpfun' ? 'unknown' : 'pass'; } },
    { id: 'curve60', group: 'Launchpad', label: 'pump.fun curve 60–95% filled', severity: 'caution', on: true,
      why: 'Positions after 60% curve fill carry dramatically worse risk/reward.',
      test: function (a, t) { if (a.curve) return a.curve.level === 'poor' ? 'caution' : 'pass'; return t.launchpad === 'pumpfun' ? 'unknown' : 'pass'; } },
    { id: 'lp', group: 'On-chain', label: 'LP unlocked / removable', severity: 'reject', on: true,
      why: 'Rug pull = developer removes liquidity pool. Most common in first 24h.',
      test: function (a) { var v = a.signals.lpUnlocked; return v === true ? 'reject' : v === false ? 'pass' : 'unknown'; } },
    { id: 'dev', group: 'On-chain', label: 'Dev wallet holds >10%', severity: 'reject', on: true,
      why: 'Ownership concealment / soft-rug supply. +2 in the scoring model.',
      test: function (a) { var v = a.signals.devHold; return v === true ? 'reject' : v === false ? 'pass' : 'unknown'; } },
    { id: 'top10', group: 'On-chain', label: 'Top-10 holders >50%', severity: 'reject', on: true,
      why: 'Pump and dump setup: coordinated accumulation (<5 wallets holding 40%+).',
      test: function (a) { var v = a.signals.top10; return v === true ? 'reject' : v === false ? 'pass' : 'unknown'; } },
    { id: 'thinlp', group: 'On-chain', label: 'Liquidity <5% of market cap', severity: 'reject', on: true,
      why: 'LP price inflation (LPI): thin pool, small buys move price, insiders sell into added depth.',
      test: function (a, t) { var m = t.metrics || {}; if (!isNum(m.liquidityUsd) || !isNum(m.marketCap) || m.marketCap < 50000) return isNum(m.marketCap) ? 'pass' : 'unknown'; return m.liquidityUsd / m.marketCap < 0.05 ? 'reject' : 'pass'; } },
    { id: 'wash', group: 'On-chain', label: 'Vol/mcap >100% in 1h', severity: 'caution', on: true,
      why: 'Wash trading signature: volume inflated to trigger trending placement.',
      test: function (a) { var v = a.signals.volMcap; return v === true ? 'caution' : v === false ? 'pass' : 'unknown'; } },
    { id: 'launch', group: 'Lifecycle', label: 'Launch phase (<24h old)', severity: 'caution', on: true,
      why: 'Highest risk window for dev wallet activity; volume may be wash-traded.',
      test: function (a) { return a.phase ? (a.phase.id === 'launch' ? 'caution' : 'pass') : 'unknown'; } },
    { id: 'fresh', group: 'Lifecycle', label: 'Under 1 hour old', severity: 'reject', on: false,
      why: 'Sniper / bot window. Off by default — turn on for a stricter screen.',
      test: function (a, t) { var h = t.metrics && t.metrics.ageHours; return isNum(h) ? (h < 1 ? 'reject' : 'pass') : 'unknown'; } },
    { id: 'distribution', group: 'Lifecycle', label: '3+ pre-collapse signals (distribution phase)', severity: 'reject', on: true,
      why: '3+ signals concurrent in 48h = distribution phase. Dev sell + LP reduction = highest-confidence exit.',
      test: function (a) { return a.collapse.distribution || a.collapse.highestConfidence ? 'reject' : 'pass'; } },
    { id: 'bsc', group: 'Chain', label: 'BSC / four.meme (very high risk chain)', severity: 'caution', on: true,
      why: 'Tight coordinated groups, sharp spikes, fast collapse. High-churn, low survival.',
      test: function (a, t) { return t.chain === 'bsc' ? 'caution' : 'pass'; } },
    { id: 'flags', group: 'Launchpad', label: 'Any launchpad red flag', severity: 'reject', on: true,
      why: 'No LP lock, duplicate ticker, not renounced 48h post-launch, four.meme + unknown dev.',
      test: function (a) { return a.flags.red.length ? 'reject' : 'pass'; } }
  ];

  function defaults() {
    var o = {};
    RULES.forEach(function (r) { o[r.id] = r.on; });
    return o;
  }

  /**
   * Evaluate all rules. enabled: { ruleId: bool } (missing = research default).
   * Returns { verdict: 'reject'|'caution'|'pass', rejects:[], cautions:[], unknown:[], passed:[] }
   */
  function evaluate(assessment, token, enabled) {
    var en = Object.assign(defaults(), enabled || {});
    var out = { verdict: 'pass', rejects: [], cautions: [], unknown: [], passed: [], disabled: [] };
    RULES.forEach(function (r) {
      if (!en[r.id]) { out.disabled.push(r); return; }
      var res;
      try { res = r.test(assessment, token || {}); } catch (e) { res = 'unknown'; }
      var item = { id: r.id, label: r.label, why: r.why, severity: r.severity, group: r.group };
      if (res === 'reject') out.rejects.push(item);
      else if (res === 'caution') out.cautions.push(item);
      else if (res === 'unknown') out.unknown.push(item);
      else out.passed.push(item);
    });
    out.verdict = out.rejects.length ? 'reject' : out.cautions.length ? 'caution' : 'pass';
    return out;
  }

  var VERDICTS = {
    reject: { label: 'SKIP', short: 'SKIP', color: '#ef4444', note: 'Matches a research rejection pattern. Do not enter.' },
    caution: { label: 'HALF SIZE · CAUTION', short: 'HALF', color: '#f59e0b', note: 'No rejection pattern, but a caution rule fired. Half size at most.' },
    pass: { label: 'BUY · FULL SIZE', short: 'BUY', color: '#22c55e', note: 'No research rule fired. Unknown signals still need a manual check before sizing up.' }
  };

  return { RULES: RULES, defaults: defaults, evaluate: evaluate, VERDICTS: VERDICTS };
});
