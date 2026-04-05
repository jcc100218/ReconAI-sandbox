// ── ESPN API — Scout App Layer ─────────────────────────────────────────────
// Supplemental helpers for ESPN leagues in War Room Scout.
// NOTE: The primary connection flow (connectESPN, showESPNTeamPicker,
// selectESPNTeam, _updateLeaguePillESPN) lives in js/app.js.
// This file adds:
//   ESPN_KEYS  — canonical localStorage key registry for ESPN credentials
//   loadESPNLeague() — lightweight re-fetch for post-connect refreshes
//
// Requires shared/espn-api.js (window.ESPN) and js/app.js to be loaded first.

window.App = window.App || {};

// ── ESPN storage key registry ─────────────────────────────────────────────
// Centralises the localStorage keys used by app.js's ESPN flow so they are
// never hardcoded in multiple places.  app.js uses these same raw strings;
// this object makes them referable from other modules (js/espn-api.js loads
// after app.js so app.js still uses the string literals directly).
var ESPN_KEYS = {
  LEAGUE_ID: 'espn_league_id',  // ESPN numeric league ID
  YEAR:      'espn_year',       // Season year string e.g. '2025'
  ESPN_S2:   'espn_s2',         // espn_s2 cookie value (for proxy)
  SWID:      'espn_swid',       // SWID cookie value (for proxy)
  MY_TEAM:   'espn_my_team',    // User's ESPN team ID (1–N)
};
window.ESPN_KEYS = ESPN_KEYS;
window.App.ESPN_KEYS = ESPN_KEYS;

// ── loadESPNLeague ────────────────────────────────────────────────────────
// Lightweight refresh of ESPN data into S.* — used when returning to an
// already-connected ESPN league (e.g. switching tabs, reloading stats)
// without re-showing the team picker UI.
//
// Populates: S.players, S.rosters, S.leagueUsers, S.leagues
// Does NOT change S.myRosterId (preserves the user's selected team).
async function loadESPNLeague() {
  var leagueId = localStorage.getItem(ESPN_KEYS.LEAGUE_ID);
  var year     = parseInt(localStorage.getItem(ESPN_KEYS.YEAR) || String(new Date().getFullYear()));
  var espnS2   = localStorage.getItem(ESPN_KEYS.ESPN_S2) || '';
  var swid     = localStorage.getItem(ESPN_KEYS.SWID)    || '';

  if (!leagueId) { console.warn('[ESPN] loadESPNLeague: no saved league ID'); return; }
  if (!window.ESPN) { console.warn('[ESPN] loadESPNLeague: window.ESPN not loaded'); return; }

  var result = await window.ESPN.connectLeague(
    leagueId, year, espnS2 || null, swid || null, null
  );

  // Fetch and map transactions in the background
  window.ESPN.fetchTransactions(leagueId, String(year), espnS2 || null, swid || null)
    .then(function(txData) {
      var week = (window.S || {}).currentWeek || 1;
      var S_ref = window.S || window.App.S;
      if (!S_ref) return;

      // Waiver / FA pickups → Sleeper-ish transaction format
      var waivers = (txData.transactions || [])
        .filter(function(t) { return t.type === 'WAIVER' || t.type === 'FREE_AGENT'; })
        .map(function(t) {
          var adds = {}, drops = {};
          (t.items || []).forEach(function(item) {
            if (item.type === 'ADD'  && item.toTeamId   > 0) adds[String(item.playerId)]  = item.toTeamId;
            if (item.type === 'DROP' && item.fromTeamId > 0) drops[String(item.playerId)] = item.fromTeamId;
          });
          return {
            type:    t.type === 'WAIVER' ? 'waiver' : 'free_agent',
            status:  'complete',
            adds:    adds,
            drops:   drops,
            created: t.processDate || t.proposedDate || 0,
            week:    t.scoringPeriodId || week,
            _source: 'espn',
          };
        });
      if (!S_ref.transactions['w' + week]) S_ref.transactions['w' + week] = [];
      S_ref.transactions['w' + week] = waivers;

      // Store mapped trades for DHQ / Owner DNA
      S_ref.espnTrades = (txData.transactions || [])
        .filter(function(t) { return t.type === 'TRADE'; })
        .map(window.ESPN.mapESPNTrade);

      if (typeof renderWaivers === 'function') try { renderWaivers(); } catch(e) {}
      if (typeof renderTrades  === 'function') try { renderTrades();  } catch(e) {}
    })
    .catch(function(e) { console.warn('[ESPN] transaction fetch error:', e); });

  return result;
}
window.loadESPNLeague = loadESPNLeague;
window.App.loadESPNLeague = loadESPNLeague;
