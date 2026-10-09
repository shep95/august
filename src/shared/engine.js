/*
 * Meme coin domain map — decision engine.
 * Pure functions over the taxonomy. No DOM, no network.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./taxonomy.js'));
  } else {
    root.MCT = root.MCT || {};
    root.MCT.engine = factory(root.MCT.taxonomy);
  }
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  // -------------------------------------------------------------------
  // Narrative classification (Domain I)
  // -------------------------------------------------------------------
  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  /**
   * Classify a token by name / symbol / description into a narrative.
   * Returns { id, label, confidence, matches:[...], group, notes, cycle }.
   * Falls back to 'absurdist' (no-theme) when nothing matches — which the
   * research flags as the highest-manipulation category.
   */
  function classifyNarrative(input) {
    var text = [input && input.name, input && input.symbol, input && input.description].filter(Boolean).join(' ');
    var lower = text.toLowerCase();
    var words = tokenize(text);
    var wordSet = {};
    words.forEach(function (w) { wordSet[w] = true; });

    var best = null;
    var scores = [];
    Object.keys(T.NARRATIVES).forEach(function (id) {
      var n = T.NARRATIVES[id];
      var matches = [];
      n.keywords.forEach(function (kw) {
        if (kw.indexOf(' ') >= 0) {
          if (lower.indexOf(kw) >= 0) matches.push(kw);
        } else if (wordSet[kw]) {
          matches.push(kw);
        } else if (kw.length >= 4) {
          // substring match for compound tickers like "DOGWIFHAT", "PEPECOIN"
          for (var i = 0; i < words.length; i++) {
            if (words[i].length > kw.length && words[i].indexOf(kw) >= 0) { matches.push(kw); break; }
          }
        }
      });
      if (matches.length) {
        // Exact word hits weigh more than substring hits; shorter keyword lists
        // are not penalised.
        var score = matches.reduce(function (acc, m) { return acc + (wordSet[m] ? 2 : 1); }, 0);
        // Known example tickers are strong evidence.
        if (input && input.symbol && n.examples.indexOf(String(input.symbol).toUpperCase()) >= 0) score += 5;
        scores.push({ id: id, score: score, matches: matches });
      }
    });
    scores.sort(function (a, b) { return b.score - a.score; });
    if (scores.length) best = scores[0];

    if (!best) {
      var abs = T.NARRATIVES.absurdist;
      return { id: abs.id, label: abs.label, group: abs.group, confidence: 'low', matches: [], notes: abs.notes, cycle: abs.cycle, alternatives: [] };
    }
    var n = T.NARRATIVES[best.id];
    return {
      id: n.id,
      label: n.label,
      group: n.group,
      confidence: best.score >= 5 ? 'high' : best.score >= 2 ? 'medium' : 'low',
      matches: best.matches,
      notes: n.notes,
      cycle: n.cycle,
      alternatives: scores.slice(1, 3).map(function (s) { return T.NARRATIVES[s.id].label; })
    };
  }

  /** Where the narrative sits in the documented rotation sequences. */
  function rotationContext(narrativeId) {
    var out = [];
    Object.keys(T.ROTATIONS).forEach(function (rid) {
      var r = T.ROTATIONS[rid];
      var idx = r.sequence.indexOf(narrativeId);
      if (idx < 0) return;
      var next = r.sequence[(idx + 1) % r.sequence.length];
      var prev = r.sequence[(idx - 1 + r.sequence.length) % r.sequence.length];
      out.push({
        rotation: r.label,
        position: idx + 1,
        of: r.sequence.length,
        prev: T.NARRATIVES[prev] ? T.NARRATIVES[prev].label : prev,
        next: T.NARRATIVES[next] ? T.NARRATIVES[next].label : next,
        lag: r.lag,
        notes: r.notes
      });
    });
    return out;
  }

  // -------------------------------------------------------------------
  // Signal scoring (Domain III applied)
  // -------------------------------------------------------------------

  /**
   * Derive which of the 7 signals fire automatically from raw metrics.
   * metrics: { devPct, top10Pct, lpLocked (bool), volMcap1h (ratio),
   *            ageHours, devLastTradeHours, socialSpike (bool) }
   * Unknown metrics leave the signal undefined (not fired, flagged unknown).
   */
  function deriveSignals(metrics) {
    var m = metrics || {};
    var s = {};
    s.devHold = isNum(m.devPct) ? m.devPct > 10 : undefined;
    s.top10 = isNum(m.top10Pct) ? m.top10Pct > 50 : undefined;
    s.lpUnlocked = typeof m.lpLocked === 'boolean' ? !m.lpLocked : undefined;
    s.volMcap = isNum(m.volMcap1h) ? m.volMcap1h > 1 : undefined;
    s.socialSpike = typeof m.socialSpike === 'boolean' ? m.socialSpike : undefined;
    s.age = isNum(m.ageHours) ? m.ageHours < 24 : undefined;
    s.devTrade = isNum(m.devLastTradeHours) ? m.devLastTradeHours < 2 : undefined;
    return s;
  }

  /**
   * Composite 10-point score.
   * signals: { [signalId]: true|false|undefined }
   * Returns { score, max, band, fired:[], unknown:[], breakdown:[] }
   */
  function scoreSignals(signals) {
    var sig = signals || {};
    var score = 0, max = 0, fired = [], unknown = [], breakdown = [];
    T.SIGNALS.forEach(function (def) {
      max += def.points;
      var v = sig[def.id];
      var state = v === true ? 'fired' : v === false ? 'clear' : 'unknown';
      if (v === true) { score += def.points; fired.push(def.id); }
      if (v === undefined) unknown.push(def.id);
      breakdown.push({ id: def.id, label: def.label, points: def.points, state: state });
    });
    return { score: score, max: max, band: bandForScore(score), fired: fired, unknown: unknown, breakdown: breakdown };
  }

  function bandForScore(score) {
    var s = Math.max(0, Math.min(10, Math.round(score)));
    for (var i = 0; i < T.SCORE_BANDS.length; i++) {
      var b = T.SCORE_BANDS[i];
      if (s >= b.min && s <= b.max) return b;
    }
    return T.SCORE_BANDS[T.SCORE_BANDS.length - 1];
  }

  // -------------------------------------------------------------------
  // Lifecycle (Domain IV)
  // -------------------------------------------------------------------
  function lifecyclePhase(ageHours) {
    if (!isNum(ageHours) || ageHours < 0) return null;
    for (var i = 0; i < T.LIFECYCLE.length; i++) {
      if (ageHours < T.LIFECYCLE[i].maxHours) return T.LIFECYCLE[i];
    }
    return T.LIFECYCLE[T.LIFECYCLE.length - 1];
  }

  /**
   * Pre-collapse check. checked: { [signalId]: boolean }
   * Returns { count, distribution (bool), highestConfidence (bool), active:[] }
   */
  function preCollapseCheck(checked) {
    var c = checked || {};
    var active = T.PRE_COLLAPSE_SIGNALS.filter(function (s) { return c[s.id] === true; });
    var ids = active.map(function (s) { return s.id; });
    return {
      count: active.length,
      distribution: active.length >= T.PRE_COLLAPSE_RULES.distributionThreshold,
      highestConfidence: ids.indexOf('devSell5') >= 0 && ids.indexOf('lpRemoval') >= 0,
      active: active
    };
  }

  /** Classify a terminal-phase token from volume and holder data. */
  function terminalState(metrics) {
    var m = metrics || {};
    var vol = m.volume24h, holders = m.holders, holdersPrev = m.holdersPrev, cto = m.cto;
    if (!isNum(vol)) return null;
    var lowVol = vol < 1000;
    if (lowVol && isNum(holders) && isNum(holdersPrev) && holders < holdersPrev * 0.5) return find(T.TERMINAL_STATES, 'dead');
    if (lowVol && isNum(holders) && holders > 0) return find(T.TERMINAL_STATES, 'sleeping');
    if (lowVol) return find(T.TERMINAL_STATES, 'dead');
    if (cto === true) return find(T.TERMINAL_STATES, 'evolving');
    return find(T.TERMINAL_STATES, 'recovery');
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // -------------------------------------------------------------------
  // Launchpad (Domain II)
  // -------------------------------------------------------------------

  /** Bonding-curve positioning rule for pump.fun style curves. */
  function bondingCurveAssessment(fillPct) {
    if (!isNum(fillPct)) return null;
    var p = Math.max(0, Math.min(100, fillPct));
    if (p >= 100) return { fillPct: p, level: 'graduated', label: 'Graduated', note: 'Curve complete; LP seeded on Raydium. Check LP lock / renounce next.' };
    if (p >= 95) return { fillPct: p, level: 'red', label: 'Red flag', note: 'pump.fun token at 95%+ curve fill is a documented red flag entry.' };
    if (p >= 60) return { fillPct: p, level: 'poor', label: 'Poor R/R', note: 'Positions after 60% curve fill carry dramatically worse risk/reward.' };
    return { fillPct: p, level: 'ok', label: 'Early curve', note: 'Below the 60% fill threshold. Launch-phase risk still applies.' };
  }

  /**
   * Launchpad flag evaluation.
   * ctx: { launchpad, lpLocked, lpLockDays, renounced, ageHours, curveFillPct,
   *        devKnown, hasCommunity, duplicateTicker, lpBurned, curated, graduated }
   */
  function launchpadFlags(ctx) {
    var c = ctx || {};
    var red = [], green = [];
    if (c.lpLocked === false && isNum(c.ageHours)) red.push('No LP lock at launch');
    if (c.launchpad === 'fourmeme' && c.devKnown === false && c.hasCommunity === false) red.push('four.meme + unknown dev + no community');
    if (c.launchpad === 'pumpfun' && isNum(c.curveFillPct) && c.curveFillPct >= 95 && c.curveFillPct < 100) red.push('pump.fun token at 95%+ curve fill');
    if (c.duplicateTicker === true) red.push('Duplicate ticker copy');
    if (c.renounced === false && isNum(c.ageHours) && c.ageHours >= 48) red.push('Contract not renounced 48h post-launch');

    if (c.lpBurned === true || c.launchpad === 'meteora') green.push('Meteora LP burn at launch');
    if (c.curated === true || c.launchpad === 'moonshot') green.push('Moonshot curation');
    if (c.graduated === true || (isNum(c.curveFillPct) && c.curveFillPct >= 100)) green.push('pump.fun graduation');
    if (isNum(c.lpLockDays) && c.lpLockDays > 30) green.push('Liquidity lock >30 days');
    if (c.renounced === true && c.graduated === true) green.push('Renounced contract post-graduation');
    return { red: red, green: green };
  }

  // -------------------------------------------------------------------
  // KOL tiering
  // -------------------------------------------------------------------
  function kolTier(info) {
    var k = info || {};
    var followers = isNum(k.followers) ? k.followers : null;
    if (followers !== null && followers > 1e6) return find(T.KOL_TIERS, 'C');
    if (k.coordinatedCall === true || (isNum(k.priceUpPctBeforeCall) && k.priceUpPctBeforeCall > 300)) return find(T.KOL_TIERS, 'C');
    if (k.onChainVerified === true && k.trackRecordMonths >= 6 && (followers === null || followers < 50000)) return find(T.KOL_TIERS, 'A');
    return find(T.KOL_TIERS, 'B');
  }

  // -------------------------------------------------------------------
  // Full assessment — one call the panel uses.
  // -------------------------------------------------------------------
  function assess(token) {
    var t = token || {};
    var metrics = t.metrics || {};
    var auto = deriveSignals(metrics);
    var signals = Object.assign({}, auto, t.overrides || {});
    var scoring = scoreSignals(signals);
    var narrative = classifyNarrative({ name: t.name, symbol: t.symbol, description: t.description });
    var phase = lifecyclePhase(metrics.ageHours);
    var curve = bondingCurveAssessment(t.curveFillPct);
    var flags = launchpadFlags(Object.assign({ launchpad: t.launchpad, ageHours: metrics.ageHours, lpLocked: metrics.lpLocked, curveFillPct: t.curveFillPct }, t.launchCtx || {}));
    var collapse = preCollapseCheck(t.preCollapse || {});
    var warnings = [];

    if (narrative.id === 'celebrity') warnings.push('Celebrity derivative: announcement = exit signal, not entry. Median loss from peak -95%.');
    if (narrative.id === 'political') warnings.push('Political narrative: very short window, heavy insider pre-positioning documented.');
    if (narrative.id === 'absurdist') warnings.push('No narrative anchor detected: highest manipulation rate, no organic recovery path.');
    if (phase && phase.id === 'launch') warnings.push('Launch phase (0–24h): highest risk window for dev wallet activity; volume may be wash-traded.');
    if (phase && phase.id === 'distribution') warnings.push('Distribution phase (days 7–30): pre-collapse signals cluster here. Run the checklist.');
    if (curve && curve.level === 'red') warnings.push(curve.note);
    if (collapse.highestConfidence) warnings.push('Dev sell + LP reduction simultaneously: highest-confidence exit signal.');
    else if (collapse.distribution) warnings.push(collapse.count + ' pre-collapse signals active: treat as distribution phase.');
    if (t.chain && T.CHAINS[t.chain] && T.CHAINS[t.chain].risk === 'very high') warnings.push(T.CHAINS[t.chain].label + ' chain risk: very high. Sharp spikes, fast collapse.');

    return {
      signals: signals,
      autoSignals: auto,
      scoring: scoring,
      narrative: narrative,
      rotation: rotationContext(narrative.id),
      phase: phase,
      curve: curve,
      flags: flags,
      collapse: collapse,
      chain: t.chain ? T.CHAINS[t.chain] || null : null,
      launchpad: t.launchpad ? T.LAUNCHPADS[t.launchpad] || null : null,
      warnings: warnings
    };
  }

  return {
    tokenize: tokenize,
    classifyNarrative: classifyNarrative,
    rotationContext: rotationContext,
    deriveSignals: deriveSignals,
    scoreSignals: scoreSignals,
    bandForScore: bandForScore,
    lifecyclePhase: lifecyclePhase,
    preCollapseCheck: preCollapseCheck,
    terminalState: terminalState,
    bondingCurveAssessment: bondingCurveAssessment,
    launchpadFlags: launchpadFlags,
    kolTier: kolTier,
    assess: assess
  };
});
