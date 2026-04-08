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

  const myRoster = typeof myR === 'function' ? myR() : null;
  if (!myRoster) return;

  const nameEl  = document.getElementById('tbar-name');
  const recEl   = document.getElementById('tbar-record');
  const rankEl  = document.getElementById('tbar-rank');

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
          <span class="tbar-ppg">${ppg}</span>
          <span class="tbar-dhq">${dhqStr}</span>
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

  // Item 3: Draft capital
  if (items.length < 3) {
    const picks = myRoster.draft_picks || [];
    const futureCapital = picks.length;
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

  // Sort by health score if available, otherwise by wins
  const assessFn = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
  const ownerProfiles = window.App?.LI?.ownerProfiles || {};

  const enriched = S.rosters.map(roster => {
    const owner = (S.leagueUsers || []).find(u => u.user_id === roster.owner_id);
    const assess = assessFn ? assessFn(roster.roster_id) : null;
    const dna = ownerProfiles[roster.roster_id];
    return { roster, owner, assess, dna };
  });

  enriched.sort((a, b) => {
    const ha = a.assess?.healthScore || 0;
    const hb = b.assess?.healthScore || 0;
    if (hb !== ha) return hb - ha;
    return (b.roster.settings?.wins || 0) - (a.roster.settings?.wins || 0);
  });

  // Division grouping — check if this league uses divisions
  const hasDivisions = enriched.some(t => t.roster?.settings?.division > 0);

  const isLargeLeague = enriched.length > 24;
  let html = '';
  if (isLargeLeague) {
    html += `<div style="margin-bottom:10px"><input type="text" id="league-search" placeholder="Search ${enriched.length} teams..." oninput="filterLeagueCards(this.value)" style="width:100%;padding:10px 14px;font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:inherit;outline:none"></div>`;
  }

  // If divisions exist, group and render by division
  if (hasDivisions) {
    const divGroups = {};
    enriched.forEach(item => {
      const divNum = item.roster?.settings?.division || 0;
      if (!divGroups[divNum]) divGroups[divNum] = [];
      divGroups[divNum].push(item);
    });
    // Sort division keys numerically
    const divKeys = Object.keys(divGroups).sort((a, b) => Number(a) - Number(b));
    const leagueMeta = (S.leagues && S.leagues[0]?.metadata) || {};
    divKeys.forEach(divNum => {
      // Sort within division by health score
      divGroups[divNum].sort((a, b) => {
        const ha = a.assess?.healthScore || 0;
        const hb = b.assess?.healthScore || 0;
        if (hb !== ha) return hb - ha;
        return (b.roster.settings?.wins || 0) - (a.roster.settings?.wins || 0);
      });
      const divName = leagueMeta['division_' + divNum] || leagueMeta['division_' + divNum + '_name'] || ('Division ' + divNum);
      html += '<div style="font-size:0.72rem;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:12px 0 6px;border-bottom:1px solid rgba(212,175,55,0.15);margin-top:8px;">' + _esc(divName) + '</div>';
      divGroups[divNum].forEach((item, divIdx) => {
        html += _buildLeagueCard(item, divIdx, myId);
      });
    });
  } else {
    // Flat list — no divisions
    enriched.forEach((item, idx) => {
      html += _buildLeagueCard(item, idx, myId);
    });
  }

  container.innerHTML = html;
}

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
            badges.push('<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(52,152,219,.2);color:#3498DB;font-weight:700">Active Trader</span>');
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
      <div class="league-card-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>
    <div class="league-dossier" id="dossier-${rid}" style="display:none;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:0 0 var(--r) var(--r);margin-top:-7px;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">SCOUTING REPORT</div>
      ${rosterPlayers.length ? `<div style="margin-bottom:8px">${rosterPlayers.map(p =>
        `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:12px;border-radius:6px;transition:background .15s" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background='transparent'">
          <span onclick="event.stopPropagation();openPlayerModal('${p.pid}')" style="color:var(--text);font-weight:600;flex:1;cursor:pointer">${_esc(p.name)}</span>
          <span style="color:var(--accent);font-size:10px;font-weight:700">${p.pos}</span>
          <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;font-size:11px">${p.val > 0 ? p.val.toLocaleString() : '—'}</span>
          ${!isMe ? `<button onclick="event.stopPropagation();openTradeBuilderForOpponentPlayer('${p.pid}','${rid}')" style="font-size:10px;font-weight:700;color:var(--accent);background:var(--accentL);border:none;border-radius:5px;padding:2px 6px;cursor:pointer;font-family:inherit;flex-shrink:0">Trade</button>` : ''}
        </div>`
      ).join('')}</div>` : ''}
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
    if (window.S?.user) _onLeagueReady();
  }, 500);
  // Safety cutoff after 60s
  setTimeout(() => clearInterval(_teamBarInterval), 60000);
});
