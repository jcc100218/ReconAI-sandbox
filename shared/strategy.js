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
    // Default source is 'scout' but let callers override (War Room passes 'warroom'
    // in its strategy-editor payload — that used to get stomped to 'scout' because
    // the override came before the updates spread).
    const merged = { ...current, lastSyncedFrom: 'scout', ...updates, version: (current.version || 0) + 1, lastSyncedAt: Date.now() };
    localStorage.setItem(STRATEGY_KEY, JSON.stringify(merged));
    if (window.DhqEvents) window.DhqEvents.emit('strategy:changed', merged);
    // Fire-and-forget cross-device sync via Supabase. Failures are silent —
    // localStorage is the authoritative path and feels instant.
    if (window.OD?.saveStrategy) {
      try { window.OD.saveStrategy(merged); } catch (e) { /* ignore */ }
    }
    return merged;
  }

  // Pull the latest strategy from Supabase and reconcile with local. Called
  // on DOMContentLoaded and window focus so cross-device edits propagate
  // without requiring a full reload cycle on either app.
  let _syncInFlight = false;
  async function syncFromRemote() {
    if (_syncInFlight) return;
    if (!window.OD?.loadStrategy) return;
    _syncInFlight = true;
    try {
      const remote = await window.OD.loadStrategy();
      const local = getStrategy();
      const localVersion = local.version || 0;
      if (!remote) {
        // No remote row yet — push local up to seed the table (only if local has ever been saved)
        if (localVersion > 0 && window.OD?.saveStrategy) {
          window.OD.saveStrategy(local);
        }
        return;
      }
      const remoteVersion = remote.version || 0;
      if (remoteVersion > localVersion) {
        // Remote wins — adopt it and emit a change event so subscribers refresh
        const adopted = {
          ...remote.strategy,
          version: remoteVersion,
          lastSyncedAt: remote.lastSyncedAt,
          lastSyncedFrom: remote.lastSyncedFrom,
        };
        localStorage.setItem(STRATEGY_KEY, JSON.stringify(adopted));
        if (window.DhqEvents) window.DhqEvents.emit('strategy:changed', adopted);
      } else if (localVersion > remoteVersion && window.OD?.saveStrategy) {
        // Local is newer — push it up to catch the server up
        window.OD.saveStrategy(local);
      }
      // Version tie: no-op
    } catch (e) { /* silent — localStorage is authoritative */ }
    finally { _syncInFlight = false; }
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
  window.App.Strategy = { getStrategy, saveStrategy, syncFromRemote, checkAlignment, recordAction, getDrift, hasDrift, clearDrift, DEFAULT_STRATEGY };
  window.GMStrategy = window.App.Strategy;

  // ── Cross-device sync hooks ─────────────────────────────────────
  // Wait ~800ms after DOM ready so Supabase client + session token are up.
  function _bootSync() { setTimeout(syncFromRemote, 800); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootSync, { once: true });
  } else {
    _bootSync();
  }

  // Refresh when the window regains focus — throttled to 1/5s so rapid tab
  // switches don't hammer Supabase.
  let _lastFocusSync = 0;
  window.addEventListener('focus', () => {
    const now = Date.now();
    if (now - _lastFocusSync < 5000) return;
    _lastFocusSync = now;
    syncFromRemote();
  });
})();
