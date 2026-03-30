#!/usr/bin/env node
// Generates a synthetic test fixture from FantasyCalc API data
// Run: node tests/generate-synthetic-fixture.js
// Output: tests/fixtures/psycho-league-snapshot.json

const fs = require('fs');
const path = require('path');
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching FantasyCalc 16-team SF 0.5PPR data...');
  const fc = await fetch('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=16&ppr=0.5');
  console.log(`Got ${fc.length} entries from FC`);

  const playerScores = {};
  const playerMeta = {};
  const playerNames = {};

  // Scale FC values to DHQ 0-10000 range
  // FC top is ~10744, DHQ top should be ~9200 (not maxing out)
  const fcTop = Math.max(...fc.map(d => d.value || 0));
  const scaleFactor = 9200 / fcTop;

  const peakWindows = {QB:[24,34],RB:[22,27],WR:[22,30],TE:[23,30],DL:[23,29],LB:[23,28],DB:[23,29]};
  const posMap = p => { if (['DE','DT','OLB'].includes(p)) return 'DL'; if (['CB','S','FS','SS'].includes(p)) return 'DB'; return p; };

  let rookieCount = 0;
  let vetCount = 0;

  fc.forEach(d => {
    const sid = d.player?.sleeperId;
    const pos = posMap(d.player?.position || '');
    const val = d.value || 0;
    const name = d.player?.name || 'Unknown';
    if (!sid || !pos || pos === 'PICK' || val <= 0) return;
    if (!['QB','RB','WR','TE','K','DL','LB','DB'].includes(pos)) return;

    const dhqVal = Math.min(10000, Math.max(0, Math.round(val * scaleFactor)));
    const age = d.player?.maybeAge ? Math.round(d.player.maybeAge) : 25;
    const peakEnd = (peakWindows[pos] || [23, 29])[1];
    const peakYrsLeft = Math.max(0, peakEnd - age);
    const yoe = d.player?.maybeYoe || 0;
    const isRookie = yoe === 0;

    // Simulate ageFactor
    const peakStart = (peakWindows[pos] || [23, 29])[0];
    let ageFactor = 1.0;
    if (age < peakStart) ageFactor = 0.80 + 0.20 * (1 - (peakStart - age) / Math.max(1, peakStart - 18));
    else if (age > peakEnd) ageFactor = Math.max(0.03, 1.0 - (age - peakEnd) * ({QB:0.06,RB:0.25,WR:0.14,TE:0.12,DL:0.15,LB:0.15,DB:0.14}[pos] || 0.13));

    // Simulate sitMult (1.0 baseline with minor variation)
    const sitMult = isRookie ? 1.0 : Math.max(0.40, Math.min(1.60, 0.85 + dhqVal / 10000 * 0.75));

    playerScores[sid] = dhqVal;
    playerNames[sid] = name;
    playerMeta[sid] = {
      pos, ppg: dhqVal / 400, age, ageFactor: +ageFactor.toFixed(4),
      sitMult: +sitMult.toFixed(4), peakYrsLeft,
      starterSeasons: isRookie ? 0 : Math.min(8, Math.max(0, Math.floor(dhqVal / 1500))),
      source: isRookie ? 'FC_ROOKIE' : 'DHQ_FC_BLEND',
      fcValue: val, fcScaled: dhqVal, dhqRaw: dhqVal,
      fcWeight: 25,
    };

    if (isRookie) rookieCount++; else vetCount++;
  });

  // Generate pick values using the new convex decay formula
  const totalTeams = 16;
  const sizeAdj = 1 + (totalTeams - 12) * 0.04;
  const INDUSTRY_PICK_START = {1:7200, 2:1950, 3:1200, 4:850, 5:500, 6:250, 7:125};
  const INDUSTRY_PICK_END   = {1:2100, 2:1200, 3:850,  4:650, 5:300, 6:150, 7:75};
  const DECAY_RATE = {1:2.8, 2:1.8, 3:1.5, 4:1.2, 5:1.0, 6:1.0, 7:1.0};

  const dhqPickValues = {};
  const maxPicks = totalTeams * 7;
  for (let pick = 1; pick <= maxPicks; pick++) {
    const rd = Math.ceil(pick / totalTeams);
    const posInRound = ((pick - 1) % totalTeams) + 1;
    const pickPct = (posInRound - 1) / Math.max(1, totalTeams - 1);
    const iBase = INDUSTRY_PICK_START[rd] || 50;
    const iEnd = INDUSTRY_PICK_END[rd] || 25;
    const iDecay = DECAY_RATE[rd] || 1.5;
    const value = Math.round(iEnd + (iBase - iEnd) * Math.exp(-iDecay * pickPct * sizeAdj));
    dhqPickValues[pick] = {
      value,
      hitRate: Math.max(0, 60 - rd * 12),
      starterRate: Math.max(0, 70 - rd * 10),
      avgNorm: 100 - rd * 15,
      samples: 5,
    };
  }

  const snapshot = {
    meta: {
      exportedAt: new Date().toISOString(),
      leagueId: 'synthetic-psycho-league',
      season: '2026',
      totalTeams,
      isSF: true,
      ppr: 0.5,
      synthetic: true,
    },
    playerScores,
    playerMeta,
    dhqPickValues,
    starterCounts: { QB: 2, RB: 3, WR: 3, TE: 2, DL: 2, LB: 2, DB: 2, K: 1 },
    scarcityMult: { QB: 1.25, RB: 1.0, WR: 0.95, TE: 1.15, DL: 0.92, LB: 0.92, DB: 0.92 },
    peakWindows,
    avgThresh: {
      QB: { starterLine: 280, eliteLine: 350 },
      RB: { starterLine: 180, eliteLine: 250 },
      WR: { starterLine: 180, eliteLine: 240 },
      TE: { starterLine: 140, eliteLine: 200 },
      DL: { starterLine: 100, eliteLine: 140 },
      LB: { starterLine: 100, eliteLine: 140 },
      DB: { starterLine: 90, eliteLine: 130 },
    },
    posTiers: {},
    hitRateByRound: { 1: { total: 40, hits: 12, starters: 20, rate: 50, eliteRate: 30 } },
    totalPicks: 300,
    rookieCount,
    ownerProfiles: {},
    tradeHistory: [],
    playerNames,
  };

  const outPath = path.join(__dirname, 'fixtures', 'psycho-league-snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅ Fixture written: ${outPath}`);
  console.log(`   ${Object.keys(playerScores).length} players (${vetCount} vets, ${rookieCount} rookies)`);
  console.log(`   ${Object.keys(dhqPickValues).length} pick values`);
  console.log(`   Top player: ${playerNames[Object.entries(playerScores).sort((a,b) => b[1]-a[1])[0][0]]} = ${Math.max(...Object.values(playerScores))}`);
  console.log(`   Pick 1.01 = ${dhqPickValues[1].value}, Pick 2.01 = ${dhqPickValues[totalTeams+1].value}`);
}

main().catch(e => { console.error('Failed:', e); process.exit(1); });
