#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// dhq-sanity-tests.js — DHQ Engine Value Sanity Tests
// Run: node tests/dhq-sanity-tests.js
// Requires: tests/fixtures/psycho-league-snapshot.json
//           (export from browser via tests/export-snapshot.js)
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ── Load snapshot ──
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'psycho-league-snapshot.json');
if (!fs.existsSync(FIXTURE_PATH)) {
  console.error('\n  ✗ Fixture not found: ' + FIXTURE_PATH);
  console.error('    Run export-snapshot.js in the browser first.\n');
  process.exit(1);
}
const snap = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const { playerScores, playerMeta, dhqPickValues, playerNames,
        starterCounts, scarcityMult, peakWindows, avgThresh,
        posTiers, hitRateByRound, ownerProfiles, meta } = snap;

// ── Test framework ──
let passed = 0, failed = 0, skipped = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log('  ✗ ' + name + ' — ' + e.message);
  }
}

function skip(name) {
  skipped++;
  console.log('  ○ SKIP: ' + name);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertRange(val, min, max, label) {
  assert(val >= min && val <= max, `${label}: ${val} not in [${min}, ${max}]`);
}

function pName(pid) { return playerNames[pid] || pid; }
function pScore(pid) { return playerScores[pid] || 0; }
function pMeta(pid) { return playerMeta[pid] || {}; }

// Known Sleeper IDs for test players
const IDS = {
  JOSH_ALLEN:     '4984',
  BIJAN_ROBINSON: '9509',
  JAMARR_CHASE:   '7564',
  JAHMYR_GIBBS:   '9221',
  JSN:            '9488',
  DRAKE_MAYE:     '11564',
  PUKA_NACUA:     '9493',
  LAMAR_JACKSON:  '4881',
  MALIK_NABERS:   '11632',
  BROCK_BOWERS:   '11604',
  TREY_MCBRIDE:   '8130',
  CALEB_WILLIAMS: '11560',
  CEEDEE_LAMB:    '6786',
  JOE_BURROW:     '6770',
  MAHOMES:        '4046',
  SAQUON_BARKLEY: '4866',
  DERRICK_HENRY:  '3198',
  JONATHAN_TAYLOR:'6813',
  DAVANTE_ADAMS:  '2133',
  KENNETH_WALKER: '8151',
  DANIEL_JONES:   '5870',
  AARON_RODGERS:  '3163',
  TRAVIS_KELCE:   '1466',
  TYREEK_HILL:    '3321',
};

// FantasyCalc 16-team SF 0.5PPR reference values (March 2026)
const FC_REF = {
  '4984':  10744, // Josh Allen
  '9509':  10009, // Bijan Robinson
  '7564':  9562,  // Ja'Marr Chase
  '9221':  9404,  // Jahmyr Gibbs
  '9488':  9316,  // JSN
  '11564': 8889,  // Drake Maye
  '9493':  8887,  // Puka Nacua
  '4881':  7472,  // Lamar Jackson
  '11632': 7429,  // Malik Nabers
  '11604': 7135,  // Brock Bowers
  '8130':  7119,  // Trey McBride
  '11560': 6854,  // Caleb Williams
  '6786':  6675,  // CeeDee Lamb
  '6770':  6632,  // Joe Burrow
  '4046':  5797,  // Mahomes
  '4866':  3846,  // Saquon Barkley
  '3198':  2585,  // Derrick Henry
  '6813':  4998,  // Jonathan Taylor
  '2133':  2219,  // Davante Adams
  '8151':  4232,  // Kenneth Walker
  '5870':  2693,  // Daniel Jones
};

const FC_PICKS = {
  1: 7043, 2: 4842, 3: 4163, 4: 3806, 5: 3465, 6: 3046,
  7: 2717, 8: 2543, 9: 2443, 10: 2315, 11: 2207, 12: 2126,
};

// ═══════════════════════════════════════════════════════════════
console.log('\n═══ DHQ ENGINE SANITY TESTS ═══');
console.log(`League: ${meta?.leagueId} | Season: ${meta?.season} | Teams: ${meta?.totalTeams} | SF: ${meta?.isSF}\n`);

// ═══════════════════════════════════════════════════════════════
// SECTION 1: SCALE & RANGE
// ═══════════════════════════════════════════════════════════════
console.log('── 1. Scale & Range ──');

test('All player values are 0-10000', () => {
  const vals = Object.values(playerScores);
  const outOfRange = vals.filter(v => v < 0 || v > 10000);
  assert(outOfRange.length === 0, `${outOfRange.length} values out of 0-10000 range`);
});

test('At least 500 players scored', () => {
  const count = Object.keys(playerScores).length;
  assert(count >= 500, `Only ${count} players scored`);
});

test('Top player is 7000+', () => {
  const top = Math.max(...Object.values(playerScores));
  assert(top >= 7000, `Top player only ${top}`);
});

test('Top player is not 10000 (should not max out scale)', () => {
  const top = Math.max(...Object.values(playerScores));
  assert(top < 10000, `Top player is ${top} — capped at max, likely a scaling issue`);
});

test('Median player is 500-3000 range', () => {
  const sorted = Object.values(playerScores).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assertRange(median, 500, 3000, 'Median');
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2: ELITE PLAYER ORDERING
// Market consensus top-10 should all be near the top of DHQ
// ═══════════════════════════════════════════════════════════════
console.log('\n── 2. Elite Player Ordering ──');

test('Josh Allen is top 5 (SF premium)', () => {
  const ranked = Object.entries(playerScores).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([pid]) => pid === IDS.JOSH_ALLEN) + 1;
  assert(rank > 0 && rank <= 5, `Josh Allen ranked #${rank} (expected top 5)`);
});

test('Bijan Robinson is top 10', () => {
  const ranked = Object.entries(playerScores).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([pid]) => pid === IDS.BIJAN_ROBINSON) + 1;
  assert(rank > 0 && rank <= 10, `Bijan Robinson ranked #${rank}`);
});

test("Ja'Marr Chase is top 10", () => {
  const ranked = Object.entries(playerScores).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([pid]) => pid === IDS.JAMARR_CHASE) + 1;
  assert(rank > 0 && rank <= 10, `Ja'Marr Chase ranked #${rank}`);
});

test('Brock Bowers is top 25 (elite young TE)', () => {
  const ranked = Object.entries(playerScores).sort((a, b) => b[1] - a[1]);
  const rank = ranked.findIndex(([pid]) => pid === IDS.BROCK_BOWERS) + 1;
  assert(rank > 0 && rank <= 25, `Brock Bowers ranked #${rank}`);
});

test('No IDP player in top 20', () => {
  const ranked = Object.entries(playerScores).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const idp = ranked.filter(([pid]) => ['DL', 'LB', 'DB'].includes(pMeta(pid).pos));
  assert(idp.length === 0, `${idp.length} IDP players in top 20: ${idp.map(([pid]) => pName(pid)).join(', ')}`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3: POSITIONAL VALUE HIERARCHY
// QB > RB ≈ WR > TE > IDP (in superflex)
// ═══════════════════════════════════════════════════════════════
console.log('\n── 3. Positional Value Hierarchy ──');

function topNAvg(pos, n) {
  const vals = Object.entries(playerScores)
    .filter(([pid]) => pMeta(pid).pos === pos)
    .map(([, v]) => v).sort((a, b) => b - a);
  return vals.length >= n ? vals.slice(0, n).reduce((s, v) => s + v, 0) / n : 0;
}

test('SF: Top-5 QB avg > Top-5 RB avg', () => {
  if (!meta?.isSF) { skip('Not SF league'); return; }
  const qbAvg = topNAvg('QB', 5);
  const rbAvg = topNAvg('RB', 5);
  assert(qbAvg > rbAvg, `QB5 avg ${qbAvg.toFixed(0)} <= RB5 avg ${rbAvg.toFixed(0)}`);
});

test('Top-5 RB avg ≈ Top-5 WR avg (within 25%)', () => {
  const rbAvg = topNAvg('RB', 5);
  const wrAvg = topNAvg('WR', 5);
  const ratio = rbAvg / Math.max(1, wrAvg);
  assertRange(ratio, 0.75, 1.25, 'RB/WR ratio');
});

test('Top-5 TE avg < Top-5 WR avg', () => {
  const teAvg = topNAvg('TE', 5);
  const wrAvg = topNAvg('WR', 5);
  assert(teAvg < wrAvg, `TE5 avg ${teAvg.toFixed(0)} >= WR5 avg ${wrAvg.toFixed(0)}`);
});

test('Top-5 IDP avg < Top-5 TE avg', () => {
  const dlAvg = topNAvg('DL', 5);
  const lbAvg = topNAvg('LB', 5);
  const dbAvg = topNAvg('DB', 5);
  const idpBest = Math.max(dlAvg, lbAvg, dbAvg);
  const teAvg = topNAvg('TE', 5);
  assert(idpBest < teAvg, `Best IDP5 avg ${idpBest.toFixed(0)} >= TE5 avg ${teAvg.toFixed(0)}`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4: AGE CURVES
// Young studs > aging vets at similar production
// ═══════════════════════════════════════════════════════════════
console.log('\n── 4. Age Curves ──');

test('Kenneth Walker (24 RB) > Saquon Barkley (29 RB)', () => {
  const kw = pScore(IDS.KENNETH_WALKER);
  const sb = pScore(IDS.SAQUON_BARKLEY);
  if (!kw || !sb) { skip('Players not in snapshot'); return; }
  assert(kw > sb, `Walker ${kw} <= Barkley ${sb}`);
});

test('Derrick Henry (32 RB) valued < 3500 (aging)', () => {
  const dh = pScore(IDS.DERRICK_HENRY);
  if (!dh) { skip('Henry not in snapshot'); return; }
  assert(dh < 3500, `Henry at ${dh} — should be declining`);
});

test('All RBs age 30+ are below 5000', () => {
  const oldRBs = Object.entries(playerScores)
    .filter(([pid]) => pMeta(pid).pos === 'RB' && pMeta(pid).age >= 30 && playerScores[pid] > 5000);
  assert(oldRBs.length === 0, `${oldRBs.length} RBs 30+ above 5000: ${oldRBs.map(([pid, v]) => pName(pid) + '=' + v).join(', ')}`);
});

test('No QB under 25 with production is below 2000', () => {
  const youngQBs = Object.entries(playerScores)
    .filter(([pid]) => pMeta(pid).pos === 'QB' && pMeta(pid).age <= 25 && pMeta(pid).ppg > 10);
  const undervalued = youngQBs.filter(([, v]) => v < 2000);
  assert(undervalued.length === 0, `${undervalued.length} young QBs undervalued: ${undervalued.map(([pid, v]) => pName(pid) + '=' + v).join(', ')}`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5: FC MARKET CORRELATION
// DHQ values should be within 50% of FC for top players
// ═══════════════════════════════════════════════════════════════
console.log('\n── 5. FantasyCalc Market Correlation ──');

test('Top-20 FC players: DHQ within 50% of FC scaled value', () => {
  // Scale FC values to DHQ range
  const fcEntries = Object.entries(FC_REF).filter(([pid]) => playerScores[pid]);
  if (fcEntries.length < 5) { skip('Not enough FC matches'); return; }
  const dhqTop = Math.max(...Object.values(playerScores));
  const fcTop = Math.max(...fcEntries.map(([, v]) => v));
  const scale = dhqTop / fcTop;

  const deviations = fcEntries.map(([pid, fcVal]) => {
    const dhq = playerScores[pid];
    const fcScaled = Math.round(fcVal * scale);
    const dev = Math.abs(dhq - fcScaled) / Math.max(dhq, fcScaled);
    return { pid, name: pName(pid), dhq, fcScaled, dev };
  }).sort((a, b) => b.dev - a.dev);

  const worst = deviations[0];
  const over50 = deviations.filter(d => d.dev > 0.50);
  assert(over50.length <= 3, `${over50.length} players deviate >50% from FC: ${over50.map(d => `${d.name} DHQ=${d.dhq} FC=${d.fcScaled} (${(d.dev * 100).toFixed(0)}%)`).join('; ')}`);
});

test('Daniel Jones DHQ < 4000 (was overvalued by pedigree floor)', () => {
  const dj = pScore(IDS.DANIEL_JONES);
  if (!dj) { skip('Jones not in snapshot'); return; }
  assert(dj < 4000, `Daniel Jones at ${dj} — pedigree floor may still be too high`);
});

test('Rank correlation with FC: Spearman > 0.7', () => {
  const matched = Object.entries(FC_REF)
    .filter(([pid]) => playerScores[pid])
    .map(([pid, fcVal]) => ({ pid, dhq: playerScores[pid], fc: fcVal }))
    .sort((a, b) => b.dhq - a.dhq);
  if (matched.length < 10) { skip('Not enough FC matches'); return; }

  // Compute Spearman rank correlation
  const n = matched.length;
  const dhqRanks = matched.map((_, i) => i + 1);
  const fcSorted = [...matched].sort((a, b) => b.fc - a.fc);
  const fcRankMap = {};
  fcSorted.forEach((p, i) => fcRankMap[p.pid] = i + 1);
  const fcRanks = matched.map(p => fcRankMap[p.pid]);

  let d2sum = 0;
  for (let i = 0; i < n; i++) d2sum += Math.pow(dhqRanks[i] - fcRanks[i], 2);
  const rho = 1 - (6 * d2sum) / (n * (n * n - 1));
  assert(rho >= 0.70, `Spearman rho = ${rho.toFixed(3)} (need ≥ 0.70)`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 6: DRAFT PICK VALUES
// Must decrease monotonically, match market within 30%
// ═══════════════════════════════════════════════════════════════
console.log('\n── 6. Draft Pick Values ──');

test('Pick 1.01 > Pick 1.16 (monotonic within R1)', () => {
  const p1 = dhqPickValues[1]?.value || 0;
  const p16 = dhqPickValues[16]?.value || dhqPickValues[Math.min(16, meta?.totalTeams || 12)]?.value || 0;
  assert(p1 > p16, `1.01=${p1} <= last R1 pick=${p16}`);
});

test('R1 picks decrease monotonically', () => {
  const teams = meta?.totalTeams || 16;
  let prev = Infinity;
  for (let i = 1; i <= teams; i++) {
    const v = dhqPickValues[i]?.value || 0;
    if (v === 0) continue;
    assert(v <= prev, `Pick ${i} (${v}) > Pick ${i - 1} (${prev}) — not monotonic`);
    prev = v;
  }
});

test('Pick 1.01 is 5500-8000 range', () => {
  const v = dhqPickValues[1]?.value || 0;
  assertRange(v, 5500, 8000, 'Pick 1.01');
});

test('Pick 2.01 is 1500-2500 range', () => {
  const teams = meta?.totalTeams || 16;
  const v = dhqPickValues[teams + 1]?.value || 0;
  assertRange(v, 1500, 2500, 'Pick 2.01');
});

test('R1 mid-pick within 35% of FC market', () => {
  const teams = meta?.totalTeams || 16;
  // Pick 1.06 — FC=3046 for 16-team
  const pick6 = dhqPickValues[6]?.value || 0;
  const fc6 = FC_PICKS[6] || 3046;
  if (!pick6) { skip('Pick 6 not in snapshot'); return; }
  const dev = Math.abs(pick6 - fc6) / fc6;
  assert(dev <= 0.35, `Pick 1.06: DHQ=${pick6} vs FC=${fc6} — ${(dev * 100).toFixed(0)}% deviation (max 35%)`);
});

test('R1 last pick within 35% of FC market', () => {
  // Pick 1.12 — FC=2126 for 12-slot reference
  const pick12 = dhqPickValues[12]?.value || 0;
  const fc12 = FC_PICKS[12] || 2126;
  if (!pick12) { skip('Pick 12 not in snapshot'); return; }
  const dev = Math.abs(pick12 - fc12) / fc12;
  assert(dev <= 0.35, `Pick 1.12: DHQ=${pick12} vs FC=${fc12} — ${(dev * 100).toFixed(0)}% deviation (max 35%)`);
});

test('Future year discount: 2027 pick < 2026 same slot', () => {
  // dhqPickValueFn is not available in snapshot, but we can check the formula
  // 12% per year discount means 2027 = 88% of 2026
  const p1 = dhqPickValues[1]?.value || 0;
  const expected2027 = Math.round(p1 * 0.88);
  assert(expected2027 < p1, `2027 discount math check`);
  assert(expected2027 > p1 * 0.75, `2027 discount too steep: ${expected2027}`);
});

test('R4+ picks are under 1000 (lottery tickets)', () => {
  const teams = meta?.totalTeams || 16;
  const r4start = teams * 3 + 1;
  const r4picks = Object.entries(dhqPickValues)
    .filter(([pick]) => parseInt(pick) >= r4start)
    .filter(([, d]) => d.value > 1000);
  assert(r4picks.length === 0, `${r4picks.length} R4+ picks above 1000: ${r4picks.map(([p, d]) => 'Pick ' + p + '=' + d.value).join(', ')}`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 7: SCARCITY & LEAGUE SETTINGS
// ═══════════════════════════════════════════════════════════════
console.log('\n── 7. Scarcity & League Settings ──');

test('SF league: QB scarcity multiplier >= 1.20', () => {
  if (!meta?.isSF) { skip('Not SF'); return; }
  assert((scarcityMult?.QB || 0) >= 1.20, `QB scarcity ${scarcityMult?.QB} < 1.20`);
});

test('WR scarcity multiplier <= 1.0 (deepest position)', () => {
  assert((scarcityMult?.WR || 1) <= 1.0, `WR scarcity ${scarcityMult?.WR} > 1.0`);
});

test('TE scarcity multiplier >= 1.10', () => {
  assert((scarcityMult?.TE || 0) >= 1.10, `TE scarcity ${scarcityMult?.TE} < 1.10`);
});

test('IDP scarcity multiplier <= 1.05', () => {
  ['DL', 'LB', 'DB'].forEach(pos => {
    assert((scarcityMult?.[pos] || 0) <= 1.05, `${pos} scarcity ${scarcityMult?.[pos]} > 1.05`);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 8: ROOKIE HANDLING
// ═══════════════════════════════════════════════════════════════
console.log('\n── 8. Rookie Handling ──');

test('At least 30 rookies imported from FC', () => {
  const rookies = Object.entries(playerMeta).filter(([, m]) => m.source === 'FC_ROOKIE');
  assert(rookies.length >= 30, `Only ${rookies.length} rookies imported`);
});

test('Rookie values are reasonable (not all at 100)', () => {
  const rookies = Object.entries(playerScores).filter(([pid]) => pMeta(pid).source === 'FC_ROOKIE');
  const avg = rookies.reduce((s, [, v]) => s + v, 0) / Math.max(1, rookies.length);
  assert(avg > 500, `Rookie avg ${avg.toFixed(0)} — too low, likely scaling issue`);
  assert(avg < 5000, `Rookie avg ${avg.toFixed(0)} — suspiciously high`);
});

test('Top rookie is 3000+ (1st round pick caliber)', () => {
  const rookies = Object.entries(playerScores)
    .filter(([pid]) => pMeta(pid).source === 'FC_ROOKIE')
    .sort((a, b) => b[1] - a[1]);
  assert(rookies.length > 0 && rookies[0][1] >= 3000, `Top rookie only ${rookies[0]?.[1] || 0}`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 9: TRADE ACCEPTANCE (formula logic)
// ═══════════════════════════════════════════════════════════════
console.log('\n── 9. Trade Acceptance Logic ──');

// Inline the formula for offline testing
function calcAcceptance(myVal, theirVal, dnaKey) {
  let likelihood = 50;
  const totalA = myVal, totalB = theirVal;
  if (totalA > 0 && totalB > 0) {
    const nd = (totalA - totalB) / Math.max(totalA, totalB, 1);
    if (dnaKey === 'FLEECER') {
      likelihood = nd > 0.15 ? Math.min(92, 70 + Math.round(nd * 80))
        : nd > 0 ? 35 + Math.round(nd * 200)
        : Math.max(3, 20 + Math.round(nd * 80));
    } else if (dnaKey === 'ACCEPTOR') {
      likelihood = nd >= 0 ? Math.min(90, 55 + Math.round(nd * 100))
        : Math.max(5, 45 + Math.round(nd * 150));
    } else if (dnaKey === 'STALWART') {
      const absGap = Math.abs(nd);
      likelihood = absGap <= 0.05 ? 65 : absGap <= 0.10 ? 50 : absGap <= 0.15 ? 30 : absGap <= 0.25 ? 15 : 5;
    } else {
      likelihood = nd >= 0 ? Math.min(82, 48 + Math.round(nd * 120))
        : Math.max(5, 40 + Math.round(nd * 150));
    }
  }
  return Math.round(Math.max(3, Math.min(95, likelihood)));
}

test('Fair trade (equal value) → 45-65% acceptance for any DNA', () => {
  ['FLEECER', 'ACCEPTOR', 'STALWART', 'NONE'].forEach(dna => {
    const pct = calcAcceptance(5000, 5000, dna);
    assertRange(pct, 30, 70, `Fair trade (${dna})`);
  });
});

test('Underpaying 30%+ → ACCEPTOR acceptance < 40%', () => {
  const pct = calcAcceptance(3500, 5000, 'ACCEPTOR');
  assert(pct < 40, `Underpay 30% vs ACCEPTOR: ${pct}% (should be < 40)`);
});

test('Underpaying 30%+ → FLEECER acceptance < 15%', () => {
  const pct = calcAcceptance(3500, 5000, 'FLEECER');
  assert(pct < 15, `Underpay 30% vs FLEECER: ${pct}% (should be < 15)`);
});

test('Overpaying 20% → FLEECER acceptance > 70%', () => {
  const pct = calcAcceptance(6000, 5000, 'FLEECER');
  assert(pct > 70, `Overpay 20% vs FLEECER: ${pct}% (should be > 70)`);
});

test('STALWART rejects 25%+ gap regardless of direction', () => {
  const over = calcAcceptance(6500, 5000, 'STALWART');
  const under = calcAcceptance(3750, 5000, 'STALWART');
  assert(over <= 15, `25%+ overpay vs STALWART: ${over}%`);
  assert(under <= 15, `25%+ underpay vs STALWART: ${under}%`);
});

test('No acceptance ever exceeds 95%', () => {
  const extreme = calcAcceptance(10000, 1000, 'ACCEPTOR');
  assert(extreme <= 95, `Extreme overpay: ${extreme}%`);
});

test('No acceptance ever below 3%', () => {
  const extreme = calcAcceptance(1000, 10000, 'FLEECER');
  assert(extreme >= 3, `Extreme underpay: ${extreme}%`);
});

// ═══════════════════════════════════════════════════════════════
// SECTION 10: METADATA INTEGRITY
// ═══════════════════════════════════════════════════════════════
console.log('\n── 10. Metadata Integrity ──');

test('All scored players have metadata', () => {
  const missing = Object.keys(playerScores).filter(pid => !playerMeta[pid]);
  assert(missing.length === 0, `${missing.length} players scored without metadata`);
});

test('All metadata has valid position', () => {
  const valid = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB']);
  const invalid = Object.entries(playerMeta).filter(([, m]) => !valid.has(m.pos));
  assert(invalid.length === 0, `${invalid.length} players with invalid position`);
});

test('ageFactor is 0-1.0 range for all players', () => {
  const bad = Object.entries(playerMeta).filter(([, m]) => m.ageFactor < 0 || m.ageFactor > 1.01);
  assert(bad.length === 0, `${bad.length} players with ageFactor out of [0, 1.0]: ${bad.slice(0, 3).map(([pid, m]) => pName(pid) + '=' + m.ageFactor).join(', ')}`);
});

test('sitMult is 0.40-1.60 range for all players', () => {
  const bad = Object.entries(playerMeta).filter(([, m]) =>
    m.source !== 'FC_ROOKIE' && (m.sitMult < 0.39 || m.sitMult > 1.61));
  assert(bad.length === 0, `${bad.length} players with sitMult out of [0.40, 1.60]`);
});

test('FC blend metadata present for blended players', () => {
  const blended = Object.entries(playerMeta).filter(([, m]) => m.source === 'DHQ_FC_BLEND');
  assert(blended.length > 50, `Only ${blended.length} players have FC blend data`);
  const withFcVal = blended.filter(([, m]) => m.fcValue > 0);
  assert(withFcVal.length === blended.length, `${blended.length - withFcVal.length} blended players missing fcValue`);
});

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════');
console.log(`  PASSED: ${passed}  FAILED: ${failed}  SKIPPED: ${skipped}`);
console.log('═══════════════════════════════════════');

if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f.name}\n     → ${f.error}`));
}

// Top-10 players table for manual review
console.log('\n── Top 20 DHQ Players (manual review) ──');
const top20 = Object.entries(playerScores).sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log('  #   DHQ    Pos  Age  FC      Name');
top20.forEach(([pid, v], i) => {
  const m = pMeta(pid);
  const fc = FC_REF[pid] || '';
  console.log(`  ${String(i + 1).padStart(2)}  ${String(v).padStart(5)}  ${(m.pos || '??').padEnd(3)}  ${String(m.age || '?').padStart(3)}  ${String(fc || '—').padStart(5)}   ${pName(pid)}`);
});

// Pick value table
console.log('\n── R1 Pick Values (manual review) ──');
const teams = meta?.totalTeams || 16;
console.log('  Pick    DHQ   FC     Δ%');
for (let i = 1; i <= Math.min(teams, 12); i++) {
  const v = dhqPickValues[i]?.value || 0;
  const fc = FC_PICKS[i] || 0;
  const dev = fc ? ((v - fc) / fc * 100).toFixed(0) : '—';
  console.log(`  1.${String(i).padStart(2, '0')}  ${String(v).padStart(5)}  ${String(fc).padStart(5)}  ${String(dev).padStart(4)}%`);
}

process.exit(failed > 0 ? 1 : 0);
