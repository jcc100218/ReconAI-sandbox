// tests/export-snapshot.js — Run in browser console after DHQ engine loads
// Captures a snapshot of LI data for offline testing
//
// Usage:
//   1. Open ReconAI in browser, connect to league, wait for "DHQ ✓"
//   2. Open DevTools console
//   3. Paste this entire file and press Enter
//   4. A JSON file will download — move it to tests/fixtures/psycho-league-snapshot.json

(function exportSnapshot() {
  const LI = window.App?.LI || window.LI;
  if (!LI || !LI.playerScores) {
    console.error('DHQ engine not loaded. Wait for "DHQ ✓" indicator.');
    return;
  }
  const S = window.App?.S || window.S;

  // Build compact snapshot (skip large arrays to keep file manageable)
  const snapshot = {
    meta: {
      exportedAt: new Date().toISOString(),
      leagueId: S?.currentLeagueId,
      season: S?.season,
      totalTeams: S?.rosters?.length || 16,
      isSF: (S?.leagues?.[0]?.roster_positions || []).includes('SUPER_FLEX'),
      ppr: S?.leagues?.[0]?.scoring_settings?.rec ?? 0.5,
    },

    // Player values — all of them
    playerScores: LI.playerScores,

    // Player meta (compact: only fields tests need)
    playerMeta: Object.fromEntries(
      Object.entries(LI.playerMeta || {}).map(([pid, m]) => [pid, {
        pos: m.pos, ppg: m.ppg, age: m.age, ageFactor: m.ageFactor,
        sitMult: m.sitMult, peakYrsLeft: m.peakYrsLeft,
        starterSeasons: m.starterSeasons, source: m.source,
        fcValue: m.fcValue, fcScaled: m.fcScaled, dhqRaw: m.dhqRaw,
        fcWeight: m.fcWeight,
      }])
    ),

    // Pick values
    dhqPickValues: LI.dhqPickValues,

    // Positional analysis
    starterCounts: LI.starterCounts,
    scarcityMult: LI.scarcityMult,
    peakWindows: LI.peakWindows,
    avgThresh: LI.avgThresh,
    posTiers: LI.posTiers,

    // Draft stats
    hitRateByRound: LI.hitRateByRound,
    totalPicks: LI.totalPicks,
    rookieCount: LI.rookieCount,

    // Trade intel
    ownerProfiles: LI.ownerProfiles,
    tradeHistory: (LI.tradeHistory || []).slice(0, 30), // cap for size

    // Player name lookup (for readable test output)
    playerNames: Object.fromEntries(
      Object.keys(LI.playerScores).map(pid => {
        const p = S?.players?.[pid];
        return [pid, p ? (p.full_name || `${p.first_name} ${p.last_name}`.trim()) : pid];
      })
    ),
  };

  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'psycho-league-snapshot.json';
  a.click();
  URL.revokeObjectURL(url);
  console.log(`Snapshot exported: ${Object.keys(snapshot.playerScores).length} players, ${Object.keys(snapshot.dhqPickValues).length} picks`);
})();
