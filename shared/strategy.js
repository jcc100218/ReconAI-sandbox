(function() {
  'use strict';

  const STRATEGY_KEY = 'dhq_gm_strategy_v1';
  const DRIFT_KEY = 'dhq_strategy_drift_v1';

  const DEFAULT_STRATEGY = {
    mode: 'balanced_rebuild',
    timeline: '2-3yr',
    targetPositions: [],
    sellPositions: [],
    sellRules: [],
    untouchables: [],
    targetList: [],
    blockList: [],
    aggression: 'medium',
    draftStyle: 'bpa',
    marketPosture: 'hold',
    alexPersonality: 'balanced',
    lastSyncedFrom: 'scout',
    lastSyncedAt: Date.now(),
    version: 1
  };

  function getStrategy() {
    try {
      const raw = localStorage.getItem(STRATEGY_KEY);
      return raw ? { ...DEFAULT_STRATEGY, ...JSON.parse(raw) } : { ...DEFAULT_STRATEGY };
    } catch(e) { return { ...DEFAULT_STRATEGY }; }
  }

  function saveStrategy(updates) {
    const current = getStrategy();
    const merged = { ...current, ...updates, version: (current.version || 0) + 1, lastSyncedAt: Date.now(), lastSyncedFrom: 'scout' };
    localStorage.setItem(STRATEGY_KEY, JSON.stringify(merged));
    if (window.DhqEvents) window.DhqEvents.emit('strategy:changed', merged);
    return merged;
  }

  // Check alignment of an action against the strategy
  function checkAlignment(action) {
    // action = { type: 'trade'|'waiver'|'draft', position, playerAge, direction: 'acquire'|'sell' }
    const s = getStrategy();
    let score = 0;
    let reasons = [];

    if (action.direction === 'acquire' && s.targetPositions.includes(action.position)) {
      score += 2; reasons.push('Target position');
    }
    if (action.direction === 'sell' && s.sellPositions.includes(action.position)) {
      score += 2; reasons.push('Sell position');
    }
    // Check sell rules
    if (action.direction === 'sell') {
      const rule = s.sellRules.find(r => r.pos === action.position && action.playerAge >= r.ageAbove);
      if (rule) { score += 1; reasons.push('Matches sell rule'); }
    }
    // Check untouchables
    if (action.direction === 'sell' && s.untouchables.includes(action.playerId)) {
      score = -10; reasons = ['Player is untouchable'];
    }
    // Check block list
    if (action.direction === 'acquire' && s.blockList.includes(action.playerId)) {
      score = -10; reasons = ['Player is blocked'];
    }

    if (score >= 2) return { alignment: 'aligned', reasons };
    if (score >= 0) return { alignment: 'partial', reasons: reasons.length ? reasons : ['Neutral to strategy'] };
    return { alignment: 'conflicts', reasons };
  }

  // Track drift
  function recordAction(action) {
    const alignment = checkAlignment(action);
    if (alignment.alignment === 'conflicts') {
      const drift = getDrift();
      drift.conflicts.push({ ...action, timestamp: Date.now(), reasons: alignment.reasons });
      // Keep last 10
      if (drift.conflicts.length > 10) drift.conflicts = drift.conflicts.slice(-10);
      localStorage.setItem(DRIFT_KEY, JSON.stringify(drift));
      if (window.DhqEvents) window.DhqEvents.emit('strategy:drift', drift);
    }
    return alignment;
  }

  function getDrift() {
    try {
      return JSON.parse(localStorage.getItem(DRIFT_KEY) || '{"conflicts":[]}');
    } catch(e) { return { conflicts: [] }; }
  }

  function hasDrift() {
    const drift = getDrift();
    const recent = drift.conflicts.filter(c => Date.now() - c.timestamp < 7 * 24 * 60 * 60 * 1000);
    return recent.length >= 2;
  }

  function clearDrift() {
    localStorage.setItem(DRIFT_KEY, JSON.stringify({ conflicts: [] }));
  }

  window.App = window.App || {};
  window.App.Strategy = { getStrategy, saveStrategy, checkAlignment, recordAction, getDrift, hasDrift, clearDrift, DEFAULT_STRATEGY };
  window.GMStrategy = window.App.Strategy;
})();
