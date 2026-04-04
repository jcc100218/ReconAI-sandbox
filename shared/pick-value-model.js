// ═══════════════════════════════════════════════════════════════
// UNIVERSAL DYNASTY PICK VALUE MODEL v5
// Continuous curve — no artificial cliffs at round boundaries
//
// Calibrated to: Rich Hill NFL Draft Chart (curve shape),
// KeepTradeCut (April 2026, 25M+ crowdsourced data points),
// theScore/Justin Boone dynasty trade values, FantasyCalc
//
// Key design: TWO-PHASE continuous exponential decay
//   Phase 1 (R1-R2): Premium territory — gentler decay
//   Phase 2 (R3+):   Lottery territory — steeper decay
//   Smooth 5-6% transition between phases (no cliff)
//
// Works for any league size (8-32 teams) and any draft length
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate the industry consensus value for any dynasty draft pick.
 * Returns a value on the DHQ 0-10000 scale.
 * 
 * Uses a continuous exponential curve — NO round boundary cliffs.
 * Pick 2.01 is worth slightly less than 1.last (5-6% drop),
 * not a massive cliff like piecewise models produce.
 *
 * @param {number} pickNumber - Overall pick number (1-indexed)
 * @param {number} totalTeams - League size (8-32)
 * @param {number} draftRounds - Number of draft rounds (typically 4-10)
 * @returns {number} DHQ value (1-7500)
 */
function getIndustryPickValue(pickNumber, totalTeams, draftRounds) {
  const TOP = 7500;    // Pick 1 value
  const FLOOR = 1;     // Minimum value
  const transition = totalTeams * 2; // Phase shift at end of R2

  // Phase 1 decay: calibrated so end of R2 ≈ 1400-1600
  // 7500 * exp(-0.052 * 31) ≈ 1500 for 16-team
  const k1 = 0.052;

  // Phase 2 decay: steeper — R3 decays to ~500 by end, R4+ to ~150
  const k2 = 0.065;

  let value;
  if (pickNumber <= transition) {
    // Phase 1: Premium picks (R1-R2 territory)
    value = FLOOR + (TOP - FLOOR) * Math.exp(-k1 * (pickNumber - 1));
  } else {
    // Phase 2: Lottery picks (R3+ territory)
    // Start from where Phase 1 ends — smooth handoff
    const transVal = FLOOR + (TOP - FLOOR) * Math.exp(-k1 * (transition - 1));
    value = FLOOR + (transVal - FLOOR) * Math.exp(-k2 * (pickNumber - transition));
  }

  return Math.max(1, Math.round(value));
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
