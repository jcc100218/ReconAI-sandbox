// ══════════════════════════════════════════════════════════════════
// shared/roster-snapshot.js — Structured roster snapshot for AI context
//
// Builds a data-rich snapshot of the current user's team so the GM
// engine's Field Intel, Priorities, and Alex Learning surfaces can
// reference specific players, DHQ scores, and league-relative metrics
// instead of generic dynasty platitudes.
//
// This is NOT an LLM prompt — it's a data object consumed by the
// rule-based generators in gm-engine.js. By centralizing the data
// pull here, every surface gets the same grounded picture.
//
// Public API:
//   window.buildRosterSnapshot()  → snapshot object (or null)
//   window.App.buildRosterSnapshot = buildRosterSnapshot
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

(function () {
  'use strict';

  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

  function buildRosterSnapshot() {
    const S = window.S || window.App?.S;
    if (!S?.rosters?.length || !S?.myRosterId) return null;

    const myRoster = S.rosters.find(r => r.roster_id === S.myRosterId);
    if (!myRoster) return null;

    const assessFn = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
    const myAssess = assessFn ? assessFn(S.myRosterId) : null;
    if (!myAssess) return null;

    const league = (S.leagues || []).find(l => l.league_id === S.currentLeagueId) || {};
    const allAssess = typeof window.assessAllTeamsFromGlobal === 'function' ? window.assessAllTeamsFromGlobal() : [];
    const dhqFn = typeof window.dynastyValue === 'function' ? window.dynastyValue : (() => 0);
    const nameFn = typeof window.pName === 'function' ? window.pName : (id => id);
    const posFn = typeof window.pPos === 'function' ? window.pPos : (() => '');
    const normPosFn = typeof window.normPos === 'function' ? window.normPos : (p => p);
    const pkFn = typeof window.peakYears === 'function' ? window.peakYears : (() => null);

    // ── Team basics ──
    const teamName = myAssess.teamName || myAssess.ownerName || 'My Team';
    const healthScore = myAssess.healthScore || 0;
    const tier = myAssess.tier || 'CROSSROADS';

    // League rank by total DHQ
    const teamDHQs = allAssess.map(a => ({
      rid: a.rosterId,
      total: (a.posGroups ? Object.values(a.posGroups).flat() : []).reduce((s, pid) => s + dhqFn(pid), 0),
    })).sort((a, b) => b.total - a.total);
    const myTotalDHQ = teamDHQs.find(t => t.rid === S.myRosterId)?.total || 0;
    const leagueRank = teamDHQs.findIndex(t => t.rid === S.myRosterId) + 1;

    // ── Position groups with player-level detail ──
    const positionGroups = {};
    const leaguePosAvgs = {}; // avg DHQ per position across all teams

    // Compute league averages first
    POS_ORDER.forEach(pos => {
      const totals = allAssess.map(a => {
        const pids = (a.posGroups || {})[pos] || [];
        return pids.reduce((s, pid) => s + dhqFn(pid), 0);
      }).filter(v => v > 0);
      leaguePosAvgs[pos] = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
    });

    POS_ORDER.forEach(pos => {
      const pids = (myAssess.posGroups || {})[pos] || [];
      const pa = (myAssess.posAssessment || {})[pos];
      if (!pa) return;

      const players = pids
        .map(pid => {
          const p = S.players?.[pid];
          const dhq = dhqFn(pid);
          const age = p?.age || null;
          const team = p?.team || 'FA';
          const peak = pkFn(pid);
          return { name: nameFn(pid), dhq, age, team, peak: peak?.label || null, pid };
        })
        .sort((a, b) => b.dhq - a.dhq);

      const groupDHQ = players.reduce((s, p) => s + p.dhq, 0);
      const leagueAvgDHQ = leaguePosAvgs[pos] || 0;
      const gapPct = leagueAvgDHQ > 0 ? Math.round(((groupDHQ - leagueAvgDHQ) / leagueAvgDHQ) * 100) : 0;

      positionGroups[pos] = {
        count: players.length,
        players,
        groupDHQ,
        leagueAvgDHQ,
        gapPct,
        gap: gapPct >= 15 ? 'strength' : gapPct <= -15 ? 'weakness' : 'neutral',
        status: pa.status, // 'deficit' | 'thin' | 'ok' | 'surplus'
        nflStarters: pa.nflStarters || 0,
        startingReq: pa.startingReq || 1,
      };
    });

    // ── Pick inventory ──
    const pa = myAssess.picksAssessment || {};
    const pickDHQFn = typeof window.pickValue === 'function' ? window.pickValue : (() => 0);
    const teams = S.rosters.length || 12;
    const picks = [];
    let totalPickDHQ = 0;
    const allTP = S.tradedPicks || [];
    const curYear = parseInt(league.season) || new Date().getFullYear();
    const draftRounds = league.settings?.draft_rounds || 4;

    for (let yr = curYear; yr <= curYear + 2; yr++) {
      for (let rd = 1; rd <= draftRounds; rd++) {
        const tradedAway = allTP.find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === S.myRosterId && p.owner_id !== S.myRosterId);
        const acquired = allTP.filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === S.myRosterId && p.roster_id !== S.myRosterId);
        if (!tradedAway) {
          const val = pickDHQFn(String(yr), rd, teams);
          picks.push({ round: rd, year: yr, originalTeam: 'own', dhq: val });
          totalPickDHQ += val;
        }
        acquired.forEach(a => {
          const val = pickDHQFn(String(yr), rd, teams);
          picks.push({ round: rd, year: yr, originalTeam: 'acquired', dhq: val });
          totalPickDHQ += val;
        });
      }
    }
    picks.sort((a, b) => b.dhq - a.dhq);

    // League average pick DHQ
    const leaguePickTotals = allAssess.map(a => {
      const aPicks = a.picksAssessment?.totalPicks || 0;
      // Approximate total pick DHQ — use totalPicks × avg pick value
      return aPicks * (totalPickDHQ / Math.max(1, picks.length));
    });
    const leagueAvgPickDHQ = leaguePickTotals.length ? Math.round(leaguePickTotals.reduce((a, b) => a + b, 0) / leaguePickTotals.length) : 0;
    const pickStrength = totalPickDHQ > leagueAvgPickDHQ * 1.15 ? 'above average' : totalPickDHQ < leagueAvgPickDHQ * 0.85 ? 'below average' : 'average';

    const pickInventory = {
      totalPicks: picks.length,
      picks: picks.slice(0, 12), // cap for readability
      totalPickDHQ,
      leagueAvgPickDHQ,
      pickStrength,
    };

    // ── Top assets (top 5 by DHQ) ──
    const allPlayerDHQs = (myRoster.players || [])
      .map(pid => ({ name: nameFn(pid), position: normPosFn(posFn(pid)), dhq: dhqFn(pid), age: S.players?.[pid]?.age || null }))
      .filter(p => p.dhq > 0)
      .sort((a, b) => b.dhq - a.dhq);
    const topAssets = allPlayerDHQs.slice(0, 5);

    // ── Aging risks (30+ or past peak with significant DHQ) ──
    const agingRisks = allPlayerDHQs
      .filter(p => p.age && p.age >= 30 && p.dhq >= 1000)
      .slice(0, 5);

    // ── Sell candidates (declining DHQ trajectory or past peak) ──
    const sellCandidates = (myRoster.players || [])
      .map(pid => {
        const p = S.players?.[pid];
        const dhq = dhqFn(pid);
        const age = p?.age || 0;
        const peak = pkFn(pid);
        const pos = normPosFn(p?.position);
        if (dhq < 1000) return null;
        // Past peak window = sell candidate
        if (peak && peak.label === 'Past Peak') return { name: nameFn(pid), position: pos, dhq, reason: 'Past peak window — value declining' };
        // Age 30+ at RB = sell candidate
        if (pos === 'RB' && age >= 28) return { name: nameFn(pid), position: pos, dhq, reason: 'RB age 28+ — steep decline curve' };
        // Age 32+ at WR/TE = sell candidate
        if ((pos === 'WR' || pos === 'TE') && age >= 32) return { name: nameFn(pid), position: pos, dhq, reason: `${pos} age 32+ — production cliff approaching` };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.dhq - a.dhq)
      .slice(0, 5);

    // ── League context ──
    const calInfo = window.SeasonCalendar?.describe ? window.SeasonCalendar.describe() : null;
    const ownerProfile = (window.App?.LI?.ownerProfiles || {})[S.myRosterId] || {};
    const strategyMode = window.GMStrategy?.getStrategy?.()?.mode || 'balanced_rebuild';

    const leagueContext = {
      season: calInfo ? calInfo.label + (calInfo.nextMilestone ? ' — ' + calInfo.nextMilestone + ' in ' + calInfo.weeksToNext + 'w' : '') : (league.season || '') + ' season',
      rookieDraftScheduled: !!window.SeasonCalendar?.getKeyDates?.()?.draftDate,
      userDNA: [
        ownerProfile.dna || 'Unknown trader profile',
        strategyMode.replace(/_/g, ' '),
      ].join(' · '),
    };

    // ── Team mode ──
    const teamMode = tier === 'ELITE' || tier === 'CONTENDER' ? 'Contending'
      : tier === 'REBUILDING' ? 'Rebuilding'
      : 'Balanced';

    return {
      teamName,
      healthScore,
      leagueRank,
      leagueSize: S.rosters.length,
      teamMode,
      totalDHQ: myTotalDHQ,

      positionGroups,
      pickInventory,
      topAssets,
      agingRisks,
      sellCandidates,
      leagueContext,
    };
  }

  window.buildRosterSnapshot = buildRosterSnapshot;
  window.App.buildRosterSnapshot = buildRosterSnapshot;
})();
