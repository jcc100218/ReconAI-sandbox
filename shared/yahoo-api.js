// ══════════════════════════════════════════════════════════════════
// shared/yahoo-api.js — Yahoo Fantasy Football connector
// Fetches Yahoo league data via OAuth 2.0 and maps it to
// Sleeper-equivalent format so all ReconAI features work as-is.
//
// window.Yahoo exposes:
//   startAuth()                       → Promise<tokens> — opens Yahoo OAuth popup
//   fetchUserLeagues(tokens)          → list of user's NFL leagues
//   fetchLeague(leagueKey, tokens)    → settings + standings
//   fetchTeamsWithRosters(lKey, tok)  → all team rosters
//   mapYahooPlayer(playerArr)         → Sleeper-compatible player
//   mapYahooRoster(teamData, cw)      → Sleeper-compatible roster
//   mapYahooSettings(data, lKey)      → Sleeper-compatible league
//   buildCrosswalk(sleeperPl, yahPl, year) → Yahoo pid → Sleeper pid
//   connectLeague(leagueKey, myTeamId) → populates window.S
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

(function () {
'use strict';

// ── Constants ─────────────────────────────────────────────────────

const YAHOO_AUTH_PROXY = 'https://sxshiqyxhhifvtfqawbq.supabase.co/functions/v1/yahoo-auth';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4c2hpcXl4aGhpZnZ0ZnFhd2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkwNTUzNzYsImV4cCI6MjA1NDYzMTM3Nn0.cjHrPFWDFikyVQiMF0U1NXd5bEaUJnqTpSZhCxRNkfM';

// Yahoo NFL game key by season year (changes annually)
// Update each year when Yahoo releases the new season game key
const YAHOO_NFL_GAME_KEYS = {
  '2019': '380', '2020': '390', '2021': '399',
  '2022': '406', '2023': '414', '2024': '423',
};

// Yahoo stat ID → Sleeper scoring key
const YAHOO_STAT_MAP = {
  '4':  'pass_yd',
  '5':  'pass_td',
  '6':  'pass_int',
  '8':  'rush_yd',
  '9':  'rush_td',
  '11': 'rec_yd',
  '12': 'rec_td',
  '13': 'rec',
  '18': 'fum_lost',
  '57': 'bonus_2pt_off',
  // IDP
  '42': 'idp_sack',
  '45': 'idp_int',
  '46': 'idp_fum_rec',
  '48': 'idp_safe',
  '49': 'idp_def_td',
  '54': 'idp_solo',
  '55': 'idp_ast',
};

// Yahoo flex/special roster position labels → Sleeper
const YAHOO_ROSTER_POS_MAP = {
  'QB': 'QB', 'RB': 'RB', 'WR': 'WR', 'TE': 'TE',
  'K': 'K', 'DEF': 'DEF', 'D': 'DEF',
  'BN': 'BN', 'IR': 'IR',
  'W/R': 'FLEX', 'RB/WR': 'FLEX', 'W/R/T': 'FLEX',
  'RB/WR/TE': 'FLEX', 'W/T': 'FLEX', 'WR/TE': 'FLEX',
  'W/R/K': 'FLEX', 'OP': 'OP', 'Q/W/R/T': 'OP',
  'DL': 'DL', 'LB': 'LB', 'DB': 'DB', 'CB': 'CB', 'S': 'S',
};

// Yahoo team abbreviations that differ from Sleeper's
const YAHOO_TEAM_MAP = {
  'GNB': 'GB', 'KAN': 'KC', 'NWE': 'NE', 'NOR': 'NO',
  'SFO': 'SF', 'TAM': 'TB', 'LVR': 'LV', 'HST': 'HOU',
  'CLV': 'CLE', 'PIT': 'PIT', 'BLT': 'BAL',
  'FA':  'FA',
};

// ── Crosswalk cache ───────────────────────────────────────────────
let _crosswalk = null;
let _crosswalkYear = null;

// ── Auth state ────────────────────────────────────────────────────
let _pendingAuthResolve = null;
let _pendingAuthReject  = null;
let _pendingAuthTimeout = null;

// ── Helpers ───────────────────────────────────────────────────────

function _normTeam(t) {
  if (!t || t === 'FA') return 'FA';
  const u = t.toUpperCase();
  return YAHOO_TEAM_MAP[u] || u;
}

function _resolveLeagueKey(leagueId, year) {
  const y = String(year || new Date().getFullYear());
  const gameKey = YAHOO_NFL_GAME_KEYS[y];
  if (!gameKey) throw new Error(`Unknown Yahoo game key for year ${y}. Enter the full league key (e.g. 423.l.${leagueId}).`);
  return `${gameKey}.l.${leagueId}`;
}

/**
 * Yahoo player metadata is returned as an array of single-key objects.
 * This flattens [{team_key:...}, {player_id:...}, {name:{...}}, ...] → one object.
 */
function _flattenYahooMeta(arr) {
  const result = {};
  if (!Array.isArray(arr)) return result;
  arr.forEach(item => {
    if (item && typeof item === 'object') Object.assign(result, item);
  });
  return result;
}

/**
 * Iterate a Yahoo numbered-key collection: {0: {...}, 1: {...}, count: N}
 * Returns array of values (excluding the 'count' key).
 */
function _iterYahoo(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .filter(([k]) => k !== 'count' && !isNaN(Number(k)))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => v);
}

// ── Proxy API call ────────────────────────────────────────────────

/**
 * Make a Yahoo Fantasy API call through the Edge Function proxy.
 * Handles token refresh automatically; updates localStorage if tokens change.
 */
async function _yahooApiGet(path, tokens) {
  if (!tokens?.access_token) throw new Error('Not authenticated with Yahoo');

  const res = await fetch(YAHOO_AUTH_PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON,
    },
    body: JSON.stringify({
      action: 'api',
      path,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Yahoo proxy error ' + res.status);
  }

  const result = await res.json();

  // If tokens were refreshed server-side, persist the new ones
  if (result.new_tokens) {
    const updated = { ...tokens, ...result.new_tokens, stored_at: Date.now() };
    _storeTokens(updated);
  }

  return result.data;
}

// ── Token storage ─────────────────────────────────────────────────

function _storeTokens(tokens) {
  try {
    const toStore = { ...tokens, stored_at: Date.now() };
    localStorage.setItem('yahoo_tokens', JSON.stringify(toStore));
  } catch (e) {}
}

function _getStoredTokens() {
  try {
    const raw = localStorage.getItem('yahoo_tokens');
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (!t?.access_token) return null;
    return t;
  } catch (e) {
    return null;
  }
}

function clearTokens() {
  try { localStorage.removeItem('yahoo_tokens'); } catch (e) {}
}

// ── OAuth flow ────────────────────────────────────────────────────

/**
 * Start Yahoo OAuth. Opens a popup, returns a Promise that resolves
 * with tokens when the user completes the flow.
 */
async function startAuth() {
  // Get auth URL from Edge Function
  const res = await fetch(YAHOO_AUTH_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
    body: JSON.stringify({ action: 'auth_url' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Could not get Yahoo auth URL');
  }
  const { auth_url } = await res.json();

  // Open popup
  const popup = window.open(
    auth_url,
    'yahoo_oauth',
    'width=560,height=680,menubar=no,toolbar=no,location=no,status=no'
  );
  if (!popup) {
    throw new Error('Popup blocked. Allow popups for this site and try again.');
  }

  // Listen for postMessage from the popup (sent by the Edge Function callback page)
  return new Promise((resolve, reject) => {
    _pendingAuthResolve = resolve;
    _pendingAuthReject  = reject;

    // Timeout after 8 minutes
    _pendingAuthTimeout = setTimeout(() => {
      _clearAuthPending();
      reject(new Error('Yahoo auth timed out. Try again.'));
    }, 8 * 60 * 1000);

    // Poll for popup close (user dismissed without completing)
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        // Give postMessage a moment to arrive before declaring failure
        setTimeout(() => {
          if (_pendingAuthReject) {
            _clearAuthPending();
            reject(new Error('Yahoo auth cancelled.'));
          }
        }, 500);
      }
    }, 500);
  });
}

function _clearAuthPending() {
  clearTimeout(_pendingAuthTimeout);
  _pendingAuthResolve = null;
  _pendingAuthReject  = null;
  _pendingAuthTimeout = null;
}

// Called by the message listener below when the popup sends tokens
function _onAuthMessage(event) {
  const { data } = event;
  if (!data || !data.type) return;

  if (data.type === 'yahoo_auth_complete') {
    if (_pendingAuthResolve) {
      const tokens = data.tokens || {};
      _storeTokens(tokens);
      const resolve = _pendingAuthResolve;
      _clearAuthPending();
      resolve(tokens);
    }
  } else if (data.type === 'yahoo_auth_error') {
    if (_pendingAuthReject) {
      const reject = _pendingAuthReject;
      _clearAuthPending();
      reject(new Error(data.error || 'Yahoo auth failed'));
    }
  }
}

window.addEventListener('message', _onAuthMessage);

// ── Data fetchers ─────────────────────────────────────────────────

/**
 * Fetch all NFL leagues for the authenticated user.
 * Returns array of { league_key, name, season, num_teams } objects.
 */
async function fetchUserLeagues(tokens) {
  const path = '/users;use_login=1/games;game_codes=nfl/leagues';
  const raw = await _yahooApiGet(path, tokens);
  return _extractUserLeagues(raw);
}

function _extractUserLeagues(raw) {
  const leagues = [];
  try {
    const users = raw?.fantasy_content?.users || {};
    _iterYahoo(users).forEach(userEntry => {
      const userArr = userEntry?.user || [];
      // userArr[1] is the content object
      const content = userArr[1] || {};
      const games = content?.games || {};
      _iterYahoo(games).forEach(gameEntry => {
        const gameArr = gameEntry?.game || [];
        // gameArr[0] = game metadata array, gameArr[1] = leagues object
        const gameContent = gameArr[1] || {};
        const leaguesObj = gameContent?.leagues || {};
        _iterYahoo(leaguesObj).forEach(leagueEntry => {
          const leagueArr = leagueEntry?.league || [];
          // league[0] = metadata array
          const meta = _flattenYahooMeta(leagueArr[0] || leagueArr);
          if (meta.league_key) {
            leagues.push({
              league_key: meta.league_key,
              name: meta.name || ('Yahoo League ' + meta.league_id),
              season: String(meta.season || ''),
              num_teams: parseInt(meta.num_teams || 0),
              league_type: meta.league_type || '',
            });
          }
        });
      });
    });
  } catch (e) {
    console.warn('[Yahoo] Error extracting user leagues:', e);
  }
  return leagues;
}

/**
 * Fetch league settings and standings.
 * Uses sub-resource chain: league;out=settings,standings
 */
async function fetchLeague(leagueKey, tokens) {
  const path = `/league/${leagueKey};out=settings,standings`;
  return _yahooApiGet(path, tokens);
}

/**
 * Fetch all team rosters in one call.
 */
async function fetchTeamsWithRosters(leagueKey, tokens) {
  const path = `/league/${leagueKey}/teams/roster`;
  return _yahooApiGet(path, tokens);
}

/**
 * Fetch trade transactions for the league.
 */
async function fetchTransactions(leagueKey, tokens) {
  const path = `/league/${leagueKey}/transactions;types=trade`;
  return _yahooApiGet(path, tokens);
}

// ── Data mappers ──────────────────────────────────────────────────

/**
 * Map a Yahoo player meta array → Sleeper-compatible player object.
 * playerArr[0] = array of metadata objects (team_key, player_id, name, team_abbr, position...)
 */
function mapYahooPlayer(playerArr) {
  const meta = _flattenYahooMeta(playerArr[0] || playerArr);
  const yahooId = String(meta.player_id || '');
  if (!yahooId) return null;

  const name = meta.name || {};
  const team = _normTeam(meta.editorial_team_abbr || '');
  const rawPos = (meta.display_position || meta.primary_position || '').toUpperCase();
  // Map positions like "WR,TE" → "WR" (take first), DEF/DST normalization
  const position = rawPos.split(',')[0] || rawPos;

  return {
    player_id: 'yahoo_' + yahooId,
    _yahoo_id: yahooId,
    _yahoo_player_key: meta.player_key || '',
    full_name: name.full || name.ascii_full || '',
    first_name: name.first || name.ascii_first || '',
    last_name: name.last || name.ascii_last || '',
    position: YAHOO_ROSTER_POS_MAP[position] || position,
    team,
    age: parseInt(meta.age || 0),
    injury_status: meta.status || '',
  };
}

/**
 * Map a Yahoo team entry → Sleeper-compatible roster object.
 * teamArr[0] = array of team metadata objects
 * teamArr[1] = { roster: { players: {0: {player: [...]}, count: N} } }
 */
function mapYahooRoster(teamArr, crosswalk) {
  const meta  = _flattenYahooMeta(teamArr[0] || []);
  const rosterContent = teamArr[1] || {};
  const playersObj = rosterContent?.roster?.players || {};

  const teamKey  = meta.team_key || '';
  const teamId   = String(meta.team_id || '');
  const teamName = meta.name || ('Team ' + teamId);

  // Extract owner name from managers
  const managersRaw = meta.managers?.manager;
  const managers    = Array.isArray(managersRaw) ? managersRaw : (managersRaw ? [managersRaw] : []);
  const ownerName   = managers[0]?.nickname || managers[0]?.email || ('Owner ' + teamId);

  // W/L from team_standings
  const standings = meta.team_standings || {};
  const totals    = standings.outcome_totals || {};
  const fpts      = parseFloat(standings.points_for || 0);
  const fptsAg    = parseFloat(standings.points_against || 0);

  const players  = [];
  const starters = [];
  const reserve  = [];

  _iterYahoo(playersObj).forEach(pEntry => {
    const pArr = pEntry?.player || [];
    // pArr[0] = meta array, pArr[1] = {selected_position: {position: 'QB', is_flex: 0}}
    const pMeta = _flattenYahooMeta(pArr[0] || []);
    const yahooId = String(pMeta.player_id || '');
    if (!yahooId) return;

    const pid = (crosswalk && crosswalk[yahooId]) ? crosswalk[yahooId] : ('yahoo_' + yahooId);
    players.push(pid);

    const selPos = pArr[1]?.selected_position?.position || 'BN';
    if (selPos === 'IR') {
      reserve.push(pid);
    } else if (selPos !== 'BN') {
      starters.push(pid); // Any non-bench, non-IR slot = starting
    }
  });

  return {
    roster_id: teamId,
    owner_id: teamId,
    players,
    starters,
    reserve,
    taxi: [],
    settings: {
      wins:               parseInt(totals.wins   || 0),
      losses:             parseInt(totals.losses || 0),
      ties:               parseInt(totals.ties   || 0),
      fpts:               Math.floor(fpts),
      fpts_decimal:       Math.round((fpts % 1) * 100),
      fpts_against:       Math.floor(fptsAg),
      fpts_against_decimal: Math.round((fptsAg % 1) * 100),
    },
    _owner_name: ownerName,
    _team_name:  teamName,
    _team_abbrev: meta.team_abbrev || meta.team_code || '',
    _yahoo_team_key: teamKey,
  };
}

/**
 * Map a Yahoo trade transaction → Sleeper-compatible trade object.
 */
function mapYahooTrade(tx, crosswalk) {
  if (!tx) return null;
  const cw = crosswalk || {};
  return {
    type: 'trade',
    status: 'complete',
    timestamp: parseInt(tx.timestamp || 0) * 1000,
    week: parseInt(tx.transaction_key?.split('.').pop() || 0),
    sides: (tx.players?.player ? (Array.isArray(tx.players.player) ? tx.players.player : [tx.players.player]) : [])
      .reduce((acc, p) => {
        const yahooId = String(p.player_id || p[0]?.[1]?.player_id || '');
        const pid = cw[yahooId] || ('yahoo_' + yahooId);
        const teamId = p.transaction_data?.destination_team_key?.split('.t.').pop() || '';
        let side = acc.find(s => s.roster_id === teamId);
        if (!side) { side = { roster_id: teamId, adds: [], drops: [] }; acc.push(side); }
        side.adds.push(pid);
        return acc;
      }, []),
    _source: 'yahoo',
  };
}

/**
 * Map Yahoo league settings → Sleeper-compatible league settings object.
 * leagueRaw = raw fantasy_content.league array from Yahoo API
 */
function mapYahooSettings(leagueRaw, leagueKey) {
  // league array: [metadata_object, {settings: {...}, standings: {...}}]
  const leagueArr = leagueRaw?.fantasy_content?.league || [];
  const meta = _flattenYahooMeta(Array.isArray(leagueArr[0]) ? leagueArr[0] : [leagueArr[0]]);
  const content = Array.isArray(leagueArr) ? leagueArr[1] : {};
  const settings = content?.settings || {};

  // ── Scoring settings from stat_modifiers ──
  const scoring_settings = {};
  const statModsRaw = settings.stat_modifiers?.stats?.stat || [];
  const statMods = Array.isArray(statModsRaw) ? statModsRaw : [statModsRaw];
  statMods.forEach(s => {
    const key = YAHOO_STAT_MAP[String(s.stat_id || '')];
    if (key) {
      const val = parseFloat(s.value || 0);
      scoring_settings[key] = val;
    }
  });
  // Ensure negatives for turnovers
  if (scoring_settings.pass_int > 0) scoring_settings.pass_int = -scoring_settings.pass_int;
  if (scoring_settings.fum_lost > 0) scoring_settings.fum_lost = -scoring_settings.fum_lost;

  // ── Roster positions ──
  const roster_positions = [];
  const rosterPosRaw = settings.roster_positions?.roster_position || [];
  const rosterPosArr = Array.isArray(rosterPosRaw) ? rosterPosRaw : [rosterPosRaw];
  rosterPosArr.forEach(pos => {
    const name  = pos.position || '';
    const count = parseInt(pos.count || 1);
    const mapped = YAHOO_ROSTER_POS_MAP[name] || name;
    for (let i = 0; i < count; i++) roster_positions.push(mapped);
  });

  // ── League type (dynasty vs redraft) ──
  // Yahoo uses "league_type": "private"/"public" — not dynasty/redraft
  // Check for "is_cash_league", "draft_type", etc.
  const draftType = settings.draft_type || '';
  const isKeeper = ['keeper', 'dynasty'].some(t => (meta.league_type || '').toLowerCase().includes(t) || draftType.toLowerCase().includes(t));

  const leagueId = leagueKey.split('.l.')[1] || leagueKey;
  const gameKey  = leagueKey.split('.l.')[0] || '';
  const season   = String(meta.season || Object.entries(YAHOO_NFL_GAME_KEYS).find(([, v]) => v === gameKey)?.[0] || new Date().getFullYear());

  return {
    league_id: 'yahoo_' + leagueKey.replace(/\./g, '_'),
    name: meta.name || ('Yahoo League ' + leagueId),
    total_rosters: parseInt(meta.num_teams || 12),
    season,
    status: 'in_season',
    settings: { type: isKeeper ? 2 : 0 },
    scoring_settings,
    roster_positions,
    avatar: meta.logo_url || null,
    _source: 'yahoo',
    _yahoo_league_key: leagueKey,
  };
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
 * Build Yahoo playerId → Sleeper playerId crosswalk.
 * Matches by normalized name + NFL team. Cached per year.
 */
function buildCrosswalk(sleeperPlayers, yahooPlayers, year) {
  const cacheKey = 'yahoo_crosswalk_' + year;
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

  // Match Yahoo players → Sleeper IDs
  const map = {};
  (yahooPlayers || []).forEach(pArr => {
    const meta = _flattenYahooMeta(pArr[0] || pArr);
    const yahooId = String(meta.player_id || '');
    if (!yahooId) return;
    const nameMeta = meta.name || {};
    const name = _normalizeName(nameMeta.full || nameMeta.ascii_full || '');
    const team = _normTeam(meta.editorial_team_abbr || '').toUpperCase();

    let sleeperPid = nameTeamIndex[name + '|' + team];
    if (!sleeperPid && nameOnlyIndex[name]) sleeperPid = nameOnlyIndex[name][0];
    if (sleeperPid) map[yahooId] = sleeperPid;
  });

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ map, _ts: Date.now() }));
  } catch (e) {}

  _crosswalk = map;
  _crosswalkYear = year;
  return map;
}

function lookupSleeperPlayerId(yahooId) {
  if (_crosswalk && _crosswalk[yahooId]) return _crosswalk[yahooId];
  return 'yahoo_' + yahooId;
}

// ── Full state population ─────────────────────────────────────────

/**
 * Map raw Yahoo API responses → { players, rosters, league, leagueUsers }.
 */
function mapToSleeperState(leagueSettingsRaw, rostersRaw, leagueKey, crosswalk) {
  const cw = crosswalk || _crosswalk || {};

  // ── League settings ──
  const league = mapYahooSettings(leagueSettingsRaw, leagueKey);

  // ── Teams + players ──
  const leagueArr = rostersRaw?.fantasy_content?.league || [];
  const content   = Array.isArray(leagueArr) ? leagueArr[1] : {};
  const teamsObj  = content?.teams || {};

  const leagueUsers = [];
  const rosters     = [];
  const players     = {};

  _iterYahoo(teamsObj).forEach(teamEntry => {
    const teamArr = teamEntry?.team || [];
    if (!teamArr.length) return;

    // Map roster
    const roster = mapYahooRoster(teamArr, cw);
    rosters.push(roster);

    // Build leagueUsers entry
    leagueUsers.push({
      user_id: roster.roster_id,
      display_name: roster._owner_name,
      username: (roster._owner_name || '').toLowerCase().replace(/\s+/g, '_'),
      avatar: null,
      metadata: {},
    });

    // Collect players from roster entries
    const rosterContent = teamArr[1] || {};
    const playersObj = rosterContent?.roster?.players || {};
    _iterYahoo(playersObj).forEach(pEntry => {
      const pArr = pEntry?.player || [];
      const pMeta = _flattenYahooMeta(pArr[0] || []);
      const yahooId = String(pMeta.player_id || '');
      if (!yahooId) return;
      const pid = cw[yahooId] || ('yahoo_' + yahooId);
      if (!players[pid]) {
        const mapped = mapYahooPlayer(pArr);
        if (mapped) {
          mapped.player_id = pid;
          players[pid] = mapped;
        }
      }
    });
  });

  return { players, rosters, league, leagueUsers };
}

// ── Main connect function ─────────────────────────────────────────

/**
 * Connect to a Yahoo league and populate window.S.
 *
 * @param {string} leagueKey  Full Yahoo league key (e.g. "423.l.12345")
 *                            OR just the league ID — year must be in S.season
 * @param {string} myTeamId   Optional: Yahoo team ID (1–N) for the current user
 * @param {object} tokens     Optional: existing tokens; uses localStorage if omitted
 */
async function connectLeague(leagueKey, myTeamId, tokens) {
  const S = window.S || window.App?.S;
  if (!S) throw new Error('window.S not initialized');

  // Resolve tokens
  const tok = tokens || _getStoredTokens();
  if (!tok?.access_token) throw new Error('Not authenticated with Yahoo. Click "Connect with Yahoo" first.');

  // Resolve league key (accept bare league ID too)
  const resolvedKey = leagueKey.includes('.l.')
    ? leagueKey
    : _resolveLeagueKey(leagueKey, S.season || new Date().getFullYear());

  // ── 1. Fetch data ──
  const [leagueSettingsRaw, rostersRaw] = await Promise.all([
    fetchLeague(resolvedKey, tok),
    fetchTeamsWithRosters(resolvedKey, tok),
  ]);
  if (!leagueSettingsRaw?.fantasy_content) throw new Error('Invalid Yahoo league data. Check your league key.');

  // ── 2. Build crosswalk ──
  const leagueArr  = rostersRaw?.fantasy_content?.league || [];
  const content    = Array.isArray(leagueArr) ? leagueArr[1] : {};
  const teamsObj   = content?.teams || {};
  const allYahooPl = [];
  _iterYahoo(teamsObj).forEach(teamEntry => {
    const teamArr    = teamEntry?.team || [];
    const rosterCont = teamArr[1] || {};
    const playersObj = rosterCont?.roster?.players || {};
    _iterYahoo(playersObj).forEach(pEntry => {
      const pArr = pEntry?.player || [];
      if (pArr.length) allYahooPl.push(pArr);
    });
  });

  const lgSettingsArr = leagueSettingsRaw?.fantasy_content?.league || [];
  const lgMeta = _flattenYahooMeta(Array.isArray(lgSettingsArr[0]) ? lgSettingsArr[0] : [lgSettingsArr[0]]);
  const year = parseInt(lgMeta.season || new Date().getFullYear());

  const crosswalk = buildCrosswalk(S.players || {}, allYahooPl, year);

  // ── 3. Map data ──
  const { players, rosters, league, leagueUsers } = mapToSleeperState(leagueSettingsRaw, rostersRaw, resolvedKey, crosswalk);

  // ── 4. Populate window.S ──
  S.platform         = 'yahoo';
  S.yahooLeagueKey   = resolvedKey;
  S.yahooYear        = year;

  Object.assign(S.players, players);
  S.rosters      = rosters;
  S.leagueUsers  = leagueUsers;
  S.tradedPicks  = [];
  S.drafts       = [];
  S.bracket      = { w: [], l: [] };
  S.matchups     = {};
  S.transactions = {};
  S.season       = String(year);
  S.leagues      = [league];
  S.currentLeagueId = league.league_id;

  // ── 5. Find my roster ──
  if (myTeamId) {
    S.myRosterId = String(myTeamId);
  }

  return { players, rosters, league, leagueUsers };
}

// ── Expose on window.Yahoo ────────────────────────────────────────
window.Yahoo = {
  PROXY_URL: YAHOO_AUTH_PROXY,
  YAHOO_STAT_MAP,
  YAHOO_NFL_GAME_KEYS,

  // Auth
  startAuth,
  clearTokens,
  getStoredTokens: _getStoredTokens,

  // Fetch
  fetchUserLeagues,
  fetchLeague,
  fetchTeamsWithRosters,
  fetchTransactions,

  // Mappers
  mapYahooPlayer,
  mapYahooRoster,
  mapYahooTrade,
  mapYahooSettings,
  mapToSleeperState,

  // Crosswalk
  buildCrosswalk,
  lookupSleeperPlayerId,

  // Main connect
  connectLeague,
};

})();
