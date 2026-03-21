// ══════════════════════════════════════════════════════════════════
// shared/player-modal.js — Shared player card modal for Fantasy Wars
// Loads ReconAI's player modal into any page (ReconAI or War Room)
// Requires: shared/constants.js, shared/dhq-engine.js loaded first
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

// ── Inject modal HTML if not present ──────────────────────────
function _ensureModalDOM() {
  if (document.getElementById('fw-player-modal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
  <div id="fw-player-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10000;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto">
    <div style="background:#111318;border:1px solid rgba(255,255,255,.12);border-radius:18px;width:100%;max-width:620px;margin:auto;position:relative;box-shadow:0 16px 64px rgba(0,0,0,.6);animation:fwModalIn .3s ease">
      <style>@keyframes fwModalIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}</style>
      <!-- Banner -->
      <div id="fwpm-banner" style="border-radius:18px 18px 0 0;padding:22px;position:relative;overflow:hidden;background:#181b22">
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(124,107,248,.1),transparent 60%);pointer-events:none"></div>
        <button onclick="closeFWPlayerModal()" style="position:absolute;top:14px;right:14px;background:rgba(0,0,0,.4);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);color:#a8acb8;cursor:pointer;font-size:16px;line-height:1;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:1">✕</button>
        <div style="display:flex;gap:16px;align-items:flex-end">
          <div style="position:relative;flex-shrink:0">
            <img id="fwpm-photo" src="" style="width:88px;height:88px;border-radius:12px;object-fit:cover;object-position:top;border:2px solid rgba(255,255,255,.12)" onerror="this.style.display='none';document.getElementById('fwpm-initials').style.display='flex'"/>
            <div id="fwpm-initials" style="display:none;width:88px;height:88px;border-radius:12px;background:#1f232d;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#7d8291;border:2px solid rgba(255,255,255,.12)"></div>
            <div id="fwpm-pos" style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;background:rgba(124,107,248,.15);color:#a78bfa"></div>
          </div>
          <div style="flex:1;min-width:0;padding-bottom:6px">
            <div id="fwpm-name" style="font-size:20px;font-weight:700;letter-spacing:-.02em;color:#f0f0f3;line-height:1.1;margin-bottom:3px"></div>
            <div id="fwpm-bio" style="font-size:12px;color:#a8acb8;margin-bottom:6px"></div>
            <div id="fwpm-tags" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          </div>
        </div>
      </div>
      <!-- Stats bar -->
      <div id="fwpm-stats" style="display:grid;grid-template-columns:repeat(5,1fr);border-bottom:1px solid rgba(255,255,255,.07)"></div>
      <!-- Body -->
      <div style="padding:16px 18px">
        <!-- Insight -->
        <div id="fwpm-insight" style="margin-bottom:14px"></div>
        <!-- Age curve -->
        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:11px;font-weight:600;color:#a8acb8;text-transform:uppercase;letter-spacing:.06em">Age curve</div>
            <div id="fwpm-peak-tag" style="font-size:11px;color:#a8acb8"></div>
          </div>
          <div id="fwpm-curve" style="display:flex;height:22px;border-radius:5px;overflow:hidden;gap:1px"></div>
        </div>
        <!-- Value + Right panel -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div style="background:#181b22;border-radius:10px;padding:12px">
            <div style="font-size:10px;color:#7d8291;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Dynasty trade value</div>
            <div id="fwpm-val" style="font-size:22px;font-weight:700;letter-spacing:-.02em;color:#7c6bf8"></div>
            <div id="fwpm-tier" style="font-size:11px;color:#a8acb8;margin-top:2px"></div>
          </div>
          <div id="fwpm-right" style="background:#181b22;border-radius:10px;padding:12px"></div>
        </div>
        <!-- Actions -->
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <a id="fwpm-fp-link" href="#" target="_blank" style="font-size:12px;padding:6px 14px;background:#1f232d;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#a8acb8;text-decoration:none;transition:all .15s">FantasyPros ↗</a>
          <a id="fwpm-sleeper-link" href="#" target="_blank" style="font-size:12px;padding:6px 14px;background:#1f232d;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#a8acb8;text-decoration:none;transition:all .15s">Sleeper ↗</a>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(div.firstElementChild);
  // Close on backdrop click
  document.getElementById('fw-player-modal').addEventListener('click', e => {
    if (e.target.id === 'fw-player-modal') closeFWPlayerModal();
  });
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeFWPlayerModal();
  });
}

// ── Position colors ────────────────────────────────────────────
const _fwPosColor = {
  QB:'rgba(96,165,250,.15)', RB:'rgba(52,211,153,.15)', WR:'rgba(124,107,248,.15)',
  TE:'rgba(251,191,36,.15)', K:'rgba(139,143,154,.1)', DL:'rgba(251,146,60,.15)',
  LB:'rgba(167,139,250,.15)', DB:'rgba(244,114,182,.15)', DEF:'rgba(248,113,113,.1)'
};
const _fwPosText = {
  QB:'#60a5fa', RB:'#34d399', WR:'#a78bfa', TE:'#fbbf24', K:'#a8acb8',
  DL:'#fb923c', LB:'#a78bfa', DB:'#f472b6', DEF:'#f87171'
};

// ── Helper: normalize IDP positions ───────────────────────────
function _fwNormPos(p) {
  if (['DE','DT','NT','IDL','EDGE'].includes(p)) return 'DL';
  if (['CB','S','SS','FS'].includes(p)) return 'DB';
  if (['OLB','ILB','MLB'].includes(p)) return 'LB';
  return p;
}

// ── Helper: FantasyPros URL ────────────────────────────────────
function _fwFPUrl(name) {
  if (!name) return '#';
  return 'https://www.fantasypros.com/nfl/players/' +
    name.toLowerCase().replace(/[.']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/-+$/,'') + '.php';
}

// ── Helper: peak years ────────────────────────────────────────
function _fwPeakYears(pos, age) {
  const peaks = {QB:[27,33],RB:[22,26],WR:[24,29],TE:[25,30],DL:[24,29],LB:[23,28],DB:[24,29]};
  const [lo,hi] = peaks[pos] || [24,29];
  if (!age) return {label:'—',desc:''};
  if (age < lo-3) return {label:'Seedling',desc:(lo-age)+'yr to peak'};
  if (age < lo) return {label:'Rising',desc:(lo-age)+'yr to peak'};
  if (age <= hi) return {label:'Peak',desc:Math.max(0,hi-age)<=0?'final yr':'~'+(hi-age)+'yr left'};
  if (age <= hi+2) return {label:'Veteran',desc:(age-hi)+'yr past peak'};
  return {label:'Declining',desc:(age-hi)+'yr past peak'};
}

// ── Main: open player modal ────────────────────────────────────
// Works with EITHER ReconAI data (S.players) or raw player object
function openFWPlayerModal(playerIdOrObj, playersData, statsData, scoringSettings) {
  _ensureModalDOM();

  // Resolve player data
  let pid, p, stats;
  if (typeof playerIdOrObj === 'object') {
    p = playerIdOrObj;
    pid = p.player_id || p.id || '';
    stats = statsData?.[pid] || {};
  } else {
    pid = String(playerIdOrObj);
    // Try ReconAI global state first, then passed playersData
    const players = (window.S && window.S.players) || playersData || {};
    p = players[pid];
    if (!p) { console.warn('[FW] Player not found:', pid); return; }
    stats = (window.S && window.S.playerStats?.[pid]) || statsData?.[pid] || {};
  }

  const pos = _fwNormPos(p.position || '');
  const age = p.age || 0;
  const name = p.full_name || ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || pid;
  const team = p.team || 'FA';
  const exp = p.years_exp ?? 0;
  const pk = _fwPeakYears(pos, age);
  const isIDP = ['DL','LB','DB'].includes(pos);

  // DHQ value
  const val = (typeof dynastyValue === 'function') ? dynastyValue(pid) :
    (window.App.LI?.playerScores?.[pid] || 0);
  const tier = val >= 7000 ? 'Elite' : val >= 4000 ? 'Starter' : val >= 2000 ? 'Depth' : val > 0 ? 'Stash' : '—';
  const tierCol = val >= 7000 ? '#34d399' : val >= 4000 ? '#7c6bf8' : val >= 2000 ? '#a8acb8' : '#7d8291';

  // Photo
  const photo = document.getElementById('fwpm-photo');
  photo.src = `https://sleepercdn.com/content/nfl/players/${pid}.jpg`;
  photo.style.display = '';
  const initials = document.getElementById('fwpm-initials');
  initials.textContent = ((p.first_name||'?')[0] + (p.last_name||'?')[0]).toUpperCase();
  initials.style.display = 'none';

  // Position badge
  const posBadge = document.getElementById('fwpm-pos');
  posBadge.textContent = pos;
  posBadge.style.background = _fwPosColor[pos] || 'rgba(124,107,248,.15)';
  posBadge.style.color = _fwPosText[pos] || '#a78bfa';

  // Name + bio
  document.getElementById('fwpm-name').textContent = name;
  document.getElementById('fwpm-bio').innerHTML = `${pos} · ${team} · Age ${age || '?'} · ${exp}yr exp${p.college ? ' · '+p.college : ''}`;

  // Tags
  const tags = [];
  if (p.injury_status) tags.push(`<span style="background:rgba(248,113,113,.08);color:#f87171;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px">${p.injury_status}</span>`);
  if (p.height || p.weight) {
    const ht = p.height ? Math.floor(p.height/12)+"'"+(p.height%12)+'"' : '';
    const wt = p.weight ? p.weight+'lbs' : '';
    tags.push(`<span style="background:#1f232d;color:#7d8291;font-size:11px;padding:2px 7px;border-radius:20px">${[ht,wt].filter(Boolean).join(' · ')}</span>`);
  }
  document.getElementById('fwpm-tags').innerHTML = tags.join('');

  // Stats bar
  const sc = scoringSettings || (window.S && window.S.leagues?.find(l=>l.league_id===window.S?.currentLeagueId)?.scoring_settings) || {};
  const rawStats = stats.prevRawStats || stats.curRawStats || stats;
  const ppg = stats.prevAvg || stats.seasonAvg || 0;
  const total = stats.prevTotal || stats.seasonTotal || 0;

  let statBoxes;
  if (isIDP && rawStats) {
    const idpPts = (typeof calcIDPScore === 'function') ? calcIDPScore(rawStats, sc) : 0;
    const gp = rawStats.gp || 17;
    const idpPPG = +(idpPts / Math.max(1, gp)).toFixed(1);
    const tkl = Math.round((rawStats.idp_tkl_solo||0)+(rawStats.idp_tkl_ast||0));
    const sacks = +(rawStats.idp_sack||0).toFixed(1);
    const ints = rawStats.idp_int||0;
    const pds = rawStats.idp_pass_def||0;
    statBoxes = [
      {val: val>0 ? val.toLocaleString() : '—', lbl: 'DHQ Value', col: tierCol},
      {val: idpPPG || '—', lbl: 'IDP PPG', col: idpPPG>=6?'#34d399':idpPPG>=3?'#f0f0f3':'#7d8291'},
      {val: tkl || '—', lbl: 'Tackles', col: tkl>=80?'#34d399':tkl>=40?'#f0f0f3':'#7d8291'},
      {val: pos==='DB' ? (ints+'/'+pds) : String(sacks), lbl: pos==='DB'?'INT/PD':'Sacks', col: '#f0f0f3'},
      {val: pk.label, lbl: 'Peak', col: pk.label==='Peak'?'#34d399':pk.label==='Rising'?'#34d399':'#a8acb8'},
    ];
  } else {
    statBoxes = [
      {val: val>0 ? val.toLocaleString() : '—', lbl: 'DHQ Value', col: tierCol},
      {val: ppg ? ppg.toFixed(1) : '—', lbl: 'PPG', col: ppg>15?'#34d399':ppg>8?'#f0f0f3':'#7d8291'},
      {val: total ? Math.round(total) : '—', lbl: 'Season Total', col: '#a8acb8'},
      {val: pk.label, lbl: 'Peak', col: pk.label==='Peak'?'#34d399':pk.label==='Rising'?'#34d399':'#a8acb8'},
      {val: age || '—', lbl: 'Age', col: '#f0f0f3'},
    ];
  }
  document.getElementById('fwpm-stats').innerHTML = statBoxes.map(s =>
    `<div style="padding:12px 8px;text-align:center;border-right:1px solid rgba(255,255,255,.07)">
      <div style="font-size:18px;font-weight:800;letter-spacing:-.03em;line-height:1;font-family:monospace;color:${s.col}">${s.val}</div>
      <div style="font-size:10px;color:#a8acb8;text-transform:uppercase;letter-spacing:.04em;margin-top:5px;font-weight:600">${s.lbl}</div>
    </div>`
  ).join('');

  // Insight
  const insightEl = document.getElementById('fwpm-insight');
  const meta = window.App.LI?.playerMeta?.[pid];
  if (meta && val > 0) {
    const [peakStart,peakEnd] = (window.App.peakWindows || {})[pos] || [23,29];
    const yrsPast = Math.max(0, age - peakEnd);
    const peakYrsLeft = meta.peakYrsLeft || 0;
    let blurb = '', blurbCol = '#fbbf24';
    if (meta.source === 'FC_ROOKIE') { blurb = `Incoming rookie with ${peakYrsLeft||'?'} peak years ahead.`; blurbCol = '#34d399'; }
    else if (yrsPast >= 3) { blurb = `${yrsPast} years past ${pos} prime. Dynasty value declining.`; blurbCol = '#f87171'; }
    else if (peakYrsLeft >= 4) { blurb = `${peakYrsLeft} peak years ahead. Dynasty stock rising.`; blurbCol = '#34d399'; }
    else if (peakYrsLeft >= 1) { blurb = `${peakYrsLeft} peak year${peakYrsLeft>1?'s':''} left. Window closing.`; blurbCol = '#fbbf24'; }
    if (blurb) {
      const bg = blurbCol === '#f87171' ? 'rgba(248,113,113,.06)' : blurbCol === '#34d399' ? 'rgba(52,211,153,.06)' : 'rgba(251,191,36,.06)';
      insightEl.innerHTML = `<div style="font-size:12px;color:${blurbCol};line-height:1.5;padding:8px 12px;background:${bg};border-radius:8px">${blurb}</div>`;
    } else insightEl.innerHTML = '';
  } else insightEl.innerHTML = '';

  // Age curve
  const ages = Array.from({length:17},(_,i)=>i+20);
  const peaks = {QB:[27,33],RB:[22,26],WR:[24,29],TE:[25,30],DL:[24,29],LB:[23,28],DB:[24,29]};
  const [pLo,pHi] = peaks[pos] || [24,29];
  document.getElementById('fwpm-curve').innerHTML = ages.map(a => {
    const col = a < pLo-3 ? 'rgba(96,165,250,.3)' : a < pLo ? 'rgba(52,211,153,.5)' : (a>=pLo&&a<=pHi) ? 'rgba(52,211,153,.8)' : a <= pHi+2 ? 'rgba(251,191,36,.5)' : 'rgba(248,113,113,.4)';
    return `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:default;background:${col};opacity:${a===age?1:0.6};outline:${a===age?'2px solid white':'none'};outline-offset:-1px">${a===age?age:''}</div>`;
  }).join('');
  document.getElementById('fwpm-peak-tag').textContent = `Age ${age || '?'} · ${pk.label} · ${pk.desc}`;

  // Value + right panel
  document.getElementById('fwpm-val').textContent = val > 0 ? val.toLocaleString() : '—';
  document.getElementById('fwpm-tier').innerHTML = val > 0 ? `<span style="color:${tierCol}">${tier}</span>` : '<span style="color:#7d8291">No DHQ data</span>';

  const rightPanel = document.getElementById('fwpm-right');
  if (isIDP && rawStats) {
    const gp = rawStats.gp || 17;
    const idpPts2 = (typeof calcIDPScore === 'function') ? calcIDPScore(rawStats, sc) : 0;
    const idpPPG2 = +(idpPts2 / Math.max(1, gp)).toFixed(1);
    const tkl = Math.round((rawStats.idp_tkl_solo||0)+(rawStats.idp_tkl_ast||0));
    const sacks = +(rawStats.idp_sack||0).toFixed(1);
    const ints = rawStats.idp_int||0;
    const pds = rawStats.idp_pass_def||0;
    const ff = rawStats.idp_ff||0;
    const qbhits = rawStats.idp_qb_hit||0;
    rightPanel.innerHTML = `
      <div style="font-size:11px;color:#7d8291;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">IDP Stats <span style="font-weight:400;text-transform:none">· ${gp}gp</span></div>
      <div style="font-size:18px;font-weight:800;color:#34d399;margin-bottom:6px">${idpPPG2||'—'} <span style="font-size:12px;font-weight:600;color:#a8acb8">PPG</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
        ${tkl?`<div style="font-size:12px;color:#a8acb8"><strong style="color:#f0f0f3">${tkl}</strong> tackles</div>`:''}
        ${sacks?`<div style="font-size:12px;color:#a8acb8"><strong style="color:#f0f0f3">${sacks}</strong> sacks</div>`:''}
        ${ints?`<div style="font-size:12px;color:#a8acb8"><strong style="color:#f0f0f3">${ints}</strong> INT</div>`:''}
        ${pds?`<div style="font-size:12px;color:#a8acb8"><strong style="color:#f0f0f3">${pds}</strong> PD</div>`:''}
        ${ff?`<div style="font-size:12px;color:#a8acb8"><strong style="color:#f0f0f3">${ff}</strong> FF</div>`:''}
        ${qbhits?`<div style="font-size:12px;color:#a8acb8"><strong style="color:#f0f0f3">${qbhits}</strong> QB hits</div>`:''}
      </div>`;
  } else {
    rightPanel.innerHTML = `
      <div style="font-size:11px;color:#7d8291;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Peak years projection</div>
      <div style="font-size:16px;font-weight:700;color:#34d399">${pk.label}</div>
      <div style="font-size:12px;color:#a8acb8;margin-top:2px;line-height:1.4">${pk.desc}</div>`;
  }

  // Links
  document.getElementById('fwpm-fp-link').href = _fwFPUrl(name);
  document.getElementById('fwpm-sleeper-link').href = `https://sleeper.com/players/nfl/${pid}`;

  // Show
  document.getElementById('fw-player-modal').style.display = 'flex';
}

function closeFWPlayerModal() {
  const el = document.getElementById('fw-player-modal');
  if (el) el.style.display = 'none';
}

// Expose globally
window.openFWPlayerModal = openFWPlayerModal;
window.closeFWPlayerModal = closeFWPlayerModal;
window.App.openFWPlayerModal = openFWPlayerModal;
window.App.closeFWPlayerModal = closeFWPlayerModal;
