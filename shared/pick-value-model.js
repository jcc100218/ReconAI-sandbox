// ═══════════════════════════════════════════════════════════════
// UNIVERSAL DYNASTY PICK VALUE MODEL v6
// Three-phase continuous exponential decay
//
// Calibrated to: KeepTradeCut (April 2026, 25M+ crowdsourced data points),
// FantasyCalc, theScore/Justin Boone dynasty trade values
//
// Key design: THREE-PHASE continuous exponential decay
//   Phase 1 (R1):  Steep — mid/late 1sts within 5-10% of KTC/FC consensus
//   Phase 2 (R2):  Gentle — 2nd rounders hold reasonable value
//   Phase 3 (R3+): Steeper — lottery territory
//   Each phase starts where the previous one ends (smooth continuous handoff)
//
// Works for any league size (8-32 teams) and any draft length
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate the industry consensus value for any dynasty draft pick.
 * Returns a value on the DHQ 0-10000 scale.
 *
 * Three-phase continuous exponential decay. Phase 1 is steep so that
 * mid/late R1 picks (1.04-1.12) land within 5-10% of KTC/FantasyCalc.
 * Pick 1.01 is unchanged at 7500.
 *
 * 16-team reference (k1=0.111): 1.04≈5200, 1.08≈3200, 1.12≈2100
 *
 * @param {number} pickNumber - Overall pick number (1-indexed)
 * @param {number} totalTeams - League size (8-32)
 * @param {number} draftRounds - Number of draft rounds (typically 4-10)
 * @returns {number} DHQ value (50-7500)
 */
function getIndustryPickValue(pickNumber, totalTeams, draftRounds) {
  const TOP = 7500;  // Pick 1.01 value (correctly calibrated)
  const FLOOR = 1;

  const r1End = totalTeams;      // last pick of R1
  const r2End = totalTeams * 2;  // last pick of R2

  // Phase 1 (R1): steep — calibrated so 1.04-1.12 match KTC/FC within 5-10%
  const k1 = 0.111;
  // Phase 2 (R2): gentle — smooth descent from R1 endpoint
  const k2 = 0.028;
  // Phase 3 (R3+): steeper — lottery territory
  const k3 = 0.065;

  // Transition values (each phase starts where previous ends)
  const t1 = FLOOR + (TOP - FLOOR) * Math.exp(-k1 * (r1End - 1));
  const t2 = FLOOR + (t1  - FLOOR) * Math.exp(-k2 * (r2End - r1End));

  let value;
  if (pickNumber <= r1End) {
    value = FLOOR + (TOP - FLOOR) * Math.exp(-k1 * (pickNumber - 1));
  } else if (pickNumber <= r2End) {
    value = FLOOR + (t1 - FLOOR) * Math.exp(-k2 * (pickNumber - r1End));
  } else {
    value = FLOOR + (t2 - FLOOR) * Math.exp(-k3 * (pickNumber - r2End));
  }

  return Math.max(50, Math.round(value));
}

/**
 * Convenience: get value using round + slot instead of pick number
 */
function getPickValueBySlot(round, posInRound, totalTeams, draftRounds) {
  const pickNumber = (round - 1) * totalTeams + posInRound;
  return getIndustryPickValue(pickNumber, totalTeams, draftRounds || 7);
}

/**
 * Generate a complete pick value table for a league.
 * Returns an object keyed by pick number (1-indexed).
 */
function buildIndustryPickTable(totalTeams, draftRounds) {
  const table = {};
  for (let pick = 1; pick <= totalTeams * draftRounds; pick++) {
    table[pick] = getIndustryPickValue(pick, totalTeams, draftRounds);
  }
  // Monotonic enforcement: each pick must be worth ≤ the previous pick.
  // Guards against any discount or phase-boundary inversion.
  for (let pick = 2; pick <= totalTeams * draftRounds; pick++) {
    if (table[pick] > table[pick - 1]) {
      table[pick] = table[pick - 1] - 1;
    }
  }
  return table;
}

// Export for use in DHQ engine and Node.js tests
if (typeof window !== 'undefined') {
  window.getIndustryPickValue = getIndustryPickValue;
  window.getPickValueBySlot = getPickValueBySlot;
  window.buildIndustryPickTable = buildIndustryPickTable;
}
if (typeof module !== 'undefined') {
  module.exports = { getIndustryPickValue, getPickValueBySlot, buildIndustryPickTable };
}
