// ══════════════════════════════════════════════════════════════════
// shared/mfl-api.js — MyFantasyLeague connector
// Fetches MFL league data and maps it to Sleeper-equivalent format
// so all existing ReconAI/WarRoom features work without modification.
//
// window.MFL exposes:
//   fetchLeague(leagueId, year, apiKey) → { league, rosters, players }
//   mapToSleeperState(raw, leagueId, year) → { players, rosters, league, leagueUsers }
//   buildCrosswalk(sleeperPlayers, mflPlayers, year) → MFL playerId → Sleeper pid map
//   connectLeague(leagueId, year, apiKey, myFranchiseId) → populates window.S
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

(function () {
'use strict';

const MFL_BASE = 'https://api.myfantasyleague.com';

// MFL scoring rule name → Sleeper scoring key
const MFL_SCORE_MAP = {
  'PASS_YDS':        'pass_yd',
  'PASS_TDS':        'pass_td',
  'PASS_INT':        'pass_int',
  'RUSH_YDS':        'rush_yd',
  'RUSH_TDS':        'rush_td',
  'REC_YDS':         'rec_yd',
  'REC_TDS':         'rec_td',
  'RECEPTIONS':      'rec',
  'FUML':            'fum_lost',
  '2PT_CONVERSION':  'bonus_2pt_off',
  'SACK':            'idp_sack',
  'INT':             'idp_int',
  'FUMB_REC':        'idp_fum_rec',
  'SAFETY':          'idp_safe',
  'TD':              'idp_def_td',
  'TACKLE_SOLO':     'idp_solo',
  'TACKLE_ASSIST':   'idp_ast',
  'PASS_DEFENDED':   'idp_pass_def',
};

// MFL player status → Sleeper-style slot classification
// ROSTER = normal, INJURED_RESERVE = IR, TAXI_SQUAD = taxi
const MFL_ROSTER_STATUS = {
  'ROSTER':           'active',
  'INJURED_RESERVE':  'ir',
  'TAXI_SQUAD':       'taxi',
  'PRACTICE_SQUAD':   'taxi',
};

// MFL NFL team abbreviations are mostly identical to Sleeper's;
// map the few that differ
const MFL_TEAM_MAP = {
  'ARZ': 'ARI',
  'BLT': 'BAL',
  'CLV': 'CLE',
  'HST': 'HOU',
  'KCC': 'KC',
  'NOS': 'NO',
  'NEP': 'NE',
  'NWE': 'NE',
  'NYG': 'NYG',
  'NYJ': 'NYJ',
  'SFO': 'SF',
  'TBB': 'TB',
  'GBP': 'GB',
  'SLC': 'LAR',
  'RAM': 'LAR',
  'SDC': 'LAC',
  'OAK': 'LV',
  'LVR': 'LV',
  'JAX': 'JAC',
  'FA':  'FA',
};

function _normTeam(t) {
  if (!t) return 'FA';
  const u = t.toUpperCase();
  return MFL_TEAM_MAP[u] || u;
}

// ── Crosswalk cache ───────────────────────────────────────────────
let _crosswalk = null;
let _crosswalkYear = null;

// ── Fetch helpers ─────────────────────────────────────────────────

function _mflUrl(year, type, leagueId, apiKey, extra) {
  let url = `${MFL_BASE}/${year}/export?TYPE=${type}&L=${leagueId}&JSON=1`;
  if (apiKey) url += '&APIKEY=' + encodeURIComponent(apiKey);
  if (extra) url += '&' + extra;
  return url;
}

async function _mflGet(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('This MFL league is private. Provide your API key to connect.');
    }
    throw new Error('MFL API error ' + res.status + '. Check your League ID and year.');
  }
  return res.json();
}

/**
 * Fetch all data needed to populate window.S.
 * Returns { leagueData, rostersData, playersData }
 */
async function fetchLeague(leagueId, year, apiKey) {
  const [leagueData, rostersData, playersData] = await Promise.all([
    _mflGet(_mflUrl(year, 'league', leagueId, apiKey)),
    _mflGet(_mflUrl(year, 'rosters', leagueId, apiKey)),
    _mflGet(_mflUrl(year, 'players', leagueId, apiKey, 'DETAILS=1')),
  ]);
  return { leagueData, rostersData, playersData };
}

// ── Data mappers ──────────────────────────────────────────────────

/**
 * Parse MFL player name "LastName, FirstName" → { full_name, first_name, last_name }
 */
function _parseMFLName(nameStr) {
  const parts = (nameStr || '').split(',').map(s => s.trim());
  if (parts.length >= 2) {
    return {
      full_name: parts[1] + ' ' + parts[0],
      first_name: parts[1],
      last_name: parts[0],
    };
  }
  return { full_name: nameStr || '', first_name: '', last_name: nameStr || '' };
}

/**
 * Map an MFL player entry → Sleeper-compatible player object.
 * player_id is set to 'mfl_{id}' initially; crosswalk resolves to Sleeper ID later.
 */
function mapMFLPlayer(p) {
  if (!p || !p.id) return null;
  const { full_name, first_name, last_name } = _parseMFLName(p.name);
  const team = _normTeam(p.team);
  return {
    player_id: 'mfl_' + p.id,
    _mfl_id: p.id,
    full_name,
    first_name,
    last_name,
    position: (p.position || '').toUpperCase(),
    team,
    age: parseInt(p.age) || 0,
    years_exp: p.draft_year ? (parseInt(year || new Date().getFullYear()) - parseInt(p.draft_year)) : 0,
    injury_status: p.injury_status || '',
  };
}

/**
 * Map an MFL franchise + its roster entries → Sleeper-compatible roster object.
 * crosswalk: Map<mflId, sleeperId>
 */
function mapMFLRoster(franchise, rosterEntries, crosswalk) {
  const players = [];
  const starters = [];
  const reserve = [];
  const taxi = [];

  (rosterEntries || []).forEach(entry => {
    const mflId = entry.id;
    if (!mflId) return;
    const pid = (crosswalk && crosswalk[mflId]) ? crosswalk[mflId] : 'mfl_' + mflId;
    players.push(pid);
    const status = (entry.status || 'ROSTER').toUpperCase();
    if (status === 'INJURED_RESERVE') {
      reserve.push(pid);
    } else if (status === 'TAXI_SQUAD' || status === 'PRACTICE_SQUAD') {
      taxi.push(pid);
    }
    // ROSTER players are in players[] — no separate starters list for MFL (no lineup data in rosters export)
  });

  return {
    roster_id: franchise.id,
    owner_id: franchise.id, // MFL uses franchise ID as owner identifier
    players,
    starters: [], // MFL doesn't expose lineup decisions in the rosters export
    reserve,
    taxi,
    settings: {
      wins: parseInt(franchise.h2hw || 0),
      losses: parseInt(franchise.h2hl || 0),
      ties: parseInt(franchise.h2ht || 0),
      fpts: parseFloat(franchise.pf || 0),
      fpts_decimal: 0,
      fpts_against: parseFloat(franchise.pa || 0),
      fpts_against_decimal: 0,
    },
    _owner_name: franchise.owner_name || franchise.name || ('Team ' + franchise.id),
    _team_name: franchise.name || ('Team ' + franchise.id),
    _team_abbrev: franchise.abbrev || '',
  };
}

/**
 * Map MFL league export → Sleeper-compatible league settings object.
 */
function mapMFLSettings(leagueRaw, leagueId, year) {
  const lg = leagueRaw?.league || {};

  // ── Scoring settings ──
  const scoring_settings = {};
  const rules = lg.rules?.positionRules?.rules?.rule || [];
  const ruleArr = Array.isArray(rules) ? rules : [rules];
  ruleArr.forEach(rule => {
    const key = MFL_SCORE_MAP[rule.name];
    if (key) {
      const val = parseFloat(rule.score || 0);
      scoring_settings[key] = val;
    }
  });
  // Ensure negatives for turnovers
  if (scoring_settings.pass_int > 0) scoring_settings.pass_int = -scoring_settings.pass_int;
  if (scoring_settings.fum_lost > 0) scoring_settings.fum_lost = -scoring_settings.fum_lost;

  // ── Roster positions ──
  const roster_positions = [];
  const positions = lg.starters?.position || [];
  const posArr = Array.isArray(positions) ? positions : [positions];
  posArr.forEach(pos => {
    const name = (pos.name || '').toUpperCase();
    const count = parseInt(pos.count || 1);
    for (let i = 0; i < count; i++) roster_positions.push(name);
  });

  // ── Bench slots ──
  const rosterSize = parseInt(lg.rosterSize || lg.roster_size || 20);
  const starterCount = posArr.reduce((acc, p) => acc + parseInt(p.count || 1), 0);
  const benchCount = Math.max(0, rosterSize - starterCount);
  for (let i = 0; i < benchCount; i++) roster_positions.push('BN');

  const franchises = _getFranchiseArr(leagueRaw);

  return {
    league_id: 'mfl_' + leagueId + '_' + year,
    name: lg.name || ('MFL League ' + leagueId),
    total_rosters: franchises.length || parseInt(lg.franchises?.count || 12),
    season: String(year),
    status: 'in_season',
    settings: { type: 2 }, // MFL is dynasty-first
    scoring_settings,
    roster_positions,
    avatar: null,
    _source: 'mfl',
    _mfl_id: String(leagueId),
  };
}

function _getFranchiseArr(leagueRaw) {
  const f = leagueRaw?.league?.franchises?.franchise || [];
  return Array.isArray(f) ? f : [f];
}

// ── Player crosswalk ──────────────────────────────────────────────

function _normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build MFL playerId → Sleeper playerId crosswalk.
 * Matches by normalized full name + NFL team abbreviation.
 * Result cached in localStorage per year.
 */
function buildCrosswalk(sleeperPlayers, mflPlayers, year) {
  const cacheKey = 'mfl_crosswalk_' + year;

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - (cached._ts || 0) < 24 * 60 * 60 * 1000) {
        _crosswalk = cached.map;
        _crosswalkYear = year;
        return cached.map;
      }
    }
  } catch (e) {}

  // Build Sleeper name+team index
  const nameTeamIndex = {};
  const nameOnlyIndex = {};

  Object.entries(sleeperPlayers || {}).forEach(([sid, p]) => {
    const name = _normalizeName(p.full_name || (p.first_name + ' ' + p.last_name));
    if (!name) return;
    const team = (p.team || 'FA').toUpperCase();
    nameTeamIndex[name + '|' + team] = sid;
    if (!nameOnlyIndex[name]) nameOnlyIndex[name] = [];
    nameOnlyIndex[name].push(sid);
  });

  // Match MFL players → Sleeper IDs
  const map = {};
  (mflPlayers || []).forEach(p => {
    if (!p || !p.id) return;
    const { full_name } = _parseMFLName(p.name);
    const name = _normalizeName(full_name);
    const team = _normTeam(p.team).toUpperCase();

    let sleeperPid = nameTeamIndex[name + '|' + team];
    if (!sleeperPid && nameOnlyIndex[name]) {
      sleeperPid = nameOnlyIndex[name][0];
    }
    if (sleeperPid) map[p.id] = sleeperPid;
  });

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ map, _ts: Date.now() }));
  } catch (e) {}

  _crosswalk = map;
  _crosswalkYear = year;
  return map;
}

function lookupSleeperPlayerId(mflId) {
  if (_crosswalk && _crosswalk[mflId]) return _crosswalk[mflId];
  return 'mfl_' + mflId;
}

// ── Transactions ─────────────────────────────────────────────────

/**
 * Fetch MFL transactions and map to Sleeper-compatible format.
 * MFL TYPE=transactions returns trades, adds, drops, IR moves.
 */
async function fetchTransactions(leagueId, year, apiKey) {
  try {
    const data = await _mflGet(_mflUrl(year, 'transactions', leagueId, apiKey));
    const txnArr = data?.transactions?.transaction || [];
    const txns = Array.isArray(txnArr) ? txnArr : [txnArr];
    const cw = _crosswalk || {};

    return txns.filter(t => t && t.type).map(t => {
      const type = (t.type || '').toUpperCase();
      const ts = parseInt(t.timestamp || 0) * 1000; // MFL uses seconds, convert to ms

      if (type === 'TRADE') {
        // Parse traded players: "franchise1_adds|franchise1_drops,franchise2_adds|franchise2_drops"
        const rids = [t.franchise, t.franchise2].filter(Boolean);
        const adds = {};
        const drops = {};
        // MFL trade format varies — parse player lists
        (t.franchise1_gave_up || '').split(',').filter(Boolean).forEach(pid => {
          const sid = cw[pid] || ('mfl_' + pid);
          adds[sid] = t.franchise2;
          drops[sid] = t.franchise;
        });
        (t.franchise2_gave_up || '').split(',').filter(Boolean).forEach(pid => {
          const sid = cw[pid] || ('mfl_' + pid);
          adds[sid] = t.franchise;
          drops[sid] = t.franchise2;
        });
        return { type: 'trade', status: 'complete', created: ts, roster_ids: rids, adds, drops, _source: 'mfl' };
      }

      if (type === 'FREE_AGENT' || type === 'BBID_WAIVER' || type === 'WAIVER') {
        const adds = {};
        const drops = {};
        (t.transaction || '').split('|').forEach(part => {
          const [pid, action] = (part || '').split(',');
          if (!pid) return;
          const sid = cw[pid] || ('mfl_' + pid);
          if (action === 'added' || !action) adds[sid] = t.franchise;
          else if (action === 'dropped') drops[sid] = t.franchise;
        });
        return { type: type === 'BBID_WAIVER' ? 'waiver' : 'free_agent', status: 'complete', created: ts, adds, drops, _source: 'mfl' };
      }

      return { type: type.toLowerCase(), status: 'complete', created: ts, _source: 'mfl' };
    }).filter(t => t.type === 'trade' || t.type === 'free_agent' || t.type === 'waiver');
  } catch (e) {
    console.warn('[MFL] Transaction fetch error:', e);
    return [];
  }
}

/**
 * Fetch MFL draft results and map to Sleeper-compatible format.
 * Handles large drafts (100+ picks for mega-leagues).
 */
async function fetchDraftResults(leagueId, year, apiKey) {
  try {
    const data = await _mflGet(_mflUrl(year, 'draftResults', leagueId, apiKey));
    const units = data?.draftResults?.draftUnit;
    if (!units) return [];
    const unitArr = Array.isArray(units) ? units : [units];
    const cw = _crosswalk || {};
    const allPicks = [];

    unitArr.forEach(unit => {
      const picks = unit?.draftPick || [];
      const pickArr = Array.isArray(picks) ? picks : [picks];
      pickArr.forEach(pick => {
        if (!pick || !pick.player) return;
        const sid = cw[pick.player] || ('mfl_' + pick.player);
        const [rd, pk] = (pick.pick || '').split('.');
        allPicks.push({
          player_id: sid,
          picked_by: pick.franchise,
          round: parseInt(rd) || 1,
          pick_no: parseInt(pk) || 1,
          overall: allPicks.length + 1,
          timestamp: parseInt(pick.timestamp || 0) * 1000,
          _source: 'mfl',
        });
      });
    });

    return allPicks;
  } catch (e) {
    console.warn('[MFL] Draft results fetch error:', e);
    return [];
  }
}

// ── Full state population ─────────────────────────────────────────

/**
 * Map raw MFL API responses → { players, rosters, league, leagueUsers }.
 */
function mapToSleeperState(raw, leagueId, year, crosswalk) {
  const cw = crosswalk || _crosswalk || {};
  const { leagueData, rostersData, playersData } = raw;

  // ── League settings ──
  const league = mapMFLSettings(leagueData, leagueId, year);

  // ── Franchises (owners) ──
  const franchises = _getFranchiseArr(leagueData);
  const leagueUsers = franchises.map(f => ({
    user_id: f.id,
    display_name: f.owner_name || f.name || ('Team ' + f.id),
    username: (f.owner_name || f.name || '').toLowerCase().replace(/\s+/g, '_'),
    avatar: null,
    metadata: {},
  }));

  // Build franchise id → standings lookup from rosters endpoint
  const standingsMap = {};
  const rosterFranchises = rostersData?.rosters?.franchise || [];
  const rosterArr = Array.isArray(rosterFranchises) ? rosterFranchises : [rosterFranchises];

  // Franchise standings come from the league endpoint franchises
  franchises.forEach(f => {
    standingsMap[f.id] = f;
  });

  // ── Players + Rosters ──
  const players = {};

  // Build MFL player lookup from players export
  const mflPlayerLookup = {};
  const mflPlayerArr = playersData?.players?.player || [];
  const allMflPlayers = Array.isArray(mflPlayerArr) ? mflPlayerArr : [mflPlayerArr];
  allMflPlayers.forEach(p => {
    if (p && p.id) mflPlayerLookup[p.id] = p;
  });

  // Add all MFL players to the players dict
  allMflPlayers.forEach(p => {
    if (!p || !p.id) return;
    const sleeperPid = cw[p.id] || ('mfl_' + p.id);
    if (!players[sleeperPid]) {
      const mapped = mapMFLPlayer(p);
      if (mapped) {
        mapped.player_id = sleeperPid;
        players[sleeperPid] = mapped;
      }
    }
  });

  // Map rosters
  const rosters = rosterArr.map(rf => {
    const franchise = standingsMap[rf.id] || { id: rf.id, name: 'Team ' + rf.id };
    const rosterEntries = Array.isArray(rf.player) ? rf.player : (rf.player ? [rf.player] : []);
    return mapMFLRoster(franchise, rosterEntries, cw);
  });

  return { players, rosters, league, leagueUsers };
}

// ── Main connect function ─────────────────────────────────────────

/**
 * Connect to an MFL league and populate window.S.
 * Returns { players, rosters, league, leagueUsers } after populating state.
 *
 * @param {string|number} leagueId       MFL league ID
 * @param {number}        year           Season year (e.g. 2024)
 * @param {string}        apiKey         Optional: MFL API key for private leagues
 * @param {string}        myFranchiseId  Optional: franchise ID (e.g. "0001") for current user
 */
async function connectLeague(leagueId, year, apiKey, myFranchiseId) {
  const S = window.S || window.App?.S;
  if (!S) throw new Error('window.S not initialized');

  // ── 1. Fetch MFL data ──
  const raw = await fetchLeague(leagueId, year, apiKey);
  if (!raw?.leagueData?.league) throw new Error('Invalid MFL league data. Check your League ID and year.');

  // ── 2. Build player crosswalk against Sleeper player DB ──
  const mflPlayerArr = raw.playersData?.players?.player || [];
  const allMflPlayers = Array.isArray(mflPlayerArr) ? mflPlayerArr : [mflPlayerArr];
  const crosswalk = buildCrosswalk(S.players || {}, allMflPlayers, year);

  // ── 3. Map MFL data → Sleeper-equivalent format ──
  const { players, rosters, league, leagueUsers } = mapToSleeperState(raw, leagueId, year, crosswalk);

  // ── 4. Populate window.S ──
  S.platform = 'mfl';
  S.mflLeagueId = String(leagueId);
  S.mflYear = year;
  if (apiKey) S._mflApiKey = apiKey;

  // Merge MFL players into S.players (Sleeper players already present take precedence)
  Object.assign(S.players, players);

  S.rosters = rosters;
  S.leagueUsers = leagueUsers;
  S.bracket = { w: [], l: [] };
  S.matchups = {};
  S.season = String(year);

  // Fetch transactions and draft results (non-blocking — don't fail connect)
  const [txns, draftPicks] = await Promise.all([
    fetchTransactions(leagueId, year, apiKey).catch(() => []),
    fetchDraftResults(leagueId, year, apiKey).catch(() => []),
  ]);

  // Store transactions keyed by week (consistent with Sleeper format)
  const txnsByWeek = {};
  txns.forEach(t => { const key = 'w0'; if (!txnsByWeek[key]) txnsByWeek[key] = []; txnsByWeek[key].push(t); });
  S.transactions = txnsByWeek;

  // Extract traded picks from trade transactions
  S.tradedPicks = txns.filter(t => t.type === 'trade').map((t, i) => ({
    season: year, round: 1, roster_id: t.roster_ids?.[0], owner_id: t.roster_ids?.[1], _idx: i,
  })).slice(0, 50); // Limit for performance

  S.drafts = draftPicks.length ? [{ draft_id: 'mfl_draft_' + year, picks: draftPicks }] : [];

  S.leagues = [league];
  S.currentLeagueId = league.league_id;

  // ── 5. Find my roster ──
  if (myFranchiseId) {
    const myRoster = rosters.find(r => r.roster_id === String(myFranchiseId));
    S.myRosterId = myRoster?.roster_id || null;
  }

  return { players, rosters, league, leagueUsers, raw };
}

// ── Expose on window.MFL ──────────────────────────────────────────
window.MFL = {
  BASE_URL: MFL_BASE,
  MFL_SCORE_MAP,
  MFL_TEAM_MAP,

  // Fetch
  fetchLeague,
  fetchTransactions,
  fetchDraftResults,

  // Mappers
  mapMFLPlayer,
  mapMFLRoster,
  mapMFLSettings,
  mapToSleeperState,

  // Crosswalk
  buildCrosswalk,
  lookupSleeperPlayerId,

  // Main connect
  connectLeague,
};

})();
