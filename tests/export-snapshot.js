// ═══════════════════════════════════════════════════════════════
// SNAPSHOT EXPORTER — paste into browser DevTools console
// ═══════════════════════════════════════════════════════════════
// 1. Open https://jcc100218.github.io/ReconAI/ in Chrome
// 2. Connect to league, wait for green "DHQ ✓" status
// 3. Open DevTools (Cmd+Option+J on Mac, F12 on Windows)
// 4. Paste ALL of this code and press Enter
// 5. JSON file downloads → move to tests/fixtures/psycho-league-snapshot.json
// ═══════════════════════════════════════════════════════════════

var _LI = window.App && window.App.LI;
var _S = window.S || (window.App && window.App.S);

if (!_LI || !_LI.playerScores || Object.keys(_LI.playerScores).length === 0) {
  console.error('❌ DHQ engine not loaded yet. Check:');
  console.log('   window.App.LI_LOADED =', window.App && window.App.LI_LOADED);
  console.log('   window.App.LI =', _LI);
  console.log('   playerScores keys:', _LI && _LI.playerScores ? Object.keys(_LI.playerScores).length : 0);
  throw new Error('Wait for DHQ ✓ indicator, then try again.');
}

console.log('✓ Found', Object.keys(_LI.playerScores).length, 'player scores');
console.log('✓ Found', Object.keys(_LI.dhqPickValues || {}).length, 'pick values');

var _snapshot = {
  meta: {
    exportedAt: new Date().toISOString(),
    leagueId: _S && _S.currentLeagueId,
    season: _S && _S.season,
    totalTeams: _S && _S.rosters ? _S.rosters.length : 16,
    isSF: _S && _S.leagues && _S.leagues[0] && _S.leagues[0].roster_positions
      ? _S.leagues[0].roster_positions.indexOf('SUPER_FLEX') >= 0
      : false,
    ppr: _S && _S.leagues && _S.leagues[0] && _S.leagues[0].scoring_settings
      ? _S.leagues[0].scoring_settings.rec
      : 0.5,
  },
  playerScores: _LI.playerScores,
  playerMeta: {},
  dhqPickValues: _LI.dhqPickValues || {},
  starterCounts: _LI.starterCounts || {},
  scarcityMult: _LI.scarcityMult || {},
  peakWindows: _LI.peakWindows || {},
  avgThresh: _LI.avgThresh || {},
  posTiers: _LI.posTiers || {},
  hitRateByRound: _LI.hitRateByRound || {},
  totalPicks: _LI.totalPicks || 0,
  rookieCount: _LI.rookieCount || 0,
  ownerProfiles: _LI.ownerProfiles || {},
  tradeHistory: (_LI.tradeHistory || []).slice(0, 30),
  playerNames: {},
};

// Build playerMeta (compact)
var _pm = _LI.playerMeta || {};
var _pmKeys = Object.keys(_pm);
for (var i = 0; i < _pmKeys.length; i++) {
  var _pid = _pmKeys[i];
  var _m = _pm[_pid];
  _snapshot.playerMeta[_pid] = {
    pos: _m.pos, ppg: _m.ppg, age: _m.age, ageFactor: _m.ageFactor,
    sitMult: _m.sitMult, peakYrsLeft: _m.peakYrsLeft,
    starterSeasons: _m.starterSeasons, source: _m.source,
    fcValue: _m.fcValue, fcScaled: _m.fcScaled, dhqRaw: _m.dhqRaw,
    fcWeight: _m.fcWeight,
  };
}

// Build playerNames
var _psKeys = Object.keys(_LI.playerScores);
var _players = _S && _S.players ? _S.players : {};
for (var j = 0; j < _psKeys.length; j++) {
  var _pid2 = _psKeys[j];
  var _p = _players[_pid2];
  _snapshot.playerNames[_pid2] = _p
    ? (_p.full_name || ((_p.first_name || '') + ' ' + (_p.last_name || '')).trim() || _pid2)
    : _pid2;
}

// Download
var _json = JSON.stringify(_snapshot, null, 2);
var _blob = new Blob([_json], { type: 'application/json' });
var _url = URL.createObjectURL(_blob);
var _a = document.createElement('a');
_a.href = _url;
_a.download = 'psycho-league-snapshot.json';
document.body.appendChild(_a);
_a.click();
document.body.removeChild(_a);
setTimeout(function() { URL.revokeObjectURL(_url); }, 1000);

console.log('✅ Snapshot exported!');
console.log('   ' + Object.keys(_snapshot.playerScores).length + ' players');
console.log('   ' + Object.keys(_snapshot.dhqPickValues).length + ' pick values');
console.log('   ' + Object.keys(_snapshot.playerMeta).length + ' with metadata');
console.log('   Move the downloaded file to: tests/fixtures/psycho-league-snapshot.json');
