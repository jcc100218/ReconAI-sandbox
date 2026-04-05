// ══════════════════════════════════════════════════════════════════
// reconai/js/scout-ui.js — War Room Scout v4 UI Components
// Persistent chat bar, contextual chips, team bar, scout briefing,
// field log, league panel
// ══════════════════════════════════════════════════════════════════

// ── Escape helper (app.js defines this but may not be loaded yet) ─
const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Active tab tracker ──────────────────────────────────────────
window._activeTab = 'digest';

// ════════════════════════════════════════════════════════════════
// CONTEXTUAL PROMPT CHIPS
// ════════════════════════════════════════════════════════════════

const TAB_CHIPS = {
  digest: [
    { title: 'Find a WR upgrade',  sub: 'via trade or waivers' },
    { title: 'Roster risks',       sub: 'age, depth, bye weeks' },
    { title: 'Trade partners',     sub: 'based on owner DNA' },
  ],
  league: [
    { title: 'Weakest teams',      sub: 'exploit their gaps' },
    { title: 'Owner tendencies',   sub: 'behavioral patterns' },
    { title: 'Trade targets',      sub: 'who needs what' },
  ],
  draftroom: [
    { title: 'My draft plan',      sub: 'picks & priorities' },
    { title: 'Best available',     sub: 'at my pick range' },
    { title: 'Positional needs',   sub: 'fill my weakest spot' },
  ],
  waivers: [
    { title: 'Hidden gems',        sub: 'low-rostered upside' },
    { title: 'FAAB strategy',      sub: 'budget allocation' },
    { title: 'Spot starter',       sub: "this week's pickup" },
  ],
  fieldlog: [
    { title: 'Summarize my log',   sub: 'recent decisions' },
    { title: 'What changed',       sub: 'since last week' },
  ],
};

function renderCtxChips(tab) {
  const container = document.getElementById('ctx-chips-row');
  if (!container) return;
  const chips = TAB_CHIPS[tab] || TAB_CHIPS.digest;
  container.innerHTML = chips.map(c =>
    `<button class="ctx-chip" onclick="fillGlobalChat(${JSON.stringify(c.title + ': ' + c.sub)})">
      <div class="ctx-chip-title">${_esc(c.title)}</div>
      <div class="ctx-chip-sub">${_esc(c.sub)}</div>
    </button>`
  ).join('');
}
window.renderCtxChips = renderCtxChips;

// Pre-fill the global chat input with chip text (don't send yet)
function fillGlobalChat(text) {
  const inp = document.getElementById('global-chat-in');
  if (!inp) return;
  inp.value = text;
  inp.focus();
  inp.select();
}
window.fillGlobalChat = fillGlobalChat;

// ════════════════════════════════════════════════════════════════
// GLOBAL CHAT SEND
// ════════════════════════════════════════════════════════════════

function sendGlobalChat() {
  const inp = document.getElementById('global-chat-in');
  const text = inp ? inp.value.trim() : '';
  if (!text) return;
  if (inp) inp.value = '';

  // Switch to home tab so user sees the response
  const activeTab = window._activeTab;
  if (activeTab !== 'digest') {
    mobileTab('digest');
    // Small delay to let panel render
    setTimeout(() => _routeToHomeChat(text), 80);
  } else {
    _routeToHomeChat(text);
  }
}
window.sendGlobalChat = sendGlobalChat;

function _routeToHomeChat(text) {
  const homeIn = document.getElementById('home-chat-in');
  if (homeIn) homeIn.value = text;
  if (typeof sendHomeChat === 'function') sendHomeChat();
}

// ════════════════════════════════════════════════════════════════
// TEAM BAR
// ════════════════════════════════════════════════════════════════

function toggleTeamBar() {
  const bar = document.getElementById('team-bar');
  if (!bar) return;
  const expanded = bar.classList.toggle('expanded');
  const roster = document.getElementById('team-bar-roster');
  if (!roster) return;
  if (expanded) {
    renderTeamBarRoster();
  }
}
window.toggleTeamBar = toggleTeamBar;

function renderTeamBar() {
  const S = window.S;
  if (!S || !S.user) return;

  const myRoster = typeof myR === 'function' ? myR() : null;
  if (!myRoster) return;

  const nameEl  = document.getElementById('tbar-name');
  const recEl   = document.getElementById('tbar-record');
  const rankEl  = document.getElementById('tbar-rank');

  // Team name
  if (nameEl) {
    const owner = (S.leagueUsers || []).find(u => u.user_id === myRoster.owner_id);
    const tname = owner?.metadata?.team_name || owner?.display_name || 'My Team';
    nameEl.textContent = tname;
  }

  // Record
  if (recEl) {
    const w = myRoster.settings?.wins || 0;
    const l = myRoster.settings?.losses || 0;
    const t = myRoster.settings?.ties || 0;
    recEl.textContent = t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
  }

  // Power rank (simple wins-based)
  if (rankEl && S.rosters?.length) {
    const sorted = [...S.rosters].sort((a, b) =>
      (b.settings?.wins || 0) - (a.settings?.wins || 0) ||
      (b.settings?.fpts || 0) - (a.settings?.fpts || 0)
    );
    const rank = sorted.findIndex(r => r.roster_id === myRoster.roster_id) + 1;
    if (rank > 0) {
      rankEl.style.display = '';
      rankEl.textContent = `#${rank}`;
    }
  }
}
window.renderTeamBar = renderTeamBar;

let _tbarExpanded = null;

function _tbarToggle(pid) {
  // Collapse previous
  if (_tbarExpanded && _tbarExpanded !== pid) {
    const prev = document.getElementById('tbar-expand-' + _tbarExpanded);
    if (prev) prev.style.maxHeight = '0';
  }
  const el = document.getElementById('tbar-expand-' + pid);
  if (!el) return;
  if (_tbarExpanded === pid) {
    el.style.maxHeight = '0';
    _tbarExpanded = null;
  } else {
    el.style.maxHeight = el.scrollHeight + 'px';
    _tbarExpanded = pid;
  }
}
window._tbarToggle = _tbarToggle;

function renderTeamBarRoster() {
  const S = window.S;
  const container = document.getElementById('team-bar-roster');
  if (!container) return;

  if (!S || !S.user) {
    container.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--text3)">Connect your Sleeper account to see your roster.</div>';
    return;
  }

  const myRoster = typeof myR === 'function' ? myR() : null;
  if (!myRoster || !myRoster.players?.length) {
    container.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--text3)">No roster data yet.</div>';
    return;
  }

  // Group by normalized position
  const groups = { QB: [], RB: [], WR: [], TE: [], IDP: [] };
  myRoster.players.forEach(pid => {
    const rawPos = typeof pPos === 'function' ? pPos(pid) : '';
    const norm = ['QB','RB','WR','TE'].includes(rawPos) ? rawPos
      : ['DL','LB','DB','DE','DT','CB','S','SS','FS','EDGE','IDL'].includes(rawPos) ? 'IDP'
      : null;
    if (norm) groups[norm].push(pid);
  });

  const weeksDone = Math.max(1, (S.currentWeek || 1) - 1);

  let html = '';
  Object.entries(groups).forEach(([pos, players]) => {
    if (!players.length) return;
    html += `<div class="tbar-pos-group"><div class="tbar-pos-label">${pos}</div>`;
    players.forEach(pid => {
      const name     = typeof pName === 'function' ? pName(pid) : pid;
      const team     = typeof pTeam === 'function' ? pTeam(pid) : '';
      const total    = S.playerStats?.[pid]?.pts_ppr;
      const ppg      = total != null ? (total / weeksDone).toFixed(1) : '—';
      const dhq      = typeof dynastyValue === 'function' ? dynastyValue(pid) : 0;
      const dhqStr   = dhq > 0 ? dhq.toLocaleString() : '—';
      const safeName = _esc(name).replace(/'/g, "\\'");

      // Inline card data
      const p         = S.players?.[pid] || {};
      const age       = p.age || '—';
      const prevAvg   = S.playerStats?.[pid]?.prevAvg;
      const prevPpg   = prevAvg != null ? prevAvg.toFixed(1) : '—';
      const pk        = typeof peakYears === 'function' ? peakYears(pid) : null;
      const pkLabel   = pk ? pk.label : '—';
      const pkDesc    = pk ? pk.desc : '';
      const pkColor   = pk ? pk.color : 'var(--text3)';
      const trend     = (typeof LI !== 'undefined' ? LI?.playerMeta?.[pid]?.trend : 0) || 0;
      const trendStr  = trend > 5 ? `↑ ${trend}%` : trend < -5 ? `↓ ${Math.abs(trend)}%` : '—';
      const trendCol  = trend > 5 ? 'var(--green)' : trend < -5 ? 'var(--red)' : 'var(--text3)';

      html += `
      <div class="tbar-player-row" id="tbar-row-${pid}">
        <span class="pos p${pos}" style="font-size:11px;padding:1px 5px;flex-shrink:0">${pos}</span>
        <button class="tbar-pname tbar-name-btn" onclick="event.stopPropagation();_tbarToggle('${pid}')">${_esc(name)}</button>
        <span class="tbar-pteam">${_esc(team)}</span>
        <div class="tbar-ppg-col">
          <span class="tbar-ppg">${ppg}</span>
          <span class="tbar-dhq">${dhqStr}</span>
        </div>
      </div>
      <div class="tbar-expand" id="tbar-expand-${pid}">
        <div class="tbar-expand-inner">
          <div class="tbar-card-stats">
            <div class="tbar-card-stat">
              <div class="tbar-card-stat-val" style="color:var(--accent)">${dhqStr}</div>
              <div class="tbar-card-stat-lbl">DHQ</div>
            </div>
            <div class="tbar-card-stat">
              <div class="tbar-card-stat-val">${ppg}</div>
              <div class="tbar-card-stat-lbl">PPG</div>
            </div>
            <div class="tbar-card-stat">
              <div class="tbar-card-stat-val">${prevPpg}</div>
              <div class="tbar-card-stat-lbl">Prev PPG</div>
            </div>
            <div class="tbar-card-stat">
              <div class="tbar-card-stat-val">${age}</div>
              <div class="tbar-card-stat-lbl">Age</div>
            </div>
            <div class="tbar-card-stat">
              <div class="tbar-card-stat-val" style="color:${trendCol}">${trendStr}</div>
              <div class="tbar-card-stat-lbl">30d</div>
            </div>
            <div class="tbar-card-stat">
              <div class="tbar-card-stat-val" style="color:${pkColor};font-size:11px;line-height:1.2">${pkLabel}</div>
              <div class="tbar-card-stat-lbl">${pkDesc || 'Peak'}</div>
            </div>
          </div>
          <div class="tbar-card-actions">
            <button class="tbar-card-btn tbar-card-hold" onclick="event.stopPropagation();fillGlobalChat('Should I hold ${safeName}?')">Hold</button>
            <button class="tbar-card-btn tbar-card-trade" onclick="event.stopPropagation();fillGlobalChat('What can I get for ${safeName} in a trade?')">Trade</button>
            <button class="tbar-card-btn tbar-card-sell" onclick="event.stopPropagation();fillGlobalChat('Is now a good time to sell ${safeName}?')">Sell High</button>
            <button class="tbar-card-btn tbar-card-replace" onclick="event.stopPropagation();fillGlobalChat('Who can replace ${safeName} on waivers?')">Replace</button>
          </div>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  container.innerHTML = html || '<div style="padding:12px;font-size:13px;color:var(--text3)">No players found.</div>';

  // Restore expanded state after re-render
  if (_tbarExpanded) {
    const el = document.getElementById('tbar-expand-' + _tbarExpanded);
    if (el) el.style.maxHeight = el.scrollHeight + 'px';
  }
}

// ════════════════════════════════════════════════════════════════
// SCOUT BRIEFING
// ════════════════════════════════════════════════════════════════

function toggleScoutBriefing() {
  const el = document.getElementById('scout-briefing');
  if (!el) return;
  const expanded = el.classList.toggle('expanded');
  const items = document.getElementById('scout-briefing-items');
  if (!items) return;
  if (expanded) {
    items.style.display = 'flex';
    // Render if empty
    if (!items.children.length) renderScoutBriefing();
  } else {
    items.style.display = 'none';
  }
}
window.toggleScoutBriefing = toggleScoutBriefing;

function renderScoutBriefing() {
  const titleEl = document.getElementById('scout-briefing-title');
  const countEl = document.getElementById('scout-briefing-count');
  const itemsEl = document.getElementById('scout-briefing-items');
  if (!itemsEl) return;

  const S = window.S;
  if (!S || !S.user) {
    if (titleEl) titleEl.textContent = '3 things worth your attention';
    if (itemsEl) itemsEl.innerHTML = `<div class="scout-item">
      <div class="scout-item-dot watch"></div>
      <div class="scout-item-body">
        <div class="scout-item-title">Connect to get your personalized briefing</div>
        <div class="scout-item-desc">Enter your Sleeper username above to see intel tailored to your exact roster and league.</div>
      </div>
    </div>`;
    return;
  }

  const items = _generateBriefingItems();
  if (typeof trackUsage === 'function') trackUsage('briefings_received');

  if (titleEl) titleEl.textContent = `${items.length} thing${items.length !== 1 ? 's' : ''} worth your attention`;
  if (countEl) { countEl.textContent = items.length; countEl.style.display = ''; }

  // Determine if briefing reasoning (desc + actions) is gated
  const _reasoningGated = typeof canAccess === 'function'
    && !canAccess(window.FEATURES?.BRIEFING_REASONING || 'briefing_reasoning');
  const _feat = window.FEATURES?.BRIEFING_REASONING || 'briefing_reasoning';

  itemsEl.innerHTML = items.map(item => {
    if (_reasoningGated) {
      // Show headline and dot, but gate the "why" behind an upgrade tap
      return `
        <div class="scout-item">
          <div class="scout-item-dot ${item.priority}"></div>
          <div class="scout-item-body">
            <div class="scout-item-title">${_esc(item.title)}</div>
            <div style="font-size:13px;color:var(--text3);margin-top:3px">
              <a onclick="showUpgradePrompt('${_feat}')" style="color:var(--accent);cursor:pointer;text-decoration:none;font-size:13px">Why this matters →</a>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="scout-item">
        <div class="scout-item-dot ${item.priority}"></div>
        <div class="scout-item-body">
          <div class="scout-item-title">${_esc(item.title)}</div>
          <div class="scout-item-desc">${_esc(item.desc)}</div>
          ${item.action ? `<button class="scout-item-action" onclick="${_esc(item.actionFn)}">${_esc(item.action)}</button>` : ''}
        </div>
      </div>`;
  }).join('');
}
window.renderScoutBriefing = renderScoutBriefing;

function _generateBriefingItems() {
  const S = window.S;
  const items = [];
  const myRoster = typeof myR === 'function' ? myR() : null;
  if (!myRoster) return [];

  const w = myRoster.settings?.wins || 0;
  const l = myRoster.settings?.losses || 0;
  const total = w + l;
  const winPct = total > 0 ? w / total : 0.5;

  // Item 1: Record-driven narrative
  if (total > 0) {
    if (winPct < 0.40) {
      items.push({
        priority: 'urgent',
        title: `Rebuild window — ${w}-${l} record`,
        desc: 'Your record is below .400. Consider trading veterans for draft capital to accelerate your rebuild.',
        action: 'Build trade →',
        actionFn: "mobileTab('trades')",
      });
    } else if (winPct >= 0.65) {
      items.push({
        priority: 'opportunity',
        title: `Win-now mode — ${w}-${l} record`,
        desc: 'Strong record. Explore trading future picks for elite contributors before the deadline.',
        action: 'Find upgrades →',
        actionFn: "fillGlobalChat('What win-now trades should I make this week?')",
      });
    } else {
      items.push({
        priority: 'watch',
        title: `Middling record — ${w}-${l}`,
        desc: 'Right in the middle of the pack. A well-timed move or two could push you into playoff position.',
        action: 'Identify targets →',
        actionFn: "fillGlobalChat('What one trade move would most improve my playoff odds?')",
      });
    }
  }

  // Item 2: Waiver opportunity
  items.push({
    priority: 'opportunity',
    title: 'Waiver wire has upside',
    desc: 'Low-ownership players with breakout potential are available right now.',
    action: 'View waivers →',
    actionFn: "mobileTab('waivers')",
  });

  // Item 3: Draft capital check
  if (items.length < 3) {
    const picks = myRoster.draft_picks || [];
    const futureCapital = picks.length;
    if (futureCapital === 0) {
      items.push({
        priority: 'watch',
        title: 'Low draft capital',
        desc: "You have no future picks on hand. Consider acquiring picks before the rookie draft.",
        action: 'Acquire picks →',
        actionFn: "fillGlobalChat('How can I acquire more draft picks this offseason?')",
      });
    } else {
      items.push({
        priority: 'opportunity',
        title: `${futureCapital} pick${futureCapital !== 1 ? 's' : ''} in hand`,
        desc: 'Use the draft room to map your targets. Good capital = leverage in trades.',
        action: 'Open draft room →',
        actionFn: "mobileTab('draftroom')",
      });
    }
  }

  return items.slice(0, 3);
}

// ════════════════════════════════════════════════════════════════
// FIELD LOG
// ════════════════════════════════════════════════════════════════

const FL_KEY = 'scout_field_log_v1';

function getFieldLog() {
  try { return JSON.parse(localStorage.getItem(FL_KEY) || '[]'); }
  catch (e) { return []; }
}

// meta = { actionType, players: [{id,name}], context, leagueId }
function addFieldLogEntry(icon, text, category, meta) {
  meta = meta || {};
  const log = getFieldLog();
  const entry = {
    id: 'fl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    icon: icon || '📋',
    text,
    category: category || 'note',
    ts: Date.now(),
    actionType: meta.actionType || null,
    players: meta.players || [],
    context: meta.context || null,
    leagueId: meta.leagueId || window.S?.currentLeagueId || null,
    syncStatus: 'pending',
  };
  log.unshift(entry);
  localStorage.setItem(FL_KEY, JSON.stringify(log.slice(0, 50)));
  renderFieldLogCard();
  // Fire-and-forget sync to Supabase
  if (window.OD?.saveFieldLogEntry) {
    window.OD.saveFieldLogEntry(entry).then(() => renderFieldLogCard()).catch(() => {});
  }
}
window.addFieldLogEntry = addFieldLogEntry;

// Bulk sync pending entries; called on app load
async function syncFieldLog() {
  // Tier gate — Field Log sync requires paid
  if (typeof canAccess === 'function' && !canAccess(window.FEATURES?.FIELD_LOG_SYNC || 'field_log_sync')) {
    if (typeof showUpgradePrompt === 'function') showUpgradePrompt(window.FEATURES?.FIELD_LOG_SYNC || 'field_log_sync');
    return;
  }
  if (!window.OD?.syncPendingFieldLog) return;
  const btn = document.getElementById('fieldlog-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  await window.OD.syncPendingFieldLog();
  renderFieldLogCard();
  renderFieldLogPanel();
  if (btn) { btn.disabled = false; btn.textContent = '↑ Sync to War Room'; }
}
window.syncFieldLog = syncFieldLog;

function _relativeTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000)    return 'Just now';
  if (d < 3600000)  return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

// Card on Home tab
function renderFieldLogCard() {
  const container = document.getElementById('field-log-entries-home');
  if (!container) return;
  const log = getFieldLog();

  if (!log.length) {
    container.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:6px 0">No activity yet. Your moves will appear here.</div>';
    return;
  }

  const pendingCount = log.filter(e => e.syncStatus === 'pending' || e.syncStatus === 'failed').length;
  const syncBadge = pendingCount > 0
    ? `<span style="font-size:11px;color:var(--text3)">${pendingCount} pending sync</span>`
    : `<span class="field-log-sync-badge">Synced to War Room</span>`;

  container.innerHTML = log.slice(0, 3).map(e =>
    `<div class="field-log-entry">
      <span class="field-log-icon">${e.icon}</span>
      <span class="field-log-text">${_esc(e.text)}</span>
      <span class="field-log-time">${_relativeTime(e.ts)}</span>
    </div>`
  ).join('') + `<div style="margin-top:6px">${syncBadge}</div>`;
}
window.renderFieldLogCard = renderFieldLogCard;

const FL_CATEGORY_LABELS = {
  trade: '🔄 Trade', roster: '📋 Roster', draft: '🎯 Draft',
  waivers: '📡 Waivers', research: '🔍 Research', note: '📝 Note',
};

// Full panel
function renderFieldLogPanel() {
  const container = document.getElementById('panel-fieldlog-content');
  if (!container) return;
  const log = getFieldLog();

  const pendingCount = log.filter(e => e.syncStatus === 'pending' || e.syncStatus === 'failed').length;
  const _syncGated = typeof canAccess === 'function'
    && !canAccess(window.FEATURES?.FIELD_LOG_SYNC || 'field_log_sync');
  const _syncFeat  = window.FEATURES?.FIELD_LOG_SYNC || 'field_log_sync';
  const syncBtn = _syncGated
    ? `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text3)">Local only — sync requires War Room Scout</div>
        <button onclick="showUpgradePrompt('${_syncFeat}')" style="padding:6px 14px;background:linear-gradient(135deg,#D4AF37,#e8cc6c);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">🔒 Unlock Sync</button>
      </div>`
    : `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text3)">${pendingCount > 0 ? `${pendingCount} entries pending sync` : 'All entries synced to War Room'}</div>
        <button id="fieldlog-sync-btn" onclick="syncFieldLog()" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;opacity:${pendingCount > 0 ? '1' : '0.5'}">↑ Sync to War Room</button>
      </div>`;

  if (!log.length) {
    container.innerHTML = syncBtn + `<div class="fieldlog-empty">
      <div class="fieldlog-empty-icon">📋</div>
      <div class="fieldlog-empty-text">Your field log is empty.<br>Moves you make — trade scenarios, waiver bids, draft targets — appear here automatically.</div>
    </div>`;
    return;
  }

  // Group by date
  const groups = {};
  log.forEach(e => {
    const d = new Date(e.ts);
    const key = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  const entriesHtml = Object.entries(groups).map(([date, entries]) =>
    `<div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px;border-bottom:1px solid var(--border);margin-bottom:8px">${date}</div>
      ${entries.map(e => {
        const timeStr = new Date(e.ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
        const syncDot = e.syncStatus === 'synced'
          ? `<span title="Synced to War Room" style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0"></span>`
          : e.syncStatus === 'failed'
          ? `<span title="Sync failed" style="width:6px;height:6px;border-radius:50%;background:#E74C3C;display:inline-block;flex-shrink:0"></span>`
          : `<span title="Pending sync" style="width:6px;height:6px;border-radius:50%;background:var(--text3);display:inline-block;flex-shrink:0"></span>`;
        const catLabel = FL_CATEGORY_LABELS[e.category] || e.category;
        const playersHtml = e.players?.length
          ? `<div style="font-size:11px;color:var(--accent);margin-top:3px">${e.players.map(p => _esc(p.name || p)).join(', ')}</div>`
          : '';
        const contextHtml = e.context
          ? `<div style="font-size:12px;color:var(--text2);margin-top:3px;font-style:italic;line-height:1.4">${_esc(e.context)}</div>`
          : '';
        return `<div class="fieldlog-entry">
          <div class="fieldlog-entry-icon">${e.icon}</div>
          <div class="fieldlog-entry-body">
            <div class="fieldlog-entry-title">${_esc(e.text)}</div>
            ${playersHtml}${contextHtml}
            <div class="fieldlog-entry-meta" style="display:flex;align-items:center;gap:6px">
              <span>${catLabel}</span>
              <span>·</span>
              <span>${timeStr}</span>
              ${syncDot}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`
  ).join('');

  container.innerHTML = syncBtn + entriesHtml;
}
window.renderFieldLogPanel = renderFieldLogPanel;

// ════════════════════════════════════════════════════════════════
// LEAGUE PANEL
// ════════════════════════════════════════════════════════════════

function renderLeaguePanel() {
  const container = document.getElementById('panel-league-content');
  if (!container) return;
  const S = window.S;

  if (!S || !S.user || !S.rosters?.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:10px">🏈</div>
      <div style="font-size:14px">Connect your league to see owner intelligence.</div>
    </div>`;
    return;
  }

  const myId = S.myRosterId;
  const myR_ = (S.rosters || []).find(r => r.roster_id === myId);
  const myWins = myR_?.settings?.wins || 0;

  const sorted = [...S.rosters].sort((a, b) =>
    (b.settings?.wins || 0) - (a.settings?.wins || 0) ||
    (b.settings?.fpts || 0) - (a.settings?.fpts || 0)
  );

  let html = '';
  sorted.forEach((roster, idx) => {
    const owner = (S.leagueUsers || []).find(u => u.user_id === roster.owner_id);
    const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${idx + 1}`;
    const displayName = owner?.display_name || owner?.username || '?';
    const initial = (teamName[0] || '?').toUpperCase();
    const w = roster.settings?.wins || 0;
    const l = roster.settings?.losses || 0;
    const t = roster.settings?.ties || 0;
    const isMe = roster.roster_id === myId;
    const winPct = (w + l) > 0 ? w / (w + l) : 0.5;

    // DNA tags
    const tags = [];
    if (winPct > 0.65) tags.push({ label: 'Win-now', cls: 'dna-hold' });
    else if (winPct < 0.35) tags.push({ label: 'Rebuilding', cls: 'dna-build' });
    else tags.push({ label: 'Competing', cls: 'dna-buy' });

    if (!isMe && Math.abs(w - myWins) <= 2) tags.push({ label: 'Trade target', cls: 'dna-sell' });
    if (isMe) tags.push({ label: 'You', cls: 'dna-build' });

    const prompt = `Tell me about ${teamName} and how to exploit their weaknesses`;
    html += `<div class="league-owner-card${isMe ? ' league-owner-me' : ''}" onclick="fillGlobalChat(${JSON.stringify(prompt)})">
      <div class="league-owner-header">
        <div class="league-owner-avatar">${_esc(initial)}</div>
        <div class="league-owner-info">
          <div class="league-owner-name">${_esc(teamName)}</div>
          <div class="league-owner-record">${w}-${l}${t > 0 ? `-${t}` : ''} · @${_esc(displayName)}</div>
        </div>
        <div class="league-owner-rank">#${idx + 1}</div>
      </div>
      <div class="league-dna-tags">
        ${tags.map(tag => `<span class="league-dna-tag ${tag.cls}">${_esc(tag.label)}</span>`).join('')}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}
window.renderLeaguePanel = renderLeaguePanel;

// ════════════════════════════════════════════════════════════════
// MOBILELAB OVERRIDE — handle new tabs
// ════════════════════════════════════════════════════════════════

// Wait for ui.js to define mobileTab, then wrap it
function _patchMobileTab() {
  const original = window.mobileTab;
  if (!original) {
    setTimeout(_patchMobileTab, 50);
    return;
  }

  window.mobileTab = function(tab, btn) {
    window._activeTab = tab;
    renderCtxChips(tab);

    if (tab === 'league' || tab === 'fieldlog') {
      // Handle new tabs directly
      document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
      if (btn) {
        btn.classList.add('active');
      } else {
        const idMap = { league: 'mnav-league', fieldlog: 'mnav-fieldlog' };
        const el = document.getElementById(idMap[tab]);
        if (el) el.classList.add('active');
      }
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');

      if (tab === 'league')    renderLeaguePanel();
      if (tab === 'fieldlog')  renderFieldLogPanel();
    } else {
      // Call the original pre-patch mobileTab (which calls switchTab for panel activation)
      original(tab, btn);
      // Always sync v4 nav active state (original uses old nav IDs that no longer exist)
      document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
      if (btn) {
        btn.classList.add('active');
      } else {
        const newMap = { digest:'mnav-home', draftroom:'mnav-draft', waivers:'mnav-waivers', trades:'mnav-home', roster:'mnav-home', startsit:'mnav-home', settings:null };
        const navId = newMap[tab];
        if (navId) { const el = document.getElementById(navId); if (el) el.classList.add('active'); }
      }
    }
  };
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Initial chip render
  renderCtxChips('digest');
  renderFieldLogCard();

  // Patch mobileTab after other scripts have loaded
  _patchMobileTab();

  // Initialize chat placeholder with daily limit hint for free users
  if (typeof _updateChatPlaceholder === 'function') _updateChatPlaceholder();

  // Hook: refresh team bar + briefing after league loads
  // Poll for S.user being set (league connection)
  let _teamBarInterval = null;
  function _onLeagueReady() {
    renderTeamBar();
    renderScoutBriefing();
    renderFieldLogCard();
    if (typeof renderTrialBanner === 'function') renderTrialBanner();
    if (typeof _updateChatPlaceholder === 'function') _updateChatPlaceholder();
    clearInterval(_teamBarInterval);
    // Re-check every 15 seconds in case data updates
    setInterval(() => {
      if (window.S?.user) {
        renderTeamBar();
        renderScoutBriefing();
      }
    }, 15000);
  }

  _teamBarInterval = setInterval(() => {
    if (window.S?.user) _onLeagueReady();
  }, 500);
  // Safety cutoff after 60s
  setTimeout(() => clearInterval(_teamBarInterval), 60000);
});
