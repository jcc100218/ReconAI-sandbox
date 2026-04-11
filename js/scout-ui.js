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
  // Also refresh the GM bar Alex block + dynamic placeholder whenever chips change
  if (typeof _renderGMBarAlexBlock === 'function') _renderGMBarAlexBlock();
  if (typeof _updateGlobalChatPlaceholder === 'function') _updateGlobalChatPlaceholder();
}
window.renderCtxChips = renderCtxChips;

// ── GM bar (Phase 6) — expanding unified AI surface ────────────
// The global chat overlay becomes the central prompt hub. When the input is
// focused, it expands to reveal: (1) GM Strategy + Alex Learning summary,
// (2) context chips. Placeholder text is dynamic, driven by field intel.

function _renderGMBarAlexBlock() {
  const el = document.getElementById('gm-bar-alex');
  if (!el) return;
  const strat = window.GMStrategy?.getStrategy?.() || {};
  const eng = window.GMEngine;
  const fi = eng?.generateFieldIntel?.() || [];
  const mode = (strat.mode || 'balanced').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const aggr = strat.aggression || 'medium';
  const targets = (strat.targetPositions || []).join(', ') || '—';
  const fiBullets = fi.slice(0, 2).map(s => `<div style="font-size:11px;color:var(--text3);padding:2px 0">· ${_esc(s)}</div>`).join('');
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:${fiBullets ? '6px' : '0'}">
      <div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:.06em;text-transform:uppercase">AI GM · Alex ${strat.alexPersonality || 'balanced'}</div>
      <div style="font-size:11px;color:var(--text3)">${_esc(mode)} · ${_esc(aggr)} · ${_esc(targets)}</div>
    </div>
    ${fiBullets}
  `;
}
window._renderGMBarAlexBlock = _renderGMBarAlexBlock;

function _updateGlobalChatPlaceholder() {
  const inp = document.getElementById('global-chat-in');
  if (!inp) return;
  const fi = window.GMEngine?.generateFieldIntel?.() || [];
  const top = (fi[0] || '').toString().trim();
  inp.placeholder = top ? `Ask about: ${top.length > 64 ? top.slice(0, 61) + '…' : top}` : 'Click here to ask Scout…';
}
window._updateGlobalChatPlaceholder = _updateGlobalChatPlaceholder;

// ── GM Bar expand / collapse / launcher nav (Phase 7 v2) ────────
// The expanded state takes over ~70% of the viewport, shows the 3
// quick-launch buttons (Waivers / Trades / Draft), an Alex Learning /
// GM Strategy summary, and prompt chips. A semi-transparent scrim
// covers the rest of the app and is tappable to dismiss.

function _gmBarExpand() {
  const ov = document.getElementById('global-chat-overlay');
  if (!ov) return;
  ov.classList.add('expanded');
  document.body.classList.add('gm-bar-active');
  if (typeof _renderGMBarAlexBlock === 'function') _renderGMBarAlexBlock();
  if (typeof _updateGlobalChatPlaceholder === 'function') _updateGlobalChatPlaceholder();
}
window._gmBarExpand = _gmBarExpand;

function _gmBarCollapse() {
  const ov = document.getElementById('global-chat-overlay');
  if (!ov) return;
  ov.classList.remove('expanded');
  document.body.classList.remove('gm-bar-active');
  const inp = document.getElementById('global-chat-in');
  if (inp && document.activeElement === inp) inp.blur();
}
window._gmBarCollapse = _gmBarCollapse;

// Launcher button handlers — switch tab, then nudge the sub-view,
// then collapse the GM bar. Each call is chained so the user lands in
// the exact destination they asked for.
function _gmLaunchWaivers() {
  _gmBarCollapse();
  if (typeof window.mobileTab === 'function') window.mobileTab('league');
  setTimeout(() => {
    if (typeof window._leagueEnterRoom === 'function') window._leagueEnterRoom('waivers');
  }, 180);
}
window._gmLaunchWaivers = _gmLaunchWaivers;

function _gmLaunchTrades() {
  _gmBarCollapse();
  if (typeof window.mobileTab === 'function') window.mobileTab('league');
  setTimeout(() => {
    if (typeof window._leagueEnterRoom === 'function') window._leagueEnterRoom('trades');
  }, 180);
}
window._gmLaunchTrades = _gmLaunchTrades;

function _gmLaunchDraft() {
  _gmBarCollapse();
  if (typeof window.mobileTab === 'function') window.mobileTab('draftroom');
  setTimeout(() => {
    if (typeof window.switchDraftView === 'function') window.switchDraftView('board');
  }, 180);
}
window._gmLaunchDraft = _gmLaunchDraft;

// Legacy no-op kept for any leftover references (Phase 6 v1 had a blur-debounced collapse)
function _gmBarCollapseSoon() { /* replaced by scrim click / Esc / programmatic collapse */ }
window._gmBarCollapseSoon = _gmBarCollapseSoon;

// Fill global chat and auto-send
function fillGlobalChat(text) {
  const inp = document.getElementById('global-chat-in');
  if (!inp) return;
  inp.value = text;
  inp.focus();
  setTimeout(() => { if (typeof sendGlobalChat === 'function') sendGlobalChat(); }, 150);
}
window.fillGlobalChat = fillGlobalChat;

// ════════════════════════════════════════════════════════════════
// UNIFIED SEARCH + CHAT INPUT
// ════════════════════════════════════════════════════════════════

let _unifiedDebounce = null;

function handleUnifiedInput(val) {
  clearTimeout(_unifiedDebounce);
  const results = document.getElementById('unified-search-results');
  if (!results) return;
  if (!val || val.length < 2) { results.style.display = 'none'; return; }

  _unifiedDebounce = setTimeout(() => {
    const q = val.toLowerCase();
    const players = window.S?.players || {};
    const matches = Object.entries(players)
      .filter(([, p]) => {
        const full = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
        return full.includes(q) && p.position && !['HC','OC','DC','GM'].includes(p.position);
      })
      .map(([pid, p]) => {
        const dhq = typeof dynastyValue === 'function' ? dynastyValue(pid) : 0;
        return { pid, name: (p.first_name || '') + ' ' + (p.last_name || ''), pos: p.position, team: p.team || 'FA', dhq };
      })
      .sort((a, b) => b.dhq - a.dhq)
      .slice(0, 5);

    let html = '';
    if (matches.length) {
      html += matches.map(m =>
        `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s" onclick="document.getElementById('unified-search-results').style.display='none';document.getElementById('global-chat-in').value='';openPlayerModal('${m.pid}')">
          <img src="https://sleepercdn.com/content/nfl/players/${m.pid}.jpg" style="width:28px;height:28px;border-radius:50%;object-fit:cover" onerror="this.style.display='none'"/>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:var(--text)">${_esc(m.name)}</div>
            <div style="font-size:12px;color:var(--text3)">${m.pos} · ${m.team}${m.dhq > 0 ? ' · ' + m.dhq.toLocaleString() + ' DHQ' : ''}</div>
          </div>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`
      ).join('');
    }
    // Always show "Ask Scout" option at bottom
    html += `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;background:var(--accentL);transition:background .1s" onclick="document.getElementById('unified-search-results').style.display='none';sendGlobalChat()">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:var(--accent)">Ask Scout</div>
        <div style="font-size:12px;color:var(--text3)">"${_esc(val.slice(0, 50))}"</div>
      </div>
    </div>`;

    results.innerHTML = html;
    results.style.display = '';
  }, 200);
}
window.handleUnifiedInput = handleUnifiedInput;

function handleUnifiedEnter(event) {
  const results = document.getElementById('unified-search-results');
  if (results) results.style.display = 'none';
  sendGlobalChat();
}
window.handleUnifiedEnter = handleUnifiedEnter;

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
  // Scroll to chat area so user can see the response
  setTimeout(() => {
    const msgs = document.getElementById('home-chat-msgs');
    if (msgs) msgs.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 200);
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

  const nameEl  = document.getElementById('tbar-name');
  const recEl   = document.getElementById('tbar-record');
  const rankEl  = document.getElementById('tbar-rank');

  const myRoster = typeof myR === 'function' ? myR() : null;
  if (!myRoster) {
    // User is logged in but the roster hasn't been resolved yet (S.myRosterId
    // may populate after S.user on cold start). Show a loading state instead
    // of leaving the default "— Connect to see your team —" fallback visible.
    if (nameEl) nameEl.textContent = 'Loading your team…';
    if (recEl)  recEl.textContent  = '';
    if (rankEl) rankEl.style.display = 'none';
    return;
  }

  // Team avatar + name
  const owner = (S.leagueUsers || []).find(u => u.user_id === myRoster.owner_id);
  const avatarEl = document.getElementById('tbar-avatar');
  if (avatarEl) {
    const avatarId = owner?.avatar || S.user?.avatar;
    if (avatarId) {
      avatarEl.src = `https://sleepercdn.com/avatars/thumbs/${avatarId}`;
      avatarEl.style.display = '';
    }
  }
  if (nameEl) {
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

  // Health score (replaces power rank in offseason)
  if (rankEl) {
    try {
      const assess = typeof window.assessTeamFromGlobal === 'function'
        ? window.assessTeamFromGlobal(myRoster.roster_id)
        : null;
      const health = assess?.healthScore ?? assess?.health ?? assess?.overallGrade ?? null;
      if (health != null) {
        rankEl.style.display = '';
        const score = typeof health === 'number' ? Math.round(health) : health;
        const tierLabel = assess?.tier ? assess.tier.charAt(0) + assess.tier.slice(1).toLowerCase() : '';
        rankEl.textContent = tierLabel ? `${tierLabel} · ${score}` : `Health: ${score}`;
      }
    } catch (e) {}
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

  // Group by normalized position in display order
  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'];
  const groups = { QB: [], RB: [], WR: [], TE: [], K: [], DL: [], LB: [], DB: [] };
  myRoster.players.forEach(pid => {
    const rawPos = typeof pPos === 'function' ? pPos(pid) : '';
    let norm;
    if (['QB','RB','WR','TE','K'].includes(rawPos)) norm = rawPos;
    else if (['DE','DT','EDGE','IDL'].includes(rawPos)) norm = 'DL';
    else if (['CB','S','SS','FS'].includes(rawPos)) norm = 'DB';
    else if (['DL','LB','DB'].includes(rawPos)) norm = rawPos;
    if (norm) groups[norm].push(pid);
  });

  // Sort each position group by DHQ descending
  const _dhqVal = pid => typeof dynastyValue === 'function' ? dynastyValue(pid) : 0;
  POS_ORDER.forEach(pos => groups[pos].sort((a, b) => _dhqVal(b) - _dhqVal(a)));

  const weeksDone = Math.max(1, (S.currentWeek || 1) - 1);

  let html = '';
  POS_ORDER.forEach(pos => {
    const players = groups[pos];
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

      // Age curve bar segments
      const peakMap = window.App?.peakWindows || {QB:[23,39],RB:[21,31],WR:[21,33],TE:[21,34],DL:[26,33],LB:[26,32],DB:[21,34]};
      const rawPos2 = p.position || pos;
      const mappedPos = ['DE','DT'].includes(rawPos2) ? 'DL' : ['CB','S','SS','FS'].includes(rawPos2) ? 'DB' : rawPos2;
      const [pLo, pHi] = peakMap[mappedPos] || [24, 29];
      const ageNum = parseInt(age) || 25;
      const curveAges = [20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36];
      const segColor = a => a < pLo - 3 ? 'rgba(96,165,250,.3)' : a < pLo ? 'rgba(52,211,153,.5)' : a >= pLo && a <= pHi ? 'rgba(52,211,153,.8)' : a <= pHi + 2 ? 'rgba(251,191,36,.5)' : 'rgba(248,113,113,.4)';
      const curveHtml = curveAges.map(a => `<div style="flex:1;height:6px;background:${segColor(a)};opacity:${a===ageNum?1:0.5};border-radius:1px;${a===ageNum?'outline:1.5px solid white;outline-offset:-1px;':''}"></div>`).join('');

      // Trade profile verdict
      const action = typeof getPlayerAction === 'function' ? getPlayerAction(pid) : null;
      const actionLabel = action?.label || '';
      const actionCol = action?.col || 'var(--text3)';

      html += `
      <div class="tbar-player-row" id="tbar-row-${pid}">
        <span class="pos p${pos}" style="font-size:11px;padding:1px 5px;flex-shrink:0">${pos}</span>
        <button class="tbar-pname tbar-name-btn" onclick="event.stopPropagation();_tbarToggle('${pid}')">${_esc(name)}</button>
        <span class="tbar-pteam">${_esc(team)}</span>
        <div class="tbar-ppg-col">
          <span class="tbar-dhq">${dhqStr}</span>
          <span class="tbar-ppg" title="Points per game">${ppg} ppg</span>
        </div>
      </div>
      <div class="tbar-expand" id="tbar-expand-${pid}">
        <div class="tbar-expand-inner" style="padding:10px 12px">
          <!-- Row 1: Photo + name + team + DHQ -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <img src="https://sleepercdn.com/content/nfl/players/${pid}.jpg" style="width:40px;height:40px;border-radius:10px;object-fit:cover;object-position:top;border:1px solid var(--border2);flex-shrink:0" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
            <div style="display:none;width:40px;height:40px;border-radius:10px;background:var(--bg4);align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--text3);flex-shrink:0">${(name[0]||'?').toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="event.stopPropagation();openPlayerModal('${pid}')">${_esc(name)}</div>
              <div style="font-size:11px;color:var(--text3)">${pos} · Age ${age} · ${ppg} PPG${prevPpg !== '—' ? ' · Prev ' + prevPpg : ''} · <span style="color:${trendCol}">${trendStr}</span></div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:14px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace">${dhqStr}</div>
              ${actionLabel ? `<div style="font-size:10px;font-weight:700;color:${actionCol}">${actionLabel}</div>` : ''}
            </div>
          </div>
          <!-- Row 2: Age curve bar -->
          <div style="margin-bottom:8px">
            <div style="display:flex;gap:1px;border-radius:3px;overflow:hidden">${curveHtml}</div>
            <div style="display:flex;justify-content:space-between;margin-top:2px">
              <span style="font-size:9px;color:var(--text3)">20</span>
              <span style="font-size:10px;color:${pkColor};font-weight:600">${pkLabel} · ${pkDesc}</span>
              <span style="font-size:9px;color:var(--text3)">36</span>
            </div>
          </div>
          <!-- Row 3: Action buttons -->
          <div class="tbar-card-actions" style="display:flex;gap:4px">
            <button class="tbar-card-btn tbar-card-hold" onclick="event.stopPropagation();fillGlobalChat('Should I hold ${safeName}?')">Hold</button>
            <button class="tbar-card-btn tbar-card-trade" onclick="event.stopPropagation();if(typeof openTradeBuilderForPlayer==='function'){openTradeBuilderForPlayer('${pid}')}else{fillGlobalChat('What can I get for ${safeName} in a trade?')}">Trade</button>
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

  // Get team assessment (same engine as War Room)
  const assess = typeof window.assessTeamFromGlobal === 'function'
    ? window.assessTeamFromGlobal(myRoster.roster_id) : null;
  const tier = assess?.tier || '';
  const hs = assess?.healthScore || 0;
  const needs = (assess?.needs || []).slice(0, 3);
  const elites = assess?.elites || 0;
  const needPos = needs.map(n => typeof n === 'string' ? n : n.pos).filter(Boolean).join(', ');

  const w = myRoster.settings?.wins || 0;
  const l = myRoster.settings?.losses || 0;
  const total = w + l;
  const winPct = total > 0 ? w / total : 0.5;

  // Item 1: Team health diagnosis (assessment-driven, not just record)
  if (assess) {
    const healthDesc = hs >= 85
      ? `Elite roster (${hs} health). ${elites} franchise player${elites !== 1 ? 's' : ''} anchoring your team.`
      : hs >= 70
      ? `Contender-class roster (${hs} health).${needPos ? ' Biggest gap: ' + needPos + '.' : ''}`
      : hs >= 55
      ? `Roster at a crossroads (${hs} health).${needPos ? ' Priority needs: ' + needPos + '.' : ''} A smart trade could shift momentum.`
      : `Rebuild mode (${hs} health).${needPos ? ' Critical gaps at ' + needPos + '.' : ''} Focus on acquiring young talent and draft capital.`;

    items.push({
      priority: hs >= 70 ? 'opportunity' : hs >= 55 ? 'watch' : 'urgent',
      title: `${tier || 'Team'} · Health ${hs}${total > 0 ? ' · ' + w + '-' + l : ''}`,
      desc: healthDesc,
      action: hs >= 70 ? 'Find upgrades →' : 'Build trade →',
      actionFn: hs >= 70
        ? "fillGlobalChat('What upgrades should I target to push for a championship?')"
        : "fillGlobalChat('What trades should I make to improve my roster health?')",
    });
  } else if (total > 0) {
    // Fallback: record-based if assessment unavailable
    const title = winPct < 0.40 ? `Rebuild window — ${w}-${l}` : winPct >= 0.65 ? `Win-now — ${w}-${l}` : `${w}-${l} record`;
    items.push({
      priority: winPct < 0.40 ? 'urgent' : 'opportunity',
      title,
      desc: winPct < 0.40 ? 'Consider trading vets for draft capital.' : 'Explore upgrades before the deadline.',
      action: 'Find moves →',
      actionFn: "mobileTab('trades')",
    });
  }

  // Item 2: Positional need action (if assessment found needs)
  if (needs.length > 0) {
    const topNeed = typeof needs[0] === 'string' ? needs[0] : needs[0].pos;
    items.push({
      priority: 'watch',
      title: `${topNeed} is your biggest gap`,
      desc: `Your roster is thinnest at ${topNeed}. Check waivers and trade targets to address this before it costs you.`,
      action: 'Find ' + topNeed + ' →',
      actionFn: `fillGlobalChat('Who are the best ${topNeed} targets I can acquire via trade or waivers?')`,
    });
  } else {
    items.push({
      priority: 'opportunity',
      title: 'Waiver wire has upside',
      desc: 'Low-ownership players with breakout potential are available.',
      action: 'View waivers →',
      actionFn: "mobileTab('waivers')",
    });
  }

  // Item 3: Draft capital (use tradedPicks API, not roster.draft_picks)
  if (items.length < 3) {
    const curYear = parseInt(S.season) || new Date().getFullYear();
    const league = S.leagues?.find(l => l.league_id === S.currentLeagueId);
    const draftRounds = league?.settings?.draft_rounds || 4;
    const allTP = S.tradedPicks || [];
    let futureCapital = 0;
    for (let yr = curYear; yr <= curYear + 2; yr++) {
      for (let rd = 1; rd <= draftRounds; rd++) {
        const tradedAway = allTP.find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster.roster_id && p.owner_id !== myRoster.roster_id);
        if (!tradedAway) futureCapital++;
        const acquired = allTP.filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster.roster_id && p.roster_id !== myRoster.roster_id);
        futureCapital += acquired.length;
      }
    }
    if (futureCapital === 0) {
      items.push({
        priority: 'watch',
        title: 'Low draft capital',
        desc: "No future picks in hand. Acquire picks before the rookie draft.",
        action: 'Acquire picks →',
        actionFn: "fillGlobalChat('How can I acquire more draft picks this offseason?')",
      });
    } else {
      items.push({
        priority: 'opportunity',
        title: `${futureCapital} pick${futureCapital !== 1 ? 's' : ''} in hand`,
        desc: 'Use the draft room to map your targets. Good capital = leverage.',
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

// ── Activity panel helpers ────────────────────────────────────

function _modeLabel(mode) {
  const labels = { rebuild: 'Rebuild', balanced_rebuild: 'Balanced Rebuild', contend: 'Contend', win_now: 'Win Now' };
  return labels[mode] || mode || 'current';
}

function _describeConflict(c) {
  if (c.reasons?.length) return c.reasons[0];
  if (c.type) return `${c.type}${c.position ? ' ' + c.position : ''} move conflicts with plan`;
  return 'Action conflicts with strategy';
}

function _getDayKey(ts) {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const t = todayStart.getTime();
  if (ts >= t) return 'Today';
  if (ts >= t - 86400000) return 'Yesterday';
  if (ts >= t - 6 * 86400000) return 'This Week';
  return new Date(ts).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

function _getEntryAlignment(entry) {
  if (!window.GMStrategy?.checkAlignment) return null;
  if (!entry.actionType || entry.actionType === 'note' || entry.actionType === 'scout') return null;
  const player = entry.players?.[0];
  if (!player) return null;
  const isAcquire = /waiver|acquire/.test(entry.actionType || '');
  const action = {
    type: entry.category || entry.actionType,
    playerId: player.id,
    position: player.pos || null,
    direction: isAcquire ? 'acquire' : 'sell',
  };
  const result = window.GMStrategy.checkAlignment(action);
  if (result.alignment === 'aligned')   return { type: 'aligned',   label: '✓ Aligned' };
  if (result.alignment === 'partial')   return { type: 'partial',   label: '~ Partial' };
  if (result.alignment === 'conflicts') return { type: 'conflicts', label: '✗ Conflicts' };
  return null;
}

function _getTradeFrequency(log) {
  const cutoff = Date.now() - 14 * 86400000;
  const n = log.filter(e => (e.actionType === 'trade' || e.category === 'trade') && e.ts >= cutoff).length;
  if (n >= 4) return 'Active';
  if (n >= 2) return 'Moderate';
  return 'Conservative';
}

function _getFaabStyle(log) {
  const cutoff = Date.now() - 14 * 86400000;
  const n = log.filter(e => (e.actionType === 'waiver' || e.category === 'waivers') && e.ts >= cutoff).length;
  if (n >= 4) return 'Aggressive';
  if (n >= 2) return 'Moderate';
  return 'Conservative';
}

function _getPositionBias(log) {
  const cutoff = Date.now() - 14 * 86400000;
  const posCounts = {};
  log.filter(e => e.ts >= cutoff).forEach(e => {
    (e.players || []).forEach(p => { if (p.pos) posCounts[p.pos] = (posCounts[p.pos] || 0) + 1; });
  });
  const top = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'Balanced';
}

function _getLastSyncTime(log) {
  const s = log.filter(e => e.syncStatus === 'synced').sort((a, b) => b.ts - a.ts)[0];
  return s ? _relativeTime(s.ts) : 'Never';
}

function _clearDriftWithNote() {
  if (window.GMStrategy?.clearDrift) window.GMStrategy.clearDrift();
  addFieldLogEntry('🎯', 'Staying the course — acknowledged drift, chose to continue.', 'note', {});
  renderFieldLogPanel();
}
window._clearDriftWithNote = _clearDriftWithNote;

// ── Override reason modal ────────────────────────────────────

function showOverrideReasonModal(entryId, actionDesc) {
  const existing = document.getElementById('override-reason-modal');
  if (existing) existing.remove();

  const options = [
    'Short-term win',
    'Injury reaction',
    'Changed my mind',
    'Testing the market',
    'Just a gut feel',
  ];

  const el = document.createElement('div');
  el.id = 'override-reason-modal';
  el.className = 'override-modal-overlay';
  el.innerHTML = `<div class="override-modal-card">
    <div class="override-modal-header">
      <div class="override-modal-title">⚠️ This move conflicts with your strategy.</div>
      <div class="override-modal-sub">Quick note — why this move?</div>
    </div>
    <div class="override-modal-options">
      ${options.map(o => `<button class="override-modal-option" onclick="_selectOverrideReason('${entryId}',${JSON.stringify(o)})">${_esc(o)}</button>`).join('')}
    </div>
    <button class="override-modal-skip" onclick="_closeOverrideModal()">Skip</button>
  </div>`;

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('override-modal-visible'));
}
window.showOverrideReasonModal = showOverrideReasonModal;

function _selectOverrideReason(entryId, label) {
  const log = getFieldLog();
  const entry = log.find(e => e.id === entryId);
  if (entry) {
    entry.overrideReason = label;
    localStorage.setItem(FL_KEY, JSON.stringify(log));
  }
  _closeOverrideModal();
  renderFieldLogPanel();
  if (typeof window.showToast === 'function') window.showToast('Reason noted — Alex will learn from this.');
}
window._selectOverrideReason = _selectOverrideReason;

function _closeOverrideModal() {
  const el = document.getElementById('override-reason-modal');
  if (!el) return;
  el.classList.remove('override-modal-visible');
  setTimeout(() => el.remove(), 220);
}
window._closeOverrideModal = _closeOverrideModal;

// Phase 7: the log displays only these four action types. Older entries
// (e.g. 'scout', strategy drift acknowledgements) are kept in storage but
// hidden from this view unless explicitly requested.
const FIELD_LOG_VISIBLE_ACTIONS = new Set(['tag','note','mock_saved','trade_option_saved','trade_scenario']);

// Full Activity panel
function renderFieldLogPanel() {
  const container = document.getElementById('panel-fieldlog-content');
  if (!container) return;
  const rawLog = getFieldLog();
  // Filter to the 4 visible action types; fall back to the category field
  // when actionType is missing (for older entries still in localStorage).
  const log = (rawLog || []).filter(e => {
    if (e.actionType && FIELD_LOG_VISIBLE_ACTIONS.has(e.actionType)) return true;
    return false;
  });
  const strategy = window.GMStrategy?.getStrategy ? window.GMStrategy.getStrategy() : {};
  const drift = window.GMStrategy?.getDrift ? window.GMStrategy.getDrift() : { conflicts: [] };
  const hasDrift = window.GMStrategy?.hasDrift ? window.GMStrategy.hasDrift() : false;

  let html = '';

  // ── SECTION 1: STRATEGY DRIFT ──────────────────────────────
  if (hasDrift) {
    const recentConflicts = (drift.conflicts || [])
      .filter(c => Date.now() - c.timestamp < 7 * 86400000);
    const modeLabel = _modeLabel(strategy.mode);
    html += `<div class="activity-drift-card">
      <div class="activity-drift-header">
        <span class="activity-drift-icon">⚠️</span>
        <div>
          <div class="activity-drift-title">STRATEGY DRIFT DETECTED</div>
          <div class="activity-drift-sub">You've made ${recentConflicts.length} move${recentConflicts.length !== 1 ? 's' : ''} that conflict with your ${_esc(modeLabel)} plan.</div>
        </div>
      </div>
      <div class="activity-drift-conflicts">
        ${recentConflicts.map(c => `<div class="activity-drift-item">• ${_esc(_describeConflict(c))}</div>`).join('')}
      </div>
      <div class="activity-drift-actions">
        <button class="activity-drift-btn-primary" onclick="typeof openStrategyEditor==='function'&&openStrategyEditor()">Adjust Strategy</button>
        <button class="activity-drift-btn-secondary" onclick="_clearDriftWithNote()">Stay Course</button>
      </div>
    </div>`;
  }

  // ── SECTION 2: ALEX LEARNING ──────────────────────────────
  const intel = window.GMEngine?.generateFieldIntel ? window.GMEngine.generateFieldIntel() : [];
  const tradeFreq = _getTradeFrequency(log);
  const faabStyle = _getFaabStyle(log);
  const posBias   = _getPositionBias(log);

  html += `<div class="activity-learning-section">
    <div class="activity-section-header">
      <span style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">🧠 Alex Learning</span>
      <span style="height:1px;flex:1;background:rgba(212,175,55,.15);display:inline-block"></span>
    </div>
    <div class="activity-intel-list">
      ${intel.length
        ? intel.map(obs => `<div class="activity-intel-item">
            <span class="activity-intel-icon">🧠</span>
            <span class="activity-intel-text">${_esc(obs)}</span>
          </div>`).join('')
        : `<div style="font-size:13px;color:var(--text3);padding:8px 0">Make some moves and Alex will start learning your patterns.</div>`
      }
    </div>
    <div class="activity-behavior-profile">
      <div class="activity-profile-title">Behavior Profile</div>
      <div class="activity-profile-grid">
        <div class="activity-profile-stat">
          <div class="activity-profile-label">Trading</div>
          <div class="activity-profile-value">${_esc(tradeFreq)}</div>
        </div>
        <div class="activity-profile-stat">
          <div class="activity-profile-label">FAAB</div>
          <div class="activity-profile-value">${_esc(faabStyle)}</div>
        </div>
        <div class="activity-profile-stat">
          <div class="activity-profile-label">Pos Bias</div>
          <div class="activity-profile-value">${_esc(posBias)}</div>
        </div>
      </div>
    </div>
  </div>`;

  // ── SECTION 3: ACTIVITY LOG ───────────────────────────────
  const pendingCount = log.filter(e => e.syncStatus === 'pending' || e.syncStatus === 'failed').length;
  const _syncGated = typeof canAccess === 'function'
    && !canAccess(window.FEATURES?.FIELD_LOG_SYNC || 'field_log_sync');
  const _syncFeat = window.FEATURES?.FIELD_LOG_SYNC || 'field_log_sync';

  html += `<div class="activity-log-section">
    <div class="activity-section-header">
      <span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Activity Log</span>
      <span style="height:1px;flex:1;background:var(--border);display:inline-block"></span>
    </div>`;

  if (!log.length) {
    html += `<div class="fieldlog-empty">
      <div class="fieldlog-empty-icon">📋</div>
      <div class="fieldlog-empty-text">No activity yet.<br>Trade scenarios, waiver bids, and draft targets appear here automatically.</div>
    </div>`;
  } else {
    // Group by smart day label
    const groupOrder = [];
    const groupMap = {};
    log.forEach(e => {
      const key = _getDayKey(e.ts);
      if (!groupMap[key]) { groupMap[key] = []; groupOrder.push(key); }
      groupMap[key].push(e);
    });

    html += groupOrder.map(dayKey => {
      const entries = groupMap[dayKey];
      return `<div style="margin-bottom:16px">
        <div class="activity-date-header">${_esc(dayKey)}</div>
        ${entries.map(e => {
          const timeStr = new Date(e.ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
          const syncDot = e.syncStatus === 'synced'
            ? `<span title="Synced" style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0"></span>`
            : e.syncStatus === 'failed'
            ? `<span title="Sync failed" style="width:6px;height:6px;border-radius:50%;background:#E74C3C;display:inline-block;flex-shrink:0"></span>`
            : `<span title="Pending sync" style="width:6px;height:6px;border-radius:50%;background:var(--text3);display:inline-block;flex-shrink:0"></span>`;
          const catLabel = FL_CATEGORY_LABELS[e.category] || e.category;
          const alignment = _getEntryAlignment(e);
          const alignBadge = alignment
            ? `<span class="activity-align-badge activity-align-${alignment.type}">${alignment.label}</span>`
            : '';
          const playersHtml = e.players?.length
            ? `<div style="font-size:11px;color:var(--accent);margin-top:2px">${e.players.map(p => _esc(p.name || p)).join(', ')}</div>`
            : '';
          const overrideHtml = e.overrideReason
            ? `<div class="activity-override-reason">"${_esc(e.overrideReason)}"</div>`
            : '';
          return `<div class="fieldlog-entry">
            <div class="fieldlog-entry-icon">${e.icon}</div>
            <div class="fieldlog-entry-body">
              <div class="fieldlog-entry-title">${_esc(e.text)}</div>
              ${playersHtml}${overrideHtml}
              <div class="fieldlog-entry-meta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span>${catLabel}</span>
                <span>·</span>
                <span>${timeStr}</span>
                ${alignBadge}
                ${syncDot}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }

  // Sync footer
  const lastSyncTime = _getLastSyncTime(log);
  html += `<div class="activity-sync-footer">
    ${_syncGated
      ? `<span style="font-size:12px;color:var(--text3)">Local only — sync requires War Room Scout</span>
         <button onclick="showUpgradePrompt('${_syncFeat}')" style="padding:5px 12px;background:linear-gradient(135deg,#D4AF37,#e8cc6c);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">🔒 Unlock</button>`
      : `<span style="font-size:12px;color:var(--text3)">${pendingCount > 0 ? `${pendingCount} pending` : `Synced to War Room · ${lastSyncTime}`}</span>
         <button id="fieldlog-sync-btn" onclick="syncFieldLog()" style="padding:5px 12px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;opacity:${pendingCount > 0 ? '1' : '0.5'}">↑ Sync</button>`
    }
  </div>
  </div>`; // close activity-log-section

  container.innerHTML = html;
}
window.renderFieldLogPanel = renderFieldLogPanel;

// ════════════════════════════════════════════════════════════════
// LEAGUE PANEL
// ════════════════════════════════════════════════════════════════

// ── Exploit Targets section (GMEngine-powered) ────────────────
function _renderExploitTargets() {
  const eng = window.GMEngine;
  if (!eng) return '';
  const oppsRaw = eng.generateOpportunities();
  if (!oppsRaw.length || !oppsRaw[0].rosterId) return '';
  const ownerProfiles = window.App?.LI?.ownerProfiles || {};
  const S = window.S;

  // Re-rank by current user's top positional need so the highest-priority
  // match bubbles to the top, then slice to 2 teams.
  const assessFn = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
  const myAssess = assessFn ? assessFn(S?.myRosterId) : null;
  const myTopNeedRaw = myAssess?.needs?.[0];
  const myTopNeed = typeof myTopNeedRaw === 'string' ? myTopNeedRaw : myTopNeedRaw?.pos;

  const opps = [...oppsRaw].sort((a, b) => {
    if (!myTopNeed) return (b.exploitScore || 0) - (a.exploitScore || 0);
    const aAs = assessFn ? assessFn(a.rosterId) : null;
    const bAs = assessFn ? assessFn(b.rosterId) : null;
    const aHas = (aAs?.strengths || []).some(s => (typeof s === 'string' ? s : s?.pos) === myTopNeed) ? 1 : 0;
    const bHas = (bAs?.strengths || []).some(s => (typeof s === 'string' ? s : s?.pos) === myTopNeed) ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return (b.exploitScore || 0) - (a.exploitScore || 0);
  }).slice(0, 2);

  const teamCards = opps.map((o, i) => {
    const isTop = i === 0;
    const dna = ownerProfiles[o.rosterId]?.dna || '';
    const border = isTop ? 'rgba(212,175,55,.5)' : 'var(--border)';
    const glow = isTop ? ';box-shadow:0 0 14px rgba(212,175,55,.08)' : '';
    const roster = (S?.rosters || []).find(r => r.roster_id === o.rosterId);
    const owner = (S?.leagueUsers || []).find(u => u.user_id === roster?.owner_id);
    const avatarId = owner?.avatar;
    const initials = (o.ownerName || '?').slice(0, 2).toUpperCase();
    const avatarHtml = avatarId
      ? `<img src="https://sleepercdn.com/avatars/thumbs/${avatarId}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>`
      : `<div style="width:36px;height:36px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text3);flex-shrink:0">${initials}</div>`;
    return `<div style="padding:11px 14px;background:var(--bg2);border:1px solid ${border};border-radius:var(--r);margin-bottom:6px;display:flex;align-items:center;gap:10px${glow}">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
          ${isTop ? '<span style="font-size:9px;font-weight:700;color:var(--accent);padding:1px 5px;border:1px solid rgba(212,175,55,.4);border-radius:8px;text-transform:uppercase;letter-spacing:.04em">BEST TARGET</span>' : ''}
          <span style="font-size:14px;font-weight:700;color:var(--text)">${_esc(o.ownerName)}</span>
          ${dna ? `<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:var(--accentL);color:var(--accent);font-weight:600">${_esc(dna)}</span>` : ''}
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.4;font-weight:500">${_esc(o.insight)}</div>
        ${o.exploitScore >= 75 ? '<div style="font-size:11px;color:var(--accent);margin-top:3px;font-weight:700">Move now</div>' : o.exploitScore >= 50 ? '<div style="font-size:11px;color:var(--amber);margin-top:3px;font-weight:600">Good window</div>' : ''}
      </div>
      <button onclick="event.stopPropagation();typeof openTradeBuilder==='function'?openTradeBuilder(${o.rosterId},[],[]):fillGlobalChat(${JSON.stringify('Build me the best trade I can make with ' + o.ownerName)})" style="padding:8px 14px;font-size:12px;font-weight:700;background:var(--accentL);color:var(--accent);border:1px solid rgba(212,175,55,.3);border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">Build Trade</button>
    </div>`;
  }).join('');

  // Waiver recommendation card (reuses _getHomeWaiverRec from js/ui.js)
  let waiverCard = '';
  if (typeof window._getHomeWaiverRec === 'function') {
    const rec = window._getHomeWaiverRec();
    if (rec) {
      const wvName = typeof window.pName === 'function' ? window.pName(rec.id) : rec.id;
      const safeName = (wvName || '').replace(/'/g, "\\'");
      waiverCard = `<div style="padding:11px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:6px;display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(52,211,153,.12);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#2ECC71;flex-shrink:0">FA</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
            <span style="font-size:9px;font-weight:700;color:#2ECC71;padding:1px 5px;border:1px solid rgba(52,211,153,.4);border-radius:8px;text-transform:uppercase;letter-spacing:.04em">WAIVER</span>
            <span style="font-size:14px;font-weight:700;color:var(--text)">${_esc(wvName)}</span>
          </div>
          <div style="font-size:13px;color:var(--text2);line-height:1.4">${rec.pos} · ${(rec.val||0).toLocaleString()} DHQ — fits your ${rec.pos} need</div>
        </div>
        <button onclick="event.stopPropagation();fillGlobalChat('Help me claim ${safeName}')" style="padding:8px 14px;font-size:12px;font-weight:700;background:var(--accentL);color:var(--accent);border:1px solid rgba(212,175,55,.3);border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">Add</button>
      </div>`;
    }
  }

  return `<div style="margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;color:#F0A500;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
      OPPORTUNITIES <span style="height:1px;flex:1;background:rgba(240,165,0,.2);display:inline-block;margin-left:4px"></span>
    </div>
    ${teamCards}${waiverCard}
  </div>`;
}

// ════════════════════════════════════════════════════════════════
// PHASE 5 v2 — LEAGUE COMMAND CENTER
//
// The League tab is reorganized into a "room switcher" pattern. A slim
// hero strip sits at the top of the tab (with a back chevron when deep
// inside a room). Below it, a three-card command menu (Trades / Waivers
// / All Teams) gives the user live previews and a single clear entry
// point. Tapping a card slides the menu away and slides in one of three
// rooms. Everything under the League tab lives in exactly one room.
// ════════════════════════════════════════════════════════════════

let _leagueRoom = null; // null | 'trades' | 'waivers' | 'teams'

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

  // Compose the full command-center shell. Individual rooms are lazy-rendered
  // on first entry so we don't pay the cost upfront.
  const heroHtml = _renderLeagueHero();
  const menuHtml = _renderLeagueCommandMenu();

  container.innerHTML = `
    ${heroHtml}
    <div class="league-rooms-menu" id="league-rooms-menu">
      ${menuHtml}
    </div>
    <div class="league-room" id="league-room-trades" data-room="trades" style="display:none"></div>
    <div class="league-room" id="league-room-waivers" data-room="waivers" style="display:none"></div>
    <div class="league-room" id="league-room-teams" data-room="teams" style="display:none"></div>
  `;

  // Restore last room if persisted
  const restore = sessionStorage.getItem('scout_league_room');
  if (restore === 'trades' || restore === 'waivers' || restore === 'teams') {
    _leagueEnterRoom(restore);
  }
}
window.renderLeaguePanel = renderLeaguePanel;

// ── Hero strip — team name, DNA, phase, back chevron ──────────
function _renderLeagueHero() {
  const S = window.S;
  const myR_ = (S.rosters || []).find(r => r.roster_id === S.myRosterId);
  const owner = (S.leagueUsers || []).find(u => u.user_id === myR_?.owner_id);
  const league = (S.leagues || [])[0] || {};
  const leagueName = league.name || 'League';
  const season = league.season || '';
  const teamName = owner?.metadata?.team_name || owner?.display_name || 'Your Team';
  const avatarId = owner?.avatar;
  const avatarHtml = avatarId
    ? `<img src="https://sleepercdn.com/avatars/thumbs/${avatarId}" class="league-hero-avatar" onerror="this.style.display='none'"/>`
    : `<div class="league-hero-avatar" style="display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text3);background:var(--bg4)">${_esc((teamName[0] || '?').toUpperCase())}</div>`;

  const w = myR_?.settings?.wins || 0;
  const l = myR_?.settings?.losses || 0;
  const t = myR_?.settings?.ties || 0;
  const recordStr = t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;

  const assess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(S.myRosterId) : null;
  const health = assess?.healthScore ? 'Health ' + Math.round(assess.healthScore) : '';
  const dna = (window.App?.LI?.ownerProfiles || {})[S.myRosterId]?.dna || '';
  const phaseInfo = window.SeasonCalendar?.describe ? window.SeasonCalendar.describe() : null;
  const phaseLabel = phaseInfo?.label || '';

  const metaParts = [dna, health, phaseLabel].filter(Boolean);

  return `
    <div class="league-hero">
      <button class="league-hero-back" id="league-hero-back" style="display:none" onclick="_leagueExitRoom()" aria-label="Back">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      ${avatarHtml}
      <div class="league-hero-body">
        <div class="league-hero-title">${_esc(teamName)} · ${_esc(leagueName)}${season ? ' · ' + _esc(season) : ''}</div>
        <div class="league-hero-meta">${metaParts.length ? _esc(metaParts.join(' · ')) : 'Connect to see details'}</div>
      </div>
      <div class="league-hero-record">${_esc(recordStr)}</div>
    </div>
  `;
}

// ── Three-card command menu ──────────────────────────────────
function _renderLeagueCommandMenu() {
  const S = window.S;
  const cards = [];

  // Card 1 — Trades
  const tradesPreview = _leagueTradesPreview();
  cards.push(`
    <button class="league-command-card" onclick="_leagueEnterRoom('trades')">
      <div class="lcc-icon">🤝</div>
      <div class="lcc-body">
        <div class="lcc-title">Trades</div>
        <div class="lcc-preview">${_esc(tradesPreview.preview)}</div>
        <div class="lcc-detail">${_esc(tradesPreview.detail)}</div>
      </div>
      <div class="lcc-chev">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </button>
  `);

  // Card 2 — Waivers
  const waiversPreview = _leagueWaiversPreview();
  cards.push(`
    <button class="league-command-card" onclick="_leagueEnterRoom('waivers')">
      <div class="lcc-icon">💰</div>
      <div class="lcc-body">
        <div class="lcc-title">Waivers</div>
        <div class="lcc-preview">${_esc(waiversPreview.preview)}</div>
        <div class="lcc-detail">${_esc(waiversPreview.detail)}</div>
      </div>
      <div class="lcc-chev">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </button>
  `);

  // Card 3 — All Teams
  const teamsPreview = _leagueTeamsPreview();
  cards.push(`
    <button class="league-command-card" onclick="_leagueEnterRoom('teams')">
      <div class="lcc-icon">🏈</div>
      <div class="lcc-body">
        <div class="lcc-title">All Teams</div>
        <div class="lcc-preview">${_esc(teamsPreview.preview)}</div>
        <div class="lcc-detail">${_esc(teamsPreview.detail)}</div>
      </div>
      <div class="lcc-chev">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </button>
  `);

  return cards.join('');
}

// ── Command-card preview helpers (compute short live stats) ──
function _leagueTradesPreview() {
  const S = window.S;
  const partners = _leagueGetPartners();
  if (!partners.length) return { preview: 'Connect a league to see trade partners', detail: '' };
  const top = partners[0];
  const ownerName = top.assessment?.ownerName || 'Team';
  const compat = Math.round(top.compatibility || 0);
  return {
    preview: `${partners.length} partner${partners.length === 1 ? '' : 's'} matched for your needs`,
    detail: `Best fit: ${ownerName} · ${compat}% compat`,
  };
}

function _leagueWaiversPreview() {
  const S = window.S;
  const faab = (typeof window.getFAAB === 'function') ? window.getFAAB() : null;
  const slots = (typeof window.getRosterSlots === 'function') ? window.getRosterSlots() : null;
  const budgetStr = faab?.budget > 0 ? `$${faab.remaining} FAAB` : 'Priority #' + (S.rosters?.find(r => r.roster_id === S.myRosterId)?.settings?.waiver_position || '?');
  const slotsStr = slots?.openBench != null ? `${slots.openBench} open spot${slots.openBench === 1 ? '' : 's'}` : '';
  return {
    preview: [budgetStr, slotsStr].filter(Boolean).join(' · '),
    detail: 'Top 5 targets ranked by fit + value',
  };
}

function _leagueTeamsPreview() {
  const S = window.S;
  const n = S.rosters?.length || 0;
  const assessFn = typeof window.assessAllTeamsFromGlobal === 'function' ? window.assessAllTeamsFromGlobal : null;
  if (!assessFn) return { preview: `${n} teams`, detail: 'Connect for tier breakdown' };
  const all = assessFn() || [];
  const contenders = all.filter(a => (a.tier || '').toUpperCase() === 'CONTENDER' || (a.tier || '').toUpperCase() === 'ELITE').length;
  const rebuilding = all.filter(a => (a.tier || '').toUpperCase() === 'REBUILDING').length;
  // Most active trader from LI.tradeHistory
  const history = window.App?.LI?.tradeHistory || [];
  const tradeCounts = {};
  history.forEach(t => (t.roster_ids || []).forEach(rid => { tradeCounts[rid] = (tradeCounts[rid] || 0) + 1; }));
  const topTraderRid = Object.entries(tradeCounts).sort((a, b) => b[1] - a[1])[0];
  let activeDetail = '';
  if (topTraderRid) {
    const r = (S.rosters || []).find(x => String(x.roster_id) === String(topTraderRid[0]));
    const owner = r ? (S.leagueUsers || []).find(u => u.user_id === r.owner_id) : null;
    const name = owner?.metadata?.team_name || owner?.display_name || 'Unknown';
    activeDetail = `Most active trader: ${name} · ${topTraderRid[1]} trade${topTraderRid[1] === 1 ? '' : 's'}`;
  }
  return {
    preview: `${n} teams · ${contenders} contender${contenders === 1 ? '' : 's'} · ${rebuilding} rebuilding`,
    detail: activeDetail || 'Tap to scout any team',
  };
}

// Shared helper — computes top 3 partners, cached per render
function _leagueGetPartners() {
  const S = window.S;
  if (!S?.rosters?.length || !S?.myRosterId) return [];
  let myAssess = window._tcMyAssessment;
  let allAssess = window._tcAssessments;
  if ((!myAssess || !allAssess || !allAssess.length) && typeof window.assessAllTeamsFromGlobal === 'function') {
    allAssess = window.assessAllTeamsFromGlobal();
    myAssess = (allAssess || []).find(a => a.rosterId === S.myRosterId);
    window._tcAssessments = allAssess;
    window._tcMyAssessment = myAssess;
  }
  if (!myAssess || !allAssess?.length) return [];
  return typeof window.findBestPartners === 'function'
    ? window.findBestPartners(myAssess, allAssess).slice(0, 3)
    : [];
}

// ── Room switching ────────────────────────────────────────────
function _leagueEnterRoom(room) {
  _leagueRoom = room;
  try { sessionStorage.setItem('scout_league_room', room); } catch (e) {}
  const menu = document.getElementById('league-rooms-menu');
  const target = document.getElementById('league-room-' + room);
  const back = document.getElementById('league-hero-back');
  if (!menu || !target) return;

  // Render the room body on every entry (fast — these are just DOM inserts)
  if (room === 'trades')  _renderLeagueRoomTrades(target);
  if (room === 'waivers') _renderLeagueRoomWaivers(target);
  if (room === 'teams')   _renderLeagueRoomTeams(target);

  menu.classList.add('hiding');
  setTimeout(() => { menu.style.display = 'none'; }, 180);
  target.style.display = '';
  // Force layout, then add .active for the slide-in animation
  requestAnimationFrame(() => target.classList.add('active'));
  if (back) back.style.display = '';
}
window._leagueEnterRoom = _leagueEnterRoom;

function _leagueExitRoom() {
  const current = _leagueRoom;
  _leagueRoom = null;
  try { sessionStorage.removeItem('scout_league_room'); } catch (e) {}
  if (current) {
    const target = document.getElementById('league-room-' + current);
    if (target) {
      target.classList.remove('active');
      setTimeout(() => { target.style.display = 'none'; }, 200);
    }
  }
  const menu = document.getElementById('league-rooms-menu');
  if (menu) {
    menu.classList.remove('hiding');
    menu.style.display = '';
  }
  const back = document.getElementById('league-hero-back');
  if (back) back.style.display = 'none';
}
window._leagueExitRoom = _leagueExitRoom;

// ── Trades room ────────────────────────────────────────────────
function _renderLeagueRoomTrades(host) {
  const S = window.S;
  if (!host || !S?.rosters?.length) { if (host) host.innerHTML = ''; return; }
  const partners = _leagueGetPartners();
  const ownerProfiles = window.App?.LI?.ownerProfiles || {};

  let html = `<div class="league-room-header">
    <div class="league-room-title">Trades · ${partners.length} partner${partners.length === 1 ? '' : 's'}</div>
    <button class="league-room-action" onclick="event.stopPropagation();typeof openTradeBuilder==='function'?openTradeBuilder(null,[],[]):fillGlobalChat('Help me build a trade')">+ Build from scratch</button>
  </div>`;

  if (!partners.length) {
    html += '<div style="padding:20px;color:var(--text3);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);text-align:center">No partners identified yet. Give the engine a moment to analyze rosters.</div>';
    host.innerHTML = html;
    return;
  }

  // Hero partner card (big, gold-accented)
  const top = partners[0];
  const topA = top.assessment;
  const topRid = topA.rosterId;
  const topOwner = (S.leagueUsers || []).find(u => u.user_id === S.rosters.find(r => r.roster_id === topRid)?.owner_id);
  const topAvatarId = topOwner?.avatar;
  const topAvatar = topAvatarId
    ? `<img src="https://sleepercdn.com/avatars/thumbs/${topAvatarId}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>`
    : `<div style="width:52px;height:52px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--text3);flex-shrink:0">${_esc((topA.ownerName || '?').slice(0, 2).toUpperCase())}</div>`;
  const topDna = ownerProfiles[topRid]?.dna || '';
  const topCompat = Math.round(top.compatibility || 0);
  const topTheyProvide = (top.theyProvide || []).join(', ');
  const topIProvide = (top.iProvide || []).join(', ');
  const topWhy = topTheyProvide && topIProvide
    ? `They have ${topTheyProvide}, need your ${topIProvide}`
    : topTheyProvide
    ? `Has ${topTheyProvide} depth you need`
    : topIProvide
    ? `Needs ${topIProvide} — you have the supply`
    : 'Roster fit for a 2-for-2 swap';

  html += `<div style="padding:16px;background:rgba(212,175,55,.06);border:2px solid rgba(212,175,55,.5);border-radius:var(--rl);margin-bottom:12px;box-shadow:0 4px 20px rgba(212,175,55,.12)">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      ${topAvatar}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:10px;font-weight:700;color:var(--accent);padding:2px 6px;border:1px solid rgba(212,175,55,.4);border-radius:8px;text-transform:uppercase;letter-spacing:.04em">BEST FIT</span>
          ${topDna ? `<span style="font-size:11px;padding:2px 6px;border-radius:8px;background:var(--accentL);color:var(--accent);font-weight:600">${_esc(topDna)}</span>` : ''}
          <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace">${topCompat}% compat</span>
        </div>
        <div style="font-size:17px;font-weight:800;color:var(--text);letter-spacing:-.02em">${_esc(topA.ownerName || 'Team ' + topRid)}</div>
      </div>
    </div>
    <div style="font-size:14px;color:var(--text2);line-height:1.5;margin-bottom:12px">${_esc(topWhy)}</div>
    <button onclick="typeof openTradeBuilder==='function'?openTradeBuilder(${topRid},[],[]):fillGlobalChat('Build a trade with ${_esc(topA.ownerName || '').replace(/'/g, "\\'")}')" style="width:100%;padding:12px;font-size:14px;font-weight:800;background:linear-gradient(135deg,var(--accent),#e8cc6c);color:var(--bg1);border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 2px 10px rgba(212,175,55,.3)">Build Trade with ${_esc(topA.ownerName || 'Them')}</button>
  </div>`;

  // Secondary partners (compact)
  partners.slice(1).forEach(part => {
    const a = part.assessment;
    const rid = a.rosterId;
    const owner = (S.leagueUsers || []).find(u => u.user_id === S.rosters.find(r => r.roster_id === rid)?.owner_id);
    const avatarId = owner?.avatar;
    const avatarHtml = avatarId
      ? `<img src="https://sleepercdn.com/avatars/thumbs/${avatarId}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>`
      : `<div style="width:36px;height:36px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text3);flex-shrink:0">${_esc((a.ownerName || '?').slice(0, 2).toUpperCase())}</div>`;
    const dna = ownerProfiles[rid]?.dna || '';
    const compatPct = Math.round(part.compatibility || 0);
    const theyProvide = (part.theyProvide || []).join(', ');
    const iProvide = (part.iProvide || []).join(', ');
    const why = theyProvide && iProvide
      ? `They have ${theyProvide}, need your ${iProvide}`
      : theyProvide
      ? `Has ${theyProvide} depth you need`
      : iProvide
      ? `Needs ${iProvide} — you have the supply`
      : 'Roster fit for a swap';
    html += `<div style="padding:11px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:6px;display:flex;align-items:center;gap:10px">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
          <span style="font-size:14px;font-weight:700;color:var(--text)">${_esc(a.ownerName || 'Team ' + rid)}</span>
          ${dna ? `<span style="font-size:10px;padding:1px 5px;border-radius:8px;background:var(--accentL);color:var(--accent);font-weight:600">${_esc(dna)}</span>` : ''}
          <span style="font-size:10px;color:var(--text3);font-family:'JetBrains Mono',monospace">${compatPct}%</span>
        </div>
        <div style="font-size:12px;color:var(--text2);line-height:1.4">${_esc(why)}</div>
      </div>
      <button onclick="typeof openTradeBuilder==='function'?openTradeBuilder(${rid},[],[]):fillGlobalChat('Build a trade with ${_esc(a.ownerName || '').replace(/'/g, "\\'")}')" style="padding:8px 14px;font-size:12px;font-weight:700;background:var(--accentL);color:var(--accent);border:1px solid rgba(212,175,55,.3);border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">Build</button>
    </div>`;
  });

  // Trade Finder inline expand
  html += `<div style="margin-top:16px">
    <button onclick="_openTradeFinder()" style="width:100%;padding:12px;font-size:13px;font-weight:700;background:var(--bg2);color:var(--accent);border:1px dashed rgba(212,175,55,.4);border-radius:10px;cursor:pointer;font-family:inherit">🔍 Launch Trade Finder</button>
    <div id="league-trade-finder-host" style="margin-top:12px"></div>
  </div>`;

  host.innerHTML = html;
}

// Trade Finder inline expand (reuses renderTradeFinder from trade-calc.js)
function _openTradeFinder() {
  const finderHost = document.getElementById('league-trade-finder-host');
  if (!finderHost) return;
  if (finderHost.innerHTML.trim()) { finderHost.innerHTML = ''; return; }
  if (!window._tcAssessments?.length && typeof window.assessAllTeamsFromGlobal === 'function') {
    window._tcAssessments = window.assessAllTeamsFromGlobal();
    window._tcMyAssessment = (window._tcAssessments || []).find(a => a.rosterId === window.S?.myRosterId);
  }
  if (typeof window.renderTradeFinder === 'function') {
    try { window.renderTradeFinder(finderHost); } catch (e) { console.warn('[scout] renderTradeFinder failed:', e); }
  }
}
window._openTradeFinder = _openTradeFinder;

// ── Waivers room ───────────────────────────────────────────────
function _renderLeagueRoomWaivers(host) {
  if (!host) return;
  const S = window.S;
  const faab = typeof window.getFAAB === 'function' ? window.getFAAB() : null;
  const budgetStr = faab?.budget > 0 ? `$${faab.remaining} FAAB` : 'Priority #' + (S.rosters?.find(r => r.roster_id === S.myRosterId)?.settings?.waiver_position || '?');

  // Inject the waivers host. The existing #panel-waivers in the DOM is moved
  // here on first render so renderWaivers can keep finding its faab-bar +
  // waiver-alex-top5 IDs unchanged.
  host.innerHTML = `<div class="league-room-header">
    <div class="league-room-title">Waivers · ${_esc(budgetStr)}</div>
  </div>
  <div id="league-waivers-mount"></div>`;

  const mount = document.getElementById('league-waivers-mount');
  const waiversPanel = document.getElementById('panel-waivers');
  if (mount && waiversPanel && waiversPanel.children.length) {
    while (waiversPanel.firstChild) mount.appendChild(waiversPanel.firstChild);
  }
  if (typeof window.renderWaivers === 'function') {
    try { window.renderWaivers(); } catch (e) { console.warn('[scout] renderWaivers failed:', e); }
  }
}

// ── All Teams room ─────────────────────────────────────────────
function _renderLeagueRoomTeams(host) {
  if (!host) return;
  const S = window.S;
  const myId = S.myRosterId;
  const assessFn = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
  const ownerProfiles = window.App?.LI?.ownerProfiles || {};

  const enriched = (S.rosters || []).map(roster => {
    const owner = (S.leagueUsers || []).find(u => u.user_id === roster.owner_id);
    const assess = assessFn ? assessFn(roster.roster_id) : null;
    const dna = ownerProfiles[roster.roster_id];
    return { roster, owner, assess, dna };
  });

  // Sort: me last, then by health score desc
  enriched.sort((a, b) => {
    if (a.roster.roster_id === myId) return 1;
    if (b.roster.roster_id === myId) return -1;
    const ha = a.assess?.healthScore || 0;
    const hb = b.assess?.healthScore || 0;
    if (hb !== ha) return hb - ha;
    return (b.roster.settings?.wins || 0) - (a.roster.settings?.wins || 0);
  });

  const hasDivisions = enriched.some(t => t.roster?.settings?.division > 0);
  const isLarge = enriched.length > 24;

  let html = `<div class="league-room-header">
    <div class="league-room-title">All Teams · ${enriched.length}</div>
    ${isLarge ? '<button class="league-room-action" onclick="_leagueToggleTeamsSearch()">🔍 Search</button>' : ''}
  </div>
  ${isLarge ? '<div id="league-teams-search" style="display:none;margin-bottom:10px"><input type="text" placeholder="Search teams..." oninput="_leagueTeamsFilter(this.value)" style="width:100%;padding:10px 14px;font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:inherit;outline:none"></div>' : ''}`;

  if (hasDivisions) {
    const divGroups = {};
    enriched.forEach(item => {
      const divNum = item.roster?.settings?.division || 0;
      if (!divGroups[divNum]) divGroups[divNum] = [];
      divGroups[divNum].push(item);
    });
    const divKeys = Object.keys(divGroups).sort((a, b) => Number(a) - Number(b));
    const leagueMeta = (S.leagues && S.leagues[0]?.metadata) || {};
    divKeys.forEach(divNum => {
      const divName = leagueMeta['division_' + divNum] || leagueMeta['division_' + divNum + '_name'] || ('Division ' + divNum);
      html += `<div style="font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:14px 0 6px;border-bottom:1px solid rgba(212,175,55,0.15);margin-top:8px">${_esc(divName)}</div>`;
      html += '<div class="league-teams-grid">';
      divGroups[divNum].forEach((item, idx) => {
        html += _buildLeagueTeamCardMini(item, idx, myId);
      });
      html += '</div>';
    });
  } else {
    html += '<div class="league-teams-grid">';
    enriched.forEach((item, idx) => {
      html += _buildLeagueTeamCardMini(item, idx, myId);
    });
    html += '</div>';
  }

  // Team dossier slot — populated when a mini card is tapped
  html += '<div id="league-team-dossier" style="margin-top:14px"></div>';

  host.innerHTML = html;
}

// ── Mini team card for the All Teams grid ─────────────────────
function _buildLeagueTeamCardMini({ roster, owner, assess, dna }, idx, myId) {
  const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${idx + 1}`;
  const w = roster.settings?.wins || 0;
  const l = roster.settings?.losses || 0;
  const t = roster.settings?.ties || 0;
  const isMe = roster.roster_id === myId;
  const recordStr = t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;

  const tier = (assess?.tier || '').toUpperCase();
  const hs = assess?.healthScore || 0;
  const tierCol = tier === 'ELITE' ? 'var(--green)'
    : tier === 'CONTENDER' ? 'var(--accent)'
    : tier === 'CROSSROADS' ? 'var(--amber)'
    : tier === 'REBUILDING' ? 'var(--red)'
    : 'var(--text3)';
  const needs = (assess?.needs || []).slice(0, 2).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean);

  const avatarId = owner?.avatar;
  const avatarHtml = avatarId
    ? `<img src="https://sleepercdn.com/avatars/thumbs/${avatarId}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>`
    : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text3);flex-shrink:0">${_esc((teamName[0] || '?').toUpperCase())}</div>`;

  const rid = roster.roster_id;
  return `<button class="league-team-card-mini${isMe ? ' league-team-card-me' : ''}" data-team-name="${_esc(teamName)}" onclick="_leagueOpenTeamDossier(${rid})">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      ${avatarHtml}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(teamName)}${isMe ? ' <span style="color:var(--accent);font-size:10px">YOU</span>' : ''}</div>
        <div style="font-size:11px;color:var(--text3)">${recordStr}${hs ? ' · <span style="color:' + tierCol + ';font-weight:700">' + hs + '</span>' : ''}</div>
      </div>
    </div>
    ${needs.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap">${needs.map(p => `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:var(--bg4);color:var(--text3)">${_esc(p)}</span>`).join('')}</div>` : ''}
  </button>`;
}

// Open a full dossier view for a team (uses the existing _buildLeagueCard body)
function _leagueOpenTeamDossier(rosterId) {
  const S = window.S;
  const roster = (S.rosters || []).find(r => r.roster_id === rosterId);
  if (!roster) return;
  const owner = (S.leagueUsers || []).find(u => u.user_id === roster.owner_id);
  const assess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(rosterId) : null;
  const dna = (window.App?.LI?.ownerProfiles || {})[rosterId];
  const host = document.getElementById('league-team-dossier');
  if (!host) return;
  // Scroll the dossier into view after render
  const wrapper = _buildLeagueCard({ roster, owner, assess, dna }, 0, S.myRosterId);
  host.innerHTML = `<div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(212,175,55,.2)">
    <div style="font-size:11px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Team dossier</div>
    ${wrapper}
  </div>`;
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Auto-expand the dossier
  setTimeout(() => {
    if (typeof window.toggleLeagueDossier === 'function') window.toggleLeagueDossier(rosterId);
  }, 200);
}
window._leagueOpenTeamDossier = _leagueOpenTeamDossier;

// Toggle search input in the teams room
function _leagueToggleTeamsSearch() {
  const el = document.getElementById('league-teams-search');
  if (!el) return;
  el.style.display = el.style.display === 'none' ? '' : 'none';
  if (el.style.display === '') {
    const inp = el.querySelector('input');
    if (inp) inp.focus();
  }
}
window._leagueToggleTeamsSearch = _leagueToggleTeamsSearch;

function _leagueTeamsFilter(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('.league-team-card-mini').forEach(card => {
    const name = (card.dataset.teamName || '').toLowerCase();
    card.style.display = !q || name.includes(q) ? '' : 'none';
  });
}
window._leagueTeamsFilter = _leagueTeamsFilter;

function _buildLeagueCard({ roster, owner, assess, dna }, idx, myId) {
    const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${idx + 1}`;
    const w = roster.settings?.wins || 0;
    const l = roster.settings?.losses || 0;
    const t = roster.settings?.ties || 0;
    const isMe = roster.roster_id === myId;

    // Tier + health
    const tier = (assess?.tier || '').toUpperCase();
    const hs = assess?.healthScore || 0;
    const tierCol = tier === 'ELITE' ? 'var(--green)' : tier === 'CONTENDER' ? 'var(--accent)' : tier === 'CROSSROADS' ? 'var(--amber)' : tier === 'REBUILDING' ? 'var(--red)' : 'var(--text3)';

    // Owner DNA
    const dnaLabel = dna?.dna || '';
    const needs = (assess?.needs || []).slice(0, 2).map(n => typeof n === 'string' ? n : n.pos).join(', ');

    // Build top players for this roster — show up to 8, sorted by DHQ (show all if no DHQ data)
    // Strategy target positions for alignment highlights
    const _strat = window.GMStrategy?.getStrategy ? window.GMStrategy.getStrategy() : {};
    const _stratTargetPos = _strat.targetPositions || [];

    const rosterPlayers = (roster.players || [])
      .map(pid => ({ pid, name: window.pName?.(pid) || pid, val: window.App?.LI?.playerScores?.[pid] || 0, pos: window.pPos?.(pid) || '?' }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 8);
    const strengthList = (assess?.strengths || []).slice(0, 2).map(s => typeof s === 'string' ? s : s.pos).join(', ');

    // Portfolio value (total DHQ)
    const portfolioVal = (roster.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);

    // Trade compatibility — does this team need what I have / have what I need?
    const _assessFn = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
    const myAssess = myId ? (_assessFn ? _assessFn(myId) : null) : null;
    const myNeeds = (myAssess?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);
    const myStrengths = (myAssess?.strengths || []).slice(0, 3).map(s => typeof s === 'string' ? s : s.pos);
    const theirStrengths = (assess?.strengths || []).slice(0, 3).map(s => typeof s === 'string' ? s : s.pos);
    const theirNeeds = (assess?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);
    const iCanGet = myNeeds.filter(pos => theirStrengths.includes(pos));
    const theyWant = theirNeeds.filter(pos => myStrengths.includes(pos));
    const tradeMatch = !isMe && (iCanGet.length > 0 || theyWant.length > 0);

    // Owner avatar
    const avatarId = owner?.avatar;
    const avatarHtml = avatarId
      ? `<img src="https://sleepercdn.com/avatars/thumbs/${avatarId}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'"/>`
      : `<div style="width:28px;height:28px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text3);flex-shrink:0">${_esc((teamName[0] || '?').toUpperCase())}</div>`;

    const prompt = `Give me a full scouting report on ${teamName}. Include their roster strengths, weaknesses, trade tendencies, and how I can exploit them.`;
    const rid = roster.roster_id;
    return `<div class="league-card-wrap" id="lc-${rid}">
    <div class="league-card${isMe ? ' league-card-me' : ''}" onclick="toggleLeagueDossier('${rid}')">
      ${avatarHtml}
      <div class="league-card-body">
        <div class="league-card-name">${_esc(teamName)}${isMe ? ' <span style="color:var(--accent);font-size:11px;font-weight:700">YOU</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
          <span class="league-card-meta">${w}-${l}${t > 0 ? '-' + t : ''}</span>
          ${hs ? `<span style="font-size:11px;font-weight:700;color:${tierCol};font-family:'JetBrains Mono',monospace">${hs}</span>` : ''}
          ${tier ? `<span style="font-size:10px;font-weight:700;color:${tierCol};text-transform:uppercase;letter-spacing:.04em">${tier}</span>` : ''}
          ${portfolioVal > 0 ? `<span style="font-size:10px;color:var(--text3);font-family:'JetBrains Mono',monospace">${Math.round(portfolioVal/1000)}k</span>` : ''}
          ${tradeMatch ? `<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(212,175,55,.15);color:var(--accent);font-weight:700">Trade Match</span>` : ''}
        </div>
        ${dnaLabel || needs ? `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          ${dnaLabel ? `<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:var(--accentL);color:var(--accent);font-weight:600">${_esc(dnaLabel)}</span>` : ''}
          ${needs ? `<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:var(--bg4);color:var(--text3)">Needs: ${_esc(needs)}</span>` : ''}
        </div>` : ''}
        ${(() => {
          const badges = [];
          // Window badge (CONTENDING/REBUILDING/TRANSITIONING)
          const window_ = (assess?.window || '').toUpperCase();
          if (window_ && window_ !== tier) {
            const winCol = window_ === 'CONTENDING' ? 'var(--green)' : window_ === 'REBUILDING' ? 'var(--red)' : 'var(--amber)';
            badges.push('<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:' + winCol + ';color:#fff;font-weight:700;letter-spacing:.03em;opacity:.85">' + window_ + '</span>');
          }
          // Active Trader badge
          const tradeCount = (window.App?.LI?.tradeHistory || []).filter(t => (t.roster_ids || []).includes(roster.roster_id)).length;
          if (tradeCount >= 3) {
            badges.push('<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(212,175,55,.15);color:#d4af37;font-weight:700">Active Trader</span>');
          }
          // Panic/Desperate badge
          if ((assess?.panic || 0) >= 3) {
            badges.push('<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(231,76,60,.15);color:var(--red);font-weight:700">Selling</span>');
          }
          // Top 2 strengths badges
          const strengths = (assess?.strengths || []).slice(0, 2);
          strengths.forEach(s => {
            const posLabel = typeof s === 'string' ? s : s.pos;
            if (posLabel) badges.push('<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(52,211,153,.15);color:var(--green);font-weight:600">' + _esc(posLabel) + '</span>');
          });
          return badges.length ? '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">' + badges.join('') + '</div>' : '';
        })()}
      </div>
      ${!isMe ? `<button onclick="event.stopPropagation();openTradeBuilder(${rid})" style="font-size:11px;font-weight:700;color:var(--accent);background:var(--accentL);border:1px solid rgba(212,175,55,.25);border-radius:8px;padding:4px 10px;cursor:pointer;font-family:inherit;flex-shrink:0;white-space:nowrap">Build Trade</button>` : ''}
      <div class="league-card-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>
    <div class="league-dossier" id="dossier-${rid}" style="display:none;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:0 0 var(--r) var(--r);margin-top:-7px;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">SCOUTING REPORT</div>
      ${rosterPlayers.length ? `<div style="margin-bottom:8px">${rosterPlayers.map(p => {
        const isTarget = !isMe && _stratTargetPos.includes(p.pos);
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:12px;border-radius:6px;transition:background .15s${isTarget ? ';background:rgba(212,175,55,.06)' : ''}" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background='${isTarget ? 'rgba(212,175,55,.06)' : 'transparent'}'">
          <span onclick="event.stopPropagation();openPlayerModal('${p.pid}')" style="color:var(--text);font-weight:600;flex:1;cursor:pointer">${_esc(p.name)}</span>
          <span style="color:var(--accent);font-size:10px;font-weight:700">${p.pos}</span>
          ${isTarget ? '<span style="font-size:9px;font-weight:700;color:var(--accent);padding:1px 4px;border:1px solid rgba(212,175,55,.4);border-radius:6px;letter-spacing:.03em">TARGET</span>' : ''}
          <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;font-size:11px">${p.val > 0 ? p.val.toLocaleString() : '—'}</span>
          ${!isMe ? `<button onclick="event.stopPropagation();openTradeBuilderForOpponentPlayer('${p.pid}','${rid}')" style="font-size:10px;font-weight:700;color:var(--accent);background:var(--accentL);border:none;border-radius:5px;padding:2px 6px;cursor:pointer;font-family:inherit;flex-shrink:0">Trade</button>` : ''}
        </div>`;
      }).join('')}</div>` : ''}
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
        ${strengthList ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(52,211,153,.1);color:var(--green)">Strong: ${_esc(strengthList)}</span>` : ''}
        ${needs ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:rgba(248,113,113,.1);color:var(--red)">Weak: ${_esc(needs)}</span>` : ''}
        ${portfolioVal > 0 ? `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:var(--bg4);color:var(--text3)">Portfolio: ${portfolioVal.toLocaleString()} DHQ</span>` : ''}
      </div>
      ${tradeMatch ? `<div style="padding:6px 8px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.15);border-radius:8px;margin-bottom:8px;font-size:12px;line-height:1.5">
        ${iCanGet.length ? `<div style="color:var(--green)">They have <strong>${iCanGet.join(', ')}</strong> you need</div>` : ''}
        ${theyWant.length ? `<div style="color:var(--accent)">They need <strong>${theyWant.join(', ')}</strong> you can trade</div>` : ''}
      </div>` : ''}
      <button onclick="event.stopPropagation();fillGlobalChat(${JSON.stringify(prompt).replace(/'/g, "\\'")})" style="width:100%;padding:8px;font-size:12px;font-weight:600;background:var(--accentL);color:var(--accent);border:1px solid rgba(212,175,55,.2);border-radius:8px;cursor:pointer;font-family:inherit">Ask Scout about ${_esc(teamName)}</button>
    </div>
    </div>`;
}
window.renderLeaguePanel = renderLeaguePanel;

function toggleLeagueDossier(rid) {
  const el = document.getElementById('dossier-' + rid);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  // Close all others
  document.querySelectorAll('.league-dossier').forEach(d => d.style.display = 'none');
  if (!isOpen) el.style.display = '';
}
window.toggleLeagueDossier = toggleLeagueDossier;

function filterLeagueCards(query) {
  const wraps = document.querySelectorAll('.league-card-wrap');
  const q = (query || '').toLowerCase();
  wraps.forEach(wrap => {
    const name = (wrap.querySelector('.league-card-name')?.textContent || '').toLowerCase();
    wrap.style.display = !q || name.includes(q) ? '' : 'none';
  });
}
window.filterLeagueCards = filterLeagueCards;

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
    // Wait for BOTH S.user and a resolved roster before downgrading to the
    // slow 15s retry. S.user can be set several seconds before S.myRosterId
    // populates; calling _onLeagueReady too early leaves the team bar stuck
    // on "Loading your team…" until the 15s tick.
    if (window.S?.user && typeof myR === 'function' && myR()) _onLeagueReady();
  }, 500);
  // Safety cutoff after 60s
  setTimeout(() => clearInterval(_teamBarInterval), 60000);
});
