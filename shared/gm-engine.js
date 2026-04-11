// ══════════════════════════════════════════════════════════════════
// shared/gm-engine.js — GM Intelligence Engines v1
// Phase 2: generates specific, data-driven War Room Brief content
// ══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────

  function _S()  { return window.S  || {}; }
  function _LI() { return window.LI || {}; }

  function _myRoster() {
    return typeof myR === 'function' ? myR() : null;
  }

  function _assess(rosterId) {
    return typeof window.assessTeamFromGlobal === 'function'
      ? window.assessTeamFromGlobal(rosterId) : null;
  }

  function _allAssess() {
    return typeof window.assessAllTeamsFromGlobal === 'function'
      ? window.assessAllTeamsFromGlobal() : [];
  }

  function _dhq(pid) {
    return typeof dynastyValue === 'function' ? dynastyValue(pid) : 0;
  }

  function _name(pid) {
    if (!pid) return '—';
    const S = _S();
    const p = S.players?.[pid];
    if (!p) return pid;
    return p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || pid;
  }

  function _pos(pid) {
    return _S().players?.[pid]?.position || '';
  }

  function _strategy() {
    return (window.GMStrategy?.getStrategy) ? window.GMStrategy.getStrategy() : {};
  }

  // Normalize position to fantasy-relevant canonical (RB, WR, QB, TE, DL, LB, DB)
  function _normPos(pos) {
    if (!pos) return '';
    const map = { FLEX: '', SUPER_FLEX: '', IDP_FLEX: '', BN: '', IR: '', TAXI: '' };
    return map[pos] !== undefined ? map[pos] : pos;
  }

  // Get top N players on a roster at a specific position, sorted by DHQ desc
  function _rosterPlayersAtPos(playerIds, pos) {
    return (playerIds || [])
      .filter(pid => _pos(pid) === pos)
      .map(pid => ({ pid, name: _name(pid), dhq: _dhq(pid) }))
      .sort((a, b) => b.dhq - a.dhq);
  }

  // Get owner display name from roster_id
  function _ownerName(rosterId) {
    const S = _S();
    const roster = (S.rosters || []).find(r => r.roster_id === rosterId);
    if (!roster) return 'Unknown';
    const user = (S.leagueUsers || []).find(u => u.user_id === roster.owner_id);
    return user?.display_name || user?.username || `Team ${rosterId}`;
  }

  // Score how willing an owner is to trade (based on DNA)
  function _tradingWillingness(dna) {
    if (!dna) return 0.5;
    if (dna.includes('Active')) return 1.0;
    if (dna.includes('Win-now')) return 0.85;
    if (dna.includes('Rebuilder')) return 0.75;
    if (dna.includes('Holds firm')) return 0.2;
    return 0.5; // Balanced
  }

  // ════════════════════════════════════════════════════════════════
  // 1. NEXT MOVE ENGINE
  // ════════════════════════════════════════════════════════════════

  function generateNextMove() {
    const S = _S();
    const myRoster = _myRoster();
    if (!myRoster) return _defaultNextMove();

    const myAssess = _assess(myRoster.roster_id);
    if (!myAssess) return _defaultNextMove();

    const strategy = _strategy();
    const ownerProfiles = _LI().ownerProfiles || {};

    // My biggest need
    const myNeeds = (myAssess.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean);
    const myStrengths = (myAssess.strengths || []).map(s => typeof s === 'string' ? s : s?.pos).filter(Boolean);
    const topNeed = myNeeds[0];
    const topSurplus = myStrengths[0];

    if (!topNeed) {
      // No pressing need — check if hold is appropriate
      if (myAssess.healthScore >= 80) {
        return {
          type: 'hold',
          action: 'Hold your core — roster health is elite',
          targetPlayer: null,
          targetOwner: null,
          confidence: 'high',
          urgency: 'no_rush',
          alignment: strategy.mode === 'win_now' ? { alignment: 'aligned' } : { alignment: 'partial' },
          reasoning: `Health score ${myAssess.healthScore} puts you in championship-caliber territory. Protect depth over the next 2 weeks.`,
        };
      }
      return _defaultNextMove();
    }

    // Find best trade target: scan all other rosters
    let bestMatch = null;
    let bestScore = -1;

    (S.rosters || []).forEach(r => {
      if (r.roster_id === myRoster.roster_id) return;

      const theirProfile = ownerProfiles[r.roster_id] || {};
      const willingness = _tradingWillingness(theirProfile.dna);
      if (willingness < 0.2) return; // Holds firm — skip

      // Their best player at my need position
      const theirCandidates = _rosterPlayersAtPos(r.players, topNeed);
      if (!theirCandidates.length) return;
      const theirTarget = theirCandidates[0];
      if (theirTarget.dhq < 500) return; // Not worth targeting

      // Their top need (from assessment)
      const theirAssess = _assess(r.roster_id);
      const theirNeeds = theirAssess
        ? (theirAssess.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean)
        : [];

      // Can I fill their need from my surplus?
      const overlapPos = theirNeeds.find(np => myStrengths.includes(np));
      let matchScore = theirTarget.dhq * willingness;
      if (overlapPos) matchScore *= 1.5; // Bonus for mutual need

      // What I'd give: my best player at their top need, or my surplus
      let myAssetPos = overlapPos || topSurplus;
      const myAssets = myAssetPos ? _rosterPlayersAtPos(myRoster.players, myAssetPos) : [];
      const myAsset = myAssets[0];
      if (!myAsset && !overlapPos) return; // Nothing to offer

      if (matchScore > bestScore) {
        bestScore = matchScore;
        const ownerName = _ownerName(r.roster_id);
        const assetLabel = myAsset ? myAsset.name : (myAssetPos ? `your ${myAssetPos}` : 'assets');
        const dnaNote = theirProfile.dna
          ? ` ${ownerName} trends ${theirProfile.dna.toLowerCase()}.`
          : '';

        // Confidence: high if mutual need + willing trader, else medium
        const confidence = (overlapPos && willingness >= 0.75) ? 'high'
          : willingness >= 0.5 ? 'medium' : 'low';

        // Urgency: based on strategy mode and health
        const urgency = strategy.mode === 'win_now' ? 'this_week'
          : myAssess.healthScore < 60 ? '2_weeks'
          : 'before_draft';

        const alignment = window.GMStrategy?.checkAlignment
          ? window.GMStrategy.checkAlignment({ type: 'trade', direction: 'acquire', position: topNeed, playerId: theirTarget.pid })
          : { alignment: 'partial' };

        bestMatch = {
          type: 'trade',
          action: `Trade ${assetLabel} → ${ownerName} for ${theirTarget.name}`,
          targetPlayer: { pid: theirTarget.pid, name: theirTarget.name },
          targetOwner: { name: ownerName, rosterId: r.roster_id },
          confidence,
          urgency,
          alignment,
          reasoning: `Your ${topNeed} room is your biggest gap.${dnaNote}${overlapPos ? ` They need ${overlapPos} — which you have.` : ''}`,
        };
      }
    });

    if (bestMatch) return bestMatch;

    // Fallback: waiver wire recommendation
    if (topNeed) {
      return {
        type: 'waiver',
        action: `Add ${topNeed} depth from waivers`,
        targetPlayer: null,
        targetOwner: null,
        confidence: 'medium',
        urgency: '2_weeks',
        alignment: { alignment: 'partial' },
        reasoning: `No strong trade partners found for ${topNeed} right now. Waiver wire is the fastest path.`,
      };
    }

    return _defaultNextMove();
  }

  function _defaultNextMove() {
    return {
      type: 'hold',
      action: 'Connect your league to get your personalized next move',
      targetPlayer: null,
      targetOwner: null,
      confidence: 'low',
      urgency: 'no_rush',
      alignment: { alignment: 'partial' },
      reasoning: 'Awaiting league data.',
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 2. PRIORITY GENERATOR
  // ════════════════════════════════════════════════════════════════

  function generatePriorities() {
    const myRoster = _myRoster();
    if (!myRoster) return _defaultPriorities();

    const assess = _assess(myRoster.roster_id);
    if (!assess) return _defaultPriorities();

    const strategy = _strategy();
    const mode = strategy.mode || 'balanced_rebuild';
    const hs = assess.healthScore || 0;
    const needs = (assess.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean);
    const S = _S();
    const curYear = parseInt(S.season) || new Date().getFullYear();

    // Phase-aware offseason detection (Phase 2 v2). Falls back to the
    // month heuristic if SeasonCalendar isn't available yet.
    const calPhase = window.SeasonCalendar?.getPhase ? window.SeasonCalendar.getPhase() : null;
    const _nowMonth = new Date().getMonth();
    const isOffseason = calPhase
      ? ['early_offseason', 'pre_draft', 'draft_week', 'post_draft', 'preseason', 'offseason'].includes(calPhase)
      : (_nowMonth >= 1 && _nowMonth <= 7);
    const isPreDraft = calPhase === 'pre_draft' || calPhase === 'draft_week';

    // Premium positions by dynasty value (DHQ-weighted)
    const _PREMIUM_POS = ['QB', 'RB', 'WR', 'TE'];
    const _scoringSettings = S.leagues?.find?.(l => l.league_id === S.currentLeagueId)?.scoring_settings || {};
    const _isPPR = (_scoringSettings.rec || 0) >= 0.5;
    // In PPR, WR/pass-catching RBs are elevated; otherwise RB premium is higher
    const _topPremium = _PREMIUM_POS.filter(p => needs.includes(p));

    const priorities = [];

    if (isOffseason) {
      // ── OFFSEASON priorities: dynasty asset accumulation, not weekly output ──

      // Priority 1: Biggest positional gap at a premium position
      if (_topPremium.length > 0) {
        const pos = _topPremium[0];
        priorities.push({
          problem: `${pos} room needs a foundational piece before the season`,
          consequence: _isPPR && pos === 'WR'
            ? 'PPR leagues reward deep WR rooms. Build now while prices are lower.'
            : `${pos} is the engine of dynasty rosters. Lock in your piece now.`,
          actionLabel: `Target ${pos}`,
          actionType: 'trade',
        });
      } else if (needs.length > 0) {
        const pos = needs[0];
        priorities.push({
          problem: `${pos} is your thinnest position heading into the season`,
          consequence: 'Offseason is when roster construction shapes your year. Address now.',
          actionLabel: `Find ${pos}`,
          actionType: 'trade',
        });
      }

      // Priority 2: Offseason trade window
      if (mode === 'rebuild' || mode === 'balanced_rebuild') {
        // Check draft capital
        const allTP = S.tradedPicks || [];
        let futurePicks = 0;
        for (let yr = curYear; yr <= curYear + 2; yr++) {
          const league = (S.leagues || []).find(l => l.league_id === S.currentLeagueId);
          const draftRounds = league?.settings?.draft_rounds || 4;
          for (let rd = 1; rd <= draftRounds; rd++) {
            const tradedAway = allTP.find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster.roster_id && p.owner_id !== myRoster.roster_id);
            if (!tradedAway) futurePicks++;
            futurePicks += allTP.filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster.roster_id && p.roster_id !== myRoster.roster_id).length;
          }
        }
        if (futurePicks < 6) {
          priorities.push({
            problem: 'Draft capital is below rebuild minimum',
            consequence: 'Rookie drafts are the core of a rebuild. Stack picks before the window closes.',
            actionLabel: 'Acquire Picks',
            actionType: 'trade',
          });
        } else {
          priorities.push({
            problem: 'Trade window is open — move aging assets now',
            consequence: `Win-now teams are buying. Convert veterans into youth or picks before values drop.`,
            actionLabel: 'Shop Veterans',
            actionType: 'trade',
          });
        }
      } else {
        // Win-now: offseason is for shoring up weaknesses
        priorities.push({
          problem: 'Trade window is open — upgrade before rosters lock in',
          consequence: 'Offseason is prime trading time. Contenders who wait pay a premium in-season.',
          actionLabel: 'Build Trade',
          actionType: 'trade',
        });
      }

      // Priority 3: Draft prep
      priorities.push({
        problem: isPreDraft
          ? 'Your rookie draft is approaching — lock your target board now'
          : 'Map your rookie draft targets before ADP firms up',
        consequence: isPreDraft
          ? 'ADP is firming up fast. Every week you wait is a week less to spot steals.'
          : 'Early prep lets you identify steals and avoid reaches. Start your board now.',
        actionLabel: isPreDraft ? 'Open Big Board' : 'Mock Draft',
        actionType: 'draft',
      });

      // Priority 4 (new): secondary positional gap — skip if it duplicates
      // a position already covered by an earlier priority's action label.
      if (needs.length > 1) {
        const pos2 = needs.find((p, i) => i > 0 && !priorities.some(pr => pr.actionLabel?.includes(p)));
        if (pos2) {
          priorities.push({
            problem: `${pos2} is a secondary gap that'll bite mid-season`,
            consequence: 'Secondary gaps compound when injuries hit. Fix now while prices are calm.',
            actionLabel: `Target ${pos2}`,
            actionType: 'trade',
          });
        }
      }

      // Priority 5 (new): strategy hygiene — untouchables list or market posture
      const untouchables = (strategy.untouchables || []).length;
      if (untouchables < 3) {
        priorities.push({
          problem: 'Untouchables list is thin — you haven\'t told Alex who\'s off-limits',
          consequence: 'Without an untouchables list, Alex may float your core in trade analysis.',
          actionLabel: 'Set Untouchables',
          actionType: 'hold',
        });
      } else if (strategy.marketPosture === 'hold') {
        priorities.push({
          problem: 'Your market posture is "hold" — no buy or sell direction set',
          consequence: 'Offseason is the best trade window. Pick a posture so Alex knows what to pitch.',
          actionLabel: 'Pick Posture',
          actionType: 'hold',
        });
      }

    } else {
      // ── IN-SEASON priorities: weekly output and matchup-based ──

      // Priority 1: Top positional deficit
      if (needs.length > 0) {
        const pos = needs[0];
        const isDeficit = (assess.needs || []).find(n => (typeof n === 'string' ? n : n.pos) === pos)?.urgency === 'deficit';
        const consequence = isDeficit
          ? `Fix within 2 weeks or you're leaving wins on the table.`
          : `Address before your next tough matchup.`;
        priorities.push({
          problem: `${pos} is your weakest position group`,
          consequence,
          actionLabel: `Fix ${pos}`,
          actionType: 'trade',
        });
      }

      // Priority 2: Mode-specific structural priority
      if (mode === 'rebuild' || mode === 'balanced_rebuild') {
        const allTP = S.tradedPicks || [];
        let futurePicks = 0;
        for (let yr = curYear; yr <= curYear + 2; yr++) {
          const league = (S.leagues || []).find(l => l.league_id === S.currentLeagueId);
          const draftRounds = league?.settings?.draft_rounds || 4;
          for (let rd = 1; rd <= draftRounds; rd++) {
            const tradedAway = allTP.find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster.roster_id && p.owner_id !== myRoster.roster_id);
            if (!tradedAway) futurePicks++;
            futurePicks += allTP.filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster.roster_id && p.roster_id !== myRoster.roster_id).length;
          }
        }
        if (futurePicks < 6) {
          priorities.push({
            problem: 'Draft capital is below rebuild minimum',
            consequence: 'Rebuilds stall without enough future picks. Every week costs you.',
            actionLabel: 'Acquire Picks',
            actionType: 'trade',
          });
        } else {
          priorities.push({
            problem: 'Deploy your pick capital — don\'t let it sit idle',
            consequence: `You have ${futurePicks} picks. Map a target list now or trade up.`,
            actionLabel: 'Plan Draft',
            actionType: 'draft',
          });
        }
      } else {
        const pos2 = needs[1];
        if (pos2) {
          priorities.push({
            problem: `${pos2} depth is thin for a deep playoff run`,
            consequence: 'One injury ends your season. Depth is championship insurance.',
            actionLabel: `Find ${pos2}`,
            actionType: needs.length > 1 ? 'trade' : 'waiver',
          });
        } else {
          priorities.push({
            problem: 'Sell your surplus into the market now',
            consequence: 'Peak window means buyers are aggressive. Convert excess into wins.',
            actionLabel: 'Build Trade',
            actionType: 'trade',
          });
        }
      }

      // Priority 3: Health-based or urgency catch-all
      if (hs < 65 && hs > 0) {
        priorities.push({
          problem: 'Overall roster health is below contender threshold',
          consequence: 'Competing teams are pulling ahead every week you wait.',
          actionLabel: 'Full Rebuild',
          actionType: 'trade',
        });
      } else if (hs >= 80) {
        priorities.push({
          problem: 'Protect your franchise players from trade pressure',
          consequence: 'Elite rosters get picked apart if you\'re not careful about what you trade.',
          actionLabel: 'Set Untouchables',
          actionType: 'hold',
        });
      } else if (needs.length > 2) {
        const pos3 = needs[2];
        priorities.push({
          problem: `${pos3} is a secondary gap worth monitoring`,
          consequence: 'Secondary gaps compound. Fix when the right deal appears.',
          actionLabel: `Monitor ${pos3}`,
          actionType: 'waiver',
        });
      }

      // Priority 4 (new): trade deadline proximity
      const weeksToDeadline = window.SeasonCalendar?.weeksUntil?.('deadline');
      if (weeksToDeadline != null && weeksToDeadline > 0 && weeksToDeadline <= 3) {
        priorities.push({
          problem: `Trade deadline is ${weeksToDeadline} week${weeksToDeadline === 1 ? '' : 's'} out`,
          consequence: 'After the deadline, your roster is locked for the playoff run. Make the moves now.',
          actionLabel: 'Deadline Moves',
          actionType: 'trade',
        });
      }

      // Priority 5 (new): secondary gap from needs array if not already used
      if (needs.length > 1 && priorities.length < 5) {
        const pos2 = needs[1];
        const already = priorities.some(p => p.actionLabel?.includes(pos2));
        if (!already) {
          priorities.push({
            problem: `${pos2} depth is thin for the stretch run`,
            consequence: 'One injury at a thin position can cost you a playoff week.',
            actionLabel: `Find ${pos2}`,
            actionType: 'trade',
          });
        }
      }
    }

    return priorities.slice(0, 5);
  }

  function _defaultPriorities() {
    return [
      { problem: 'Connect your league to see priorities', consequence: 'Your personalized plan will appear here.', actionLabel: 'Connect', actionType: 'hold' },
    ];
  }

  // ════════════════════════════════════════════════════════════════
  // 3. OPPORTUNITY GENERATOR
  // ════════════════════════════════════════════════════════════════

  function generateOpportunities() {
    const S = _S();
    const myRoster = _myRoster();
    if (!myRoster || !S.rosters?.length) return _defaultOpportunities();

    const myAssess = _assess(myRoster.roster_id);
    const myStrengths = myAssess
      ? (myAssess.strengths || []).map(s => typeof s === 'string' ? s : s?.pos).filter(Boolean)
      : [];
    const myNeeds = myAssess
      ? (myAssess.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean)
      : [];

    const ownerProfiles = _LI().ownerProfiles || {};

    const scored = (S.rosters || [])
      .filter(r => r.roster_id !== myRoster.roster_id)
      .map(r => {
        const profile = ownerProfiles[r.roster_id] || {};
        const theirAssess = _assess(r.roster_id);
        const theirNeeds = theirAssess
          ? (theirAssess.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean)
          : [];
        const theirStrengths = theirAssess
          ? (theirAssess.strengths || []).map(s => typeof s === 'string' ? s : s?.pos).filter(Boolean)
          : [];

        // Exploitability score
        const iHaveWhatTheyNeed = theirNeeds.some(p => myStrengths.includes(p));
        const theyHaveWhatINeed = myNeeds.some(p => theirStrengths.includes(p));
        const willingness = _tradingWillingness(profile.dna);
        const theirHealth = theirAssess?.healthScore || 50;

        let exploitScore = willingness * 50;
        if (iHaveWhatTheyNeed) exploitScore += 25;
        if (theyHaveWhatINeed) exploitScore += 25;
        if (theirHealth < 60) exploitScore += 10; // Desperate seller

        const ownerName = _ownerName(r.roster_id);

        // Build insight text
        let insight = '';
        if (iHaveWhatTheyNeed && theyHaveWhatINeed) {
          const theirNeedPos = theirNeeds.find(p => myStrengths.includes(p));
          const myNeedPos = myNeeds.find(p => theirStrengths.includes(p));
          insight = `Needs ${theirNeedPos}, has ${myNeedPos} you want`;
        } else if (iHaveWhatTheyNeed) {
          const theirNeedPos = theirNeeds.find(p => myStrengths.includes(p));
          insight = `Needs ${theirNeedPos} — you have the supply`;
        } else if (theyHaveWhatINeed) {
          const myNeedPos = myNeeds.find(p => theirStrengths.includes(p));
          insight = `Has ${myNeedPos} depth you need`;
        } else if (profile.dna) {
          insight = profile.dna;
        } else {
          insight = theirHealth < 60 ? 'Roster in trouble — motivated seller' : 'Potential partner';
        }

        const suggestedAction = exploitScore >= 75 ? 'Attack'
          : exploitScore >= 50 ? 'View Targets'
          : 'Buy Low';

        return { ownerName, insight, exploitScore: Math.round(exploitScore), suggestedAction, rosterId: r.roster_id };
      })
      .sort((a, b) => b.exploitScore - a.exploitScore);

    return scored.slice(0, 3).length ? scored.slice(0, 3) : _defaultOpportunities();
  }

  function _defaultOpportunities() {
    return [
      { ownerName: 'Best Trade Partner', insight: 'Connect your league to see opponent intel', exploitScore: 0, suggestedAction: 'Attack', rosterId: null },
    ];
  }

  // ════════════════════════════════════════════════════════════════
  // 4. TEAM DIAGNOSIS GENERATOR
  // ════════════════════════════════════════════════════════════════

  function generateDiagnosis() {
    const myRoster = _myRoster();
    if (!myRoster) return { line1: 'Connect your league for a team diagnosis.', line2: '' };

    const assess = _assess(myRoster.roster_id);
    if (!assess) return { line1: 'Loading team data...', line2: '' };

    const strategy = _strategy();
    const mode = strategy.mode || 'balanced_rebuild';
    const hs = assess.healthScore || 0;
    const needs = (assess.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean);
    const strengths = (assess.strengths || []).map(s => typeof s === 'string' ? s : s?.pos).filter(Boolean);

    // Line 1: biggest weakness and its cost
    let line1;
    if (needs.length > 0) {
      const pos = needs[0];
      const isDeficit = (assess.needs || []).find(n => (typeof n === 'string' ? n : n.pos) === pos)?.urgency === 'deficit';
      if (mode === 'rebuild' || mode === 'balanced_rebuild') {
        line1 = isDeficit
          ? `Your ${pos} room is a critical hole — costing ~1 win/season until fixed.`
          : `${pos} depth is your biggest rebuild gap — thin but addressable.`;
      } else {
        line1 = isDeficit
          ? `Your ${pos} room is costing ~1 win/season. Fix it before the deadline.`
          : `${pos} is your most exploitable gap — opponents will target your lineup.`;
      }
    } else if (hs < 60) {
      line1 = 'Roster is below contender threshold — overall health limits your ceiling.';
    } else {
      line1 = `Health score ${hs} — roster is competitive across the board.`;
    }

    // Line 2: biggest opportunity/asset
    let line2;
    if (strengths.length > 0) {
      const pos = strengths[0];
      if (mode === 'win_now' || mode === 'compete') {
        line2 = `You have excess ${pos} value — convert it into your missing piece before the deadline.`;
      } else {
        line2 = `${pos} is your biggest tradeable asset — use it to accelerate your rebuild.`;
      }
    } else if (hs >= 80) {
      line2 = 'Championship-caliber roster — protect your core and target depth upgrades.';
    } else {
      const S = _S();
      const allTP = S.tradedPicks || [];
      const myId = myRoster.roster_id;
      const futurePicks = allTP.filter(p => p.owner_id === myId && p.roster_id !== myId).length;
      if (futurePicks >= 3) {
        line2 = `You hold ${futurePicks} future picks — strong leverage heading into the draft.`;
      } else {
        line2 = 'Draft capital is your path to upgrades — prioritize pick acquisition.';
      }
    }

    return { line1, line2 };
  }

  // ════════════════════════════════════════════════════════════════
  // 5. FIELD INTEL GENERATOR
  // ════════════════════════════════════════════════════════════════

  function generateFieldIntel() {
    const strategy = _strategy();
    const myRoster = _myRoster();
    const assess = myRoster ? _assess(myRoster.roster_id) : null;
    const hs = assess?.healthScore || 0;
    const mode = strategy.mode || 'balanced_rebuild';

    const obs = [];

    // ── Calendar-aware observations (Phase 2 v2) ────────────────
    // Prepend forward-looking intel based on season phase so April
    // advice is "scout rookies" not "make a trade this week".
    const cal = window.SeasonCalendar;
    if (cal?.describe) {
      const { phase, weeksToNext, nextMilestone } = cal.describe();
      const dates = cal.getKeyDates();
      const hasDraftDate = !!dates.draftDate;

      if (phase === 'pre_draft' && hasDraftDate) {
        obs.push(`Rookie draft is ${weeksToNext} week${weeksToNext === 1 ? '' : 's'} away. This is a draft-planning phase — scout prospects, don't grind waivers.`);
        if (mode === 'rebuild' || mode === 'balanced_rebuild') {
          obs.push('Rebuild window: your picks are your biggest lever. Trade veterans for picks, not picks for veterans.');
        } else {
          obs.push('Win-now window: identify the 2-3 rookies who could start this year and target those picks.');
        }
      } else if (phase === 'draft_week' && hasDraftDate) {
        obs.push('Rookie draft is this week. Lock your board and your trade-up/down decisions before picks start.');
      } else if (phase === 'post_draft') {
        obs.push(`Rookie draft is done. Evaluate your haul — ${nextMilestone ? nextMilestone + ' is ' + weeksToNext + ' weeks out' : 'season kickoff is coming'}.`);
      } else if (phase === 'preseason' && weeksToNext != null) {
        obs.push(`NFL Week 1 is ${weeksToNext} week${weeksToNext === 1 ? '' : 's'} out. Lock in starters, finalize your lineup order, audit your bench.`);
      } else if (phase === 'regular_season' && nextMilestone) {
        obs.push(`${nextMilestone} is ${weeksToNext} week${weeksToNext === 1 ? '' : 's'} out. ${weeksToNext <= 3 ? 'Start executing — this is the window.' : 'Stay patient, let the market form.'}`);
      } else if (phase === 'playoffs') {
        obs.push('Playoff week — your lineup decisions matter more than any trade right now.');
      } else if (phase === 'early_offseason' && !hasDraftDate) {
        obs.push('No rookie draft date set. Ask your commissioner to schedule it so Alex can plan your offseason.');
      } else if (phase === 'early_offseason') {
        obs.push(`Early offseason. Rookie draft is ${weeksToNext} week${weeksToNext === 1 ? '' : 's'} away — start building your board.`);
      }
    }

    // Analyze field log
    try {
      const log = JSON.parse(localStorage.getItem('scout_field_log_v1') || '[]');
      const now = Date.now();
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
      const recent = log.filter(e => e.ts >= twoWeeksAgo);

      // Trade frequency
      const trades = recent.filter(e => e.actionType === 'trade' || e.category === 'trade');
      const waivers = recent.filter(e => e.actionType === 'waiver' || e.category === 'waivers');

      if (trades.length === 0 && recent.length > 0) {
        obs.push("You've made no trades in 2 weeks — potential missed opportunities building up.");
      } else if (trades.length >= 3) {
        obs.push(`You've been active — ${trades.length} trades logged in 2 weeks.`);
      }

      // Position patterns from traded players
      const posCounts = {};
      trades.forEach(e => {
        (e.players || []).forEach(p => {
          if (p.pos) posCounts[p.pos] = (posCounts[p.pos] || 0) + 1;
        });
      });
      const topTradedPos = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0];
      if (topTradedPos && topTradedPos[1] >= 2) {
        obs.push(`Your recent trades have concentrated on ${topTradedPos[0]}s — watch for tunnel vision.`);
      }

      // FAAB / waiver activity
      if (waivers.length === 0 && recent.length > 0) {
        obs.push("Waiver activity has been minimal — hidden gems may be available.");
      } else if (waivers.length >= 3) {
        obs.push(`High waiver activity — ${waivers.length} moves logged recently. Good market awareness.`);
      }
    } catch (e) {
      // localStorage unavailable
    }

    // Strategy drift observation
    const drift = window.GMStrategy?.getDrift ? window.GMStrategy.getDrift() : { conflicts: [] };
    const recentDrift = (drift.conflicts || []).filter(c => Date.now() - c.timestamp < 7 * 24 * 60 * 60 * 1000);
    if (recentDrift.length >= 2) {
      obs.push(`${recentDrift.length} recent actions conflicted with your stated strategy — check your plan.`);
    }

    // Mode-aligned observations
    if (mode === 'rebuild' || mode === 'balanced_rebuild') {
      const LI = _LI();
      const ownerProfiles = LI.ownerProfiles || {};
      const myId = myRoster?.roster_id;
      if (myId && ownerProfiles[myId]) {
        const profile = ownerProfiles[myId];
        if (profile.picksAcquired < profile.picksSold) {
          obs.push("You've sold more picks than you've acquired — inconsistent with rebuild mode.");
        } else if (profile.picksAcquired > 2) {
          obs.push(`You've accumulated ${profile.picksAcquired} picks via trade — rebuild capital is building.`);
        }
      }
      if (obs.length < 3) {
        obs.push("Young WR/RB acquisitions compound over time — favor upside over short-term production.");
      }
    } else {
      if (hs >= 80) {
        obs.push("Elite health means your next trade should be surgical, not reactionary.");
      } else if (obs.length < 3) {
        obs.push("Win-now window requires decisive action — indecision is its own risk.");
      }
    }

    // Health trend filler
    if (obs.length < 3) {
      if (hs < 65 && hs > 0) {
        obs.push("Roster health trending down — full evaluation recommended this week.");
      } else if (hs >= 80) {
        obs.push("Top-tier health — maintain depth and push for wins.");
      } else {
        obs.push("Draft capital usage rate is below the league's top contenders.");
      }
    }

    return obs.slice(0, 6);
  }

  // ════════════════════════════════════════════════════════════════
  // EXPOSE
  // ════════════════════════════════════════════════════════════════

  window.GMEngine = {
    generateNextMove,
    generatePriorities,
    generateOpportunities,
    generateDiagnosis,
    generateFieldIntel,
  };

  window.App = window.App || {};
  window.App.GMEngine = window.GMEngine;

})();
