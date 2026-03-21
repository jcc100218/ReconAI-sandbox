// ═══════════════════════════════════════════════════════════════
// trade-calc.js — Full Trade Calculator Module for ReconAI
// Ported from War Room's trade-calculator.html into vanilla JS
// Uses window.App global namespace (Plan B)
// ═══════════════════════════════════════════════════════════════
// Globals expected: S, LI, LI_LOADED, $, pName, pNameShort, pPos,
//   pAge, pTeam, pM, myR, getUser, dynastyValue, pickValue,
//   tradeValueTier, posClass, fullTeam, showToast, copyText,
//   openPlayerModal, switchTab
// ═══════════════════════════════════════════════════════════════

window.App = window.App || {};

// ═══════════════════════════════════════════════════════════════
// SECTION 1: Constants & DNA System
// ═══════════════════════════════════════════════════════════════

const DNA_TYPES = {
  NONE:      { label: '-- Not Set --', color: 'var(--text3)', mult: 1.0,  desc: '' },
  FLEECER:   { label: 'Fleecer',      color: '#E74C3C',      mult: 0.85, desc: 'Hunts asymmetric value, lowballs, will counter' },
  DOMINATOR: { label: 'Dominator',     color: '#D4AF37',      mult: 0.75, desc: 'High ego, needs +30% perceived margin' },
  STALWART:  { label: 'Stalwart',      color: '#2ECC71',      mult: 1.0,  desc: 'Prefers 1-for-1 fair laterals' },
  ACCEPTOR:  { label: 'Acceptor',      color: '#45B7D1',      mult: 1.15, desc: 'Low attachment, sells for futures' },
  DESPERATE: { label: 'Desperate',     color: '#F0A500',      mult: 1.3,  desc: 'Overpays for immediate help' },
};

const TRADE_PICK_VALUES = { 1: 7000, 2: 3500, 3: 1800, 4: 800, 5: 400, 6: 200, 7: 100 };

const POS_WEIGHTS   = { QB: 14, RB: 14, WR: 14, TE: 8, K: 3, DL: 13, LB: 10, DB: 12 };
const TOTAL_WEIGHT  = Object.values(POS_WEIGHTS).reduce((a, b) => a + b, 0);
const MIN_STARTER_QUALITY = { QB: 2, RB: 3, WR: 3, TE: 2, K: 1, DL: 4, LB: 5, DB: 4 };
const NFL_STARTER_POOL    = { QB: 32, RB: 40, WR: 64, TE: 32, K: 32, DL: 64, LB: 64, DB: 64 };
const WEEKLY_TARGET = 243;

const DEPTH_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];

// Ideal roster sizes per position (dynasty league)
const IDEAL_ROSTER = { QB: 3, RB: 6, WR: 6, TE: 3, K: 1, DL: 6, LB: 6, DB: 6 };

// Draft pick horizon and rounds
const PICK_HORIZON  = 3;
const DRAFT_ROUNDS  = 5;
const PICK_IDEAL    = PICK_HORIZON * DRAFT_ROUNDS;  // 15 picks across 3 years

// FAAB conversion rate ($ to value)
const FAAB_RATE = 0.5;

// Posture definitions
const POSTURES = {
  DESPERATE: { key: 'DESPERATE', label: 'Desperate',     color: '#BB8FCE', desc: 'Panic-mode -- will overpay for immediate help.' },
  BUYER:     { key: 'BUYER',     label: 'Active Buyer',  color: '#F0A500', desc: 'Contender upgrading -- open to deals, fair value required.' },
  NEUTRAL:   { key: 'NEUTRAL',   label: 'Neutral',       color: '#95A5A6', desc: 'No strong directional push. Fair offers only.' },
  SELLER:    { key: 'SELLER',    label: 'Active Seller', color: '#5DADE2', desc: 'Moving assets for futures. Buy at a discount.' },
  LOCKED:    { key: 'LOCKED',    label: 'Locked In',     color: '#7F8C8D', desc: 'Satisfied roster, high attachment. Very hard to move.' },
};

// Local position normalization (fallback if pM is unavailable)
const normPos = p => {
  if (!p) return '';
  if (['DE', 'DT'].includes(p)) return 'DL';
  if (['CB', 'S'].includes(p)) return 'DB';
  return p;
};


// ═══════════════════════════════════════════════════════════════
// SECTION 2: Team Assessment
// ═══════════════════════════════════════════════════════════════

/**
 * Build the NFL starter set — rank all players by dynasty value (or season pts),
 * take top N per position. Returns { pos: Set<pid> }
 */
function buildNflStarterSet() {
  const nflStarterSet = {};
  DEPTH_POSITIONS.forEach(pos => {
    const poolSize = NFL_STARTER_POOL[pos] || 32;
    const allAtPos = [];
    Object.keys(S.players).forEach(pid => {
      const p = S.players[pid]; if (!p) return;
      if (normPos(p.position) !== pos) return;
      if (!p.team) return;
      // Prefer dynasty value; fall back to season stats
      const val = dynastyValue(pid);
      const pts = val > 0 ? val : (S.playerStats?.[pid]?.seasonTotal || S.playerStats?.[pid]?.prevTotal || 0);
      if (pts > 0) allAtPos.push({ pid, pts });
    });
    allAtPos.sort((a, b) => b.pts - a.pts);
    nflStarterSet[pos] = new Set(allAtPos.slice(0, poolSize).map(p => p.pid));
  });
  return nflStarterSet;
}

/**
 * Build picks owned by each roster — returns { rosterId: [{year, round, originalOwnerRid}] }
 */
function buildPicksByOwner() {
  const league = S.leagues.find(l => l.league_id === S.currentLeagueId);
  const draftRounds = league?.settings?.draft_rounds || DRAFT_ROUNDS;
  const curYear = parseInt(S.season) || new Date().getFullYear();
  const years = Array.from({ length: PICK_HORIZON }, (_, i) => curYear + i);
  const allTP = S.tradedPicks || [];
  const result = {};

  (S.rosters || []).forEach(r => {
    const rid = r.roster_id;
    result[rid] = [];
    years.forEach(yr => {
      for (let rd = 1; rd <= draftRounds; rd++) {
        // Check if this pick was traded away
        const tradedAway = allTP.find(p =>
          parseInt(p.season) === yr && p.round === rd &&
          p.roster_id === rid && p.owner_id !== rid
        );
        if (!tradedAway) {
          // Own original pick
          result[rid].push({ year: yr, round: rd, originalOwnerRid: rid });
        }
        // Check for acquired picks
        const acquired = allTP.filter(p =>
          parseInt(p.season) === yr && p.round === rd &&
          p.owner_id === rid && p.roster_id !== rid
        );
        acquired.forEach(p => {
          result[rid].push({ year: yr, round: rd, originalOwnerRid: p.roster_id });
        });
      }
    });
  });
  return result;
}

/**
 * Calculate optimal lineup PPG for a roster
 */
function calcOptimalPPG(rosterPids) {
  const league = S.leagues.find(l => l.league_id === S.currentLeagueId);
  const rp = league?.roster_positions || [];
  const slotCounts = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, DL: 0, LB: 0, DB: 0, IDP_FLEX: 0 };
  rp.forEach(s => {
    if (s === 'DE' || s === 'DT') slotCounts.DL++;
    else if (s === 'CB' || s === 'S') slotCounts.DB++;
    else if (s in slotCounts) slotCounts[s]++;
    else if (s === 'REC_FLEX') slotCounts.FLEX++;
    else if (s === 'BN' || s === 'IR' || s === 'TAXI') { /* skip */ }
    else slotCounts.FLEX++;
  });

  const byPos = {};
  (rosterPids || []).forEach(pid => {
    const rawPos = pPos(pid); const pos = normPos(rawPos);
    const ppg = S.playerStats?.[pid]?.seasonAvg || S.playerStats?.[pid]?.prevAvg || 0;
    if (ppg <= 0) return;
    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push({ pid, ppg, pos });
  });
  Object.values(byPos).forEach(arr => arr.sort((a, b) => b.ppg - a.ppg));

  const used = new Set();
  let total = 0;

  ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'K'].forEach(pos => {
    const need = slotCounts[pos] || 0;
    const avail = byPos[pos] || [];
    for (let i = 0; i < need && i < avail.length; i++) {
      total += avail[i].ppg; used.add(avail[i].pid);
    }
  });

  const flexPool = ['RB', 'WR', 'TE'].flatMap(pos => (byPos[pos] || []).filter(p => !used.has(p.pid))).sort((a, b) => b.ppg - a.ppg);
  for (let i = 0; i < (slotCounts.FLEX || 0) && i < flexPool.length; i++) {
    total += flexPool[i].ppg; used.add(flexPool[i].pid);
  }

  const sfPool = ['QB', 'RB', 'WR', 'TE'].flatMap(pos => (byPos[pos] || []).filter(p => !used.has(p.pid))).sort((a, b) => b.ppg - a.ppg);
  for (let i = 0; i < (slotCounts.SUPER_FLEX || 0) && i < sfPool.length; i++) {
    total += sfPool[i].ppg; used.add(sfPool[i].pid);
  }

  const idpPool = ['DL', 'LB', 'DB'].flatMap(pos => (byPos[pos] || []).filter(p => !used.has(p.pid))).sort((a, b) => b.ppg - a.ppg);
  for (let i = 0; i < (slotCounts.IDP_FLEX || 0) && i < idpPool.length; i++) {
    total += idpPool[i].ppg; used.add(idpPool[i].pid);
  }

  return +total.toFixed(1);
}

/**
 * Assess a single team. Returns a full assessment object.
 */
function assessTeam(roster, nflStarterSet, ownerPicks) {
  const league = S.leagues.find(l => l.league_id === S.currentLeagueId);
  const users = S.leagueUsers || [];
  const user = users.find(u => u.user_id === roster.owner_id);
  const teamName  = user?.metadata?.team_name || `Team ${roster.roster_id}`;
  const ownerName = user?.display_name || `Owner ${roster.roster_id}`;
  const avatar    = user?.avatar || null;

  const wins   = roster.settings?.wins   || 0;
  const losses = roster.settings?.losses || 0;
  const ties   = roster.settings?.ties   || 0;
  const pf     = Number(roster.settings?.fpts || 0) + Number(roster.settings?.fpts_decimal || 0) / 100;

  const waiverBudget  = Number(league?.settings?.waiver_budget || 100);
  const waiverUsed    = Number(roster.settings?.waiver_budget_used || 0);
  const faabRemaining = Math.max(0, waiverBudget - waiverUsed);

  // Group players by normalized position
  const posGroups = {};
  for (const id of (roster.players || [])) {
    const np = normPos(S.players[id]?.position);
    if (!np) continue;
    if (!posGroups[np]) posGroups[np] = [];
    posGroups[np].push(id);
  }

  // Assess each position
  const posAssessment = {};
  for (const [pos, ideal] of Object.entries(IDEAL_ROSTER)) {
    const playerIds   = posGroups[pos] || [];
    const startingReq = MIN_STARTER_QUALITY[pos] || 1;
    const actual      = playerIds.length;
    const diff        = actual - ideal;

    // NFL-starter count
    const posStarters   = nflStarterSet[pos] || new Set();
    const nflStarterIds = playerIds.filter(id => posStarters.has(id));
    const nflStarters   = nflStarterIds.length;
    const minQuality    = MIN_STARTER_QUALITY[pos] || startingReq;

    // Projected PPG from starters
    const withPPG = playerIds
      .map(id => ({ id, ppg: S.playerStats?.[id]?.seasonAvg || S.playerStats?.[id]?.prevAvg || 0 }))
      .sort((a, b) => b.ppg - a.ppg);
    const projectedPts = withPPG.slice(0, startingReq).reduce((s, p) => s + p.ppg, 0);

    // Status determination — position-specific rules matching War Room
    let status;
    if (nflStarters === 0) {
      status = 'deficit';
    } else if (pos === 'QB') {
      if      (nflStarters === 1) status = 'thin';
      else if (nflStarters === 2) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'RB') {
      if      (nflStarters < 3) status = 'thin';
      else if (nflStarters === 3) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'WR') {
      if      (nflStarters < 3) status = 'thin';
      else if (nflStarters === 3) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'TE') {
      if      (nflStarters < 2) status = 'thin';
      else if (nflStarters === 2) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'K') {
      if      (nflStarters < 1) status = 'thin';
      else if (nflStarters === 1) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'DL') {
      if      (nflStarters < 4) status = 'thin';
      else if (nflStarters === 4) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'LB') {
      if      (nflStarters < 5) status = 'thin';
      else if (nflStarters === 5) status = 'ok';
      else                        status = 'surplus';
    } else if (pos === 'DB') {
      if      (nflStarters < 4) status = 'thin';
      else if (nflStarters === 4) status = 'ok';
      else                        status = 'surplus';
    } else {
      if      (nflStarters < minQuality)  status = 'thin';
      else if (actual >= ideal)           status = 'surplus';
      else                                status = 'ok';
    }

    // Depth override
    if ((status === 'ok' || status === 'surplus') && actual < ideal) {
      status = 'thin';
    }

    // Sort display order by dynasty value
    const sortedIds = [...playerIds]
      .map(id => ({ id, score: dynastyValue(id) }))
      .sort((a, b) => b.score - a.score)
      .map(p => p.id);

    posAssessment[pos] = { actual, ideal, diff, nflStarters, nflStarterIds, sortedIds, startingReq, minQuality, projectedPts, status };
  }

  // Draft picks assessment
  const leagueSeason = parseInt(league?.season || new Date().getFullYear());
  const draftRounds  = league?.settings?.draft_rounds || DRAFT_ROUNDS;
  const pickYears    = Array.from({ length: PICK_HORIZON }, (_, i) => String(leagueSeason + i));

  const pickCountByRound     = {};
  const pickCountByYear      = {};
  const pickCountByYearRound = {};
  for (let r = 1; r <= draftRounds; r++) pickCountByRound[r] = 0;
  for (const year of pickYears) {
    pickCountByYear[year] = 0;
    pickCountByYearRound[year] = {};
    for (let r = 1; r <= draftRounds; r++) pickCountByYearRound[year][r] = 0;
  }
  const myPicks = ownerPicks || [];
  for (const { year, round } of myPicks) {
    const y = String(year);
    if (!pickYears.includes(y)) continue;
    if (round < 1 || round > draftRounds) continue;
    pickCountByRound[round] = (pickCountByRound[round] || 0) + 1;
    pickCountByYear[y] = (pickCountByYear[y] || 0) + 1;
    if (pickCountByYearRound[y]) pickCountByYearRound[y][round] = (pickCountByYearRound[y][round] || 0) + 1;
  }
  const totalPicks    = Object.values(pickCountByRound).reduce((a, b) => a + b, 0);
  const roundsMissing = Object.values(pickCountByRound).filter(c => c === 0).length;
  const pickIdeal     = PICK_HORIZON * draftRounds;
  let picksStatus;
  if      (totalPicks === 0)       picksStatus = 'deficit';
  else if (totalPicks < pickIdeal) picksStatus = 'thin';
  else if (totalPicks === pickIdeal) picksStatus = 'ok';
  else                              picksStatus = 'surplus';
  const picksAssessment = { pickCountByRound, pickCountByYear, pickCountByYearRound, totalPicks, draftRounds, idealTotal: pickIdeal, pickYears, roundsMissing, status: picksStatus };

  // Optimal weekly scoring
  const weeklyPts = calcOptimalPPG(roster.players || []);

  // Health score: 60% scoring + 40% coverage
  const scoringScore = Math.min(60, (weeklyPts / WEEKLY_TARGET) * 60);
  let coverageScore  = 0;
  const hasValueData = Object.keys(nflStarterSet).length > 0;
  for (const [pos, data] of Object.entries(posAssessment)) {
    const ratio = hasValueData
      ? Math.min(1, data.nflStarters / (data.minQuality || data.startingReq || 1))
      : Math.min(1, data.actual / data.ideal);
    coverageScore += ratio * ((POS_WEIGHTS[pos] || 0) / TOTAL_WEIGHT) * 40;
  }
  const projBonus   = weeklyPts > WEEKLY_TARGET + 10 ? 3 : weeklyPts >= WEEKLY_TARGET ? 1 : 0;
  const healthScore = Math.min(100, Math.round(scoringScore + coverageScore + projBonus));

  // Tier classification — driven by weekly scoring vs target
  let tier, tierColor, tierBg;
  if (weeklyPts > 0) {
    if      (weeklyPts > WEEKLY_TARGET + 10)   { tier = 'ELITE';      tierColor = '#D4AF37'; tierBg = 'rgba(212,175,55,0.15)'; }
    else if (weeklyPts >= WEEKLY_TARGET - 15)   { tier = 'CONTENDER';  tierColor = '#2ECC71'; tierBg = 'rgba(46,204,113,0.12)'; }
    else if (weeklyPts >= WEEKLY_TARGET * 0.85) { tier = 'CROSSROADS'; tierColor = '#F0A500'; tierBg = 'rgba(240,165,0,0.12)'; }
    else                                         { tier = 'REBUILDING'; tierColor = '#E74C3C'; tierBg = 'rgba(231,76,60,0.12)'; }
  } else {
    if      (coverageScore >= 36) { tier = 'CONTENDER';  tierColor = '#2ECC71'; tierBg = 'rgba(46,204,113,0.12)'; }
    else if (coverageScore >= 26) { tier = 'CROSSROADS'; tierColor = '#F0A500'; tierBg = 'rgba(240,165,0,0.12)'; }
    else                           { tier = 'REBUILDING'; tierColor = '#E74C3C'; tierBg = 'rgba(231,76,60,0.12)'; }
  }

  // Panic meter (0-5)
  let panic = 0;
  if      (weeklyPts > 0 && weeklyPts < WEEKLY_TARGET * 0.85) panic += 2;
  else if (weeklyPts > 0 && weeklyPts < WEEKLY_TARGET)        panic += 1;
  const criticals = Object.values(posAssessment).filter(p => p.status === 'deficit').length;
  if      (criticals >= 3) panic += 2;
  else if (criticals >= 1) panic += 1;
  const played = wins + losses + ties;
  if (played > 0 && losses / played > 0.6) panic += 1;
  panic = Math.min(5, panic);

  // Trade window
  let tradeWindow;
  if      (tier === 'ELITE' || (tier === 'CONTENDER' && panic <= 1)) tradeWindow = 'CONTENDING';
  else if (tier === 'REBUILDING')                                     tradeWindow = 'REBUILDING';
  else                                                                tradeWindow = 'TRANSITIONING';

  const needs = Object.entries(posAssessment)
    .filter(([, v]) => v.status === 'deficit' || v.status === 'thin')
    .sort((a, b) => {
      const aGap = a[1].nflStarters - a[1].startingReq;
      const bGap = b[1].nflStarters - b[1].startingReq;
      return aGap !== bGap ? aGap - bGap : a[1].diff - b[1].diff;
    })
    .map(([pos, v]) => ({ pos, urgency: v.status }));

  const strengths = Object.entries(posAssessment)
    .filter(([, v]) => v.status === 'surplus')
    .map(([pos]) => pos);

  return {
    rosterId: roster.roster_id, ownerId: roster.owner_id,
    teamName, ownerName, avatar,
    wins, losses, ties, pf,
    posGroups, posAssessment, picksAssessment,
    weeklyPts, healthScore,
    tier, tierColor, tierBg,
    panic, window: tradeWindow,
    needs, strengths,
    faabRemaining, waiverBudget,
  };
}

/**
 * Assess ALL teams in the league. Returns array of assessments.
 */
function assessAllTeams() {
  const nflStarterSet = buildNflStarterSet();
  const picksByOwner  = buildPicksByOwner();
  return (S.rosters || []).map(r => {
    const ownerPicks = picksByOwner[r.roster_id] || [];
    return assessTeam(r, nflStarterSet, ownerPicks);
  });
}


// ═══════════════════════════════════════════════════════════════
// SECTION 3: Trade Partner Matching
// ═══════════════════════════════════════════════════════════════

/**
 * Score 0-100 compatibility between two team assessments
 */
function calcComplementarity(mine, theirs) {
  if (!mine || !theirs) return 0;
  let score = 0;
  for (const n of mine.needs) {
    const t = theirs.posAssessment[n.pos];
    if (t?.status === 'surplus') score += n.urgency === 'deficit' ? 25 : 12;
    else if (t?.status === 'ok' && n.urgency === 'deficit') score += 6;
  }
  for (const n of theirs.needs) {
    const m = mine.posAssessment[n.pos];
    if (m?.status === 'surplus') score += n.urgency === 'deficit' ? 25 : 12;
    else if (m?.status === 'ok' && n.urgency === 'deficit') score += 6;
  }
  if (mine.window !== theirs.window) score += 15;
  return Math.min(100, score);
}

/**
 * Find best trade partners, sorted by compatibility descending
 */
function findBestPartners(myAssessment, allAssessments) {
  if (!myAssessment) return [];
  return allAssessments
    .filter(a => a.rosterId !== myAssessment.rosterId)
    .map(a => ({
      assessment: a,
      compatibility: calcComplementarity(myAssessment, a),
      theyProvide: myAssessment.needs
        .filter(n => {
          const t = a.posAssessment[n.pos];
          return t?.status === 'surplus' || t?.status === 'ok';
        })
        .map(n => n.pos),
      iProvide: a.needs
        .filter(n => {
          const m = myAssessment.posAssessment[n.pos];
          return m?.status === 'surplus' || m?.status === 'ok';
        })
        .map(n => n.pos),
    }))
    .sort((a, b) => b.compatibility - a.compatibility);
}


// ═══════════════════════════════════════════════════════════════
// SECTION 4: Owner DNA & Psychology
// ═══════════════════════════════════════════════════════════════

/**
 * Determine owner posture based on assessment and DNA
 */
function calcOwnerPosture(assessment, dnaKey) {
  if (!assessment) return POSTURES.NEUTRAL;
  const { tier, panic } = assessment;
  if (panic >= 4)                                                      return POSTURES.DESPERATE;
  if (tier === 'REBUILDING' || dnaKey === 'ACCEPTOR')                  return POSTURES.SELLER;
  if (tier === 'ELITE' && panic <= 1)                                  return POSTURES.LOCKED;
  if ((tier === 'CONTENDER' || tier === 'CROSSROADS') && panic >= 2)   return POSTURES.BUYER;
  return POSTURES.NEUTRAL;
}

/**
 * Calculate psychological tax modifiers (8 factors)
 * Returns array of { name, impact, type:'TAX'|'BONUS', desc }
 */
function calcPsychTaxes(myAssessment, theirAssessment, theirDnaKey, theirPosture) {
  const taxes = [];

  // 1 - Endowment Effect
  const ePct = { FLEECER: 10, DOMINATOR: 28, STALWART: 20, ACCEPTOR: 5, DESPERATE: 15, NONE: 12 }[theirDnaKey] || 12;
  taxes.push({
    name: 'Endowment Effect', impact: -Math.round(ePct / 2), type: 'TAX',
    desc: `~${ePct}% mental inflation on their own players. Their side feels worth more than market.`
  });

  // 2 - Panic Premium
  if (theirAssessment?.panic >= 3) {
    taxes.push({
      name: 'Panic Premium', impact: 8 + (theirAssessment.panic - 2) * 6, type: 'BONUS',
      desc: `Panic ${theirAssessment.panic}/5 -- urgency overrides normal caution.`
    });
  }

  // 3 - Status Tax (Dominator)
  if (theirDnaKey === 'DOMINATOR') {
    taxes.push({
      name: 'Status Tax', impact: -18, type: 'TAX',
      desc: 'Must visibly win the trade for ego/status. Frame it so they feel like the winner.'
    });
  }

  // 4 - Loss Aversion (Stalwart, Dominator)
  if (['STALWART', 'DOMINATOR'].includes(theirDnaKey)) {
    taxes.push({
      name: 'Loss Aversion', impact: -8, type: 'TAX',
      desc: 'Losing a familiar player hurts more than gaining a new one. Expect resistance.'
    });
  }

  // 5 - Rebuilding Discount (Acceptor)
  if (theirDnaKey === 'ACCEPTOR') {
    taxes.push({
      name: 'Rebuilding Discount', impact: +10, type: 'BONUS',
      desc: 'They mentally discount current starters. Buy at a discount in their mind.'
    });
  }

  // 6 - Need Fulfillment
  const myStrengths  = myAssessment?.strengths || [];
  const theirNeedPos = theirAssessment?.needs?.slice(0, 3).map(n => n.pos) || [];
  if (theirNeedPos.some(p => myStrengths.includes(p))) {
    taxes.push({
      name: 'Need Fulfillment', impact: +12, type: 'BONUS',
      desc: 'Your surplus fills their critical positional gap -- strong deal motivation.'
    });
  }

  // 7 - Trade Window alignment
  if (myAssessment && theirAssessment) {
    if (myAssessment.window !== theirAssessment.window) {
      taxes.push({
        name: 'Window Alignment', impact: +8, type: 'BONUS',
        desc: 'Opposite windows (contender vs rebuilder) = natural asset exchange.'
      });
    } else {
      taxes.push({
        name: 'Window Friction', impact: -5, type: 'TAX',
        desc: 'Same trade window reduces natural motivation to exchange assets.'
      });
    }
  }

  // 8 - Posture
  if (theirPosture?.key === 'LOCKED') {
    taxes.push({
      name: 'Locked Roster Tax', impact: -12, type: 'TAX',
      desc: 'High satisfaction + attachment. Roster moves feel threatening to them.'
    });
  } else if (theirPosture?.key === 'SELLER') {
    taxes.push({
      name: 'Seller Momentum', impact: +10, type: 'BONUS',
      desc: 'Actively shopping. Trade conversations are welcomed.'
    });
  }

  return taxes;
}

/**
 * Derive DNA from trade history (LI.ownerProfiles)
 * Returns a DNA key string or null if insufficient data
 */
function deriveDNAFromHistory(rosterId) {
  // Primary: use LI.ownerProfiles from DHQ engine
  const profile = LI_LOADED && LI.ownerProfiles?.[rosterId];
  if (!profile || profile.trades < 2) return null;

  const pickBuyer  = profile.picksAcquired > profile.picksSold * 1.5;
  const pickSeller = profile.picksSold > profile.picksAcquired * 1.5;
  const totalTeams = S.rosters?.length || 12;
  const avgTrades  = (LI.leagueTradeTendencies?.totalTrades || 0) / totalTeams;
  const highVolume = profile.trades >= avgTrades * 1.5;
  const lowVolume  = profile.trades <= 1;

  // Get roster assessment for panic check
  const roster = S.rosters?.find(r => r.roster_id === rosterId);
  const wins   = roster?.settings?.wins || 0;
  const losses = roster?.settings?.losses || 0;
  const played = wins + losses;
  const losingRecord = played > 0 && losses / played > 0.55;

  // Decision tree
  if (highVolume && pickSeller) return 'FLEECER';
  if (highVolume && !pickBuyer) return 'DOMINATOR';
  if (!highVolume && !pickBuyer && !pickSeller && profile.trades >= 2) return 'STALWART';
  if (pickBuyer) return 'ACCEPTOR';
  if (lowVolume && losingRecord) return 'DESPERATE';

  return null;
}


// ── DNA Persistence ──────────────────────────────────────────

const DNA_LOCAL_KEY = lid => `od_owner_dna_v1_${lid}`;

/**
 * Load DNA profiles for a league. Returns { rosterId: dnaKey }
 */
async function loadDNAProfiles(leagueId) {
  // Try Supabase first
  if (window.OD?.loadDNA) {
    try {
      return await window.OD.loadDNA(leagueId);
    } catch (e) {
      console.warn('[TradeCalc] OD.loadDNA failed, falling back to localStorage', e);
    }
  }
  // localStorage fallback
  try {
    return JSON.parse(localStorage.getItem(DNA_LOCAL_KEY(leagueId)) || '{}');
  } catch (e) {
    return {};
  }
}

/**
 * Save a single DNA profile for a roster in a league
 */
function saveDNAProfile(leagueId, rosterId, dnaKey) {
  // Load existing, merge, save
  let map = {};
  try { map = JSON.parse(localStorage.getItem(DNA_LOCAL_KEY(leagueId)) || '{}'); } catch (e) { /* ignore */ }
  map[rosterId] = dnaKey;
  localStorage.setItem(DNA_LOCAL_KEY(leagueId), JSON.stringify(map));
  if (window.OD?.saveDNA) {
    try { window.OD.saveDNA(leagueId, map); } catch (e) { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Trade Value & Acceptance
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate total trade value for a set of player IDs, pick objects, and FAAB
 * @param {string[]} playerIds
 * @param {Array<{year:number,round:number}>} picks
 * @param {number} faab
 */
function calcTradeValue(playerIds, picks, faab) {
  const teams = S.rosters?.length || 12;
  const playerSum = (playerIds || []).reduce((sum, pid) => sum + (dynastyValue(pid) || 0), 0);
  const pickSum = (picks || []).reduce((sum, pk) => {
    if (typeof pickValue === 'function') {
      return sum + pickValue(pk.year || S.season, pk.round, teams, pk.pickInRound);
    }
    return sum + (TRADE_PICK_VALUES[pk.round] || 100);
  }, 0);
  return playerSum + pickSum + Math.round((faab || 0) * FAAB_RATE);
}

/**
 * Calculate acceptance likelihood (5-97%) based on value diff, DNA, and psych taxes
 * diff > 0 means I'm overpaying (good for acceptance)
 * diff < 0 means they're overpaying (bad for acceptance)
 */
function calcAcceptanceLikelihood(myValue, theirValue, theirDnaKey, psychTaxes, myAssessment, theirAssessment) {
  let likelihood = 50;
  const totalA = myValue;
  const totalB = theirValue;
  if (totalA > 0 || totalB > 0) {
    const diff = totalA - totalB; // positive = I'm offering more
    const maxSide = Math.max(totalA, totalB, 1);
    const normalizedDiff = diff / maxSide;

    if (theirDnaKey === 'FLEECER') {
      likelihood = normalizedDiff < -0.05
        ? 75 + Math.round(Math.abs(normalizedDiff) * 40)
        : Math.max(15, 50 - Math.round(normalizedDiff * 150));
    } else if (theirDnaKey === 'DOMINATOR') {
      likelihood = normalizedDiff < -0.10
        ? 70
        : normalizedDiff < 0 ? 55 : Math.max(10, 40 - Math.round(normalizedDiff * 200));
    } else if (theirDnaKey === 'STALWART') {
      likelihood = Math.min(85, Math.max(20, Math.round((1 - Math.abs(normalizedDiff) * 3) * 80)));
    } else if (theirDnaKey === 'ACCEPTOR') {
      likelihood = Math.min(90, Math.max(30, 60 + Math.round(normalizedDiff * 100)));
    } else if (theirDnaKey === 'DESPERATE') {
      const fitsNeed = theirAssessment?.needs?.some(n => (myAssessment?.strengths || []).includes(n.pos));
      likelihood = fitsNeed
        ? Math.min(92, 65 + Math.round(Math.abs(normalizedDiff) * 20) + 20)
        : Math.min(75, 55 + Math.round(Math.abs(normalizedDiff) * 30));
    } else {
      // NONE / default
      likelihood = Math.min(85, Math.max(15, 50 - Math.round(normalizedDiff * 120)));
    }

    // Apply psych tax total
    const netTax = (psychTaxes || []).reduce((s, t) => s + t.impact, 0);
    likelihood += netTax;
  }
  return Math.round(Math.max(5, Math.min(97, likelihood)));
}

/**
 * Grade a trade's fairness
 */
function fairnessGrade(myValue, theirValue) {
  if (myValue === 0 && theirValue === 0) return { grade: '--', color: 'var(--text3)' };
  const max = Math.max(myValue, theirValue, 1);
  const pct = Math.abs(myValue - theirValue) / max;
  if (pct <= 0.05) return { grade: 'A+', color: 'var(--green)' };
  if (pct <= 0.10) return { grade: 'A',  color: 'var(--green)' };
  if (pct <= 0.15) return { grade: 'B+', color: '#2ECC71' };
  if (pct <= 0.22) return { grade: 'B',  color: 'var(--accent)' };
  if (pct <= 0.30) return { grade: 'C',  color: 'var(--amber)' };
  if (pct <= 0.40) return { grade: 'D',  color: '#F0A500' };
  return { grade: 'F', color: 'var(--red)' };
}


// ═══════════════════════════════════════════════════════════════
// SECTION 6: Rendering
// ═══════════════════════════════════════════════════════════════

// Module-level state for the trade calculator UI
let _tcAssessments = [];
let _tcMyAssessment = null;
let _tcDnaMap = {};
let _tcSelectedScout = null;
let _tcBuilderMy = null;
let _tcBuilderTheir = null;
let _tcBuilderMyAssets = { players: [], picks: [], faab: 0 };
let _tcBuilderTheirAssets = { players: [], picks: [], faab: 0 };
let _tcActiveView = 'overview'; // 'overview' | 'scout' | 'partners' | 'builder' | 'dna'

// ── renderTradeCalc — main entry point ───────────────────────

async function renderTradeCalc() {
  const el = $('trade-calc-container');
  if (!el) return;

  if (!S.rosters?.length || !S.players || !Object.keys(S.players).length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text3)">
      <div style="font-size:14px">Connect to a league to use the Trade Calculator</div>
    </div>`;
    return;
  }

  // Show loading
  el.innerHTML = `<div style="text-align:center;padding:24px">
    <div class="ld"><span>.</span><span>.</span><span>.</span></div>
    <div style="font-size:12px;color:var(--text3);margin-top:8px">Analyzing all teams...</div>
  </div>`;

  // Compute assessments
  _tcAssessments = assessAllTeams();
  _tcMyAssessment = _tcAssessments.find(a => a.rosterId === S.myRosterId) || _tcAssessments[0] || null;

  // Load DNA profiles
  if (S.currentLeagueId) {
    _tcDnaMap = await loadDNAProfiles(S.currentLeagueId);
  }

  // Auto-derive missing DNA
  _tcAssessments.forEach(a => {
    if (!_tcDnaMap[a.rosterId]) {
      const derived = deriveDNAFromHistory(a.rosterId);
      if (derived) _tcDnaMap[a.rosterId] = derived;
    }
  });

  _renderTradeCalcShell(el);
}

function _renderTradeCalcShell(el) {
  el.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm ${_tcActiveView === 'overview' ? '' : 'btn-ghost'}" onclick="_tcSwitchView('overview')">League Overview</button>
        <button class="btn btn-sm ${_tcActiveView === 'partners' ? '' : 'btn-ghost'}" onclick="_tcSwitchView('partners')">Partner Finder</button>
        <button class="btn btn-sm ${_tcActiveView === 'builder' ? '' : 'btn-ghost'}" onclick="_tcSwitchView('builder')">Trade Builder</button>
        <button class="btn btn-sm ${_tcActiveView === 'dna' ? '' : 'btn-ghost'}" onclick="_tcSwitchView('dna')">Owner DNA</button>
      </div>
    </div>
    <div id="tc-view-content"></div>
  `;

  const content = $('tc-view-content');
  if (_tcActiveView === 'overview') renderLeagueOverview(_tcAssessments, content);
  else if (_tcActiveView === 'scout' && _tcSelectedScout) renderTeamScout(_tcSelectedScout, content);
  else if (_tcActiveView === 'partners') renderPartnerFinder(_tcMyAssessment, _tcAssessments, content);
  else if (_tcActiveView === 'builder') renderTradeBuilder(_tcBuilderMy?.rosterId || S.myRosterId, _tcBuilderTheir?.rosterId, content);
  else if (_tcActiveView === 'dna') renderDNAPanel(_tcAssessments, content);
  else renderLeagueOverview(_tcAssessments, content);
}

function _tcSwitchView(view) {
  _tcActiveView = view;
  const el = $('trade-calc-container');
  if (el) _renderTradeCalcShell(el);
}
window._tcSwitchView = _tcSwitchView;

function _tcScoutTeam(rosterId) {
  _tcSelectedScout = _tcAssessments.find(a => a.rosterId === rosterId) || null;
  _tcActiveView = 'scout';
  const el = $('trade-calc-container');
  if (el) _renderTradeCalcShell(el);
}
window._tcScoutTeam = _tcScoutTeam;

function _tcStartTrade(theirRosterId) {
  _tcBuilderMy = _tcMyAssessment;
  _tcBuilderTheir = _tcAssessments.find(a => a.rosterId === theirRosterId) || null;
  _tcBuilderMyAssets = { players: [], picks: [], faab: 0 };
  _tcBuilderTheirAssets = { players: [], picks: [], faab: 0 };
  _tcActiveView = 'builder';
  const el = $('trade-calc-container');
  if (el) _renderTradeCalcShell(el);
}
window._tcStartTrade = _tcStartTrade;


// ── renderLeagueOverview ─────────────────────────────────────

function renderLeagueOverview(assessments, container) {
  if (!container) container = $('tc-view-content');
  if (!container) return;
  if (!assessments?.length) {
    container.innerHTML = '<div class="card" style="text-align:center;color:var(--text3);padding:20px">No teams found</div>';
    return;
  }

  // Sort by health score descending
  const sorted = [...assessments].sort((a, b) => b.healthScore - a.healthScore);

  let html = `<div class="sec">League Overview <span class="sec-line"></span></div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">`;

  sorted.forEach((a, idx) => {
    const dnaKey = _tcDnaMap[a.rosterId] || 'NONE';
    const dna = DNA_TYPES[dnaKey] || DNA_TYPES.NONE;
    const isMe = a.rosterId === S.myRosterId;
    const topNeed = a.needs[0]?.pos || '--';
    const topStrength = a.strengths[0] || '--';
    const posture = calcOwnerPosture(a, dnaKey);
    const avatarHtml = a.avatar
      ? `<img src="https://sleepercdn.com/avatars/thumbs/${a.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text3)">${(a.ownerName || '?')[0].toUpperCase()}</div>`;

    html += `
      <div class="card" style="cursor:pointer;${isMe ? 'border-color:rgba(124,107,248,.35);box-shadow:0 0 12px rgba(124,107,248,.1)' : ''}" onclick="_tcScoutTeam(${a.rosterId})">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${avatarHtml}
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.ownerName}${isMe ? ' <span style="font-size:11px;color:var(--accent)">(You)</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text3)">${a.teamName}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;font-weight:700;color:${a.tierColor};text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:5px;background:${a.tierBg}">${a.tier}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text2)"><span style="font-weight:600">${a.wins}-${a.losses}${a.ties ? '-' + a.ties : ''}</span></div>
          <div style="font-size:12px;color:var(--text3)">${a.weeklyPts > 0 ? a.weeklyPts.toFixed(1) + ' ppg' : '--'}</div>
          ${dnaKey !== 'NONE' ? `<span style="font-size:11px;padding:1px 7px;border-radius:10px;background:${dna.color}22;color:${dna.color};font-weight:600">${dna.label}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <div style="font-size:11px;color:var(--text3);min-width:52px">Health</div>
          <div style="flex:1;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${a.healthScore}%;background:${a.healthScore >= 70 ? 'var(--green)' : a.healthScore >= 45 ? 'var(--amber)' : 'var(--red)'};border-radius:3px;transition:width .4s"></div>
          </div>
          <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;min-width:28px;text-align:right;color:${a.healthScore >= 70 ? 'var(--green)' : a.healthScore >= 45 ? 'var(--amber)' : 'var(--red)'}">${a.healthScore}</div>
        </div>
        <div style="display:flex;gap:12px;font-size:11px">
          <div><span style="color:var(--text3)">Need:</span> <span style="color:var(--red);font-weight:600">${topNeed}</span></div>
          <div><span style="color:var(--text3)">Surplus:</span> <span style="color:var(--green);font-weight:600">${topStrength}</span></div>
          <div><span style="color:var(--text3)">Panic:</span> <span style="color:${a.panic >= 3 ? 'var(--red)' : a.panic >= 2 ? 'var(--amber)' : 'var(--green)'};font-weight:600">${a.panic}/5</span></div>
        </div>
      </div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}


// ── renderTeamScout ──────────────────────────────────────────

function renderTeamScout(assessment, container) {
  if (!container) container = $('tc-view-content');
  if (!container || !assessment) return;
  const a = assessment;
  const dnaKey = _tcDnaMap[a.rosterId] || 'NONE';
  const dna = DNA_TYPES[dnaKey] || DNA_TYPES.NONE;
  const posture = calcOwnerPosture(a, dnaKey);
  const isMe = a.rosterId === S.myRosterId;
  const compat = _tcMyAssessment && !isMe ? calcComplementarity(_tcMyAssessment, a) : null;

  const avatarHtml = a.avatar
    ? `<img src="https://sleepercdn.com/avatars/thumbs/${a.avatar}" style="width:44px;height:44px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'">`
    : `<div style="width:44px;height:44px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--text3)">${(a.ownerName || '?')[0].toUpperCase()}</div>`;

  let html = `
    <button class="btn btn-sm btn-ghost" onclick="_tcSwitchView('overview')" style="margin-bottom:12px">&larr; Back to Overview</button>
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="font-size:16px;font-weight:800;letter-spacing:-.02em">${a.ownerName}${isMe ? ' <span style="color:var(--accent);font-size:12px">(You)</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text3)">${a.teamName} &middot; ${a.wins}-${a.losses}${a.ties ? '-' + a.ties : ''} &middot; ${a.weeklyPts > 0 ? a.weeklyPts.toFixed(1) + ' ppg' : '--'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:700;color:${a.tierColor};text-transform:uppercase;padding:3px 10px;border-radius:6px;background:${a.tierBg}">${a.tier}</div>
        </div>
      </div>

      <!-- Health + Panic meters -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-weight:600">Health Score</div>
          <div style="font-size:28px;font-weight:800;color:${a.healthScore >= 70 ? 'var(--green)' : a.healthScore >= 45 ? 'var(--amber)' : 'var(--red)'};font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${a.healthScore}</div>
          <div style="height:5px;background:var(--bg);border-radius:3px;margin-top:6px;overflow:hidden">
            <div style="height:100%;width:${a.healthScore}%;background:${a.healthScore >= 70 ? 'var(--green)' : a.healthScore >= 45 ? 'var(--amber)' : 'var(--red)'};border-radius:3px"></div>
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-weight:600">Panic Meter</div>
          <div style="font-size:28px;font-weight:800;color:${a.panic >= 4 ? 'var(--red)' : a.panic >= 2 ? 'var(--amber)' : 'var(--green)'};font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${a.panic}<span style="font-size:14px;color:var(--text3)">/5</span></div>
          <div style="display:flex;gap:3px;margin-top:6px">
            ${[1, 2, 3, 4, 5].map(i => `<div style="flex:1;height:5px;border-radius:3px;background:${i <= a.panic ? (a.panic >= 4 ? 'var(--red)' : a.panic >= 2 ? 'var(--amber)' : 'var(--green)') : 'var(--bg)'}"></div>`).join('')}
          </div>
        </div>
      </div>

      <!-- DNA + Posture + Window -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${dnaKey !== 'NONE' ? `<span class="pill" style="background:${dna.color}18;color:${dna.color};border-color:${dna.color}40;font-size:12px">DNA: ${dna.label}</span>` : '<span class="pill pd" style="font-size:12px">DNA: Not Set</span>'}
        <span class="pill" style="background:${posture.color}18;color:${posture.color};border-color:${posture.color}40;font-size:12px">${posture.label}</span>
        <span class="pill pd" style="font-size:12px">Window: ${a.window}</span>
      </div>
    </div>`;

  // Position Assessment Grid
  html += `<div class="sec">Position Assessment <span class="sec-line"></span></div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:14px">`;

  DEPTH_POSITIONS.forEach(pos => {
    const pa = a.posAssessment[pos];
    if (!pa) return;
    const statusColor = pa.status === 'surplus' ? 'var(--green)' : pa.status === 'ok' ? 'var(--accent)' : pa.status === 'thin' ? 'var(--amber)' : 'var(--red)';
    const statusBg = pa.status === 'surplus' ? 'var(--greenL)' : pa.status === 'ok' ? 'var(--accentL)' : pa.status === 'thin' ? 'var(--amberL)' : 'var(--redL)';
    const statusLabel = pa.status === 'surplus' ? 'Surplus' : pa.status === 'ok' ? 'Covered' : pa.status === 'thin' ? 'Thin' : 'Deficit';

    // Top players at this position (show top 3)
    const topPlayers = (pa.sortedIds || []).slice(0, 3).map(pid => {
      const val = dynastyValue(pid);
      const isStarter = pa.nflStarterIds?.includes(pid);
      return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;padding:1px 0">
        <span style="color:${isStarter ? 'var(--green)' : 'var(--text3)'};font-size:9px">${isStarter ? '●' : '○'}</span>
        <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;color:var(--text2)" onclick="openPlayerModal('${pid}')">${pNameShort(pid)}</span>
        ${val > 0 ? `<span style="font-size:10px;color:var(--text3);font-family:'JetBrains Mono',monospace">${val.toLocaleString()}</span>` : ''}
      </div>`;
    }).join('');

    html += `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:10px;border-top:3px solid ${statusColor}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700">${pos}</span>
          <span style="font-size:10px;font-weight:700;color:${statusColor};text-transform:uppercase;padding:1px 6px;border-radius:4px;background:${statusBg}">${statusLabel}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
          ${pa.nflStarters}/${pa.minQuality} starters &middot; ${pa.actual} total
        </div>
        ${topPlayers}
      </div>`;
  });
  html += `</div>`;

  // Needs and Strengths
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">`;
  html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px">
    <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Needs</div>
    ${a.needs.length ? a.needs.map(n => `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px">
      <span style="font-weight:600">${n.pos}</span>
      <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${n.urgency === 'deficit' ? 'var(--redL)' : 'var(--amberL)'};color:${n.urgency === 'deficit' ? 'var(--red)' : 'var(--amber)'};font-weight:600;text-transform:uppercase">${n.urgency}</span>
    </div>`).join('') : '<div style="font-size:12px;color:var(--text3)">None</div>'}
  </div>`;
  html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px">
    <div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Strengths</div>
    ${a.strengths.length ? a.strengths.map(pos => `<div style="font-size:12px;font-weight:600;padding:2px 0">${pos} <span style="font-size:10px;color:var(--green)">surplus</span></div>`).join('') : '<div style="font-size:12px;color:var(--text3)">None</div>'}
  </div>`;
  html += `</div>`;

  // Draft Capital Summary
  const pa = a.picksAssessment;
  html += `<div class="sec">Draft Capital <span class="sec-line"></span></div>`;
  html += `<div class="card" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:13px;font-weight:700">Picks</span>
      <span style="font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;background:${pa.status === 'surplus' ? 'var(--greenL)' : pa.status === 'ok' ? 'var(--accentL)' : pa.status === 'thin' ? 'var(--amberL)' : 'var(--redL)'};color:${pa.status === 'surplus' ? 'var(--green)' : pa.status === 'ok' ? 'var(--accent)' : pa.status === 'thin' ? 'var(--amber)' : 'var(--red)'};text-transform:uppercase">${pa.status}</span>
      <span style="font-size:11px;color:var(--text3)">${pa.totalPicks}/${pa.idealTotal} total</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px">
      ${(pa.pickYears || []).map(yr => {
        const count = pa.pickCountByYear[yr] || 0;
        return `<div style="background:var(--bg3);border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:11px;color:var(--text3);font-weight:600">${yr}</div>
          <div style="font-size:18px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${count >= pa.draftRounds ? 'var(--green)' : count > 0 ? 'var(--text)' : 'var(--red)'}">${count}</div>
          <div style="font-size:10px;color:var(--text3)">picks</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // Compatibility with MY team
  if (compat !== null) {
    html += `<div class="card" style="margin-bottom:14px;border-color:rgba(124,107,248,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;font-weight:700">Trade Compatibility with You</span>
        <span style="font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${compat >= 60 ? 'var(--green)' : compat >= 30 ? 'var(--amber)' : 'var(--text3)'}">${compat}</span>
      </div>
      <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${compat}%;background:${compat >= 60 ? 'var(--green)' : compat >= 30 ? 'var(--amber)' : 'var(--text3)'};border-radius:3px"></div>
      </div>
      <button class="btn btn-sm" onclick="_tcStartTrade(${a.rosterId})">Open Trade Builder</button>
    </div>`;
  }

  container.innerHTML = html;
}


// ── renderPartnerFinder ──────────────────────────────────────

function renderPartnerFinder(myAssessment, allAssessments, container) {
  if (!container) container = $('tc-view-content');
  if (!container) return;

  if (!myAssessment) {
    container.innerHTML = '<div class="card" style="text-align:center;color:var(--text3);padding:20px">Could not find your team assessment</div>';
    return;
  }

  const partners = findBestPartners(myAssessment, allAssessments);

  let html = `<div class="sec">Partner Finder <span class="sec-line"></span></div>`;

  // My summary
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">`;

  // My needs
  html += `<div class="card">
    <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">My Needs</div>
    ${myAssessment.needs.length ? myAssessment.needs.map(n => `
      <div style="display:flex;align-items:center;gap:6px;padding:3px 0">
        <span style="font-size:13px;font-weight:700">${n.pos}</span>
        <span style="font-size:10px;padding:1px 5px;border-radius:3px;background:${n.urgency === 'deficit' ? 'var(--redL)' : 'var(--amberL)'};color:${n.urgency === 'deficit' ? 'var(--red)' : 'var(--amber)'};font-weight:600;text-transform:uppercase">${n.urgency}</span>
      </div>
    `).join('') : '<div style="font-size:12px;color:var(--text3)">No critical needs</div>'}
  </div>`;

  // My strengths
  html += `<div class="card">
    <div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">My Strengths</div>
    ${myAssessment.strengths.length ? myAssessment.strengths.map(pos => `
      <div style="font-size:13px;font-weight:600;padding:3px 0">${pos} <span style="font-size:10px;color:var(--green);text-transform:uppercase">surplus</span></div>
    `).join('') : '<div style="font-size:12px;color:var(--text3)">No surplus positions</div>'}
  </div>`;
  html += `</div>`;

  // Partner rankings
  html += `<div class="sec">Ranked Partners <span class="sec-line"></span></div>`;

  if (!partners.length) {
    html += '<div class="card" style="text-align:center;color:var(--text3);padding:16px;font-size:13px">No trade partners found</div>';
  } else {
    partners.forEach((p, idx) => {
      const a = p.assessment;
      const dnaKey = _tcDnaMap[a.rosterId] || 'NONE';
      const dna = DNA_TYPES[dnaKey] || DNA_TYPES.NONE;
      const compatColor = p.compatibility >= 60 ? 'var(--green)' : p.compatibility >= 30 ? 'var(--amber)' : 'var(--text3)';

      html += `
        <div class="card" style="cursor:pointer" onclick="_tcStartTrade(${a.rosterId})">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:16px;font-weight:800;color:var(--text3);min-width:24px;font-family:'JetBrains Mono',monospace">#${idx + 1}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <span style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.ownerName}</span>
                <span style="font-size:11px;color:${a.tierColor};font-weight:600">${a.tier}</span>
                ${dnaKey !== 'NONE' ? `<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:${dna.color}22;color:${dna.color};font-weight:600">${dna.label}</span>` : ''}
              </div>
              <div style="display:flex;gap:8px;font-size:11px;color:var(--text3);flex-wrap:wrap">
                ${p.theyProvide.length ? `<span>They give: <span style="color:var(--green);font-weight:600">${p.theyProvide.join(', ')}</span></span>` : ''}
                ${p.iProvide.length ? `<span>I give: <span style="color:var(--blue);font-weight:600">${p.iProvide.join(', ')}</span></span>` : ''}
              </div>
            </div>
            <div style="text-align:right;min-width:50px">
              <div style="font-size:20px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${compatColor}">${p.compatibility}</div>
              <div style="font-size:10px;color:var(--text3)">compat</div>
            </div>
          </div>
          <div style="height:4px;background:var(--bg3);border-radius:2px;margin-top:8px;overflow:hidden">
            <div style="height:100%;width:${p.compatibility}%;background:${compatColor};border-radius:2px"></div>
          </div>
        </div>`;
    });
  }

  container.innerHTML = html;
}


// ── renderTradeBuilder ───────────────────────────────────────

function renderTradeBuilder(myRosterId, theirRosterId, container) {
  if (!container) container = $('tc-view-content');
  if (!container) return;

  const myAssessment = _tcAssessments.find(a => a.rosterId === myRosterId);
  const theirAssessment = theirRosterId ? _tcAssessments.find(a => a.rosterId === theirRosterId) : null;

  if (!myAssessment) {
    container.innerHTML = '<div class="card" style="text-align:center;color:var(--text3);padding:20px">Could not find your team</div>';
    return;
  }

  let html = `
    <button class="btn btn-sm btn-ghost" onclick="_tcSwitchView('overview')" style="margin-bottom:12px">&larr; Back</button>
    <div class="sec">Trade Builder <span class="sec-line"></span></div>`;

  // Team selector if no opponent yet
  if (!theirAssessment) {
    html += `<div class="card" style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Select trade partner</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px">
        ${_tcAssessments.filter(a => a.rosterId !== myRosterId).map(a => `
          <button class="btn btn-sm btn-ghost" onclick="_tcStartTrade(${a.rosterId})" style="text-align:left;padding:8px 10px">
            <div style="font-size:12px;font-weight:600">${a.ownerName}</div>
            <div style="font-size:10px;color:var(--text3)">${a.tier} &middot; ${a.wins}-${a.losses}</div>
          </button>
        `).join('')}
      </div>
    </div>`;
    container.innerHTML = html;
    return;
  }

  const teams = S.rosters?.length || 12;
  const theirDnaKey = _tcDnaMap[theirAssessment.rosterId] || 'NONE';
  const theirDna = DNA_TYPES[theirDnaKey] || DNA_TYPES.NONE;
  const posture = calcOwnerPosture(theirAssessment, theirDnaKey);

  // Header with opponent info
  html += `<div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
    <div style="flex:1">
      <div style="font-size:12px;color:var(--text3)">Trading with</div>
      <div style="font-size:15px;font-weight:700">${theirAssessment.ownerName}</div>
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
        <span style="font-size:11px;color:${theirAssessment.tierColor};font-weight:600">${theirAssessment.tier}</span>
        ${theirDnaKey !== 'NONE' ? `<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:${theirDna.color}22;color:${theirDna.color};font-weight:600">${theirDna.label}</span>` : ''}
        <span style="font-size:10px;padding:1px 5px;border-radius:8px;background:${posture.color}22;color:${posture.color};font-weight:600">${posture.label}</span>
      </div>
    </div>
    <button class="btn btn-sm btn-ghost" onclick="_tcScoutTeam(${theirAssessment.rosterId})">Scout</button>
  </div>`;

  // Two-column trade layout
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:10px;margin-bottom:12px">`;

  // MY SIDE
  html += _renderTradeSide(myAssessment, _tcBuilderMyAssets, 'my', true);

  // THEIR SIDE
  html += _renderTradeSide(theirAssessment, _tcBuilderTheirAssets, 'their', false);

  html += `</div>`;

  // Trade summary
  const myVal = calcTradeValue(
    _tcBuilderMyAssets.players,
    _tcBuilderMyAssets.picks,
    _tcBuilderMyAssets.faab
  );
  const theirVal = calcTradeValue(
    _tcBuilderTheirAssets.players,
    _tcBuilderTheirAssets.picks,
    _tcBuilderTheirAssets.faab
  );
  const diff = myVal - theirVal;
  const hasTrade = myVal > 0 || theirVal > 0;
  const psychTaxes = hasTrade ? calcPsychTaxes(myAssessment, theirAssessment, theirDnaKey, posture) : [];
  const acceptance = hasTrade ? calcAcceptanceLikelihood(myVal, theirVal, theirDnaKey, psychTaxes, myAssessment, theirAssessment) : 50;
  const grade = fairnessGrade(myVal, theirVal);

  html += `<div class="card" style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Trade Summary</div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-bottom:12px">
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:2px">You Give</div>
        <div style="font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent)">${myVal.toLocaleString()}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Diff</div>
        <div style="font-size:16px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--text3)'}">${diff > 0 ? '+' : ''}${diff.toLocaleString()}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--text3);margin-bottom:2px">They Give</div>
        <div style="font-size:22px;font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--accent)">${theirVal.toLocaleString()}</div>
      </div>
    </div>`;

  // Acceptance likelihood meter
  const acceptColor = acceptance >= 65 ? 'var(--green)' : acceptance >= 40 ? 'var(--amber)' : 'var(--red)';
  html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="font-size:11px;color:var(--text3);min-width:72px">Acceptance</div>
      <div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;position:relative">
        <div style="height:100%;width:${acceptance}%;background:${acceptColor};border-radius:4px;transition:width .4s"></div>
      </div>
      <div style="font-size:16px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${acceptColor};min-width:40px;text-align:right">${acceptance}%</div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div style="font-size:11px;color:var(--text3);min-width:72px">Fairness</div>
      <div style="font-size:18px;font-weight:800;color:${grade.color}">${grade.grade}</div>
      ${theirDnaKey !== 'NONE' ? `<div style="font-size:11px;color:var(--text3);margin-left:auto">DNA mult: ${theirDna.mult}x</div>` : ''}
    </div>`;

  // Psych taxes breakdown
  if (psychTaxes.length) {
    html += `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Psychological Factors</div>`;
    psychTaxes.forEach(t => {
      const isBonus = t.type === 'BONUS';
      html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:12px">
        <span style="font-size:11px;font-weight:700;min-width:40px;text-align:right;color:${isBonus ? 'var(--green)' : 'var(--red)'}">
          ${t.impact > 0 ? '+' : ''}${t.impact}%
        </span>
        <div>
          <div style="font-weight:600;color:var(--text)">${t.name}</div>
          <div style="color:var(--text3);font-size:11px;margin-top:1px">${t.desc}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;

  container.innerHTML = html;
}

/**
 * Render one side of the trade builder (my side or their side)
 */
function _renderTradeSide(assessment, assets, side, isMySide) {
  const roster = S.rosters?.find(r => r.roster_id === assessment.rosterId);
  const playerIds = roster?.players || [];
  const league = S.leagues.find(l => l.league_id === S.currentLeagueId);
  const teams = S.rosters?.length || 12;
  const draftRounds = league?.settings?.draft_rounds || DRAFT_ROUNDS;
  const curYear = parseInt(S.season) || new Date().getFullYear();

  // Group players by position, sorted by value
  const grouped = {};
  playerIds.forEach(pid => {
    const pos = normPos(pPos(pid));
    if (!grouped[pos]) grouped[pos] = [];
    grouped[pos].push({ pid, val: dynastyValue(pid), name: pName(pid) });
  });
  Object.values(grouped).forEach(arr => arr.sort((a, b) => b.val - a.val));

  // Build available picks
  const allTP = S.tradedPicks || [];
  const availPicks = [];
  for (let yr = curYear; yr < curYear + PICK_HORIZON; yr++) {
    for (let rd = 1; rd <= draftRounds; rd++) {
      const tradedAway = allTP.find(p =>
        parseInt(p.season) === yr && p.round === rd &&
        p.roster_id === assessment.rosterId && p.owner_id !== assessment.rosterId
      );
      if (!tradedAway) {
        availPicks.push({ year: yr, round: rd, originalOwnerRid: assessment.rosterId });
      }
      const acquired = allTP.filter(p =>
        parseInt(p.season) === yr && p.round === rd &&
        p.owner_id === assessment.rosterId && p.roster_id !== assessment.rosterId
      );
      acquired.forEach(p => {
        availPicks.push({ year: yr, round: rd, originalOwnerRid: p.roster_id });
      });
    }
  }

  // Selected assets value display
  const selectedPlayerHtml = assets.players.map(pid => {
    const val = dynastyValue(pid);
    const { col } = tradeValueTier(val);
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pNameShort(pid)}</span>
      <span style="font-size:11px;font-weight:600;color:${col};font-family:'JetBrains Mono',monospace">${val.toLocaleString()}</span>
      <button style="background:none;border:1px solid var(--border2);border-radius:4px;padding:1px 5px;cursor:pointer;color:var(--text3);font-size:10px;font-family:inherit" onclick="_tcRemoveAsset('${side}','player','${pid}')">&times;</button>
    </div>`;
  }).join('');

  const selectedPickHtml = assets.picks.map((pk, idx) => {
    const val = typeof pickValue === 'function' ? pickValue(pk.year, pk.round, teams) : (TRADE_PICK_VALUES[pk.round] || 100);
    return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;flex:1">${pk.year} Round ${pk.round}</span>
      <span style="font-size:11px;font-weight:600;color:var(--accent);font-family:'JetBrains Mono',monospace">${val.toLocaleString()}</span>
      <button style="background:none;border:1px solid var(--border2);border-radius:4px;padding:1px 5px;cursor:pointer;color:var(--text3);font-size:10px;font-family:inherit" onclick="_tcRemoveAsset('${side}','pick',${idx})">&times;</button>
    </div>`;
  }).join('');

  // Player dropdown grouped by position
  let playerOptions = '<option value="">+ Add player...</option>';
  DEPTH_POSITIONS.forEach(pos => {
    const players = grouped[pos] || [];
    if (!players.length) return;
    playerOptions += `<optgroup label="${pos}">`;
    players.forEach(p => {
      if (assets.players.includes(p.pid)) return; // already selected
      playerOptions += `<option value="${p.pid}">${pNameShort(p.pid)} (${p.val > 0 ? p.val.toLocaleString() : '--'})</option>`;
    });
    playerOptions += `</optgroup>`;
  });

  // Pick dropdown
  let pickOptions = '<option value="">+ Add pick...</option>';
  availPicks.forEach((pk, idx) => {
    const alreadySelected = assets.picks.some(ap => ap.year === pk.year && ap.round === pk.round && ap.originalOwnerRid === pk.originalOwnerRid);
    if (alreadySelected) return;
    const val = typeof pickValue === 'function' ? pickValue(pk.year, pk.round, teams) : (TRADE_PICK_VALUES[pk.round] || 100);
    const origLabel = pk.originalOwnerRid !== assessment.rosterId ? ` (via ${getUser(S.rosters?.find(r => r.roster_id === pk.originalOwnerRid)?.owner_id) || 'R' + pk.originalOwnerRid})` : '';
    pickOptions += `<option value="${pk.year}-${pk.round}-${pk.originalOwnerRid}">${pk.year} Rd ${pk.round}${origLabel} (${val.toLocaleString()})</option>`;
  });

  return `<div style="background:var(--bg2);border:1px solid ${isMySide ? 'rgba(124,107,248,.2)' : 'var(--border)'};border-radius:var(--rl);padding:12px">
    <div style="font-size:12px;font-weight:700;color:${isMySide ? 'var(--accent)' : 'var(--text2)'};text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${isMySide ? 'You Give' : assessment.ownerName + ' Gives'}</div>

    <!-- Selected assets -->
    <div style="min-height:24px;margin-bottom:8px">
      ${selectedPlayerHtml}
      ${selectedPickHtml}
      ${assets.faab > 0 ? `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:12px;flex:1">$${assets.faab} FAAB</span>
        <span style="font-size:11px;font-weight:600;color:var(--amber);font-family:'JetBrains Mono',monospace">${Math.round(assets.faab * FAAB_RATE).toLocaleString()}</span>
        <button style="background:none;border:1px solid var(--border2);border-radius:4px;padding:1px 5px;cursor:pointer;color:var(--text3);font-size:10px;font-family:inherit" onclick="_tcRemoveAsset('${side}','faab',0)">&times;</button>
      </div>` : ''}
      ${!selectedPlayerHtml && !selectedPickHtml && assets.faab <= 0 ? '<div style="font-size:12px;color:var(--text3);padding:8px 0;text-align:center">No assets selected</div>' : ''}
    </div>

    <!-- Add player -->
    <select style="font-size:12px;padding:6px 8px;margin-bottom:6px" onchange="_tcAddPlayer('${side}',this.value);this.value=''">
      ${playerOptions}
    </select>

    <!-- Add pick -->
    <select style="font-size:12px;padding:6px 8px;margin-bottom:6px" onchange="_tcAddPick('${side}',this.value);this.value=''">
      ${pickOptions}
    </select>

    <!-- FAAB input -->
    ${isMySide ? `<div style="display:flex;gap:6px;align-items:center;margin-top:4px">
      <span style="font-size:11px;color:var(--text3)">FAAB $</span>
      <input type="number" min="0" max="${assessment.faabRemaining || 0}" value="${assets.faab || ''}" style="width:70px;font-size:12px;padding:4px 6px" placeholder="0" onchange="_tcSetFaab('${side}',parseInt(this.value)||0)">
      <span style="font-size:10px;color:var(--text3)">/${assessment.faabRemaining || 0}</span>
    </div>` : ''}
  </div>`;
}

// Trade builder asset manipulation
function _tcAddPlayer(side, pid) {
  if (!pid) return;
  const assets = side === 'my' ? _tcBuilderMyAssets : _tcBuilderTheirAssets;
  if (assets.players.includes(pid)) return;
  if (assets.players.length >= 8) { showToast('Max 8 players per side'); return; }
  assets.players.push(pid);
  _tcRefreshBuilder();
}
window._tcAddPlayer = _tcAddPlayer;

function _tcAddPick(side, val) {
  if (!val) return;
  const [year, round, origRid] = val.split('-').map(Number);
  const assets = side === 'my' ? _tcBuilderMyAssets : _tcBuilderTheirAssets;
  if (assets.picks.length >= 6) { showToast('Max 6 picks per side'); return; }
  assets.picks.push({ year, round, originalOwnerRid: origRid });
  _tcRefreshBuilder();
}
window._tcAddPick = _tcAddPick;

function _tcSetFaab(side, val) {
  const assets = side === 'my' ? _tcBuilderMyAssets : _tcBuilderTheirAssets;
  assets.faab = Math.max(0, val || 0);
  _tcRefreshBuilder();
}
window._tcSetFaab = _tcSetFaab;

function _tcRemoveAsset(side, type, idxOrPid) {
  const assets = side === 'my' ? _tcBuilderMyAssets : _tcBuilderTheirAssets;
  if (type === 'player') {
    assets.players = assets.players.filter(p => p !== idxOrPid);
  } else if (type === 'pick') {
    assets.picks.splice(Number(idxOrPid), 1);
  } else if (type === 'faab') {
    assets.faab = 0;
  }
  _tcRefreshBuilder();
}
window._tcRemoveAsset = _tcRemoveAsset;

function _tcRefreshBuilder() {
  const myRid = _tcBuilderMy?.rosterId || S.myRosterId;
  const theirRid = _tcBuilderTheir?.rosterId;
  const container = $('tc-view-content');
  if (container) renderTradeBuilder(myRid, theirRid, container);
}


// ── renderDNAPanel ───────────────────────────────────────────

function renderDNAPanel(assessments, container) {
  if (!container) container = $('tc-view-content');
  if (!container) return;

  let html = `<div class="sec">Owner DNA Profiles <span class="sec-line"></span></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">
      DNA profiles model each owner's trade psychology. Auto-derived from league trade history, or set manually.
    </div>`;

  const sorted = [...assessments].sort((a, b) => b.healthScore - a.healthScore);

  sorted.forEach(a => {
    const dnaKey = _tcDnaMap[a.rosterId] || 'NONE';
    const dna = DNA_TYPES[dnaKey] || DNA_TYPES.NONE;
    const derived = deriveDNAFromHistory(a.rosterId);
    const derivedDna = derived ? DNA_TYPES[derived] : null;
    const posture = calcOwnerPosture(a, dnaKey);
    const isMe = a.rosterId === S.myRosterId;

    // Trade history stats from LI.ownerProfiles
    const profile = LI_LOADED && LI.ownerProfiles?.[a.rosterId];

    html += `
      <div class="card" style="margin-bottom:8px;${isMe ? 'border-color:rgba(124,107,248,.3)' : ''}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="font-size:14px;font-weight:700">${a.ownerName}${isMe ? ' <span style="font-size:11px;color:var(--accent)">(You)</span>' : ''}</span>
              <span style="font-size:11px;color:${a.tierColor};font-weight:600">${a.tier}</span>
            </div>

            <!-- Current DNA badge -->
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-size:12px;padding:3px 10px;border-radius:12px;font-weight:700;background:${dna.color}22;color:${dna.color};border:1px solid ${dna.color}40">${dna.label || 'Not Set'}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:8px;background:${posture.color}22;color:${posture.color};font-weight:600">${posture.label}</span>
            </div>
            ${dna.desc ? `<div style="font-size:11px;color:var(--text3);margin-bottom:6px">${dna.desc}</div>` : ''}

            <!-- Auto-derived suggestion -->
            ${derived && derived !== dnaKey ? `<div style="font-size:11px;color:var(--amber);margin-bottom:6px">
              Suggested: <span style="font-weight:700;color:${derivedDna.color}">${derivedDna.label}</span> (based on trade history)
              <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;margin-left:6px" onclick="_tcSetDNA(${a.rosterId},'${derived}')">Apply</button>
            </div>` : ''}

            <!-- Trade history stats -->
            ${profile ? `<div style="display:flex;gap:12px;font-size:11px;color:var(--text3);flex-wrap:wrap">
              <span>Trades: <span style="font-weight:600;color:var(--text2)">${profile.trades}</span></span>
              <span>Picks In: <span style="font-weight:600;color:var(--green)">${profile.picksAcquired || 0}</span></span>
              <span>Picks Out: <span style="font-weight:600;color:var(--red)">${profile.picksSold || 0}</span></span>
              ${profile.targetPos ? `<span>Targets: <span style="font-weight:600;color:var(--accent)">${profile.targetPos}</span></span>` : ''}
              ${profile.dna ? `<span>Style: <span style="font-weight:600;color:var(--text2)">${profile.dna}</span></span>` : ''}
            </div>` : '<div style="font-size:11px;color:var(--text3)">No trade history data</div>'}
          </div>

          <!-- Manual override dropdown -->
          <div style="flex-shrink:0">
            <select style="font-size:11px;padding:4px 6px;width:110px" onchange="_tcSetDNA(${a.rosterId},this.value)">
              ${Object.entries(DNA_TYPES).map(([key, d]) => `<option value="${key}" ${key === dnaKey ? 'selected' : ''}>${d.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

function _tcSetDNA(rosterId, dnaKey) {
  _tcDnaMap[rosterId] = dnaKey;
  if (S.currentLeagueId) {
    saveDNAProfile(S.currentLeagueId, rosterId, dnaKey);
  }
  showToast(`DNA set to ${DNA_TYPES[dnaKey]?.label || dnaKey}`);
  // Re-render DNA panel
  if (_tcActiveView === 'dna') {
    const container = $('tc-view-content');
    if (container) renderDNAPanel(_tcAssessments, container);
  }
}
window._tcSetDNA = _tcSetDNA;


// ═══════════════════════════════════════════════════════════════
// SECTION 7: Window Exports
// ═══════════════════════════════════════════════════════════════

Object.assign(window.App, {
  // Constants
  DNA_TYPES,
  TRADE_PICK_VALUES,
  POS_WEIGHTS,
  MIN_STARTER_QUALITY,
  NFL_STARTER_POOL,
  WEEKLY_TARGET,
  POSTURES,
  FAAB_RATE,

  // Assessment
  buildNflStarterSet,
  buildPicksByOwner,
  calcOptimalPPG,
  assessTeam,
  assessAllTeams,

  // Partner matching
  calcComplementarity,
  findBestPartners,

  // DNA & Psychology
  calcOwnerPosture,
  calcPsychTaxes,
  deriveDNAFromHistory,
  loadDNAProfiles,
  saveDNAProfile,

  // Trade value
  calcTradeValue,
  calcAcceptanceLikelihood,
  fairnessGrade,
});

// initTradeCalc — called when Trades tab is shown
async function initTradeCalc() {
  if (!S.rosters?.length || !S.players || !Object.keys(S.players).length) return;
  if (_tcAssessments.length) return; // already initialized
  await renderTradeCalc();
}

// Rendering functions on window (called from onclick handlers)
Object.assign(window, {
  renderTradeCalc,
  initTradeCalc,
  renderLeagueOverview,
  renderTeamScout,
  renderPartnerFinder,
  renderTradeBuilder,
  renderDNAPanel,
});
