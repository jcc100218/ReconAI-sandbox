// ═══════════════════════════════════════════════════════════════
// UNIVERSAL DYNASTY PICK VALUE MODEL
// Every pick from 1.01 to 7.last gets a specific, consistent value
// 
// Calibrated to: Rich Hill NFL Draft Chart (curve shape),
// KeepTradeCut (April 2026 market data), theScore/Justin Boone,
// FantasyCalc, DynastyProcess
//
// This is the INDUSTRY BASELINE used in the blended pick value
// formula. League-specific data adjusts from this baseline.
//
// Usage: const value = getIndustryPickValue(round, posInRound, totalTeams);
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate the industry consensus value for any dynasty draft pick.
 * Returns a value on the DHQ 0-10000 scale.
 * 
 * @param {number} round - Draft round (1-7)
 * @param {number} posInRound - Position within round (1 to totalTeams)
 * @param {number} totalTeams - League size (8-32)
 * @returns {number} DHQ value (1-7500)
 */
function getIndustryPickValue(round, posInRound, totalTeams) {
  // Round anchor values (start and end of each round)
  // Calibrated to KTC Superflex April 2026 market data
  const ROUND_START = { 1: 7500, 2: 3000, 3: 1000, 4: 300, 5: 80, 6: 30, 7: 10 };
  const ROUND_END   = { 1: 4200, 2: 1400, 3: 400,  4: 100, 5: 40, 6: 15, 7: 1  };

  const start = ROUND_START[round] || 10;
  const end = ROUND_END[round] || 1;

  // Convex interpolation using exponential decay (Hill chart shape)
  // Early picks in each round are worth disproportionately more
  const pct = (posInRound - 1) / Math.max(1, totalTeams - 1); // 0 to 1
  const decay = 2.5; // Controls front-loading within each round
  const rawPct = 1 - Math.exp(-decay * pct);
  const maxPct = 1 - Math.exp(-decay * 1.0);
  const normPct = rawPct / maxPct;

  return Math.max(1, Math.round(start - (start - end) * normPct));
}

/**
 * Generate a complete pick value table for a league.
 * Returns an object keyed by pick number (1-indexed).
 * 
 * @param {number} totalTeams - League size (8-32)
 * @param {number} draftRounds - Number of draft rounds (typically 4-7)
 * @returns {Object} Pick values keyed by pick number
 */
function buildIndustryPickTable(totalTeams, draftRounds) {
  const table = {};
  for (let pick = 1; pick <= totalTeams * draftRounds; pick++) {
    const rd = Math.ceil(pick / totalTeams);
    const pos = ((pick - 1) % totalTeams) + 1;
    table[pick] = getIndustryPickValue(rd, pos, totalTeams);
  }
  return table;
}

// Export for use in DHQ engine
if (typeof window !== 'undefined') {
  window.getIndustryPickValue = getIndustryPickValue;
  window.buildIndustryPickTable = buildIndustryPickTable;
}
if (typeof module !== 'undefined') {
  module.exports = { getIndustryPickValue, buildIndustryPickTable };
}

