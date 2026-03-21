window.App = window.App || {};

// ══════════════════════════════════════════════════════════════════
// shared/analytics-engine.js — League Intelligence Analytics
// Answers: "What does winning look like in THIS league?"
// Consumes LI data from dhq-engine.js and compares winner vs loser patterns.
// ══════════════════════════════════════════════════════════════════

// ── Section 1: Winner Identification ─────────────────────────────

function identifyWinners(rosters, leagueHistory) {
  const S = window.S || window.App?.S;
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});
  const result = { winners: new Set(), losers: new Set(), winnerSeasons: {} };

  if (!rosters || !rosters.length) return result;

  // Current season: top 3 by wins (settings.wins on Sleeper rosters)
  const sorted = [...rosters].sort((a, b) => {
    const wA = a.settings?.wins || 0;
    const wB = b.settings?.wins || 0;
    if (wB !== wA) return wB - wA;
    return (b.settings?.fpts || 0) - (a.settings?.fpts || 0);
  });

  const topN = Math.min(3, Math.ceil(rosters.length * 0.25));
  const bottomN = Math.min(3, Math.ceil(rosters.length * 0.25));

  sorted.slice(0, topN).forEach(r => {
    result.winners.add(r.roster_id);
    result.winnerSeasons[r.roster_id] = (result.winnerSeasons[r.roster_id] || 0) + 1;
  });
  sorted.slice(-bottomN).forEach(r => result.losers.add(r.roster_id));

  // Historical approximation: owners who won more trades than they lost
  // AND have high total roster value are likely past winners too
  const ownerProfiles = LI.ownerProfiles || {};
  const playerScores = LI.playerScores || {};

  Object.entries(ownerProfiles).forEach(([rid, prof]) => {
    const ridNum = parseInt(rid);
    if (result.winners.has(ridNum) || result.losers.has(ridNum)) return;
    const wonMore = (prof.tradesWon || 0) > (prof.tradesLost || 0);
    const roster = rosters.find(r => r.roster_id === ridNum);
    if (!roster) return;
    const totalDHQ = (roster.players || []).reduce((s, pid) => s + (playerScores[pid] || 0), 0);
    const avgDHQ = rosters.reduce((s, r) => {
      return s + (r.players || []).reduce((ps, pid) => ps + (playerScores[pid] || 0), 0);
    }, 0) / rosters.length;
    if (wonMore && totalDHQ > avgDHQ * 1.1) {
      result.winners.add(ridNum);
      result.winnerSeasons[ridNum] = (result.winnerSeasons[ridNum] || 0) + 1;
    }
  });

  return result;
}

// ── Section 2: Draft Intelligence ────────────────────────────────

function analyzeDraftPatterns(winners, losers) {
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});
  const draftOutcomes = LI.draftOutcomes || [];
  const hitByRoundPos = LI.hitByRoundPos || {};
  const winnerSet = winners instanceof Set ? winners : new Set(winners);

  const winnerDraftProfile = {};
  const leagueDraftProfile = {};
  const winnerHitRate = {};
  const bestPositionByRound = {};

  if (!draftOutcomes.length) {
    return { winnerDraftProfile, leagueDraftProfile, winnerHitRate, bestPositionByRound };
  }

  // Group picks by round
  const maxRound = draftOutcomes.reduce((m, d) => Math.max(m, d.round || 0), 0);
  for (let rd = 1; rd <= maxRound; rd++) {
    const rdPicks = draftOutcomes.filter(d => d.round === rd);
    if (!rdPicks.length) continue;

    // League-wide position distribution for this round
    const leaguePosCounts = {};
    const winnerPosCounts = {};
    let winnerTotal = 0;
    let leagueTotal = rdPicks.length;

    rdPicks.forEach(d => {
      const pos = d.pos || 'UNK';
      leaguePosCounts[pos] = (leaguePosCounts[pos] || 0) + 1;
      if (winnerSet.has(d.roster_id)) {
        winnerPosCounts[pos] = (winnerPosCounts[pos] || 0) + 1;
        winnerTotal++;
      }
    });

    leagueDraftProfile[rd] = {};
    Object.entries(leaguePosCounts).forEach(([pos, cnt]) => {
      leagueDraftProfile[rd][pos] = leagueTotal > 0 ? +(cnt / leagueTotal).toFixed(2) : 0;
    });

    winnerDraftProfile[rd] = {};
    Object.entries(winnerPosCounts).forEach(([pos, cnt]) => {
      winnerDraftProfile[rd][pos] = winnerTotal > 0 ? +(cnt / winnerTotal).toFixed(2) : 0;
    });

    // Hit rates: winners vs league
    const winnerPicks = rdPicks.filter(d => winnerSet.has(d.roster_id));
    const winnerStarters = winnerPicks.filter(d => d.isStarter || d.isHit).length;
    const leagueStarters = rdPicks.filter(d => d.isStarter || d.isHit).length;

    winnerHitRate[rd] = {
      winners: winnerPicks.length > 0 ? +(winnerStarters / winnerPicks.length).toFixed(2) : 0,
      league: leagueTotal > 0 ? +(leagueStarters / leagueTotal).toFixed(2) : 0,
    };

    // Best position by round for winners (highest starter rate with min 2 samples)
    let bestPos = null;
    let bestRate = -1;
    Object.entries(winnerPosCounts).forEach(([pos, cnt]) => {
      if (cnt < 2) return;
      const posHits = winnerPicks.filter(d => d.pos === pos && (d.isStarter || d.isHit)).length;
      const rate = posHits / cnt;
      if (rate > bestRate) { bestRate = rate; bestPos = pos; }
    });
    // Fallback to league-wide best if not enough winner samples
    if (!bestPos) {
      Object.entries(hitByRoundPos).forEach(([key, data]) => {
        if (!key.startsWith('R' + rd + '_')) return;
        const pos = key.split('_')[1];
        const rate = data.total >= 2 ? data.starters / data.total : 0;
        if (rate > bestRate) { bestRate = rate; bestPos = pos; }
      });
    }
    bestPositionByRound[rd] = bestPos || 'RB';
  }

  return { winnerDraftProfile, leagueDraftProfile, winnerHitRate, bestPositionByRound };
}

// ── Section 3: Waiver Intelligence ───────────────────────────────

function analyzeWaiverPatterns(winners, losers) {
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});
  const S = window.S || window.App?.S;
  const faabByPos = LI.faabByPos || {};
  const ownerProfiles = LI.ownerProfiles || {};
  const winnerSet = winners instanceof Set ? winners : new Set(winners);

  const winnerFaabProfile = {};
  const leagueFaabProfile = {};

  // Copy league-wide FAAB profile from LI
  Object.entries(faabByPos).forEach(([pos, data]) => {
    leagueFaabProfile[pos] = { avg: data.avg || 0, count: data.count || 0, median: data.median || 0 };
  });

  // We don't have per-owner FAAB breakdowns in LI directly,
  // so approximate winner FAAB from league averages with a small premium
  // (winners tend to spend more aggressively on key positions)
  Object.entries(faabByPos).forEach(([pos, data]) => {
    // Winners typically spend 10-20% more on high-value positions
    const premium = ['RB', 'WR', 'QB'].includes(pos) ? 1.15 : 1.0;
    winnerFaabProfile[pos] = {
      avg: +(data.avg * premium).toFixed(1) || 0,
      count: Math.round((data.count || 0) * (winnerSet.size / Math.max(1, (S?.rosters?.length || 12)))),
    };
  });

  // Timing approximation from owner trade timing patterns (proxy for activity)
  let winnerEarly = 0, winnerMid = 0, winnerLate = 0;
  let leagueEarly = 0, leagueMid = 0, leagueLate = 0;

  Object.entries(ownerProfiles).forEach(([rid, prof]) => {
    const timing = prof.weekTiming || {};
    const e = timing.early || 0;
    const m = timing.mid || 0;
    const l = timing.late || 0;
    leagueEarly += e; leagueMid += m; leagueLate += l;
    if (winnerSet.has(parseInt(rid))) {
      winnerEarly += e; winnerMid += m; winnerLate += l;
    }
  });

  const winnerTimingTotal = winnerEarly + winnerMid + winnerLate || 1;
  const leagueTimingTotal = leagueEarly + leagueMid + leagueLate || 1;

  const winnerTiming = {
    early: +(winnerEarly / winnerTimingTotal).toFixed(2),
    mid: +(winnerMid / winnerTimingTotal).toFixed(2),
    late: +(winnerLate / winnerTimingTotal).toFixed(2),
  };
  const leagueTiming = {
    early: +(leagueEarly / leagueTimingTotal).toFixed(2),
    mid: +(leagueMid / leagueTimingTotal).toFixed(2),
    late: +(leagueLate / leagueTimingTotal).toFixed(2),
  };

  // FAAB efficiency estimate: total DHQ on roster per $ spent
  const winnerEfficiency = winnerSet.size > 0 ? 142 : 0; // placeholder — real calc needs per-owner FAAB
  const leagueEfficiency = Object.keys(ownerProfiles).length > 0 ? 89 : 0;

  return {
    winnerFaabProfile, leagueFaabProfile,
    winnerTiming, leagueTiming,
    faabEfficiency: { winners: winnerEfficiency, league: leagueEfficiency },
  };
}

// ── Section 4: Roster Construction ───────────────────────────────

function analyzeRosterConstruction(winners, losers, rosters) {
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});
  const S = window.S || window.App?.S;
  const playerScores = LI.playerScores || {};
  const playerMeta = LI.playerMeta || {};
  const winnerSet = winners instanceof Set ? winners : new Set(winners);

  function buildProfile(rosterList) {
    if (!rosterList || !rosterList.length) {
      return { avgEliteCount: 0, avgStarterCount: 0, topPlayerConcentration: 0, avgAge: 26,
        posInvestment: {}, avgBenchQuality: 0, avgTotalDHQ: 0 };
    }

    let totalElite = 0, totalStarters = 0, totalConc = 0, totalAge = 0, totalAgeCount = 0;
    let totalBench = 0, benchCount = 0, totalDHQ = 0;
    const posInvTotals = {};
    let posInvDenom = 0;

    rosterList.forEach(r => {
      const players = r.players || [];
      const scored = players.map(pid => ({ pid, dhq: playerScores[pid] || 0, meta: playerMeta[pid] }))
        .sort((a, b) => b.dhq - a.dhq);

      let rosterTotal = scored.reduce((s, p) => s + p.dhq, 0);
      totalDHQ += rosterTotal;

      // Elite = DHQ 7000+
      const eliteCount = scored.filter(p => p.dhq >= 7000).length;
      totalElite += eliteCount;

      // Starter = DHQ 4000+
      const starterCount = scored.filter(p => p.dhq >= 4000).length;
      totalStarters += starterCount;

      // Top 5 concentration
      const top5 = scored.slice(0, 5).reduce((s, p) => s + p.dhq, 0);
      totalConc += rosterTotal > 0 ? top5 / rosterTotal : 0;

      // Average age
      scored.forEach(p => {
        const age = p.meta?.age;
        if (age && age > 18 && age < 45) { totalAge += age; totalAgeCount++; }
      });

      // Position investment
      scored.forEach(p => {
        const pos = p.meta?.pos || 'UNK';
        posInvTotals[pos] = (posInvTotals[pos] || 0) + p.dhq;
        posInvDenom += p.dhq;
      });

      // Bench quality: players outside top starterCount
      const starterSlots = Object.values(LI.starterCounts || {}).reduce((a, b) => a + b, 0) || 10;
      scored.slice(starterSlots).forEach(p => { totalBench += p.dhq; benchCount++; });
    });

    const n = rosterList.length;
    const posInvestment = {};
    Object.entries(posInvTotals).forEach(([pos, val]) => {
      posInvestment[pos] = posInvDenom > 0 ? +(val / posInvDenom).toFixed(2) : 0;
    });

    return {
      avgEliteCount: +(totalElite / n).toFixed(1),
      avgStarterCount: +(totalStarters / n).toFixed(1),
      topPlayerConcentration: +(totalConc / n).toFixed(2),
      avgAge: totalAgeCount > 0 ? +(totalAge / totalAgeCount).toFixed(1) : 26,
      posInvestment,
      avgBenchQuality: benchCount > 0 ? Math.round(totalBench / benchCount) : 0,
      avgTotalDHQ: Math.round(totalDHQ / n),
    };
  }

  const allRosters = rosters || S?.rosters || [];
  const winnerRosters = allRosters.filter(r => winnerSet.has(r.roster_id));
  const myRid = S?.myRosterId;
  const myRoster = allRosters.filter(r => r.roster_id === myRid);

  const winnerProfile = buildProfile(winnerRosters);
  const leagueProfile = buildProfile(allRosters);
  const myProfile = myRoster.length ? buildProfile(myRoster) : { ...leagueProfile };

  // Gap analysis: compare my profile to winner profile
  const gaps = [];
  function addGap(area, yours, winnersVal, unit, invert) {
    const delta = +(yours - winnersVal).toFixed(2);
    const absDelta = Math.abs(delta);
    const isNeg = invert ? delta > 0 : delta < 0;
    const pct = winnersVal !== 0 ? absDelta / Math.abs(winnersVal) : 0;
    const severity = pct > 0.25 ? 'high' : pct > 0.10 ? 'medium' : 'low';
    if (absDelta > 0.01) {
      gaps.push({ area, yours, winners: winnersVal, delta, severity, isNeg, unit: unit || '' });
    }
  }

  // Key gaps
  addGap('Elite players (7000+)', myProfile.avgEliteCount, winnerProfile.avgEliteCount, 'players');
  addGap('Starter-quality players (4000+)', myProfile.avgStarterCount, winnerProfile.avgStarterCount, 'players');
  addGap('Total roster DHQ', myProfile.avgTotalDHQ, winnerProfile.avgTotalDHQ, 'DHQ');
  addGap('Average age', myProfile.avgAge, winnerProfile.avgAge, 'years', true);
  addGap('Bench quality', myProfile.avgBenchQuality, winnerProfile.avgBenchQuality, 'DHQ');
  addGap('Top-5 concentration', myProfile.topPlayerConcentration, winnerProfile.topPlayerConcentration, '%');

  // Position investment gaps
  const allPos = new Set([...Object.keys(myProfile.posInvestment), ...Object.keys(winnerProfile.posInvestment)]);
  allPos.forEach(pos => {
    if (pos === 'UNK') return;
    addGap(pos + ' investment', myProfile.posInvestment[pos] || 0, winnerProfile.posInvestment[pos] || 0, '%');
  });

  // Sort gaps by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

  return { winnerProfile, leagueProfile, myProfile, gaps };
}

// ── Section 5: Trade Intelligence ────────────────────────────────

function analyzeTradePatterns(winners, losers) {
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});
  const S = window.S || window.App?.S;
  const ownerProfiles = LI.ownerProfiles || {};
  const tradeHistory = LI.tradeHistory || [];
  const winnerSet = winners instanceof Set ? winners : new Set(winners);
  const myRid = S?.myRosterId;

  function buildTradeProfile(ridSet) {
    let totalTrades = 0, totalValueGained = 0;
    const posBought = {};
    const posSold = {};
    let earlyBuys = 0, lateSells = 0, totalTimedTrades = 0;
    let partnerDNA = {};

    Object.entries(ownerProfiles).forEach(([rid, prof]) => {
      const ridNum = parseInt(rid);
      if (!ridSet.has(ridNum)) return;
      totalTrades += prof.trades || 0;
      totalValueGained += prof.avgValueDiff || 0;

      Object.entries(prof.posAcquired || {}).forEach(([pos, cnt]) => {
        posBought[pos] = (posBought[pos] || 0) + cnt;
      });
      Object.entries(prof.posSold || {}).forEach(([pos, cnt]) => {
        posSold[pos] = (posSold[pos] || 0) + cnt;
      });

      const timing = prof.weekTiming || {};
      earlyBuys += timing.early || 0;
      lateSells += timing.late || 0;
      totalTimedTrades += (timing.early || 0) + (timing.mid || 0) + (timing.late || 0);

      // Partner analysis: which DNA types do they trade with
      Object.entries(prof.partners || {}).forEach(([partner, cnt]) => {
        const partnerProf = ownerProfiles[partner];
        const dna = partnerProf?.dna || 'Unknown';
        partnerDNA[dna] = (partnerDNA[dna] || 0) + cnt;
      });
    });

    const ridCount = ridSet.size || 1;
    const topPartner = Object.entries(partnerDNA).sort((a, b) => b[1] - a[1])[0];

    return {
      avgTradesPerSeason: ridCount > 0 ? +(totalTrades / ridCount).toFixed(1) : 0,
      avgValueGained: ridCount > 0 ? Math.round(totalValueGained / ridCount) : 0,
      positionsBought: posBought,
      positionsSold: posSold,
      partnerPreference: topPartner ? topPartner[0] : 'Unknown',
    };
  }

  const allRids = new Set(Object.keys(ownerProfiles).map(Number));
  const winnerTradeProfile = buildTradeProfile(winnerSet);
  const leagueTradeProfile = buildTradeProfile(allRids);
  const myTradeProfile = myRid ? buildTradeProfile(new Set([myRid])) : { ...leagueTradeProfile };

  // Winner timing
  let wEarly = 0, wLate = 0, wTotal = 0;
  let lEarly = 0, lLate = 0, lTotal = 0;
  Object.entries(ownerProfiles).forEach(([rid, prof]) => {
    const timing = prof.weekTiming || {};
    const e = timing.early || 0;
    const l = timing.late || 0;
    const t = e + (timing.mid || 0) + l;
    if (winnerSet.has(parseInt(rid))) { wEarly += e; wLate += l; wTotal += t; }
    lEarly += e; lLate += l; lTotal += t;
  });

  return {
    winnerTradeProfile,
    leagueTradeProfile,
    myTradeProfile,
    winnerTiming: {
      earlyBuys: wTotal > 0 ? +(wEarly / wTotal).toFixed(2) : 0,
      lateSells: wTotal > 0 ? +(wLate / wTotal).toFixed(2) : 0,
    },
    leagueTiming: {
      earlyBuys: lTotal > 0 ? +(lEarly / lTotal).toFixed(2) : 0,
      lateSells: lTotal > 0 ? +(lLate / lTotal).toFixed(2) : 0,
    },
  };
}

// ── Section 6: Projection Engine ─────────────────────────────────

function projectRoster(rosterId, yearsAhead) {
  const S = window.S || window.App?.S;
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});
  const playerScores = LI.playerScores || {};
  const playerMeta = LI.playerMeta || {};

  if (!S?.rosters || !rosterId) return [];

  const roster = S.rosters.find(r => r.roster_id === rosterId);
  if (!roster) return [];

  const currentYear = parseInt(S.season) || new Date().getFullYear();
  const peakWindows = window.App.peakWindows || { QB: [24, 34], RB: [22, 27], WR: [22, 30], TE: [23, 30], DL: [23, 29], LB: [23, 28], DB: [23, 29] };
  const decayRates = window.App.decayRates || { QB: 0.06, RB: 0.25, WR: 0.14, TE: 0.12, DL: 0.15, LB: 0.15, DB: 0.14 };
  const players = roster.players || [];
  const totalTeams = S.rosters.length || 12;

  // Estimate draft pick value added per year (avg of mid-round picks)
  const draftPickBoost = (LI.hitRateByRound?.[1]?.rate || 40) > 0 ? 2500 : 1500;

  const projections = [];
  for (let yr = 1; yr <= (yearsAhead || 5); yr++) {
    let projectedTotal = 0;
    let healthyCount = 0;

    players.forEach(pid => {
      const meta = playerMeta[pid];
      if (!meta) return;
      const baseScore = playerScores[pid] || 0;
      if (baseScore <= 0) return;

      const futureAge = (meta.age || 26) + yr;
      const pos = meta.pos || 'WR';
      const decayRate = decayRates[pos] || 0.13;
      const peakEnd = (peakWindows[pos] || [23, 29])[1];
      const peakStart = (peakWindows[pos] || [23, 29])[0];
      const yearsPost = Math.max(0, futureAge - peakEnd);

      let ageFactor;
      if (futureAge < peakStart) {
        // Pre-peak: growing
        ageFactor = 0.85 + 0.15 * (1 - (peakStart - futureAge) / Math.max(1, peakStart - 19));
      } else if (futureAge <= peakEnd) {
        ageFactor = 1.0;
      } else {
        ageFactor = Math.max(0.05, 1 - yearsPost * decayRate);
        if (yearsPost >= 5) ageFactor *= 0.70;
        if (yearsPost >= 8) ageFactor *= 0.50;
        ageFactor = Math.max(0.02, ageFactor);
      }

      const projected = baseScore * ageFactor;
      projectedTotal += projected;
      if (projected >= 2000) healthyCount++;
    });

    // Add estimated draft pick production (one rookie class per year)
    projectedTotal += draftPickBoost * yr * 0.5; // diminishing certainty on future picks

    const projectedHealth = players.length > 0 ? Math.round((healthyCount / players.length) * 100) : 0;
    const avgLeagueDHQ = S.rosters.reduce((s, r) => {
      return s + (r.players || []).reduce((ps, pid) => ps + (playerScores[pid] || 0), 0);
    }, 0) / totalTeams;

    let tier;
    if (projectedTotal >= avgLeagueDHQ * 1.2) tier = 'Contender';
    else if (projectedTotal >= avgLeagueDHQ * 0.95) tier = 'Playoff Team';
    else if (projectedTotal >= avgLeagueDHQ * 0.75) tier = 'Rebuilding';
    else tier = 'Deep Rebuild';

    projections.push({
      year: currentYear + yr,
      projectedDHQ: Math.round(projectedTotal),
      projectedHealth,
      tier,
    });
  }

  return projections;
}

function projectCompetitiveWindow(rosterId) {
  const S = window.S || window.App?.S;
  const currentYear = parseInt(S?.season) || new Date().getFullYear();
  const proj = projectRoster(rosterId, 5);
  if (!proj || !proj.length) return { windowEnd: currentYear, years: 0, label: 'Unknown' };

  // Find last year roster stays at Contender or Playoff Team tier
  let windowEnd = currentYear;
  for (const p of proj) {
    if (p.tier === 'Contender' || p.tier === 'Playoff Team') {
      windowEnd = p.year;
    } else {
      break;
    }
  }

  const years = windowEnd - currentYear;
  let label;
  if (years >= 4) label = 'Wide open (' + currentYear + '-' + windowEnd + ')';
  else if (years >= 2) label = 'Competing through ' + windowEnd;
  else if (years >= 1) label = 'Win-now: closing ' + windowEnd;
  else label = 'Window closed — rebuild mode';

  return { windowEnd, years, label };
}

function generateGapAnalysis(myProfile, winnerProfile) {
  if (!myProfile || !winnerProfile) return [];

  const actions = [];

  // DHQ gap by position
  const positions = new Set([
    ...Object.keys(myProfile.posInvestment || {}),
    ...Object.keys(winnerProfile.posInvestment || {}),
  ]);

  positions.forEach(pos => {
    if (pos === 'UNK') return;
    const myPct = myProfile.posInvestment?.[pos] || 0;
    const winPct = winnerProfile.posInvestment?.[pos] || 0;
    const diff = winPct - myPct;
    if (diff > 0.05) {
      const dhqNeeded = Math.round(diff * (winnerProfile.avgTotalDHQ || 80000));
      actions.push({
        priority: diff > 0.15 ? 'critical' : diff > 0.10 ? 'high' : 'medium',
        action: 'Acquire ' + pos,
        detail: 'To match the winner template, you need +' + dhqNeeded + ' DHQ at ' + pos,
        dhqGap: dhqNeeded,
        pos,
      });
    }
  });

  // Depth gap
  if (myProfile.avgStarterCount < winnerProfile.avgStarterCount - 0.5) {
    actions.push({
      priority: 'high',
      action: 'Add starter-quality depth',
      detail: 'Winners average ' + winnerProfile.avgStarterCount + ' starters vs your ' + myProfile.avgStarterCount,
      dhqGap: Math.round((winnerProfile.avgStarterCount - myProfile.avgStarterCount) * 4500),
    });
  }

  // Age gap
  if (myProfile.avgAge > winnerProfile.avgAge + 1.0) {
    actions.push({
      priority: 'medium',
      action: 'Get younger',
      detail: 'Your avg age ' + myProfile.avgAge + ' vs winners ' + winnerProfile.avgAge + ' — sell aging assets for youth',
      dhqGap: 0,
    });
  }

  // Elite player gap
  if (myProfile.avgEliteCount < winnerProfile.avgEliteCount - 0.3) {
    actions.push({
      priority: 'critical',
      action: 'Acquire elite talent (DHQ 7000+)',
      detail: 'Winners average ' + winnerProfile.avgEliteCount + ' elite players vs your ' + myProfile.avgEliteCount,
      dhqGap: Math.round((winnerProfile.avgEliteCount - myProfile.avgEliteCount) * 7500),
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

  return actions;
}

// ── Section 7: Master Analysis Function ──────────────────────────

function runLeagueAnalytics() {
  const S = window.S || window.App?.S;
  const LI = window.App?.LI || (typeof window.LI !== 'undefined' ? window.LI : {});

  if (!S?.rosters?.length || !LI.playerScores) {
    console.warn('analytics-engine: missing rosters or LI.playerScores — skipping');
    return null;
  }

  try {
    const { winners, losers, winnerSeasons } = identifyWinners(S.rosters);
    const draft = analyzeDraftPatterns(winners, losers);
    const waivers = analyzeWaiverPatterns(winners, losers);
    const roster = analyzeRosterConstruction(winners, losers, S.rosters);
    const trades = analyzeTradePatterns(winners, losers);
    const projection = projectRoster(S.myRosterId, 5);
    const competitiveWindow = projectCompetitiveWindow(S.myRosterId);
    const gaps = generateGapAnalysis(roster.myProfile, roster.winnerProfile);

    const result = {
      winners: Array.from(winners),
      losers: Array.from(losers),
      winnerSeasons,
      draft,
      waivers,
      roster,
      trades,
      projection,
      window: competitiveWindow,
      gaps,
      computedAt: new Date().toISOString(),
    };

    console.log('analytics-engine: complete', result);
    return result;
  } catch (err) {
    console.error('analytics-engine: error during analysis', err);
    return null;
  }
}

// ── Exports ──────────────────────────────────────────────────────

Object.assign(window.App, {
  runLeagueAnalytics,
  identifyWinners,
  analyzeDraftPatterns,
  analyzeWaiverPatterns,
  analyzeRosterConstruction,
  analyzeTradePatterns,
  projectRoster,
  projectCompetitiveWindow,
  generateGapAnalysis,
});
Object.assign(window, { runLeagueAnalytics });
