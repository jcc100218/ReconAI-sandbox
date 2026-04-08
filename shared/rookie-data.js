// ══════════════════════════════════════════════════════════════════
// shared/rookie-data.js — CANONICAL Rookie Prospect Data Source
// Single source of truth for both War Room and Scout.
// Loads CSV prospect data, computes tiers/grades/scores, and exposes
// findProspect/getProspects for any league to consume.
//
// REPLACES: warroom/draft-war-room/csv-loader.js (deleted)
// CONSUMED BY: warroom/js/draft-room.js, warroom/js/mock-draft.js,
//              reconai/js/draft-ui.js, reconai/js/ai-chat.js
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

const ROOKIE_DATA_BASE = 'https://cdn.jsdelivr.net/gh/jcc100218/warroom@main/draft-war-room';
const _rookieCache = { loaded: false, prospects: {}, byName: {}, count: 0 };

// ── Position mapping (canonical — used by both apps) ──────────
const _RD_POS_MAP = {
  EDGE: 'DL', ED: 'DL', DE: 'DL', DT: 'DL', IDL: 'DL', NT: 'DL',
  ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB',
  OT: 'OL', IOL: 'OL', OG: 'OL', G: 'OL', C: 'OL', T: 'OL',
};
function _rdNormPos(pos) {
  // Delegate to canonical normPos if available, otherwise use local map
  if (typeof window.App?.normPos === 'function') return window.App.normPos(pos);
  return _RD_POS_MAP[pos] || pos;
}

// ── Veteran offsets: how many established vets go before #1 rookie in startups ──
const VET_OFFSETS = {
  QB: 10, RB: 6, WR: 10, TE: 5, K: 3,
  DL: 12, LB: 10, DB: 12, OL: 20,
};

// ── Fantasy value multipliers (dynasty PPR) ───────────────────
const FANTASY_MULT = {
  QB: 2.0, RB: 1.9, WR: 1.75, TE: 1.5, K: 0.5,
  DL: 0.35, LB: 0.30, DB: 0.25, OL: 0.15,
  // Raw position variants (used by csv-loader grade calc)
  DE: 0.35, EDGE: 0.35, DT: 0.2, IDL: 0.2, NT: 0.2,
  ILB: 0.30, OLB: 0.35, MLB: 0.30,
  CB: 0.25, S: 0.25, FS: 0.25, SS: 0.25,
  OT: 0.15, IOL: 0.15, OG: 0.15, G: 0.15, C: 0.15, T: 0.15,
  P: 0.2,
};

// ── NFL draft value multipliers (not fantasy — real-draft capital) ─
const DRAFT_POS_VALUES = {
  QB: 1.5, EDGE: 1.3, DE: 1.3, OT: 1.25, T: 1.25, WR: 1.2,
  CB: 1.15, DT: 1.1, DL: 1.1, IDL: 1.1, LB: 1.05, ILB: 1.05,
  OLB: 1.05, S: 1.0, TE: 0.95, IOL: 0.9, OG: 0.9, G: 0.9,
  C: 0.9, RB: 0.85, K: 0.5, P: 0.5,
};

// ── Tier/Grade calculations (merged from csv-loader.js) ───────
function _calcTier(rank) {
  if (rank <= 5) return 'ELITE';
  if (rank <= 15) return 'BLUE_CHIP';
  if (rank <= 32) return 'R1';
  if (rank <= 64) return 'R2';
  if (rank <= 100) return 'R3';
  if (rank <= 160) return 'DAY3';
  return 'UDFA';
}

function _calcTierNum(rank) {
  if (rank <= 10) return 1;
  if (rank <= 32) return 2;
  if (rank <= 64) return 3;
  if (rank <= 100) return 4;
  if (rank <= 150) return 5;
  if (rank <= 224) return 6;
  return 7;
}

function _calcGrade(rank) {
  if (rank <= 5) return +(9.0 + (6 - rank) * 0.2).toFixed(1);
  if (rank <= 10) return +(8.5 + (11 - rank) * 0.1).toFixed(1);
  if (rank <= 32) return +(7.0 + (33 - rank) * 0.07).toFixed(1);
  if (rank <= 64) return +(6.0 + (65 - rank) * 0.03).toFixed(1);
  if (rank <= 100) return +(5.0 + (101 - rank) * 0.03).toFixed(1);
  if (rank <= 224) return +(3.0 + (225 - rank) * 0.016).toFixed(1);
  return +Math.max(1.0, 3.0 - (rank - 224) * 0.01).toFixed(1);
}

function _calcDraftScore(rank, pos) {
  const posValue = DRAFT_POS_VALUES[pos] || 1.0;
  const baseScore = Math.max(0, (250 - rank) / 25);
  return Math.round(baseScore * posValue * 100) / 100;
}

function _calcFantasyDraftScore(rank, pos, customMult) {
  const mult = customMult || FANTASY_MULT[pos] || 0.3;
  return Math.round((500 - Math.min(rank, 500)) * mult);
}

// ── CSV parser (handles quoted fields with commas) ─────────────
function _parseCSV(text) {
  const lines = text.trim().split('\n');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

// ══════════════════════════════════════════════════════════════════
// MAIN LOADER — fetches CSVs, builds unified prospect cache
// ══════════════════════════════════════════════════════════════════
async function loadRookieProspects() {
  if (_rookieCache.loaded) return _rookieCache;

  try {
    const [dbRes, rankRes, enrichRes] = await Promise.allSettled([
      fetch(`${ROOKIE_DATA_BASE}/data/mock_draft_db.csv`).then(r => r.ok ? r.text() : ''),
      fetch(`${ROOKIE_DATA_BASE}/player.csv`).then(r => r.ok ? r.text() : ''),
      fetch(`${ROOKIE_DATA_BASE}/player-enrichment.csv`).then(r => r.ok ? r.text() : ''),
    ]);

    const dbRows = _parseCSV(dbRes.status === 'fulfilled' ? dbRes.value : '');
    const rankRows = _parseCSV(rankRes.status === 'fulfilled' ? rankRes.value : '');
    const enrichRows = _parseCSV(enrichRes.status === 'fulfilled' ? enrichRes.value : '');

    // Build lookups
    const enrichByName = {};
    enrichRows.forEach(r => { if (r.name) enrichByName[r.name.toLowerCase().trim()] = r; });
    const rankByName = {};
    rankRows.forEach(r => { if (r.Name) rankByName[r.Name.toLowerCase().trim()] = r; });

    // Build unified prospect list
    const prospects = {};
    dbRows.forEach(row => {
      const name = row['Player Name'] || '';
      if (!name) return;
      const key = name.toLowerCase().trim();
      const rawPos = row.Position || '';
      const mappedPos = _rdNormPos(rawPos);
      const rank = parseInt(row.Rank) || 999;
      const college = row.College || '';

      const enrich = enrichByName[key] || {};
      const ranking = rankByName[key] || {};
      const consensusRank = parseInt(ranking.Rank) || rank;
      const avgRank = parseFloat(ranking.Avg) || rank;

      const tier = _calcTier(consensusRank);
      const tierNum = _calcTierNum(consensusRank);
      const grade = _calcGrade(consensusRank);
      const isGenerational = consensusRank <= 5 && grade >= 9.0;
      const nflDraftScore = _calcDraftScore(consensusRank, rawPos);

      const customMult = parseFloat(enrich.fantasyMultiplier) || null;
      const fantasyMult = customMult || FANTASY_MULT[mappedPos] || 0.3;
      const draftScore = _calcFantasyDraftScore(consensusRank, rawPos, customMult);
      const fantasyRank = Math.round(consensusRank / fantasyMult);

      // Source rankings (from player.csv columns)
      const sources = [];
      ['ATH', 'BR', 'CBS', 'DT', 'ESPN', 'PFF', 'PFN', 'SIS', 'Tank', 'SD'].forEach(src => {
        const val = parseInt(ranking[src]);
        if (val > 0) sources.push({ source: src, rank: val });
      });

      prospects[key] = {
        name,
        pos: rawPos,
        mappedPos,
        college: enrich.school || college,
        rank: consensusRank,
        avgRank,
        tier,
        tierNum,
        grade,
        isGenerational,
        nflDraftScore,
        draftScore,
        fantasyMult,
        fantasyRank,
        sources,
        sourceCount: sources.length,
        size: enrich.size || '',
        weight: enrich.weight || '',
        speed: enrich.speed || '',
        summary: (enrich.summary || '').substring(0, 500),
        espnId: enrich.espn_id || '',
        photoUrl: enrich.photo_url || '',
        year: enrich.year || '',
        previousRank: parseInt(enrich.Rank) || null,
      };
    });

    // Compute rookiePosRank (position rank among all rookies, by consensus rank)
    const byMappedPos = {};
    Object.values(prospects).forEach(p => {
      const mp = p.mappedPos || p.pos;
      if (!byMappedPos[mp]) byMappedPos[mp] = [];
      byMappedPos[mp].push(p);
    });
    Object.values(byMappedPos).forEach(arr => {
      arr.sort((a, b) => a.rank - b.rank);
      arr.forEach((p, i) => { p.rookiePosRank = i + 1; });
    });

    _rookieCache.prospects = prospects;
    _rookieCache.byName = prospects;
    _rookieCache.loaded = true;
    _rookieCache.count = Object.keys(prospects).length;

    console.log(`[RookieData] Loaded ${_rookieCache.count} prospects (${rankRows.length} ranked, ${enrichRows.length} enriched)`);
    return _rookieCache;
  } catch (e) {
    console.warn('[RookieData] Failed to load:', e);
    _rookieCache.loaded = true;
    return _rookieCache;
  }
}

// ══════════════════════════════════════════════════════════════════
// DYNASTY VALUE — slot rookies into the DHQ position ladder
// Computed lazily (only when DHQ engine has loaded)
// ══════════════════════════════════════════════════════════════════

// Build sorted DHQ ladder for a position from the engine's playerScores
function _getPositionLadder(pos) {
  const scores = window.App?.LI?.playerScores;
  const meta = window.App?.LI?.playerMeta;
  if (!scores || !meta) return [];
  return Object.entries(scores)
    .filter(([pid]) => meta[pid]?.pos === pos && scores[pid] > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([, val]) => val);
}

// Compute startup dynasty value for a prospect
function _computeStartupValue(prospect) {
  const pos = prospect.mappedPos || prospect.pos;
  const posRank = prospect.rookiePosRank || 999;
  const vetOffset = VET_OFFSETS[pos] || 10;
  const startupPosRank = posRank + vetOffset;

  const ladder = _getPositionLadder(pos);
  if (!ladder.length) return prospect.draftScore || 0; // No DHQ data yet

  // Clamp to ladder length
  const idx = Math.min(startupPosRank - 1, ladder.length - 1);
  return ladder[idx] || ladder[ladder.length - 1] || prospect.draftScore || 0;
}

// Enrich a prospect with dynasty value if DHQ engine is loaded
function _enrichWithDynastyValue(p) {
  if (!p || p._dynastyComputed) return p;
  if (!window.App?.LI?.playerScores) return p; // Engine not loaded yet
  p.dynastyValue = _computeStartupValue(p);
  p._dynastyComputed = true;
  return p;
}

// ── Lookup functions ──────────────────────────────────────────
function findProspect(name) {
  if (!name || !_rookieCache.loaded) return null;
  const key = name.toLowerCase().trim();
  let match = _rookieCache.byName[key] || null;
  // Partial match (last name + first initial)
  if (!match) {
    const parts = key.split(' ');
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1];
      for (const [k, v] of Object.entries(_rookieCache.byName)) {
        if (k.endsWith(lastName) && k.includes(parts[0])) { match = v; break; }
      }
    }
  }
  return match ? _enrichWithDynastyValue(match) : null;
}

function getProspects(pos) {
  if (!_rookieCache.loaded) return [];
  const all = Object.values(_rookieCache.prospects).map(_enrichWithDynastyValue);
  if (!pos) return all.sort((a, b) => a.rank - b.rank);
  const mapped = _rdNormPos(pos);
  return all.filter(p => p.mappedPos === mapped || p.pos === pos).sort((a, b) => a.rank - b.rank);
}

function getIDPProspects() {
  if (!_rookieCache.loaded) return [];
  return Object.values(_rookieCache.prospects)
    .filter(p => ['DL', 'LB', 'DB'].includes(p.mappedPos))
    .sort((a, b) => a.rank - b.rank);
}

// ── Exports ───────────────────────────────────────────────────
Object.assign(window.App, { loadRookieProspects, findProspect, getProspects, getIDPProspects });
window.loadRookieProspects = loadRookieProspects;
window.findProspect = findProspect;
window.getProspects = getProspects;
window.getIDPProspects = getIDPProspects;
