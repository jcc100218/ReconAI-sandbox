// ══════════════════════════════════════════════════════════════════
// shared/mock-engine.js — Unified persona-aware mock draft CPU picker
//
// Canonical implementation used by both Scout and War Room.
// Merges War Room's 10-layer persona engine (cpu-engine.js) with
// Scout's League Intelligence enrichment (draft-ui.js).
//
// Depends on: (none — pure JS)
// Exposes:    window.App.MockEngine.{ personaPick, computePredictions }
// ══════════════════════════════════════════════════════════════════

(function () {
  'use strict';
  window.App = window.App || {};

  // Early-round position priors: in R1–2, offensive skill positions dominate.
  const EARLY_OFFENSE_PRIOR = { QB: 1.0, RB: 1.0, WR: 1.0, TE: 0.95, K: 0.3, DL: 0.5, LB: 0.5, DB: 0.4 };

  // ── Trade DNA nudges ──────────────────────────────────────────
  function tradeDnaMultiplier(persona, player, round) {
    const key = persona.tradeDna?.key || 'NONE';
    const pos = player.pos;
    if (key === 'FLEECER') return 1.12;                              // hunt asymmetric value
    if (key === 'DOMINATOR' && round <= 2 && (pos === 'QB' || pos === 'RB')) return 1.15; // status picks
    if (key === 'ACCEPTOR') return 1.08;                             // young/rookie bias
    return 1.0;
  }

  // ── Posture nudges ────────────────────────────────────────────
  function postureMultiplier(persona, player, round, needIdx) {
    const key = persona.posture?.key || 'NEUTRAL';
    const pos = player.pos;
    if (key === 'DESPERATE' && needIdx === 0) return 1.25;           // strong need premium
    if (key === 'BUYER' && round <= 3 && (pos === 'RB' || pos === 'WR')) return 1.10;
    if (key === 'SELLER') return 1.05;
    return 1.0;
  }

  // ── Window alignment ──────────────────────────────────────────
  function windowMultiplier(persona) {
    const win = persona.assessment?.window || persona.assessment?.tier || 'CROSSROADS';
    if (win === 'REBUILDING') return 1.02;  // raw upside preference
    return 1.0;
  }

  // ── Variance bound ────────────────────────────────────────────
  function variancePct(persona) {
    const key = persona.tradeDna?.key;
    if (key === 'STALWART' || persona.posture?.key === 'LOCKED') return 0.03;
    return 0.05;
  }

  /**
   * personaPick — pick a player for a CPU team using the 10-layer rule engine.
   *
   * @param {Object} persona — { draftDna, tradeDna, assessment, posture }
   * @param {Array}  available — pool of draftable players, each with { pid, name, pos, dhq|val }
   * @param {number} round — 1-indexed round
   * @param {number} pickNumber — overall pick number (1-indexed)
   * @param {Object} ctx — { teamRoster: string[], liData?: { draftOutcomes, hitRateByRound } }
   * @returns {{ player, confidence, reasoning }|null}
   */
  function personaPick(persona, available, round, pickNumber, ctx) {
    ctx = ctx || {};
    if (!available || !available.length) return null;

    const teamRoster = ctx.teamRoster || [];
    const dna = persona?.draftDna || {};
    const posPct = dna.posPct || {};
    const r1Positions = dna.r1Positions || [];
    const label = dna.label || 'Balanced';

    const assess = persona?.assessment || {};
    const needs = assess.needs || [];
    const strengths = assess.strengths || [];
    const healthScore = assess.healthScore || 70;

    const needPositions = needs.map(function (n) { return typeof n === 'string' ? n : (n?.pos || ''); });
    const strengthPositions = strengths.map(function (s) { return typeof s === 'string' ? s : (s?.pos || ''); }).filter(Boolean);

    // BPA floor: never pick below 40% of top-5 DHQ
    var topDHQ = Math.max.apply(null, available.slice(0, 5).map(function (p) { return p.dhq || p.val || 0; }).concat([1]));
    var bpaFloor = topDHQ * 0.40;

    var earlyPrior = round <= 2 ? EARLY_OFFENSE_PRIOR : null;
    var variance = variancePct(persona);

    // League Intelligence enrichment (optional — Scout passes LI data)
    var liData = ctx.liData || {};
    var rosterId = ctx.rosterId || null;
    var draftOutcomes = liData.draftOutcomes || [];
    var roundPosByFreq = {};
    if (rosterId && draftOutcomes.length) {
      draftOutcomes.filter(function (d) {
        return (d.roster_id === rosterId || d.rosterId === rosterId) && d.round === round;
      }).forEach(function (d) {
        var p = d.pos || d.position || '';
        if (p) roundPosByFreq[p] = (roundPosByFreq[p] || 0) + 1;
      });
    }
    var roundHitRates = liData.hitRateByRound?.[round] || {};
    var leagueBestPos = (roundHitRates.bestPos || []).slice(0, 2).map(function (p) { return p.pos; });

    var best = null;
    var bestScore = -Infinity;
    var bestReasoning = null;

    for (var i = 0; i < available.length; i++) {
      var p = available[i];
      var val = p.dhq || p.val || 0;
      if (val < bpaFloor && available.length > 5) continue;

      // Base score = raw DHQ
      var score = val;
      var reasoning = {
        primary: 'DHQ',
        baseVal: val,
        nudges: [],
        reach: false,
        bpaFloorTriggered: false,
      };

      // 1. Early-round position prior
      if (earlyPrior && earlyPrior[p.pos] != null) {
        var pr = earlyPrior[p.pos];
        if (pr !== 1.0) {
          score *= pr;
          reasoning.nudges.push({ name: 'EarlyRoundPrior', pct: Math.round((pr - 1) * 100), pos: p.pos });
        }
      }

      // 2. Roster need signals
      var needIdx = needPositions.indexOf(p.pos);
      if (needIdx === 0) {
        score *= 1.25;
        reasoning.nudges.push({ name: 'PrimaryNeed', pct: 25, pos: p.pos });
        reasoning.primary = 'Primary need';
      } else if (needIdx > 0) {
        score *= 1.10;
        reasoning.nudges.push({ name: 'SecondaryNeed', pct: 10, pos: p.pos });
      }
      if (healthScore < 55 && needIdx >= 0) {
        score *= 1.15;
        reasoning.nudges.push({ name: 'DesperateHealth', pct: 15 });
      }
      if (strengthPositions.includes(p.pos) && persona.posture?.key !== 'SELLER') {
        score *= 0.85;
        reasoning.nudges.push({ name: 'StrengthPenalty', pct: -15, pos: p.pos });
      }

      // 3. Draft History DNA — position pref
      var prefPct = posPct[p.pos] || 0;
      if (prefPct > 0) {
        var dMult = 1 + (prefPct / 200);
        score *= dMult;
        if (prefPct >= 20) reasoning.nudges.push({ name: 'DraftHistoryPref', pct: Math.round((dMult - 1) * 100), pos: p.pos });
      }

      // 4. R1 tendency
      if (round <= 2 && r1Positions.includes(p.pos)) {
        var r1Count = r1Positions.filter(function (x) { return x === p.pos; }).length;
        var r1Mult = 1 + (r1Count * 0.08);
        score *= r1Mult;
        reasoning.nudges.push({ name: 'R1Tendency', pct: Math.round((r1Mult - 1) * 100), pos: p.pos });
      }

      // 5. Label nudges
      if (label === 'DEF-Early' && round <= 3 && ['DL', 'LB', 'DB'].indexOf(p.pos) >= 0) {
        score *= 1.12;
        reasoning.nudges.push({ name: 'DEF-Early', pct: 12 });
      }
      if (label === 'QB-Hunter' && p.pos === 'QB' && round <= 2) {
        score *= 1.15;
        reasoning.nudges.push({ name: 'QB-Hunter', pct: 15 });
      }
      if (label === 'QB-Avoider' && p.pos === 'QB' && round <= 3) {
        score *= 0.80;
        reasoning.nudges.push({ name: 'QB-Avoider', pct: -20 });
      }
      if (label === 'TE-Premium' && p.pos === 'TE' && round <= 3) {
        score *= 1.10;
        reasoning.nudges.push({ name: 'TE-Premium', pct: 10 });
      }

      // 6. Trade DNA nudge
      var tradeMult = tradeDnaMultiplier(persona, p, round);
      if (tradeMult !== 1.0) {
        score *= tradeMult;
        reasoning.nudges.push({ name: 'TradeDNA:' + (persona.tradeDna?.key || ''), pct: Math.round((tradeMult - 1) * 100) });
      }

      // 7. Posture nudge
      var postureMult = postureMultiplier(persona, p, round, needIdx);
      if (postureMult !== 1.0) {
        score *= postureMult;
        reasoning.nudges.push({ name: 'Posture:' + (persona.posture?.key || ''), pct: Math.round((postureMult - 1) * 100) });
      }

      // 8. Window alignment
      var winMult = windowMultiplier(persona);
      if (winMult !== 1.0) {
        score *= winMult;
        reasoning.nudges.push({ name: 'Window:' + (persona.assessment?.window || ''), pct: Math.round((winMult - 1) * 100) });
      }

      // 9. Roster saturation — progressive penalty for same position
      var sameCount = teamRoster.filter(function (x) { return x === p.pos; }).length;
      if (sameCount >= 2) {
        score *= 0.80;
        reasoning.nudges.push({ name: 'RosterSaturation', pct: -20, pos: p.pos });
      } else if (sameCount === 1) {
        score *= 0.95;
      }

      // 10a. League Intelligence: per-round position history (from Scout LI)
      if (roundPosByFreq[p.pos]) {
        score *= 1 + (roundPosByFreq[p.pos] * 0.05);
      }
      // 10b. League-wide hit rates (from Scout LI)
      if (leagueBestPos[0] === p.pos) score *= 1.05;
      else if (leagueBestPos[1] === p.pos) score *= 1.02;

      // 11. Variance — small random perturbation
      var jitter = (1 - variance) + Math.random() * (variance * 2);
      score *= jitter;

      if (score > bestScore) {
        bestScore = score;
        best = p;
        bestReasoning = reasoning;
      }
    }

    if (!best) {
      best = available[0];
      bestReasoning = { primary: 'BPA fallback', baseVal: (best.dhq || best.val || 0), nudges: [], bpaFloorTriggered: true };
    }

    // Confidence: score spread vs second best
    var confidence = 0.5;
    if (available.length > 1) {
      var scores = [];
      for (var j = 0; j < Math.min(available.length, 10); j++) {
        scores.push(available[j].dhq || available[j].val || 0);
      }
      var s0 = scores[0] || 1;
      var s1 = scores[1] || 0;
      confidence = Math.max(0.4, Math.min(0.95, (s0 - s1) / s0 + 0.5));
    }

    return {
      player: best,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: bestReasoning,
    };
  }

  /**
   * computePredictions — what positions will this persona REACH for vs PASS ON?
   *
   * @param {Object} persona
   * @param {Array}  pool — sorted by DHQ desc
   * @param {number} round
   * @param {number} pickNumber
   * @returns {{ willReach: Array, willPassOn: Array, likelyPick: Object|null }}
   */
  function computePredictions(persona, pool, round, pickNumber) {
    if (!persona || !pool || !pool.length) {
      return { willReach: [], willPassOn: [], likelyPick: null };
    }

    var top = pool.slice(0, 20);
    var result = personaPick(persona, top, round, pickNumber, { teamRoster: [] });
    var likelyPick = result?.player || null;

    // Per-position: compare baseline DHQ vs persona-adjusted score
    var posStats = {};
    for (var i = 0; i < top.length; i++) {
      var p = top[i];
      var baseline = p.dhq || p.val || 0;
      var singleResult = personaPick(persona, [p], round, pickNumber, { teamRoster: [] });
      var nudges = singleResult?.reasoning?.nudges || [];
      var totalMult = 1;
      for (var j = 0; j < nudges.length; j++) {
        totalMult *= (1 + (nudges[j].pct || 0) / 100);
      }
      var adjusted = baseline * totalMult;

      if (!posStats[p.pos]) posStats[p.pos] = { baseline: 0, adjusted: 0, count: 0 };
      posStats[p.pos].baseline += baseline;
      posStats[p.pos].adjusted += adjusted;
      posStats[p.pos].count += 1;
    }

    var willReach = [];
    var willPassOn = [];
    var positions = Object.keys(posStats);
    for (var k = 0; k < positions.length; k++) {
      var pos = positions[k];
      var s = posStats[pos];
      if (s.count === 0) continue;
      var delta = (s.adjusted - s.baseline) / Math.max(s.baseline, 1);
      if (delta > 0.10) {
        willReach.push({ pos: pos, delta: Math.round(delta * 100) / 100, reasoning: 'DNA/need/posture inflation' });
      } else if (delta < -0.10) {
        willPassOn.push({ pos: pos, delta: Math.round(delta * 100) / 100, reasoning: 'strength penalty or DNA demotion' });
      }
    }

    willReach.sort(function (a, b) { return b.delta - a.delta; });
    willPassOn.sort(function (a, b) { return a.delta - b.delta; });

    return {
      willReach: willReach.slice(0, 3),
      willPassOn: willPassOn.slice(0, 3),
      likelyPick: likelyPick ? {
        pid: likelyPick.pid,
        name: likelyPick.name,
        pos: likelyPick.pos,
        dhq: likelyPick.dhq || likelyPick.val,
        confidence: result.confidence,
      } : null,
    };
  }

  // ── Expose ────────────────────────────────────────────────────
  window.App.MockEngine = {
    personaPick: personaPick,
    computePredictions: computePredictions,
  };
})();
