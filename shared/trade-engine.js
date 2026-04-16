// ══════════════════════════════════════════════════════════════════
// shared/trade-engine.js — Trade psychology primitives
// Used by both Scout (reconai/) and War Room (warroom/).
// Loads after shared/utils.js, before any app-specific trade-calc.js.
// ══════════════════════════════════════════════════════════════════

(function () {
  'use strict';
  window.App = window.App || {};

  // ── Posture definitions ────────────────────────────────────────
  // Shared across both apps. Returned by calcOwnerPosture().
  // .key  — used for identity checks (theirPosture?.key === 'LOCKED')
  // .label — used for display (posture.label)
  // .color — used for badge styling (posture.color)
  const POSTURES = {
    DESPERATE: { key: 'DESPERATE', label: 'Desperate',     color: '#BB8FCE', desc: 'Panic-mode — will overpay for immediate help.' },
    BUYER:     { key: 'BUYER',     label: 'Active Buyer',  color: '#F0A500', desc: 'Contender upgrading — open to deals, fair value required.' },
    NEUTRAL:   { key: 'NEUTRAL',   label: 'Neutral',       color: '#95A5A6', desc: 'No strong directional push. Fair offers only.' },
    SELLER:    { key: 'SELLER',    label: 'Active Seller', color: '#5DADE2', desc: 'Moving assets for futures. Buy at a discount.' },
    LOCKED:    { key: 'LOCKED',    label: 'Locked In',     color: '#7F8C8D', desc: 'Satisfied roster, high attachment. Very hard to move.' },
  };

  // ── calcComplementarity ────────────────────────────────────────
  // How well two teams' needs/surpluses complement each other.
  // Returns 0–100. Higher = better natural trade partners.
  function calcComplementarity(mine, theirs) {
    if (!mine || !theirs) return 0;
    let score = 0;
    for (const n of mine.needs) {
      const t = theirs.posAssessment[n.pos];
      if (t?.status === 'surplus') score += n.urgency === 'deficit' ? 25 : 12;
      else if (t?.status === 'ok' && n.urgency === 'deficit') score += 6;
    }
    for (const n of theirs.needs) {
      const m = mine.posAssessment[n.pos];
      if (m?.status === 'surplus') score += n.urgency === 'deficit' ? 25 : 12;
      else if (m?.status === 'ok' && n.urgency === 'deficit') score += 6;
    }
    if (mine.window !== theirs.window) score += 15;
    return Math.min(100, score);
  }

  // ── calcOwnerPosture ───────────────────────────────────────────
  // Determine owner posture based on team assessment and DNA archetype.
  // Returns one of the POSTURES objects above.
  function calcOwnerPosture(assessment, dnaKey) {
    if (!assessment) return POSTURES.NEUTRAL;
    const { tier, panic } = assessment;
    if (panic >= 4)                                                      return POSTURES.DESPERATE;
    if (tier === 'REBUILDING' || dnaKey === 'ACCEPTOR')                  return POSTURES.SELLER;
    if (tier === 'ELITE' && panic <= 1)                                  return POSTURES.LOCKED;
    if ((tier === 'CONTENDER' || tier === 'CROSSROADS') && panic >= 2)   return POSTURES.BUYER;
    return POSTURES.NEUTRAL;
  }

  // ── calcPsychTaxes ─────────────────────────────────────────────
  // Calculate psychological tax modifiers (8 factors).
  // Returns array of { name, impact, type:'TAX'|'BONUS', desc }.
  function calcPsychTaxes(myAssessment, theirAssessment, theirDnaKey, theirPosture) {
    const taxes = [];

    // 1 - Endowment Effect
    const ePct = { FLEECER: 10, DOMINATOR: 28, STALWART: 20, ACCEPTOR: 5, DESPERATE: 15, NONE: 12 }[theirDnaKey] || 12;
    taxes.push({
      name: 'Endowment Effect', impact: -Math.round(ePct / 2), type: 'TAX',
      desc: `~${ePct}% mental inflation on their own players. Their side feels worth more than market.`
    });

    // 2 - Panic Premium
    if (theirAssessment?.panic >= 3) {
      taxes.push({
        name: 'Panic Premium', impact: 8 + (theirAssessment.panic - 2) * 6, type: 'BONUS',
        desc: `Panic ${theirAssessment.panic}/5 — urgency overrides normal caution.`
      });
    }

    // 3 - Status Tax (Dominator)
    if (theirDnaKey === 'DOMINATOR') {
      taxes.push({
        name: 'Status Tax', impact: -18, type: 'TAX',
        desc: 'Must visibly win the trade for ego/status. Frame it so they feel like the winner.'
      });
    }

    // 4 - Loss Aversion (Stalwart, Dominator)
    if (['STALWART', 'DOMINATOR'].includes(theirDnaKey)) {
      taxes.push({
        name: 'Loss Aversion', impact: -8, type: 'TAX',
        desc: 'Losing a familiar player hurts more than gaining a new one. Expect resistance.'
      });
    }

    // 5 - Rebuilding Discount (Acceptor)
    if (theirDnaKey === 'ACCEPTOR') {
      taxes.push({
        name: 'Rebuilding Discount', impact: +10, type: 'BONUS',
        desc: 'They mentally discount current starters. Buy at a discount in their mind.'
      });
    }

    // 6 - Need Fulfillment
    const myStrengths  = myAssessment?.strengths || [];
    const theirNeedPos = theirAssessment?.needs?.slice(0, 3).map(n => n.pos) || [];
    if (theirNeedPos.some(p => myStrengths.includes(p))) {
      taxes.push({
        name: 'Need Fulfillment', impact: +12, type: 'BONUS',
        desc: 'Your surplus fills their critical positional gap — strong deal motivation.'
      });
    }

    // 7 - Trade Window alignment
    if (myAssessment && theirAssessment) {
      if (myAssessment.window !== theirAssessment.window) {
        taxes.push({
          name: 'Window Alignment', impact: +8, type: 'BONUS',
          desc: 'Opposite windows (contender vs rebuilder) = natural asset exchange.'
        });
      } else {
        taxes.push({
          name: 'Window Friction', impact: -5, type: 'TAX',
          desc: 'Same trade window reduces natural motivation to exchange assets.'
        });
      }
    }

    // 8 - Posture
    if (theirPosture?.key === 'LOCKED') {
      taxes.push({
        name: 'Locked Roster Tax', impact: -12, type: 'TAX',
        desc: 'High satisfaction + attachment. Roster moves feel threatening to them.'
      });
    } else if (theirPosture?.key === 'SELLER') {
      taxes.push({
        name: 'Seller Momentum', impact: +10, type: 'BONUS',
        desc: 'Actively shopping. Trade conversations are welcomed.'
      });
    }

    return taxes;
  }

  // ── calcAcceptanceLikelihood ─────────────────────────────────
  // Canonical acceptance % for a trade offer.
  // myValue = DHQ total of what user GIVES, theirValue = what user RECEIVES.
  // Returns integer 3-95.
  //
  // CALIBRATION (Mar 2026):
  //   Fair trade (within 10%): 45-65% depending on DNA
  //   Overpay 20%: 70-85%        Overpay 50%+: 85-95%
  //   Underpay 20%: 15-25%       Underpay 50%+: under 10%
  //   Psych taxes CAPPED at ±15
  function calcAcceptanceLikelihood(myValue, theirValue, theirDnaKey, psychTaxes, myAssessment, theirAssessment, opts) {
    let likelihood = 50;
    const totalA = myValue;   // what I'm giving
    const totalB = theirValue; // what I'm receiving
    if (totalA > 0 && totalB > 0) {
      const diff = totalA - totalB;
      const maxSide = Math.max(totalA, totalB, 1);
      const nd = diff / maxSide; // +0.2 = I overpay 20%, -0.3 = I underpay 30%

      if (theirDnaKey === 'FLEECER') {
        // Only accept when they clearly win. Reject anything close to fair.
        likelihood = nd > 0.15
          ? Math.min(92, 70 + Math.round(nd * 80))
          : nd > 0 ? 35 + Math.round(nd * 200)
          : Math.max(3, 20 + Math.round(nd * 80));
      } else if (theirDnaKey === 'DOMINATOR') {
        // Need to feel like they won. Fair trades feel like losses.
        likelihood = nd > 0.10
          ? Math.min(85, 60 + Math.round(nd * 70))
          : nd > 0 ? 40 + Math.round(nd * 150)
          : Math.max(3, 25 + Math.round(nd * 100));
      } else if (theirDnaKey === 'STALWART') {
        // ONLY accept fair trades. ANY gap over 15% = rejection.
        const absGap = Math.abs(nd);
        likelihood = absGap <= 0.05 ? 65 :
                     absGap <= 0.10 ? 50 :
                     absGap <= 0.15 ? 30 :
                     absGap <= 0.25 ? 15 : 5;
      } else if (theirDnaKey === 'ACCEPTOR') {
        // More lenient but won't give away the farm.
        likelihood = nd >= 0
          ? Math.min(90, 55 + Math.round(nd * 100))
          : Math.max(5, 45 + Math.round(nd * 150));
      } else if (theirDnaKey === 'DESPERATE') {
        // Will overpay if the trade fills a critical need.
        const fitsNeed = theirAssessment?.needs?.some(n => (myAssessment?.strengths || []).includes(n.pos));
        const needBonus = fitsNeed ? 15 : 0;
        likelihood = nd >= 0
          ? Math.min(90, 50 + needBonus + Math.round(nd * 80))
          : Math.max(5, 35 + needBonus + Math.round(nd * 120));
      } else {
        // NONE / default — smooth sigmoid centered at 50%
        likelihood = Math.round(5 + 90 / (1 + Math.exp(-7 * nd)));
      }

      // Apply psych tax total — CAPPED at ±15 to prevent runaway inflation
      const rawTax = (psychTaxes || []).reduce((s, t) => s + t.impact, 0);
      const cappedTax = Math.max(-15, Math.min(15, rawTax));
      likelihood += cappedTax;

      // Complexity tax: multi-asset trades are harder to close
      const totalPieces = (opts?.totalPieces) || 0;
      if (totalPieces > 4) likelihood -= 5 * (totalPieces - 4);
    }
    return Math.round(Math.max(3, Math.min(95, likelihood)));
  }

  // ── fairnessGrade ──────────────────────────────────────────────
  // Ratio-based fairness grade. myValue = what user gives, theirValue = what user gets.
  // Returns { grade, label, color }.
  function fairnessGrade(myValue, theirValue) {
    if (myValue === 0 && theirValue === 0) return { grade: '--', label: '', color: '#95A5A6' };
    const ratio = theirValue / Math.max(myValue, 1); // >1 = user gains
    if (ratio >= 1.30) return { grade: 'A+', label: 'Steal',       color: '#2ECC71' };
    if (ratio >= 1.15) return { grade: 'A',  label: 'Clear Win',   color: '#2ECC71' };
    if (ratio >= 1.05) return { grade: 'B+', label: 'Slight Win',  color: '#2ECC71' };
    if (ratio >= 0.95) return { grade: 'B',  label: 'Fair',        color: '#D4AF37' };
    if (ratio >= 0.85) return { grade: 'C',  label: 'Slight Loss', color: '#F0A500' };
    if (ratio >= 0.75) return { grade: 'D',  label: 'Overpay',     color: '#E67E22' };
    return { grade: 'F', label: 'Bad Trade', color: '#E74C3C' };
  }

  // ── calcGrudgeTax ──────────────────────────────────────────────
  // DNA-weighted grudge modifier from trade history between two owners.
  // grudgesList = [{ myOwnerId, theirOwnerId, type, date }]
  // Returns { total: Number, entries: Array }.
  function calcGrudgeTax(myOwnerId, theirOwnerId, grudgesList, theirDnaKey) {
    if (!myOwnerId || !theirOwnerId || !grudgesList?.length) return { total: 0, entries: [] };
    const GRUDGE_TYPES = window.App?.GRUDGE_TYPES || {};
    const relevant = grudgesList.filter(g => g.myOwnerId === myOwnerId && g.theirOwnerId === theirOwnerId);
    const dnaMult = { FLEECER: 0.7, DOMINATOR: 1.6, STALWART: 1.2, ACCEPTOR: 0.8, DESPERATE: 0.5, NONE: 1.0 }[theirDnaKey] || 1.0;
    const now = Date.now();
    const grudgeDecay = d => d < 30 ? 1.0 : d < 60 ? 0.6 : d < 90 ? 0.3 : 0.1;
    let total = 0;
    for (const g of relevant) {
      const ageDays = (now - new Date(g.date).getTime()) / 86400000;
      total += (GRUDGE_TYPES[g.type]?.impact || 0) * grudgeDecay(ageDays) * dnaMult;
    }
    return { total: Math.round(total), entries: relevant.sort((a, b) => new Date(b.date) - new Date(a.date)) };
  }

  // ── Expose ────────────────────────────────────────────────────
  window.App.TradeEngine = {
    POSTURES,
    calcComplementarity,
    calcOwnerPosture,
    calcPsychTaxes,
    calcAcceptanceLikelihood,
    fairnessGrade,
    calcGrudgeTax,
  };
})();
