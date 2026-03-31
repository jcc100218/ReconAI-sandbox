// ═══════════════════════════════════════════════════════════════
// ReconAI Automated QA Bot
// Paste this entire script into the browser console at:
// https://jcc100218.github.io/ReconAI/
// Wait for DHQ engine to load first (green dots in status bar)
// ═══════════════════════════════════════════════════════════════

(function() {
  'use strict';
  const R = { pass: [], fail: [], warn: [] };
  const p = (t) => { R.pass.push(t); console.log(`  ✅ ${t}`); };
  const f = (t, d) => { const msg = t + (d ? ': ' + d : ''); R.fail.push(msg); console.log(`  ❌ FAIL: ${msg}`); };
  const w = (t, d) => { const msg = t + (d ? ': ' + d : ''); R.warn.push(msg); console.log(`  ⚠️  WARN: ${msg}`); };

  console.log('\n' + '═'.repeat(60));
  console.log('  🔍 RECONAI QA BOT — Automated Bug Finder');
  console.log('  ' + new Date().toLocaleString());
  console.log('═'.repeat(60));

  // ── SECTION 1: ENGINE HEALTH ──
  console.log('\n📊 SECTION 1: ENGINE HEALTH\n');

  const LI = window.App?.LI;
  const S = window.App?.S || window.S;
  const scores = LI?.playerScores || {};
  const meta = LI?.playerMeta || {};
  const pv = LI?.dhqPickValues || {};

  if (window.App?.LI_LOADED) p('DHQ engine loaded');
  else f('DHQ engine NOT loaded — wait for green dots then re-run');

  const playerCount = Object.keys(scores).length;
  if (playerCount > 1500) p(`${playerCount} players scored`);
  else if (playerCount > 0) w(`Only ${playerCount} players scored (expected 1500+)`);
  else f('Zero players scored');

  const pickCount = Object.keys(pv).length;
  if (pickCount >= 48) p(`${pickCount} pick slots valued`);
  else f(`Only ${pickCount} pick slots (expected 48+)`);

  // Key functions exist
  if (typeof dynastyValue === 'function') p('dynastyValue() exists');
  else f('dynastyValue() function missing');
  if (typeof getPlayerRank === 'function') p('getPlayerRank() exists');
  else f('getPlayerRank() function missing');

  // ── SECTION 2: PLAYER VALUE SANITY ──
  console.log('\n🏈 SECTION 2: PLAYER VALUE SANITY\n');

  const findPid = (name) => Object.entries(S?.players || {}).find(
    ([id, pl]) => (pl.full_name || '').toLowerCase() === name.toLowerCase()
  )?.[0];

  // Top player check
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const topName = S?.players?.[sorted[0][0]]?.full_name || sorted[0][0];
    if (sorted[0][1] > 7000) p(`Top player: ${topName} (${sorted[0][1]} DHQ)`);
    else f(`Top player only ${sorted[0][1]} DHQ — expected 7000+`);
  }

  // No values over 10000
  const overMax = sorted.filter(([, v]) => v > 10000);
  if (overMax.length === 0) p('All DHQ values within 0-10000');
  else f(`${overMax.length} players exceed 10000 DHQ`);

  // Aging player checks
  const checks = [
    { name: 'Aaron Rodgers', maxDHQ: 1500, reason: 'age 42 QB should be near-zero' },
    { name: 'Daniel Jones', maxDHQ: 5000, reason: 'mid-tier QB not elite' },
    { name: 'Travis Kelce', maxDHQ: 5000, reason: 'age 36 TE declining' },
  ];
  checks.forEach(({ name, maxDHQ, reason }) => {
    const pid = findPid(name);
    if (!pid) { w(`${name} not found in player data`); return; }
    const val = scores[pid] || 0;
    if (val <= maxDHQ) p(`${name}: ${val} DHQ (${reason})`);
    else w(`${name}: ${val} DHQ — may be overvalued (${reason})`);
  });

  // AgeFactor range check
  const badAF = Object.entries(meta).filter(([, m]) => m.ageFactor > 1.01 || m.ageFactor < 0);
  if (badAF.length === 0) p('All ageFactors in valid range (0-1.0)');
  else f(`${badAF.length} players have ageFactor outside 0-1.0`);

  // SitMult range check
  const badSM = Object.entries(meta).filter(([, m]) => m.sitMult > 1.61 || m.sitMult < 0.39);
  if (badSM.length === 0) p('All sitMults in valid range (0.40-1.60)');
  else f(`${badSM.length} players have sitMult outside range`);

  // ── SECTION 3: PICK VALUE CHECKS ──
  console.log('\n📋 SECTION 3: PICK VALUES\n');

  const teams = S?.rosters?.length || 16;

  // Monotonic decrease check
  let violations = 0;
  let violationExamples = [];
  for (let i = 1; i < teams * 7; i++) {
    const curr = pv[i]?.value || 0;
    const next = pv[i + 1]?.value || 0;
    if (next > curr && curr > 0 && next > 0) {
      violations++;
      if (violationExamples.length < 3) {
        const r1 = Math.ceil(i / teams), p1 = ((i - 1) % teams) + 1;
        const r2 = Math.ceil((i + 1) / teams), p2 = (i % teams) + 1;
        violationExamples.push(`${r1}.${p1}(${curr}) < ${r2}.${p2}(${next})`);
      }
    }
  }
  if (violations === 0) p('Pick values decrease monotonically');
  else f(`${violations} pick order violations`, violationExamples.join(', '));

  // Value range checks
  const p1 = pv[1]?.value || 0;
  const pLast1 = pv[teams]?.value || 0;
  const p2_1 = pv[teams + 1]?.value || 0;
  if (p1 > 5000) p(`Pick 1.01 = ${p1} (elite range)`);
  else w(`Pick 1.01 = ${p1} — expected 5000+`);
  if (pLast1 > p2_1) p(`Late 1st (${pLast1}) > Early 2nd (${p2_1})`);
  else f(`Late 1st (${pLast1}) < Early 2nd (${p2_1}) — round boundary broken`);

  // Blend weights check
  if (pv[1]?.blendWeights?.league > 0) p(`Blend: ${pv[1].blendWeights.league}% league / ${pv[1].blendWeights.industry}% industry`);
  else w('Blend weights missing from pick values');

  // ── SECTION 4: UI CHECKS ──
  console.log('\n🎨 SECTION 4: UI CHECKS\n');

  // Font size check
  let tinyCount = 0;
  const tinyExamples = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const txt = el.textContent?.trim();
    if (fs > 0 && fs < 13 && txt?.length > 0 && txt.length < 200
        && cs.display !== 'none' && cs.visibility !== 'hidden'
        && el.offsetParent !== null) {
      tinyCount++;
      if (tinyExamples.length < 5) {
        tinyExamples.push(`${el.tagName}.${(el.className || '').split(' ')[0]}: ${fs}px "${txt.substring(0, 25)}"`);
      }
    }
  });
  if (tinyCount === 0) p('All visible text ≥ 13px');
  else f(`${tinyCount} elements below 13px`, tinyExamples.join(' | '));

  // Broken images check
  let brokenImgs = 0;
  let totalImgs = 0;
  document.querySelectorAll('img').forEach(img => {
    if (img.offsetParent === null) return; // hidden
    totalImgs++;
    if (!img.complete || img.naturalWidth === 0) brokenImgs++;
  });
  if (brokenImgs === 0) p(`All ${totalImgs} visible images loaded`);
  else f(`${brokenImgs}/${totalImgs} visible images broken`);

  // Overflow check
  const overflows = [];
  document.querySelectorAll('.header, nav, [class*="tab-bar"], [class*="bottom"]').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 5) {
      overflows.push(`${el.tagName}.${(el.className || '').split(' ')[0]}: ${el.scrollWidth}px > ${el.clientWidth}px`);
    }
  });
  if (overflows.length === 0) p('No horizontal overflow detected');
  else w(`${overflows.length} overflow elements`, overflows.join(' | '));

  // ── SECTION 5: TRADE ACCEPTANCE MATH ──
  console.log('\n🤝 SECTION 5: TRADE ACCEPTANCE MATH\n');

  // Find the acceptance function
  const hasTradeFn = typeof calcAcceptanceLikelihood === 'function'
    || typeof window.calcAcceptanceLikelihood === 'function';

  if (hasTradeFn) {
    const calc = window.calcAcceptanceLikelihood || calcAcceptanceLikelihood;

    // Underpay 50% should be under 15%
    const dnas = ['ACCEPTOR', 'FLEECER', 'STALWART', 'DOMINATOR', 'DESPERATE', 'NONE'];
    let tradePass = true;
    dnas.forEach(dna => {
      const l = calc(3000, 6000, dna);
      if (l > 15) {
        f(`Underpay 50% ${dna} = ${l}% (must be ≤15%)`, 'Trade math bug');
        tradePass = false;
      }
    });
    if (tradePass) p('Underpay 50%: all DNA types ≤ 15%');

    // Overpay 50% should be above 65% (except Stalwart)
    let overpayPass = true;
    dnas.filter(d => d !== 'STALWART').forEach(dna => {
      const l = calc(6000, 3000, dna);
      if (l < 65) {
        w(`Overpay 50% ${dna} = ${l}% (expected ≥65%)`);
        overpayPass = false;
      }
    });
    if (overpayPass) p('Overpay 50%: all non-Stalwart types ≥ 65%');

    // Fair trade should be 30-75%
    let fairPass = true;
    dnas.forEach(dna => {
      const l = calc(5000, 5000, dna);
      if (l < 20 || l > 80) {
        w(`Fair trade ${dna} = ${l}% (expected 20-80%)`);
        fairPass = false;
      }
    });
    if (fairPass) p('Fair trades: all DNA types 20-80%');

    // Daniel Jones for elite QB (the big bug test)
    const dj = calc(3500, 9000, 'ACCEPTOR');
    if (dj <= 10) p(`Jones(3500) for elite(9000) ACCEPTOR: ${dj}% — correctly low`);
    else f(`Jones for elite ACCEPTOR: ${dj}% — TOO HIGH (must be ≤10%)`);

  } else {
    w('calcAcceptanceLikelihood not found as global — trade math tests skipped');
  }

  // ── SECTION 6: DATA CONSISTENCY ──
  console.log('\n🔗 SECTION 6: DATA CONSISTENCY\n');

  // Rostered players should avg higher than unrostered
  const rostered = new Set(S?.rosters?.flatMap(r => r.players || []) || []);
  const rosterScores = Object.entries(scores).filter(([pid]) => rostered.has(pid));
  const unrosterScores = Object.entries(scores).filter(([pid]) => !rostered.has(pid));
  const rAvg = rosterScores.reduce((s, [, v]) => s + v, 0) / Math.max(1, rosterScores.length);
  const uAvg = unrosterScores.reduce((s, [, v]) => s + v, 0) / Math.max(1, unrosterScores.length);
  if (rAvg > uAvg * 1.3) p(`Rostered avg (${Math.round(rAvg)}) > unrostered avg (${Math.round(uAvg)})`);
  else w(`Rostered avg (${Math.round(rAvg)}) not much higher than unrostered (${Math.round(uAvg)})`);

  // Position distribution check
  const posDist = {};
  Object.values(meta).forEach(m => { posDist[m.pos] = (posDist[m.pos] || 0) + 1; });
  ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
    if ((posDist[pos] || 0) >= 30) p(`${pos}: ${posDist[pos]} players scored`);
    else w(`${pos}: only ${posDist[pos] || 0} players (expected 30+)`);
  });

  // SF detection
  const league = S?.leagues?.find(l => l.league_id === S?.currentLeagueId);
  const rp = league?.roster_positions || [];
  const isSF = rp.includes('SUPER_FLEX');
  p(`League format: ${isSF ? 'Superflex' : '1QB'} | ${teams} teams`);

  // QB premium in SF
  if (isSF) {
    const qbScores = Object.entries(meta).filter(([, m]) => m.pos === 'QB')
      .map(([pid]) => scores[pid] || 0).sort((a, b) => b - a).slice(0, 5);
    const rbScores = Object.entries(meta).filter(([, m]) => m.pos === 'RB')
      .map(([pid]) => scores[pid] || 0).sort((a, b) => b - a).slice(0, 5);
    const qbAvg = qbScores.reduce((a, b) => a + b, 0) / 5;
    const rbAvg = rbScores.reduce((a, b) => a + b, 0) / 5;
    if (qbAvg > rbAvg) p(`SF QB premium active: top-5 QB avg (${Math.round(qbAvg)}) > top-5 RB avg (${Math.round(rbAvg)})`);
    else w(`SF QB premium may be missing: QB avg (${Math.round(qbAvg)}) ≤ RB avg (${Math.round(rbAvg)})`);
  }

  // ── SECTION 7: JAVASCRIPT ERRORS ──
  console.log('\n💥 SECTION 7: RUNTIME ERRORS\n');

  // Check if key modules loaded
  const moduleChecks = [
    ['App.dynastyValue', typeof window.App?.dynastyValue === 'function'],
    ['App.loadLeagueIntel', typeof window.App?.loadLeagueIntel === 'function'],
    ['App.LI_LOADED', window.App?.LI_LOADED === true],
  ];
  moduleChecks.forEach(([name, ok]) => {
    if (ok) p(`${name} available`);
    else f(`${name} missing — module may have crashed on load`);
  });

  // ══════════════════════════════════════════════════
  // RESULTS SUMMARY
  // ══════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ PASSED:   ${R.pass.length}`);
  console.log(`  ❌ FAILED:   ${R.fail.length}`);
  console.log(`  ⚠️  WARNINGS: ${R.warn.length}`);
  console.log('═'.repeat(60));

  if (R.fail.length > 0) {
    console.log('\n🔴 FAILURES (must fix before deploy):');
    R.fail.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  if (R.warn.length > 0) {
    console.log('\n🟡 WARNINGS (should review):');
    R.warn.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }
  if (R.fail.length === 0 && R.warn.length === 0) {
    console.log('\n🟢 ALL CLEAR — No bugs detected!');
  }

  // Store results globally for extraction
  window._qaResults = R;
  console.log('\n💡 Results stored in window._qaResults');
  console.log('═'.repeat(60) + '\n');

})();
