// ══════════════════════════════════════════════════════════════════
// shared/utils.js — Shared utility functions for Fantasy Wars
// Used by both War Room Scout and War Room
// Requires: shared/constants.js loaded first
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

// ── Position normalization ───────────────────────────────────────
// Collapses granular NFL positions into fantasy-relevant groups.
// DE/DT/NT/IDL/EDGE → DL,  CB/S/SS/FS → DB,  OLB/ILB/MLB → LB
function normPos(pos) {
    if (!pos) return null;
    if (['DB', 'CB', 'S', 'SS', 'FS'].includes(pos))          return 'DB';
    if (['DL', 'DE', 'DT', 'NT', 'IDL', 'EDGE'].includes(pos)) return 'DL';
    if (['LB', 'OLB', 'ILB', 'MLB'].includes(pos))            return 'LB';
    return pos; // QB, RB, WR, TE, K, etc.
}

// ── Position colors ─────────────────────────────────────────────
// Delegates to App.POS_COLORS (owned by constants.js) so there is
// a single source of truth for position colors across both apps.
// constants.js MUST load before utils.js.
function posColor(pos) {
    return (window.App?.POS_COLORS?.[pos]) || 'var(--silver)';
}

// ── Position sort order ─────────────────────────────────────────
const POS_ORDER = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DL: 5, LB: 6, DB: 7 };

// ── Depth chart position list ───────────────────────────────────
const DEPTH_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

// ── Raw fantasy points from a stats row ─────────────────────────
// If a custom scoring map is provided, dot-product stats × weights.
// Otherwise fall back to pre-computed columns (half → ppr → std).
function calcRawPts(stats, scoring) {
    if (!stats) return null;
    if (scoring) {
        let t = 0;
        for (const [f, w] of Object.entries(scoring)) {
            if (typeof w !== 'number') continue;
            if (stats[f] != null) t += Number(stats[f]) * w;
        }
        return t;
    }
    const p = stats.pts_half_ppr ?? stats.pts_ppr ?? stats.pts_std ?? null;
    return p !== null ? Number(p) : null;
}

// ── Elite player detection (top-5-at-position) ─────────────────
function isElitePlayer(pid) {
  const scores = window.App?.LI?.playerScores || {};
  const meta = window.App?.LI?.playerMeta || {};
  const pos = meta[pid]?.pos || '';
  if (!pos || !scores[pid]) return false;
  // Get all players at this position, sorted by DHQ
  const atPos = Object.entries(scores)
    .filter(([p]) => (meta[p]?.pos || '') === pos)
    .sort((a, b) => b[1] - a[1]);
  const rank = atPos.findIndex(([p]) => p === String(pid));
  return rank >= 0 && rank < 5;
}

function countElitePlayers(pids) {
  return (pids || []).filter(pid => isElitePlayer(String(pid))).length;
}

// ── dhqLog — structured error logging ────────────────────────────
// Replaces empty catch(e){} blocks with visible, filterable output.
// Always uses console.warn so errors surface in DevTools without crashing.
function dhqLog(context, err, extra) {
  const tag = `[DHQ:${context}]`;
  if (err instanceof Error) {
    console.warn(tag, err.message, extra !== undefined ? extra : '');
  } else {
    console.warn(tag, err !== undefined ? err : '', extra !== undefined ? extra : '');
  }
}

// ── Expose on App namespace ─────────────────────────────────────
window.App.normPos            = normPos;
window.App.posColor           = posColor;
window.App.POS_ORDER          = POS_ORDER;
window.App.DEPTH_POSITIONS    = DEPTH_POSITIONS;
window.App.calcRawPts         = calcRawPts;
window.App.isElitePlayer      = isElitePlayer;
window.App.countElitePlayers  = countElitePlayers;

// ── Expose as bare globals for inline handlers / legacy code ────
window.normPos            = normPos;
window.posColor           = posColor;
window.POS_ORDER          = POS_ORDER;
window.DEPTH_POSITIONS    = DEPTH_POSITIONS;
window.calcRawPts         = calcRawPts;
window.isElitePlayer      = isElitePlayer;
window.countElitePlayers  = countElitePlayers;
window.dhqLog             = dhqLog;
window.App.dhqLog         = dhqLog;

// ── League-Aware Position Helper ──
// ONE function that EVERY filter, button list, and pool builder calls.
// No more hardcoded position arrays anywhere.
function getLeaguePositions(opts) {
  opts = opts || {};
  const league = opts.league || window.S?.leagues?.find(l => l.league_id === window.S?.currentLeagueId) || window.S?.league;
  const rp = league?.roster_positions || [];

  // Base offensive positions (always present in fantasy)
  const positions = ['QB', 'RB', 'WR', 'TE'];

  // K — only if league rosters kickers
  if (rp.some(s => s === 'K')) positions.push('K');

  // IDP — only if league has IDP slots
  if (rp.some(s => ['DL','DE','DT','LB','DB','CB','S','SS','FS','IDP_FLEX'].includes(s))) {
    positions.push('DL', 'LB', 'DB');
  }

  // Return formats based on opts
  if (opts.asSet) return new Set(positions);
  if (opts.withAll) return ['All', ...positions]; // for filter button lists
  if (opts.withBlank) return ['', ...positions];  // for filter with blank = ALL
  return positions;
}

// Also expose a normPos-safe check
function isValidLeaguePosition(pos) {
  const np = typeof normPos === 'function' ? normPos(pos) : pos;
  if (!np) return false;
  return getLeaguePositions({ asSet: true }).has(np);
}

window.getLeaguePositions = getLeaguePositions;
window.isValidLeaguePosition = isValidLeaguePosition;
window.App.getLeaguePositions = getLeaguePositions;
window.App.isValidLeaguePosition = isValidLeaguePosition;
