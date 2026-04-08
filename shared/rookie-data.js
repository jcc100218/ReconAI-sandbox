// ══════════════════════════════════════════════════════════════════
// shared/rookie-data.js — Rookie Prospect Data Bridge
// Loads War Room CSV prospect data and makes it available to both apps.
// Provides scouting summaries, consensus rankings, and physical attributes
// for rookie prospects that may not exist in FantasyCalc or Sleeper.
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

const ROOKIE_DATA_BASE = 'https://raw.githubusercontent.com/jcc100218/warroom/main/draft-war-room';
const _rookieCache = { loaded: false, prospects: {}, byName: {} };

// Position mapping for IDP
const POS_MAP = {
  EDGE: 'DL', ED: 'DL', DE: 'DL', DT: 'DL', IDL: 'DL', NT: 'DL',
  ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB',
  OT: 'OL', IOL: 'OL', OG: 'OL', G: 'OL', C: 'OL', T: 'OL',
};
function normPos(pos) { return POS_MAP[pos] || pos; }

// Fantasy value multipliers by position (dynasty PPR context)
const FANTASY_MULT = {
  QB: 2.0, RB: 1.9, WR: 1.75, TE: 1.5, K: 0.5,
  DL: 0.35, LB: 0.30, DB: 0.25, OL: 0.15,
};

function _parseCSV(text) {
  const lines = text.trim().split('\n');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
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

async function loadRookieProspects() {
  if (_rookieCache.loaded) return _rookieCache;

  try {
    // Fetch all three CSVs in parallel
    const [dbRes, rankRes, enrichRes] = await Promise.allSettled([
      fetch(`${ROOKIE_DATA_BASE}/data/mock_draft_db.csv`).then(r => r.ok ? r.text() : ''),
      fetch(`${ROOKIE_DATA_BASE}/player.csv`).then(r => r.ok ? r.text() : ''),
      fetch(`${ROOKIE_DATA_BASE}/player-enrichment.csv`).then(r => r.ok ? r.text() : ''),
    ]);

    const dbRows = _parseCSV(dbRes.status === 'fulfilled' ? dbRes.value : '');
    const rankRows = _parseCSV(rankRes.status === 'fulfilled' ? rankRes.value : '');
    const enrichRows = _parseCSV(enrichRes.status === 'fulfilled' ? enrichRes.value : '');

    // Build enrichment lookup by name (case-insensitive)
    const enrichByName = {};
    enrichRows.forEach(r => {
      if (r.name) enrichByName[r.name.toLowerCase()] = r;
    });

    // Build ranking lookup by name
    const rankByName = {};
    rankRows.forEach(r => {
      if (r.Name) rankByName[r.Name.toLowerCase()] = r;
    });

    // Build unified prospect list from mock_draft_db (most complete list)
    const prospects = {};
    dbRows.forEach(row => {
      const name = row['Player Name'] || '';
      if (!name) return;
      const key = name.toLowerCase();
      const rawPos = row.Position || '';
      const mappedPos = normPos(rawPos);
      const rank = parseInt(row.Rank) || 999;
      const college = row.College || '';

      // Merge enrichment data
      const enrich = enrichByName[key] || {};
      const ranking = rankByName[key] || {};
      const consensusRank = parseInt(ranking.Rank) || rank;
      const avgRank = parseFloat(ranking.Avg) || rank;

      // Calculate tier from rank
      let tier;
      if (consensusRank <= 5) tier = 'ELITE';
      else if (consensusRank <= 15) tier = 'BLUE_CHIP';
      else if (consensusRank <= 32) tier = 'R1';
      else if (consensusRank <= 64) tier = 'R2';
      else if (consensusRank <= 100) tier = 'R3';
      else if (consensusRank <= 160) tier = 'DAY3';
      else tier = 'UDFA';

      // Fantasy score from rank + position multiplier
      const mult = FANTASY_MULT[mappedPos] || 0.5;
      const fantasyMult = parseFloat(enrich.fantasyMultiplier) || mult;
      const draftScore = Math.round((500 - Math.min(rank, 500)) * fantasyMult);

      prospects[key] = {
        name,
        pos: rawPos,
        mappedPos,
        college: enrich.school || college,
        rank: consensusRank,
        avgRank,
        tier,
        draftScore,
        fantasyMult,
        size: enrich.size || '',
        weight: enrich.weight || '',
        speed: enrich.speed || '',
        summary: (enrich.summary || '').substring(0, 300),
        espnId: enrich.espn_id || '',
        year: enrich.year || 'Junior',
      };
    });

    _rookieCache.prospects = prospects;
    _rookieCache.byName = prospects; // Same ref, keyed by lowercase name
    _rookieCache.loaded = true;
    _rookieCache.count = Object.keys(prospects).length;

    console.log(`[RookieData] Loaded ${_rookieCache.count} prospects (${rankRows.length} ranked, ${enrichRows.length} enriched)`);
    return _rookieCache;
  } catch (e) {
    console.warn('[RookieData] Failed to load rookie data:', e);
    _rookieCache.loaded = true; // Don't retry
    return _rookieCache;
  }
}

// Look up a prospect by name (fuzzy match)
function findProspect(name) {
  if (!name || !_rookieCache.loaded) return null;
  const key = name.toLowerCase().trim();
  // Exact match
  if (_rookieCache.byName[key]) return _rookieCache.byName[key];
  // Partial match (last name)
  const parts = key.split(' ');
  if (parts.length >= 2) {
    const lastName = parts[parts.length - 1];
    for (const [k, v] of Object.entries(_rookieCache.byName)) {
      if (k.endsWith(lastName) && k.includes(parts[0])) return v;
    }
  }
  return null;
}

// Get all prospects, optionally filtered by position
function getProspects(pos) {
  if (!_rookieCache.loaded) return [];
  const all = Object.values(_rookieCache.prospects);
  if (!pos) return all.sort((a, b) => a.rank - b.rank);
  const mapped = normPos(pos);
  return all.filter(p => p.mappedPos === mapped || p.pos === pos).sort((a, b) => a.rank - b.rank);
}

// Get IDP-only prospects
function getIDPProspects() {
  if (!_rookieCache.loaded) return [];
  return Object.values(_rookieCache.prospects)
    .filter(p => ['DL', 'LB', 'DB'].includes(p.mappedPos))
    .sort((a, b) => a.rank - b.rank);
}

// Exports
Object.assign(window.App, { loadRookieProspects, findProspect, getProspects, getIDPProspects });
window.loadRookieProspects = loadRookieProspects;
window.findProspect = findProspect;
window.getProspects = getProspects;
window.getIDPProspects = getIDPProspects;
