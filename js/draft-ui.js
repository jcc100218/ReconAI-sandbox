// ═══════════════════════════════════════════════════════════════
// js/draft-ui.js — Draft room, rookie scouting board, pick analysis
// Extracted from ui.js to keep draft-tab logic editable standalone.
//
// Globals expected (all set before this file loads):
//   S, $, LI, LI_LOADED                   — state
//   pName, pPos, pAge, getUser, fullTeam   — player/user helpers (app.js)
//   dynastyValue, getPickDHQ               — valuation (dhq-engine, trade-calc)
//   assessTeamFromGlobal                   — roster assessment (team-assess)
//   pickValue, normPos                     — value/position helpers (ui.js, utils)
//   dhqAI, dhqContext                      — AI layer (dhq-ai)
//   goAsk, hasAnyAI                        — navigation/AI (ai-chat, ai-dispatch)
// ═══════════════════════════════════════════════════════════════

window.App = window.App || {};

// ── Phase 8 v2: centralized IDP position helpers ─────────────
// Scout's old lists were narrower than War Room's, so Psycho league (and
// any league with NT/IDL/EDGE/MLB/SS/FS positions) lost IDP prospects.
// Align with War Room's js/draft-room.js:58-70 so both apps agree.
const IDP_RAW_POSITIONS = ['DL','DE','DT','NT','IDL','EDGE','LB','OLB','ILB','MLB','DB','CB','S','SS','FS'];
const IDP_SLOT_TYPES    = ['DL','DE','DT','LB','DB','CB','S','IDP_FLEX'];
const IDP_MAPPED = ['DL','LB','DB'];

function isIDPPosition(pos) { return IDP_RAW_POSITIONS.includes(pos); }
function leagueHasIDPSlots(league) {
  const rp = league?.roster_positions;
  // If roster_positions data is missing (Sleeper occasionally delays this
  // field on cold load), default to TRUE — better to over-include IDP and
  // let users filter visually than to hide prospects they can draft.
  if (!rp || !rp.length) {
    console.warn('[draft] league.roster_positions unavailable — defaulting to IDP-on');
    return true;
  }
  return rp.some(s => IDP_SLOT_TYPES.includes(s));
}
window.isIDPPosition = isIDPPosition;
window.leagueHasIDPSlots = leagueHasIDPSlots;

// ── Draft Sub-tabs — legacy stub ──────────────────────────────
// Replaced by enterDraftRoom(). Kept for backward compat (GM bar
// launcher, deep links, etc. may still call switchDraftView).
function switchDraftView(view) {
  if (typeof enterDraftRoom === 'function') enterDraftRoom(view === 'mock' ? 'mock' : 'board');
}
window.switchDraftView = switchDraftView;

// ── Draft Room navigation (entry cards ↔ full-screen rooms) ──
function enterDraftRoom(mode) {
  const entry = document.getElementById('draft-entry-view');
  const board = document.getElementById('draft-board-fullview');
  const mock  = document.getElementById('draft-mock-fullview');
  if (!entry || !board || !mock) return;

  entry.style.display = 'none';

  if (mode === 'board') {
    board.style.display = '';
    mock.style.display  = 'none';
    if (typeof renderDraftNeeds === 'function') renderDraftNeeds();
    if (typeof renderTopProspects === 'function') renderTopProspects();
  } else {
    mock.style.display  = '';
    board.style.display = 'none';
    if (typeof onDraftTabOpen === 'function') onDraftTabOpen();
  }
}
window.enterDraftRoom = enterDraftRoom;

function exitDraftRoom() {
  const entry = document.getElementById('draft-entry-view');
  const board = document.getElementById('draft-board-fullview');
  const mock  = document.getElementById('draft-mock-fullview');
  if (entry) entry.style.display = '';
  if (board) board.style.display = 'none';
  if (mock)  mock.style.display  = 'none';
  _refreshDraftEntrySubtitles();
}
window.exitDraftRoom = exitDraftRoom;

function _refreshDraftEntrySubtitles() {
  const boardSub = document.getElementById('draft-entry-board-sub');
  if (boardSub) {
    const S = window.S || {};
    const totalRookies = Object.values(S.players || {}).filter(p => p.years_exp === 0).length;
    boardSub.textContent = totalRookies > 0
      ? `${totalRookies} prospects ranked by DHQ`
      : 'DHQ-ranked prospects · tap to rank';
  }
  const mockSub = document.getElementById('draft-entry-mock-sub');
  if (mockSub) {
    const LI = window.LI || {};
    const ownerCount = Object.keys(LI.ownerProfiles || {}).length;
    const teams = (window.S?.rosters || []).length;
    mockSub.textContent = ownerCount > 0
      ? `${ownerCount} owner DNA profiles loaded · ${teams} teams`
      : `Simulate your draft with AI opponents`;
  }
}
window._refreshDraftEntrySubtitles = _refreshDraftEntrySubtitles;

// ── Entry picks summary card ─────────────────────────────────
function renderDraftEntryPicks() {
  const el = document.getElementById('draft-entry-picks');
  if (!el || !window.S?.myRosterId) return;

  const S = window.S;
  const year = S.season || new Date().getFullYear();
  const allTP = S.tradedPicks || [];
  const myId = S.myRosterId;
  const teams = S.rosters?.length || 16;
  const league = S.leagues?.find(l => l.league_id === S.currentLeagueId);
  const draftRounds = league?.settings?.draft_rounds || 7;
  const ownedPicks = [];
  for (let rd = 1; rd <= draftRounds; rd++) {
    const tradedAway = allTP.find(p => String(p.season) === String(year) && p.round === rd && p.roster_id === myId && p.owner_id !== myId);
    if (!tradedAway) ownedPicks.push({ round: rd, own: true });
    const acquired = allTP.filter(p => String(p.season) === String(year) && p.round === rd && p.owner_id === myId && p.roster_id !== myId);
    acquired.forEach(() => ownedPicks.push({ round: rd, own: false }));
  }

  if (!ownedPicks.length) { el.innerHTML = ''; return; }

  const totalVal = ownedPicks.reduce((s, p) => s + (typeof pickValue === 'function' ? pickValue(year, p.round, teams, Math.ceil(teams / 2)) : 0), 0);
  const roundBadges = ownedPicks.slice(0, 6).map(p =>
    `<span style="font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;background:${p.own ? 'var(--accentL)' : 'rgba(52,211,153,.08)'};color:${p.own ? 'var(--accent)' : 'var(--green)'};border:1px solid ${p.own ? 'rgba(212,175,55,.2)' : 'rgba(52,211,153,.2)'}">R${p.round}</span>`
  ).join('');
  const extra = ownedPicks.length > 6 ? `<span style="font-size:12px;color:var(--text3)">+${ownedPicks.length - 6} more</span>` : '';

  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em">Your ${year} Picks</span>
        <span style="font-size:12px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace">~${totalVal.toLocaleString()} DHQ</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${roundBadges}${extra}</div>
    </div>`;
}
window.renderDraftEntryPicks = renderDraftEntryPicks;

// ── DNA intel strip for mock draft on-the-clock ──────────────
function _renderDNAIntelStrip(round) {
  const LI = window.LI || {};
  const hitRates = LI.hitRateByRound?.[round] || {};
  const bestPos = (hitRates.bestPos || []).slice(0, 2).map(p => p.pos).join('/');
  const roundHitRate = hitRates.rate || null;

  if (!bestPos && roundHitRate === null) return '';

  return `<div style="background:rgba(52,211,153,.04);border:1px solid rgba(52,211,153,.12);border-radius:var(--r);padding:10px 12px;margin-bottom:10px">
    <div style="font-size:10px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Owner DNA · Round ${round}</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${bestPos ? `<div style="font-size:13px;color:var(--text2)"><span style="color:var(--text3)">Historically hits at:</span> <span style="font-weight:700;color:var(--text)">${bestPos}</span></div>` : ''}
      ${roundHitRate !== null ? `<div style="font-size:13px;color:var(--text2)"><span style="color:var(--text3)">League hit rate:</span> <span style="font-weight:700;color:${roundHitRate >= 50 ? 'var(--green)' : roundHitRate >= 25 ? 'var(--amber)' : 'var(--red)'}">${roundHitRate}%</span></div>` : ''}
    </div>
  </div>`;
}
window._renderDNAIntelStrip = _renderDNAIntelStrip;

// ── Opponent Scouting ──────────────────────────────────────────
// idealDepth: default depth targets per position (may be overridden by other modules)
const idealDepth=window.idealDepth||{QB:3,RB:6,WR:7,TE:3,K:1,DL:5,LB:5,DB:5};
// ── Draft Room ─────────────────────────────────────────────────
// draftChatHistory declared in ai-chat.js

function _radialProgress(pct,color){
  const r=18,c=2*Math.PI*r;
  const offset=c-(pct/100)*c;
  return`<div class="radial-progress">
    <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--bg4)" stroke-width="3"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transition:stroke-dashoffset .8s ease"/></svg>
    <span class="rp-val" style="color:${color}">${pct}%</span>
  </div>`;
}

function renderDraftNeeds(){
  const needsEl=$('draft-needs');if(!needsEl)return;
  if(!S.myRosterId)return;

  // Tier gate — Draft Archetype Analysis requires trial or paid
  if (typeof canAccess === 'function' && !canAccess(window.FEATURES?.DRAFT_ARCHETYPES || 'draft_archetypes')) {
    needsEl.innerHTML = typeof _tierGatePlaceholder === 'function'
      ? _tierGatePlaceholder('Draft Archetype Analysis', window.FEATURES?.DRAFT_ARCHETYPES || 'draft_archetypes')
      : '<div style="padding:24px;text-align:center;color:var(--text3)">Upgrade to unlock Draft Archetype Analysis.</div>';
    return;
  }
  if (typeof trackUsage === 'function') trackUsage('draft_targets_flagged');

  const my=myR();const allPlayers=my?.players||[];
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const year=$('draft-year-sel')?.value||'2026';
  const teams=S.rosters.length||12;
  const posMapD=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
  const draftRounds=league?.settings?.draft_rounds||7;

  // === Build owned picks list ===
  const allTP=S.tradedPicks;
  const ownedPicks=[];
  const ownPickRounds=[];
  for(let rd=1;rd<=draftRounds;rd++){
    const myTradedAway=allTP.find(p=>String(p.season)===year&&p.round===rd&&p.roster_id===S.myRosterId&&p.owner_id!==S.myRosterId);
    const acquired=allTP.filter(p=>String(p.season)===year&&p.round===rd&&p.owner_id===S.myRosterId&&p.roster_id!==S.myRosterId);
    if(!myTradedAway){ownedPicks.push({round:rd,own:true});ownPickRounds.push(rd);}
    acquired.forEach(p=>{
      const from=getUser(S.rosters.find(r=>r.roster_id===p.roster_id)?.owner_id);
      ownedPicks.push({round:rd,own:false,from,fromRosterId:p.roster_id});
      if(!ownPickRounds.includes(rd))ownPickRounds.push(rd);
    });
  }
  ownPickRounds.sort((a,b)=>a-b);

  // === Roster analysis ===
  const rp=league?.roster_positions||[];
  const starterSlots={QB:0,RB:0,WR:0,TE:0,K:0,DL:0,LB:0,DB:0};
  rp.forEach(slot=>{
    const s=posMapD(slot);
    if(s in starterSlots)starterSlots[s]++;
    else if(slot==='FLEX'){starterSlots.RB+=0.4;starterSlots.WR+=0.4;starterSlots.TE+=0.2;}
    else if(slot==='SUPER_FLEX'){starterSlots.QB+=0.5;starterSlots.WR+=0.25;starterSlots.RB+=0.25;}
    else if(slot==='IDP_FLEX'){starterSlots.DL+=0.35;starterSlots.LB+=0.35;starterSlots.DB+=0.3;}
    else if(slot==='REC_FLEX'){starterSlots.WR+=0.5;starterSlots.TE+=0.5;}
  });
  Object.keys(starterSlots).forEach(p=>starterSlots[p]=Math.round(starterSlots[p]));
  const activePositions=Object.keys(starterSlots).filter(p=>starterSlots[p]>0);

  const avgThresh=LI_LOADED&&LI.avgThresh?LI.avgThresh:{};
  const peaks=LI_LOADED&&LI.peakWindows?LI.peakWindows:window.App.peakWindows;

  const posAnalysis=activePositions.map(pos=>{
    const posPlayers=allPlayers.filter(pid=>posMapD(pPos(pid))===pos);
    const withData=posPlayers.map(pid=>{
      const age=pAge(pid)||26;
      const dhqVal=dynastyValue(pid);
      const ppg=S.playerStats?.[pid]?.seasonAvg||S.playerStats?.[pid]?.prevAvg||(LI_LOADED&&LI.playerMeta?.[pid]?.ppg)||0;
      return{pid,age,dhqVal,ppg};
    });
    const starterPPG=avgThresh[pos]?+(avgThresh[pos].starterLine/17).toFixed(1):{QB:12,RB:8,WR:8,TE:6,DL:4,LB:4,DB:3}[pos]||6;
    const startable=withData.filter(p=>p.ppg>=starterPPG);
    const elite=withData.filter(p=>typeof window.App?.isElitePlayer==='function'?window.App.isElitePlayer(p.pid):dynastyValue(p.pid)>=7000);
    const [,peakEnd]=peaks[pos]||[23,29];
    const aging=withData.filter(p=>p.age>peakEnd);
    const young=withData.filter(p=>p.age<=25);
    const slotsNeeded=starterSlots[pos];
    const starterGap=Math.max(0,slotsNeeded-startable.length);
    let needScore=starterGap*30;
    needScore+=Math.max(0,(slotsNeeded+Math.ceil(slotsNeeded*0.5))-posPlayers.length)*5;
    needScore+=aging.length*8;needScore-=young.length*4;needScore-=elite.length*10;
    if(startable.length===0&&slotsNeeded>0)needScore+=50;
    if(LI_LOADED&&LI.scarcityMult?.[pos])needScore=Math.round(needScore*LI.scarcityMult[pos]);
    return{pos,slotsNeeded,startable:startable.length,total:posPlayers.length,elite:elite.length,
      aging:aging.length,young:young.length,starterGap,needScore};
  }).sort((a,b)=>b.needScore-a.needScore);

  // === RENDER: ON THE CLOCK hero ===
  // Phase 4: On-the-clock card removed from Board view. Its design is
  // reused inline inside renderMockDraftUI (see js/draft-ui.js mock block).
  const bestBetEl=$('draft-best-bet');
  if(false&&bestBetEl&&LI_LOADED){
    const earlyRounds=ownPickRounds.filter(r=>r<=3);
    const skipEarly=new Set(['K']);
    const bestEarlyNeed=posAnalysis.find(p=>p.needScore>=20&&!skipEarly.has(p.pos));
    const nextPickRound=ownPickRounds[0];

    if(nextPickRound&&bestEarlyNeed){
      const rosterRanks2=S.rosters.map(r=>({rid:r.roster_id,val:(r.players||[]).reduce((s,pid)=>s+dynastyValue(pid),0)})).sort((a,b)=>a.val-b.val);
      const estPos2=rosterRanks2.findIndex(r=>r.rid===S.myRosterId)+1||Math.ceil(teams/2);
      const pickLabel2=nextPickRound+'.'+String(estPos2).padStart(2,'0');
      const val2=pickValue(year,nextPickRound,teams,estPos2);

      // Find top rookie targets at this position
      const rookieTargets=Object.entries(S.players)
        .filter(([id,p])=>p.years_exp===0&&dynastyValue(id)>0&&posMapD(p.position)===bestEarlyNeed.pos)
        .map(([id,p])=>({id,name:p.first_name+' '+p.last_name,val:dynastyValue(id),pos:posMapD(p.position)}))
        .sort((a,b)=>b.val-a.val).slice(0,3);

      const reasons=[];
      if(bestEarlyNeed.starterGap>0)reasons.push(bestEarlyNeed.startable+'/'+bestEarlyNeed.slotsNeeded+' starters — gap at '+bestEarlyNeed.pos);
      if(bestEarlyNeed.aging>0)reasons.push(bestEarlyNeed.aging+' players aging past peak');
      if(bestEarlyNeed.elite===0&&bestEarlyNeed.slotsNeeded>0)reasons.push('No elite '+bestEarlyNeed.pos+' talent on roster');
      if(bestEarlyNeed.young===0)reasons.push('No young depth developing');

      // Trade pick suggestion
      const tradeHint=nextPickRound<=2
        ?'Trade down: could gain mid-round value if top target is gone'
        :nextPickRound>=3&&nextPickRound<=5?'Trade up: move into R1–2 range for elite '+bestEarlyNeed.pos+' talent':'';

      bestBetEl.innerHTML=`
        <div class="hero-action-card" style="margin-bottom:14px;border-color:rgba(212,175,55,.2)">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),#b8941f,var(--accent));background-size:200% 100%;animation:progGlow 3s ease-in-out infinite"></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">On the Clock</span>
            ${_strategyContextLine()||''}
            <span style="font-size:13px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace">${pickLabel2}</span>
            <span style="font-size:13px;color:var(--text3)">~${val2.toLocaleString()} DHQ</span>
          </div>
          <div style="font-size:18px;font-weight:800;letter-spacing:-.02em;color:var(--text);margin-bottom:2px">Draft ${bestEarlyNeed.pos}</div>
          <div style="font-size:13px;color:var(--text3);margin-bottom:10px">${bestEarlyNeed.pos} is your biggest positional need</div>
          ${rookieTargets.length?`
            <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Top Targets</div>
            ${rookieTargets.map((t,i)=>`
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;${i<rookieTargets.length-1?'border-bottom:1px solid var(--border)':''};cursor:pointer;-webkit-tap-highlight-color:transparent" onclick="openPlayerModal('${t.id}')">
                <span style="font-size:14px;font-weight:800;color:var(--accent);min-width:18px">${i+1}</span>
                <span style="font-size:14px;font-weight:600;flex:1">${t.name}</span>
                <span style="font-size:13px;font-weight:700;color:${t.val>=5000?'var(--green)':'var(--accent)'};font-family:'JetBrains Mono',monospace">${t.val.toLocaleString()}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>`).join('')}
          `:''}
          <ul style="margin:10px 0;padding:0;list-style:none">
            ${reasons.map(r=>`<li style="font-size:13px;color:var(--text2);padding:2px 0;padding-left:14px;position:relative"><span style="position:absolute;left:0;color:var(--accent);font-weight:700">›</span>${r}</li>`).join('')}
          </ul>
          ${tradeHint?`<div style="font-size:13px;color:var(--amber);padding:6px 10px;background:var(--amberL);border-radius:6px;margin-bottom:10px">${tradeHint}</div>`:''}
          <div style="display:flex;gap:8px">
            <button class="hero-cta" style="flex:1;background:linear-gradient(135deg,var(--accent),#b8941f);box-shadow:0 2px 8px rgba(212,175,55,.25)" onclick="sendDraftChatMsg('Who should I take at pick ${pickLabel2}? My biggest need is ${bestEarlyNeed.pos}.')">Draft Advice</button>
            <button class="pm-action-btn" style="flex:0 0 auto;padding:12px 14px" onclick="sendDraftChatMsg('Should I trade pick ${pickLabel2}? What could I get for it?')">Trade Pick</button>
          </div>
        </div>`;
    } else {
      bestBetEl.innerHTML='';
    }
  }

  // === RENDER: Your Picks — single large card, click to expand full list ===
  const pickEl=$('draft-my-picks');
  if(pickEl){
    const rosterRanks=S.rosters.map(r=>{
      const val=(r.players||[]).reduce((s,pid)=>s+dynastyValue(pid),0);
      return{rid:r.roster_id,val};
    }).sort((a,b)=>a.val-b.val);
    const getPickPos=(rosterId2)=>{
      const idx=rosterRanks.findIndex(r=>r.rid===rosterId2);
      return idx>=0?idx+1:Math.ceil(teams/2);
    };

    // Find best position to target per round
    const roundTarget=(rd)=>{
      if(rd<=2){const n=posAnalysis.find(p=>p.needScore>0&&p.pos!=='K');return n?n.pos:'BPA';}
      if(rd<=4)return posAnalysis.find(p=>p.needScore>10&&p.pos!=='K')?.pos||'BPA';
      return posAnalysis.find(p=>p.needScore>0&&['DL','LB','DB'].includes(p.pos))?.pos||'BPA';
    };

    if(!ownedPicks.length){
      pickEl.innerHTML=`<div style="padding:14px;color:var(--text3);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);text-align:center">No picks for ${year}</div>`;
    } else {
      // Summary numbers for the big card
      const totalPicks=ownedPicks.length;
      const totalVal=ownedPicks.reduce((s,p)=>{
        const estPos=getPickPos(p.own?S.myRosterId:p.fromRosterId);
        return s+pickValue(year,p.round,teams,estPos);
      },0);
      const rounds=[...new Set(ownedPicks.map(p=>p.round))].sort((a,b)=>a-b);
      const rangeLabel=rounds.length===1?`R${rounds[0]}`:`R${rounds[0]}–R${rounds[rounds.length-1]}`;

      // First pick details (UP NEXT)
      const first=ownedPicks[0];
      const firstEstPos=getPickPos(first.own?S.myRosterId:first.fromRosterId);
      const firstLabel=first.round+'.'+String(firstEstPos).padStart(2,'0');
      const firstTarget=roundTarget(first.round);

      // Expanded list (all picks, compact)
      const expandedRows=ownedPicks.map((p,i)=>{
        const fromRoster=p.own?S.myRosterId:p.fromRosterId;
        const estPos=getPickPos(fromRoster);
        const val=pickValue(year,p.round,teams,estPos);
        const pickLabel=p.round+'.'+String(estPos).padStart(2,'0');
        const fromName=p.own?'':'via '+p.from;
        const target=roundTarget(p.round);
        const isFirst=i===0;
        return`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${p.own?'var(--bg3)':'rgba(212,175,55,.06)'};border:1px solid ${isFirst?'var(--accent)':'var(--border)'};border-radius:8px;margin-bottom:4px;cursor:pointer" onclick="event.stopPropagation();fillGlobalChat('Who should I take at pick ${pickLabel}? My target position is ${target}.')">
          <div style="font-size:14px;font-weight:700;color:${p.own?'var(--text)':'var(--accent)'};font-family:'JetBrains Mono',monospace;min-width:46px">${pickLabel}</div>
          <div style="flex:1;font-size:12px;color:var(--text3)">${fromName||('~'+val.toLocaleString())}${isFirst?' · <span style="color:var(--accent);font-weight:700">UP NEXT</span>':''}</div>
          <span style="font-size:12px;font-weight:700;padding:2px 7px;border-radius:5px;background:var(--accentL);color:var(--accent)">${target}</span>
        </div>`;
      }).join('');

      pickEl.innerHTML=`
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);cursor:pointer;overflow:hidden" onclick="_toggleOwnedPicks()">
          <div style="padding:14px 16px;display:flex;align-items:center;gap:12px">
            <div style="flex:1">
              <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">Your picks · ${year}</div>
              <div style="font-size:14px;color:var(--text2)"><span style="color:var(--accent);font-weight:700">${firstLabel}</span> UP NEXT · target ${firstTarget}</div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px">${rangeLabel} · ~${totalVal.toLocaleString()} DHQ total</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-size:28px;font-weight:900;color:var(--accent);font-family:'JetBrains Mono',monospace;line-height:1;letter-spacing:-.03em">${totalPicks}</div>
              <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">picks</div>
            </div>
            <svg id="draft-picks-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text3);transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div id="draft-picks-expand" style="max-height:0;overflow:hidden;transition:max-height .28s ease;padding:0 12px">
            <div style="padding:6px 0 12px 0">${expandedRows}</div>
          </div>
        </div>`;
    }
  }

  // === RENDER: Draft Strategy (bar chart) ===
  const summaryEl=$('draft-summary');
  const summaryContent=$('draft-summary-content');
  if(!summaryEl||!summaryContent)return;
  summaryEl.style.display='block';

  const gradeColorD=ns=>ns>=50?'var(--red)':ns>=30?'var(--amber)':ns>=15?'var(--text3)':'var(--green)';
  const gradeLetterD=ns=>ns>=50?'!!':ns>=30?'!':ns>=15?'~':'OK';

  const sortedPos=posAnalysis.filter(p=>p.pos!=='K');

  let dhtml=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px">
    <div class="home-sec-title" style="margin-bottom:8px">Draft Intel</div>`;

  if(sortedPos.length){
    dhtml+=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${sortedPos.map(p=>{
      const chipClass=p.needScore>=50?'strat-chip-critical':p.needScore>=30?'strat-chip-need':'strat-chip-ok';
      const gradeLetter=gradeLetterD(p.needScore);
      return`<span class="strat-chip ${chipClass}" onclick="_rookieFilter('${p.pos}')">${gradeLetter} ${p.pos} · ${p.startable}/${p.slotsNeeded} starters</span>`;
    }).join('')}</div>`;
    dhtml+=sortedPos.map(p=>{
      const gradeColor=gradeColorD(p.needScore);
      const gradeLetter=gradeLetterD(p.needScore);
      const barColor=p.needScore>=50?'var(--red)':p.needScore>=30?'var(--amber)':p.needScore>=15?'var(--text3)':'var(--green)';
      return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="_rookieFilter('${p.pos}')">
        <span style="font-size:13px;font-weight:700;color:${gradeColor};min-width:20px">${gradeLetter}</span>
        <span style="font-size:13px;font-weight:600;color:var(--text);min-width:28px">${p.pos}</span>
        <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.min(100,p.needScore)}%;background:${barColor};border-radius:3px;transition:width .4s"></div>
        </div>
        <span style="font-size:13px;color:var(--text3);min-width:40px;text-align:right">${p.startable}/${p.slotsNeeded}</span>
      </div>`;
    }).join('');
  } else {
    dhtml+=`<div style="font-size:13px;color:var(--green);padding:6px 0">No critical needs — draft best player available.</div>`;
  }

  // Append history INTO the strategy card (merged "Draft Intel")
  if(LI_LOADED&&LI.hitRateByRound){
    const myPickRoundsSet=new Set(ownPickRounds);
    const keyInsights=[];
    for(let rd=1;rd<=Math.min(draftRounds,7);rd++){
      const roundData=LI.hitRateByRound[rd];
      if(!roundData)continue;
      const rate=roundData.rate||0;
      const isMine=myPickRoundsSet.has(rd);
      const bestPos2=(roundData.bestPos||[]).slice(0,2).map(bp=>bp.pos).join('/');
      if(isMine)keyInsights.push({rd,rate,bestPos:bestPos2,mine:true});
    }

    if(keyInsights.length){
      dhtml+=`<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Your Pick Hit Rates · ${LI.draftMeta?.length||0} drafts</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:4px">`;
      dhtml+=keyInsights.map(k=>{
        const hitCol=k.rate>=50?'var(--green)':k.rate>=25?'var(--amber)':'var(--red)';
        return`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px">
          <span style="font-weight:700;color:var(--accent);min-width:24px">R${k.rd}</span>
          ${_radialProgress(k.rate,hitCol)}
          ${k.bestPos?`<span style="color:var(--text3);font-size:13px">best at ${k.bestPos}</span>`:''}
        </div>`;
      }).join('');
      dhtml+=`</div>`;
    }

    // Full grid (collapsed by default)
    dhtml+=`<details style="margin-top:8px"><summary style="font-size:13px;color:var(--text3);cursor:pointer;padding:4px 0">View all rounds</summary>
    <div style="display:grid;grid-template-columns:40px 1fr 50px 1fr;gap:4px 8px;align-items:center;font-size:13px;margin-top:8px">
      <span style="font-weight:700;color:var(--text3)">Rd</span><span style="font-weight:700;color:var(--text3)">Rate</span><span></span><span style="font-weight:700;color:var(--text3)">Best</span>`;

    for(let rd=1;rd<=draftRounds;rd++){
      const roundData=LI.hitRateByRound[rd];
      if(!roundData)continue;
      const rate=roundData.rate||0;
      const isMine=ownPickRounds.includes(rd);
      const hitColor=rate>=50?'var(--green)':rate>=25?'var(--amber)':'var(--red)';
      const posRecs=(roundData.bestPos||[]).slice(0,3).map(bp=>{
        const myNeed=posAnalysis.find(pa=>pa.pos===bp.pos);
        const needDot=myNeed&&myNeed.needScore>=20?'🎯':'';
        return`<span style="color:${bp.rate>=40?'var(--green)':bp.rate>=20?'var(--text2)':'var(--text3)'}">${bp.pos} ${bp.rate}%${needDot}</span>`;
      }).join(' · ');

      dhtml+=`
        <span style="font-weight:700;color:${isMine?'var(--accent)':'var(--text)'}">${isMine?'► ':''}R${rd}</span>
        <div style="background:var(--bg4);border-radius:2px;height:5px;overflow:hidden"><div style="width:${Math.max(3,rate)}%;height:100%;background:${hitColor};border-radius:2px"></div></div>
        <span style="color:${hitColor};font-weight:600">${rate}%</span>
        <span style="color:var(--text3)">${posRecs||'—'}</span>`;
    }
    dhtml+=`</div></details></div>`;
  }

  dhtml+=`</div>`;
  summaryContent.innerHTML=dhtml;
  needsEl.style.display='none';

  renderRookieBoard();
}

// ── Rookie Scouting Board (sortable compact table) ────────────
let _rookieSort={key:'dhq',dir:-1};
let _rookiePosFilter='';
let _rookieExpanded=null;
let _rookieShowAll=false;

function renderRookieBoard(){
  const el=$('rookie-profiles');if(!el)return;
  // Don't block on LI_LOADED — show what we have from Sleeper data

  // Phase 8 v2: position mapper aligned with shared/utils.js normPos —
  // collapses raw NFL positions (NT/IDL/EDGE/MLB/SS/FS etc.) into the
  // fantasy display groups (DL/LB/DB). This must be wider than the old
  // narrow posMapD so IDP prospects match the DL/LB/DB filter chips.
  const posMapRookie = p => {
    if (['DE','DT','NT','IDL','EDGE'].includes(p)) return 'DL';
    if (['OLB','ILB','MLB'].includes(p)) return 'LB';
    if (['CB','S','SS','FS'].includes(p)) return 'DB';
    return p;
  };

  // Get rookies from player database
  let rookies=Object.entries(S.players||{})
    .filter(([pid,p])=>p.years_exp===0&&p.status!=='Inactive'&&p.position&&!['HC','OC','DC','GM'].includes(p.position))
    .map(([pid,p])=>{
      const dhq=dynastyValue(pid)||0;
      const pos=posMapRookie(pPos(pid)||p.position);
      const rookieMeta=LI?.playerMeta?.[pid];
      if(dhq<=0&&!p.team&&rookieMeta?.source!=='FC_ROOKIE')return null;
      // Check IDP filtering via shared helpers (Phase 8 v2)
      const league=S.leagues?.find(l=>l.league_id===S.currentLeagueId);
      const isIDP=isIDPPosition(p.position);
      const leagueHasIDP=leagueHasIDPSlots(league);
      if(isIDP&&!leagueHasIDP)return null;
      const meta=LI?.playerMeta?.[pid]||{};
      const college=p.college||'';
      const age=p.age||'';
      // Enrich with CSV rookie data if available
      const csvProspect=typeof window.findProspect==='function'?window.findProspect((p.first_name||'')+' '+(p.last_name||'')):null;
      const csvRank=csvProspect?.rank||null;
      const csvSummary=csvProspect?.summary||'';
      const csvSize=csvProspect?[csvProspect.size,csvProspect.weight?csvProspect.weight+'lbs':'',csvProspect.speed||''].filter(Boolean).join(' · '):'';
      const csvTier=csvProspect?.tier||'';
      // Fit score based on team needs
      const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
      const needPos=assess?.needs?.map(n=>n.pos)||[];
      const fit=needPos.includes(pos)?'high':needPos.length&&!assess?.strengths?.includes(pos)?'med':'low';
      return{pid,p,dhq,pos,college:csvProspect?.college||college,age,meta,fit,csvRank,csvSummary,csvSize,csvTier};
    })
    .filter(Boolean);

  // Apply position filter
  if(_rookiePosFilter)rookies=rookies.filter(r=>r.pos===_rookiePosFilter);

  // Apply sort
  rookies.sort((a,b)=>{
    const k=_rookieSort.key,d=_rookieSort.dir;
    if(k==='dhq')return(b.dhq-a.dhq)*d;
    if(k==='name')return d*((a.p.full_name||'').localeCompare(b.p.full_name||''));
    if(k==='pos')return d*((a.pos||'').localeCompare(b.pos||''));
    if(k==='age')return d*((a.age||99)-(b.age||99));
    if(k==='fit'){const fo={high:0,med:1,low:2};return d*((fo[a.fit]||2)-(fo[b.fit]||2));}
    return 0;
  });

  rookies=rookies.slice(0,50);

  // Limit to top 25 unless user expanded
  const ROOKIE_PAGE=25;
  const totalRookies=rookies.length;
  const visibleRookies=_rookieShowAll?rookies:rookies.slice(0,ROOKIE_PAGE);
  const hiddenCount=totalRookies-visibleRookies.length;

  const sortInd=k=>_rookieSort.key===k?(_rookieSort.dir===-1?' \u25BC':' \u25B2'):'';
  const posFilters=['','QB','RB','WR','TE'];

  // Check if league has K/IDP slots (Phase 8 v2 — via shared helpers)
  const league=S.leagues?.find(l=>l.league_id===S.currentLeagueId);
  const rp=league?.roster_positions||[];
  const leagueHasK=rp.some(s=>s==='K');
  const leagueHasIDP=leagueHasIDPSlots(league);
  if(leagueHasK)posFilters.push('K');
  if(leagueHasIDP)posFilters.push('DL','LB','DB');

  // Hero card — Alex's decisive pick, big and bold
  const _rbStrat = window.GMStrategy?.getStrategy ? window.GMStrategy.getStrategy() : {};
  const _rbDs = _rbStrat.draftStyle || 'bpa';
  const _rbAssess = typeof assessTeamFromGlobal === 'function' ? assessTeamFromGlobal(S.myRosterId) : null;
  const _rbNeeds = (_rbAssess?.needs || []).map(n => typeof n === 'string' ? n : n.pos);
  let _rbHero = '';
  if (rookies.length > 0) {
    let _rbPick = rookies[0];
    if (_rbDs === 'need' && _rbNeeds.length) _rbPick = rookies.find(r => _rbNeeds.includes(r.pos)) || _rbPick;
    else if (_rbDs === 'mix' && _rbNeeds.length) _rbPick = rookies.find(r => _rbNeeds.includes(r.pos) || (_rbStrat.targetPositions||[]).includes(r.pos)) || _rbPick;
    const _rbIsTop = _rbPick === rookies[0];
    const _rbNext = rookies[1];
    const _rbTierBreak = _rbIsTop && _rbNext && (_rbPick.dhq - _rbNext.dhq) > 1000;
    const _rbSubtitle = _rbTierBreak
      ? 'Clear tier break. Don\'t overthink it.'
      : _rbDs === 'need'
      ? 'Fills your ' + _rbPick.pos + ' gap. Best value at your position of need.'
      : _rbDs === 'mix'
      ? 'Best value + roster fit. Take him.'
      : '#1 overall value. BPA, no question.';
    // Strategy alignment
    const _rbAlignCheck = window.GMStrategy?.checkAlignment ? window.GMStrategy.checkAlignment({type:'draft',pos:_rbPick.pos}) : null;
    const _rbAlignLabel = _rbAlignCheck?.status === 'aligned' ? 'Strategy aligned' : _rbAlignCheck?.status === 'partial' ? 'Partial fit' : _rbPick.fit === 'high' ? 'Roster fit' : '';
    const _rbAlignCol = _rbAlignCheck?.status === 'aligned' ? 'var(--green)' : _rbPick.fit === 'high' ? 'var(--green)' : 'var(--amber)';
    _rbHero = `<div style="background:rgba(212,175,55,.08);border:2px solid rgba(212,175,55,.4);border-radius:var(--rl);padding:16px 18px;margin-bottom:14px;cursor:pointer;position:relative;overflow:hidden" onclick="openPlayerModal('${_rbPick.pid}')">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--accent),transparent)"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">Alex says</div>
        ${_rbAlignLabel ? `<span style="font-size:9px;font-weight:700;color:${_rbAlignCol};padding:1px 6px;border:1px solid ${_rbAlignCol};border-radius:8px;opacity:.9">${escHtml(_rbAlignLabel)}</span>` : ''}
        ${_rbTierBreak ? '<span style="font-size:9px;font-weight:700;color:var(--red);padding:1px 6px;border:1px solid rgba(231,76,60,.4);border-radius:8px">Tier break</span>' : ''}
      </div>
      <div style="font-size:22px;font-weight:900;color:var(--text);line-height:1.1;letter-spacing:-.02em">Take ${escHtml(pName(_rbPick.pid))}.</div>
      <div style="font-size:14px;color:var(--text2);margin-top:6px;font-weight:500">${escHtml(_rbSubtitle)}</div>
      ${_rbPick.dhq > 0 ? `<div style="font-size:12px;color:var(--text3);margin-top:6px;font-family:'JetBrains Mono',monospace">${_rbPick.pos} · ${_rbPick.dhq.toLocaleString()} DHQ${_rbPick.csvRank ? ' · Consensus #' + _rbPick.csvRank : ''}</div>` : ''}
    </div>`;
  }

  el.innerHTML=_rbHero+`
    <div class="home-sec-title" style="margin-bottom:8px">Rookie Board</div>
    <!-- Position filters -->
    <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
      ${posFilters.map(pos=>`<button class="chip${_rookiePosFilter===pos?' chip-active':''}" onclick="_rookieFilter('${pos}')" style="padding:4px 10px;font-size:13px;border-radius:14px;cursor:pointer;border:1px solid ${_rookiePosFilter===pos?'var(--accent)':'var(--border2)'};background:${_rookiePosFilter===pos?'var(--accentL)':'transparent'};color:${_rookiePosFilter===pos?'var(--accent)':'var(--text3)'}">${pos||'All'}</button>`).join('')}
    </div>
    <!-- Table header -->
    <div class="rb-header-sticky" style="display:flex;align-items:center;padding:4px 8px;font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border2)">
      <span style="width:28px;text-align:center">#</span>
      <span style="flex:1;cursor:pointer" onclick="_rookieSortBy('name')">Player${sortInd('name')}</span>
      <span style="width:36px;text-align:center;cursor:pointer" onclick="_rookieSortBy('pos')">Pos${sortInd('pos')}</span>
      <span style="width:32px;text-align:center;cursor:pointer" onclick="_rookieSortBy('age')">Age${sortInd('age')}</span>
      <span style="width:54px;text-align:right;cursor:pointer" onclick="_rookieSortBy('dhq')">DHQ${sortInd('dhq')}</span>
      <span style="width:40px;text-align:center;cursor:pointer" onclick="_rookieSortBy('fit')">Fit${sortInd('fit')}</span>
    </div>
    <!-- Rows -->
    ${visibleRookies.map((r,i)=>{
      const dhqCol=r.dhq>=7000?'var(--green)':r.dhq>=4000?'var(--blue)':r.dhq>=2000?'var(--text2)':'var(--text3)';
      const fitBadge=r.fit==='high'?'<span class="fit-high">FIT</span>':r.fit==='med'?'<span class="fit-med">VAL</span>':'<span class="fit-low">\u2014</span>';
      const isExp=_rookieExpanded===r.pid;
      const posStyle=getPosBadgeStyle?getPosBadgeStyle(r.pos):'';
      return`<div>
        <div onclick="_rookieToggle('${r.pid}')" style="display:flex;align-items:center;padding:6px 8px;cursor:pointer;border-bottom:1px solid ${isExp?'transparent':'var(--border)'};background:${isExp?'var(--accentL2)':'transparent'};transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='${isExp?'var(--accentL2)':'transparent'}'">
          <span style="width:28px;text-align:center;font-size:13px;font-weight:700;color:${i<3?'var(--accent)':'var(--text3)'}">${i+1}</span>
          <div style="flex:1;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden">
            <img src="https://sleepercdn.com/content/nfl/players/${r.pid}.jpg" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'" loading="lazy"/>
            <div style="min-width:0;overflow:hidden">
              <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.p.full_name||'Unknown'}</div>
              <div style="font-size:13px;color:var(--text3)">${r.college||r.p.team||''}</div>
            </div>
          </div>
          <span style="width:36px;text-align:center"><span class="rr-pos" style="${posStyle};font-size:13px;padding:1px 4px">${r.pos}</span></span>
          <span style="width:32px;text-align:center;font-size:13px;color:var(--text3)">${r.age||'\u2014'}</span>
          <span style="width:54px;text-align:right;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${dhqCol}">${r.dhq>0?r.dhq.toLocaleString():'\u2014'}</span>
          <span style="width:40px;text-align:center">${fitBadge}</span>
        </div>
        ${isExp?`<div style="padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:0 0 var(--r) var(--r);margin-bottom:4px;animation:panelIn .2s ease">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
            <span style="font-size:13px;color:var(--text2)">${r.pos} \u00B7 ${r.p.team||'TBD'} \u00B7 Age ${r.age||'?'}${r.csvSize?' \u00B7 '+r.csvSize:r.p.height?' \u00B7 '+Math.floor(r.p.height/12)+"'"+r.p.height%12+'"':''}${!r.csvSize&&r.p.weight?' \u00B7 '+r.p.weight+'lbs':''}</span>
            ${r.csvRank?'<span style="font-size:11px;padding:1px 6px;border-radius:4px;font-weight:700;background:var(--accentL);color:var(--accent)">Consensus #'+r.csvRank+'</span>':''}
            ${r.csvTier?'<span style="font-size:11px;padding:1px 6px;border-radius:4px;font-weight:600;background:var(--bg4);color:var(--text3)">'+r.csvTier+'</span>':''}
          </div>
          ${r.csvSummary?'<div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:8px;padding:8px;background:var(--bg3);border-radius:6px">'+r.csvSummary+(r.csvSummary.length>=300?'...':'')+'</div>':''}
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm" onclick="fillGlobalChat('Full scouting report on ${(r.p.full_name||'').replace(/'/g,"\\'")} (${r.pos}, ${r.college||'Unknown'}). Include strengths, weaknesses, NFL comparison, and where I should draft them.')">Scout Report</button>
            <button class="btn btn-sm btn-ghost" onclick="openPlayerModal('${r.pid}')">Player Card</button>
          </div>
        </div>`:''}
      </div>`;
    }).join('')}
    ${visibleRookies.length===0?'<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No rookies match this filter</div>':''}
    ${hiddenCount>0?`<button onclick="_rookieShowMore()" style="width:100%;padding:10px;margin-top:6px;font-size:13px;font-weight:600;color:var(--text3);background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">Show More (${hiddenCount} remaining)</button>`:''}
  `;
}

// Helper functions for rookie board
function _rookieSortBy(key){
  if(_rookieSort.key===key)_rookieSort.dir*=-1;
  else{_rookieSort.key=key;_rookieSort.dir=-1;}
  renderRookieBoard();
}
function _rookieFilter(pos){
  _rookiePosFilter=pos;
  _rookieShowAll=false; // reset pagination on filter change
  renderRookieBoard();
}
function _rookieToggle(pid){
  _rookieExpanded=_rookieExpanded===pid?null:pid;
  renderRookieBoard();
}
function _rookieShowMore(){
  _rookieShowAll=true;
  renderRookieBoard();
}

// Legacy alias
function renderRookieProfiles(){renderRookieBoard();}

window._rookieSortBy=_rookieSortBy;
window._rookieFilter=_rookieFilter;
window._rookieToggle=_rookieToggle;
window._rookieShowMore=_rookieShowMore;
window.renderRookieBoard=renderRookieBoard;

// Toggle expand/collapse on the owned-picks big card (Phase 4).
function _toggleOwnedPicks(){
  const el=document.getElementById('draft-picks-expand');
  const chev=document.getElementById('draft-picks-chev');
  if(!el)return;
  const open=el.style.maxHeight&&el.style.maxHeight!=='0px';
  if(open){
    el.style.maxHeight='0';
    if(chev)chev.style.transform='';
  } else {
    el.style.maxHeight=el.scrollHeight+'px';
    if(chev)chev.style.transform='rotate(180deg)';
  }
}
window._toggleOwnedPicks=_toggleOwnedPicks;

// Toggle the "Tendencies" expand card inside the mock draft on-the-clock
// header (Phase 4). Shows league-wide draft intel — position runs, round
// hit-rates, round targets — sourced from posAnalysis + LI.leagueHistory.
function _toggleMockTendencies(){
  const body=document.getElementById('mock-tendencies-body');
  if(!body)return;
  const open=body.style.maxHeight&&body.style.maxHeight!=='0px';
  if(open){
    body.style.maxHeight='0';
    body.style.marginBottom='0';
    return;
  }
  // Lazy-populate on first open
  if(!body.dataset.populated){
    const LI_=window.LI||{};
    const history=LI_.leagueHistory||[];
    let html='<div style="padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:8px">';
    html+='<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">League draft tendencies</div>';
    if(history.length){
      // Top 3 position runs by round from league history
      const byPos={};
      history.forEach(h=>{const pos=h.pos;if(!pos)return;byPos[pos]=(byPos[pos]||0)+1;});
      const top=Object.entries(byPos).sort((a,b)=>b[1]-a[1]).slice(0,3);
      html+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">';
      top.forEach(([pos,ct])=>{
        html+=`<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--accentL);color:var(--accent)">${pos} × ${ct}</span>`;
      });
      html+='</div>';
      html+=`<div style="font-size:11px;color:var(--text3);line-height:1.5">Based on ${history.length} past picks. Ask the chat for round-by-round hit rates or positional runs.</div>`;
    } else {
      html+='<div style="font-size:12px;color:var(--text3);line-height:1.5">No league draft history yet. Ask the chat: "What are the draft tendencies in my league by round?"</div>';
    }
    html+='<button onclick="fillGlobalChat(\'Show me league-wide draft tendencies by round and position\')" style="margin-top:8px;padding:6px 12px;font-size:11px;font-weight:700;background:var(--bg4);border:1px solid var(--border2);border-radius:6px;color:var(--accent);cursor:pointer;font-family:inherit">Ask for full breakdown</button>';
    html+='</div>';
    body.innerHTML=html;
    body.dataset.populated='1';
  }
  body.style.maxHeight=body.scrollHeight+'px';
  body.style.marginBottom='8px';
}
window._toggleMockTendencies=_toggleMockTendencies;

async function runDraftScouting(){
  if(!hasAnyAI()){switchTab('settings');return;}
  if(typeof trackUsage==='function')trackUsage('draft_targets_flagged');
  const btn=$('draft-scout-btn');btn.textContent='Scouting...';btn.disabled=true;
  $('draft-scout-content').innerHTML='<div class="card"><div class="empty">Analyzing your picks, roster needs, and league draft history...</div></div>';
  try{
    const year=$('draft-year-sel')?.value||'2026';
    const my=myR();
    const allPlayers=my?.players||[];
    const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
    const rp=league?.roster_positions||[];
    const teams=S.rosters.length||12;
    const sc7=league?.scoring_settings||{};

    const starterSlots={QB:0,RB:0,WR:0,TE:0,K:0,DL:0,LB:0,DB:0};
    rp.forEach(s=>{
      if(s in starterSlots)starterSlots[s]++;
      else if(s==='FLEX'){starterSlots.RB+=0.4;starterSlots.WR+=0.4;starterSlots.TE+=0.2;}
      else if(s==='SUPER_FLEX'){starterSlots.QB+=0.5;starterSlots.WR+=0.25;starterSlots.RB+=0.25;}
      else if(s==='IDP_FLEX'){starterSlots.DL+=0.35;starterSlots.LB+=0.35;starterSlots.DB+=0.3;}
    });
    Object.keys(starterSlots).forEach(p=>starterSlots[p]=Math.round(starterSlots[p]));

    const needsStr=Object.keys(starterSlots).filter(p=>starterSlots[p]>0).map(pos=>{
      const posPlayers=allPlayers.filter(pid=>pPos(pid)===pos);
      const aging=posPlayers.filter(pid=>{const a=pAge(pid);const peaksD={QB:33,RB:27,WR:30,TE:30,DL:29,LB:28,DB:29};return a>(peaksD[pos]||29);}).length;
      return`${pos}: ${posPlayers.length} rostered / ${starterSlots[pos]} slots${aging?' ('+aging+' aging)':''}`;
    }).join(', ');

    const myPicks=S.tradedPicks.filter(p=>p.owner_id===S.myRosterId&&String(p.season)===year);
    const draftRounds=league?.settings?.draft_rounds||5;
    const tradedAway=S.tradedPicks.filter(p=>p.previous_owner_id===S.myRosterId&&String(p.season)===year);
    const pickRounds=[];
    for(let rd=1;rd<=draftRounds;rd++){
      if(!tradedAway.some(p=>p.round===rd))pickRounds.push('R'+rd);
    }
    myPicks.forEach(p=>{const k='R'+p.round;if(!pickRounds.includes(k))pickRounds.push(k);});
    const pickStr=pickRounds.join(', ')||'Unknown';

    let historyCtx='';
    if(LI_LOADED&&LI.hitRateByRound){
      const lines=Object.entries(LI.hitRateByRound).filter(([rd])=>parseInt(rd)<=draftRounds).map(([rd,d])=>{
        const best=d.bestPos?.slice(0,3).map(p=>p.pos+'('+p.rate+'% hit)').join(',')||'—';
        return`R${rd}:${d.rate}% overall hit,best=${best}`;
      });
      historyCtx='\nLEAGUE DRAFT HISTORY ('+LI.totalPicks+' picks over 5yrs):\n'+lines.join('\n');
      if(LI.pickSlotHistory){
        const slotSamples=pickRounds.slice(0,3).map(pr=>{
          const rd=parseInt(pr.replace('R',''));
          const midSlot=rd*teams-Math.floor(teams/2);
          const nearby=Object.entries(LI.pickSlotHistory)
            .filter(([slot])=>Math.abs(parseInt(slot)-midSlot)<=3)
            .flatMap(([,picks])=>picks);
          if(!nearby.length)return null;
          const hits=nearby.filter(p=>p.hit);
          const posDist={};nearby.forEach(p=>{posDist[p.pos]=(posDist[p.pos]||0)+1;});
          return`Picks near ${pr}(slot~${midSlot}):${nearby.length} historical, ${hits.length} hits. Positions drafted:${Object.entries(posDist).map(([p,c])=>p+':'+c).join(',')}`;
        }).filter(Boolean);
        if(slotSamples.length)historyCtx+='\n'+slotSamples.join('\n');
      }
    }

    // Build positional scarcity context from starterSlots
    const scarcityCtx=Object.keys(starterSlots).filter(pos=>starterSlots[pos]>0).map(pos=>{
      const posPlayers=allPlayers.filter(pid=>pPos(pid)===pos);
      const peaksD={QB:33,RB:27,WR:30,TE:30,DL:29,LB:28,DB:29};
      const aging=posPlayers.filter(pid=>{const a=pAge(pid);return a>(peaksD[pos]||29);}).length;
      const young=posPlayers.filter(pid=>pAge(pid)<25).length;
      const elite=posPlayers.filter(pid=>dynastyValue(pid)>=5000).length;
      const startable=posPlayers.filter(pid=>dynastyValue(pid)>=2000).length;
      const slotsNeeded=starterSlots[pos];
      const status=startable>=slotsNeeded?'FILLED':'GAP';
      return`${pos}: ${startable}/${slotsNeeded} starters (${status}), ${aging} aging, ${young} young, ${elite} elite`;
    }).join('\n');

    const prompt=`${year} rookie draft scouting for ${teams}-team dynasty league.
${typeof dhqContext === 'function' ? dhqContext(false) : ''}
MY ROSTER NEEDS (starters/slots):
${scarcityCtx}
MY PICKS: ${pickStr}
${dhqBuildMentalityContext()}
${historyCtx}
SCORING: IDP sack=${sc7.idp_sack||4}, INT=${sc7.idp_int||5}, PD=${sc7.idp_pass_def||3}, PPR=${sc7.rec||1}

CRITICAL RULES:
- Consider POSITIONAL SCARCITY in the rookie class — how many startable rookies exist at each position
- Factor in STARTER THRESHOLDS — if I need 4 DL starters and only have 2, that's more urgent than needing 6 WR and having 5
- Use HIT PROBABILITY BY ROUND AND POSITION — don't recommend a position in a round where hit rates are historically terrible
- Ensure all recommendations are INTERNALLY CONSISTENT — do not recommend targeting a position in one section and avoiding it in another
- Be SPECIFIC about which rounds to target which positions based on value intersection

Based on the ${year} rookie class and my league's ACTUAL historical draft data, give me a CONCISE scout briefing (this is mobile — keep it tight):

1. TOP 3 TARGETS — specific rookie names, position, and which of MY picks to use. One sentence each on why they fit my roster.

2. QUICK STRATEGY — one paragraph: should I trade up/down? What positions to hammer vs avoid? What's the key value play?

3. ONE THING TO WATCH — the single most important insight for my draft (a position run risk, a sleeper, a trap to avoid).

Keep the total response under 300 words. Be specific with prospect names. Search the web for current ${year} rookie rankings.`;

    const timeoutMs=90000;
    const reply=await Promise.race([
      callClaude([{role:'user',content:prompt}],true,2,1200),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Scouting report timed out — try again')),timeoutMs))
    ]);
    if(!reply||!reply.trim()){throw new Error('No response from AI — check your connection and try again');}
    $('draft-scout-content').innerHTML=`
      <div class="card" style="border-color:rgba(212,175,55,.2)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="font-size:15px;font-weight:600">${year} Draft Scouting Report</div>
          <button class="copy-btn" style="margin-left:auto" onclick="copyText(${JSON.stringify(reply)},this)">Copy</button>
        </div>
        <div style="font-size:14px;color:var(--text2);line-height:1.7">${reply.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--text)">$1</strong>').replace(/#{1,3} /g,'').replace(/\n\n/g,'</p><p style="margin-top:10px">').replace(/\n/g,'<br>')}</div>
      </div>`;
    draftChatHistory=[];
    addDraftMsg(`I've analyzed your ${year} draft position. What would you like to dig into?`,'a');
  }catch(e){$('draft-scout-content').innerHTML=`<div class="card"><div class="empty" style="color:var(--red)">Error: ${escHtml(e.message||'Unknown error')}</div><button class="btn btn-ghost btn-sm" onclick="runDraftScouting()" style="margin-top:8px">Try Again</button></div>`;}
  btn.textContent='Scout ↗';btn.disabled=false;
}

// sendDraftChatMsg: defined in ai-chat.js
// addDraftMsg: defined in ai-chat.js


// ── Top Prospects (card-based layout) ─────────────────────────────
let _draftPosFilter = '';

function _setDraftPosFilter(pos) {
  _draftPosFilter = _draftPosFilter === pos ? '' : pos;
  renderTopProspects();
}
window._setDraftPosFilter = _setDraftPosFilter;

function renderTopProspects(){
  const el=$('draft-top-prospects');if(!el)return;
  if(!LI_LOADED||!LI.playerMeta){el.innerHTML='';return;}

  // Get team needs from assessment
  const assess = typeof assessTeamFromGlobal === 'function' ? assessTeamFromGlobal(S.myRosterId) : null;
  const needPositions = (assess?.needs || []).map(n => typeof n === 'string' ? n : n.pos);

  // Strategy context
  const strat = window.GMStrategy?.getStrategy ? window.GMStrategy.getStrategy() : {};
  const draftStyle = strat.draftStyle || 'bpa';
  const targetPos = strat.targetPositions || [];

  // Find rookies by source=FC_ROOKIE, sorted by DHQ value
  let allRookies = Object.entries(LI.playerMeta)
    .filter(([pid,m]) => m.source === 'FC_ROOKIE' && (LI.playerScores?.[pid] || 0) > 0)
    .map(([pid,m]) => {
      const p = S.players?.[pid] || {};
      const pos = m.pos || pPos(pid);
      return {
        pid, name: pName(pid), pos, team: p.team || '',
        college: p.college || '', val: LI.playerScores[pid] || 0,
        height: p.height, weight: p.weight
      };
    })
    .sort((a,b) => b.val - a.val);

  if(!allRookies.length){el.innerHTML='';return;}

  // Best Available (overall #1)
  const bestAvail = allRookies[0];

  // Best Fit (highest DHQ at a need position)
  const bestFit = needPositions.length
    ? allRookies.find(r => needPositions.includes(r.pos)) || bestAvail
    : bestAvail;

  // Get user's next pick info
  const league = S.leagues?.find(l => l.league_id === S.currentLeagueId);
  const draftRounds = league?.settings?.draft_rounds || 4;
  const teams = S.rosters?.length || 12;
  const year = $('draft-year-sel')?.value || '2026';
  const allTP = S.tradedPicks || [];
  let nextRound = null, nextPick = null;
  for (let rd = 1; rd <= draftRounds; rd++) {
    const tradedAway = allTP.find(p => String(p.season) === year && p.round === rd && p.roster_id === S.myRosterId && p.owner_id !== S.myRosterId);
    if (!tradedAway) { nextRound = rd; break; }
  }
  if (nextRound) {
    const rosterRanks = S.rosters.map(r => ({ rid: r.roster_id, val: (r.players || []).reduce((s, pid) => s + dynastyValue(pid), 0) })).sort((a, b) => a.val - b.val);
    const estPos = rosterRanks.findIndex(r => r.rid === S.myRosterId) + 1 || Math.ceil(teams / 2);
    nextPick = estPos;
  }

  // Position filter for prospect grid
  const posFilters = ['All', 'QB', 'RB', 'WR', 'TE'];
  const filteredRookies = _draftPosFilter
    ? allRookies.filter(r => r.pos === _draftPosFilter)
    : allRookies;
  const gridRookies = filteredRookies.slice(0, 8);

  // Helper: format height
  const fmtHt = (h) => h ? Math.floor(h / 12) + "'" + (h % 12) + '"' : '';

  // Helper: position rank (1-based rank within that position group)
  const posRank = (pid, pos) => {
    const samePosAll = allRookies.filter(r => r.pos === pos);
    const idx = samePosAll.findIndex(r => r.pid === pid);
    return idx >= 0 ? idx + 1 : '—';
  };

  // Helper: prospect card for hero section (64px photo)
  const heroCard = (r, label) => {
    const ht = fmtHt(r.height);
    const wt = r.weight ? r.weight + 'lbs' : '';
    const details = [r.college, [ht, wt].filter(Boolean).join(', ')].filter(Boolean).join(' | ');
    return `<div style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:10px;cursor:pointer" onclick="openPlayerModal('${r.pid}')">
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${label}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <img src="https://sleepercdn.com/content/nfl/players/thumb/${r.pid}.jpg" onerror="this.style.display='none'" style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg4)" loading="lazy"/>
        <div style="min-width:0;overflow:hidden">
          <div style="font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(details)}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(212,175,55,.1);color:var(--accent)">${r.pos}</span>
            <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace">#${posRank(r.pid, r.pos)} ${r.pos}</span>
            <span style="font-size:11px;color:var(--text3)">|</span>
            <span style="font-size:12px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace">${r.val.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>`;
  };

  // Helper: grid card (48px photo) with strategy alignment
  const gridCard = (r) => {
    const isStratTarget = targetPos.includes(r.pos);
    const isNeedFit = needPositions.includes(r.pos);
    const badgeHtml = isStratTarget
      ? '<span style="font-size:9px;font-weight:700;padding:1px 4px;border-radius:5px;background:rgba(212,175,55,.18);color:var(--accent);letter-spacing:.03em">TARGET</span>'
      : isNeedFit
      ? '<span style="font-size:9px;font-weight:700;padding:1px 4px;border-radius:5px;background:rgba(52,211,153,.12);color:var(--green);letter-spacing:.03em">NEED</span>'
      : '';
    const borderColor = isStratTarget ? 'rgba(212,175,55,.4)' : isNeedFit ? 'rgba(52,211,153,.3)' : 'var(--border)';
    return `<div style="background:var(--bg2);border:1px solid ${borderColor};border-radius:var(--r);padding:8px;cursor:pointer;transition:border-color .15s" onclick="openPlayerModal('${r.pid}')" onmouseover="this.style.borderColor='rgba(212,175,55,.55)'" onmouseout="this.style.borderColor='${borderColor}'">
      <div style="display:flex;align-items:center;gap:8px">
        <img src="https://sleepercdn.com/content/nfl/players/thumb/${r.pid}.jpg" onerror="this.style.display='none'" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;background:var(--bg4)" loading="lazy"/>
        <div style="min-width:0;overflow:hidden;flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</div>
          <div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.college || r.team || '')}</div>
          <div style="display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap">
            <span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:6px;background:rgba(212,175,55,.1);color:var(--accent)">${r.pos}</span>
            <span style="font-size:11px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace">${r.val.toLocaleString()}</span>
            ${badgeHtml}
          </div>
        </div>
      </div>
    </div>`;
  };

  // Build HTML — Alex Pick card first
  let html = '';

  // ALEX'S PICK — decisive recommendation
  const alexPick = draftStyle === 'need'
    ? (allRookies.find(r => needPositions.includes(r.pos)) || bestFit)
    : draftStyle === 'mix'
    ? (allRookies.find(r => needPositions.includes(r.pos) || targetPos.includes(r.pos)) || bestAvail)
    : bestAvail;

  const alexPickNeedFit = needPositions.includes(alexPick.pos);
  const alexPickTargetFit = targetPos.includes(alexPick.pos);
  const alexWhyParts = [];
  if(alexPickNeedFit) alexWhyParts.push('Fills your biggest '+alexPick.pos+' gap');
  else if(alexPickTargetFit) alexWhyParts.push('Hits your target position');
  else alexWhyParts.push('#1 overall value at '+alexPick.val.toLocaleString()+' DHQ');
  if(alexPick.val>=5000) alexWhyParts.push('Elite dynasty upside');
  else if(alexPick.val>=3000) alexWhyParts.push('Strong dynasty value');
  const alexWhy = alexWhyParts.slice(0,2).join('. ');
  const alexPickLabel = draftStyle==='bpa'?'Best Player Available':draftStyle==='need'?'Best Fit for Your Needs':'Alex\'s Pick';

  html += `<div style="background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.3);border-radius:var(--rl);padding:14px;margin-bottom:14px;cursor:pointer" onclick="openPlayerModal('${alexPick.pid}')">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">Alex says</span>
      <span style="font-size:10px;color:var(--text3)">·</span>
      <span style="font-size:10px;color:var(--text3);font-weight:600">${escHtml(alexPickLabel)}</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <img src="https://sleepercdn.com/content/nfl/players/thumb/${alexPick.pid}.jpg" onerror="this.style.display='none'" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;background:var(--bg4)" loading="lazy"/>
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:800;color:var(--text);letter-spacing:-.02em;line-height:1.1">Take ${escHtml(alexPick.name)}.</div>
        <div style="font-size:13px;color:var(--text2);margin-top:4px;line-height:1.4">${escHtml(alexWhy)}. Don't overthink it.</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
          <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:8px;background:rgba(212,175,55,.15);color:var(--accent)">${alexPick.pos}</span>
          <span style="font-size:11px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace">${alexPick.val.toLocaleString()}</span>
          ${alexPickNeedFit||alexPickTargetFit?'<span style="font-size:9px;font-weight:700;color:var(--green);padding:1px 5px;border:1px solid rgba(52,211,153,.3);border-radius:6px">ALIGNED</span>':''}
        </div>
      </div>
    </div>
  </div>`;

  // ON THE CLOCK hero
  if (nextRound) {
    const pickLabel = nextRound + '.' + String(nextPick || '??').toString().padStart(2, '0');
    const needPills = needPositions.slice(0, 4).map(p =>
      `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--accentL);color:var(--accent)">${p}</span>`
    ).join('');
    html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">On the Clock</span>
        <span style="font-size:13px;font-weight:700;color:var(--text);font-family:'JetBrains Mono',monospace">Round ${nextRound}, Pick ${nextPick || '??'}</span>
      </div>
      ${needPositions.length ? `<div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text3)">Your team needs:</span>${needPills}
      </div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${heroCard(bestAvail, 'Best Available')}
        ${bestFit.pid !== bestAvail.pid ? heroCard(bestFit, 'Best Fit') : ''}
      </div>
    </div>`;
  }

  // Position filter buttons
  html += `<div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap">
    ${posFilters.map(pos => {
      const val = pos === 'All' ? '' : pos;
      const isActive = _draftPosFilter === val;
      return `<button onclick="_setDraftPosFilter('${val}')" style="padding:4px 12px;font-size:12px;font-weight:700;border-radius:14px;cursor:pointer;border:1px solid ${isActive ? 'var(--accent)' : 'var(--border2)'};background:${isActive ? 'var(--accentL)' : 'transparent'};color:${isActive ? 'var(--accent)' : 'var(--text3)'};font-family:inherit;text-transform:uppercase;letter-spacing:.04em">${pos}</button>`;
    }).join('')}
  </div>`;

  // Prospect grid (2x4)
  if (gridRookies.length) {
    html += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">
      ${gridRookies.map(r => gridCard(r)).join('')}
    </div>`;
  } else {
    html += `<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No prospects match this filter</div>`;
  }

  el.innerHTML = html;
}
window.renderTopProspects=renderTopProspects;

// ── Mock Draft ───────────────────────────────────────────────────
// Interactive: user picks for their team, AI picks for all others
let _mockState=null;
let mockDraftPaused=false;
let _mockMode='rookie'; // 'rookie' or 'startup'

function startMockDraft(mode){
  const el=$('draft-mock');if(!el)return;
  // Phase 9 v2: startup mock draft is disabled for now. Always run rookie mock.
  if(mode==='startup'||_mockMode==='startup'){
    if(typeof showToast==='function')showToast('Startup mock draft is coming soon — running rookie draft instead.');
    _mockMode='rookie';
  }
  if(!S.rosters?.length||!LI_LOADED){el.innerHTML='<div style="padding:16px;color:var(--text3);font-size:13px">Connect league and wait for data to load.</div>';return;}
  if(mode&&mode!=='startup')_mockMode=mode;

  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const draftRounds=_mockMode==='rookie'?(league?.settings?.draft_rounds||4):Math.min(league?.settings?.draft_rounds||4,30);
  const teams=S.rosters.length;
  const rp=league?.roster_positions||[];
  const leagueHasIDP=leagueHasIDPSlots(league);
  const leagueHasK=rp.some(s=>s==='K');

  // Build available player pool
  let pool;
  if(_mockMode==='rookie'){
    // Rookies only — unified pool from CSV enrichment data (The Beast)
    // Primary: CSV prospects from getProspects() (shared across War Room + Scout)
    // Supplement: Sleeper rookies with DHQ values not in CSV
    const csvProspects = typeof window.getProspects === 'function' ? window.getProspects() : [];
    const csvNames = new Set(csvProspects.map(p => (p.name || '').toLowerCase().trim()));

    // CSV prospects as the base pool
    pool = csvProspects
      .filter(csv => {
        const pos = pM(csv.mappedPos || csv.pos) || csv.pos;
        if (!leagueHasIDP && ['DL','LB','DB'].includes(pos)) return false;
        if (!leagueHasK && pos === 'K') return false;
        return true;
      })
      .map(csv => {
        const pos = pM(csv.mappedPos || csv.pos) || csv.pos;
        // Try to find matching Sleeper PID for photo/linking
        const sleeperMatch = Object.entries(S.players || {}).find(([, p]) =>
          (p.full_name || '').toLowerCase().trim() === (csv.name || '').toLowerCase().trim() && p.years_exp === 0
        );
        const pid = sleeperMatch ? sleeperMatch[0] : 'csv_' + (csv.name || '').toLowerCase().replace(/[^a-z]/g, '_');
        const dhq = sleeperMatch ? (LI.playerScores?.[sleeperMatch[0]] || 0) : 0;
        const val = dhq > 0 ? dhq : (csv.draftScore || 0);
        return { pid, name: csv.name, pos, val };
      })
      .filter(p => p.val > 0)
      .sort((a, b) => b.val - a.val);

    // Supplement with Sleeper rookies not in CSV
    Object.entries(LI.playerScores || {}).forEach(([pid, val]) => {
      if (val <= 0) return;
      const p = S.players?.[pid];
      if (!p || p.years_exp !== 0) return;
      const name = (p.full_name || '').toLowerCase().trim();
      if (csvNames.has(name)) return; // already in pool
      const pos = pM(pPos(pid)) || pPos(pid);
      if (!leagueHasIDP && ['DL','LB','DB'].includes(pos)) return;
      if (!leagueHasK && pos === 'K') return;
      pool.push({ pid, name: p.full_name || pName(pid), pos, val });
    });
    pool.sort((a, b) => b.val - a.val);
  }else{
    // Startup: all players with DHQ value
    pool=Object.entries(LI.playerScores||{})
      .filter(([pid,val])=>val>500&&S.players[pid])
      .map(([pid,val])=>({pid,name:pName(pid),pos:pPos(pid)||'?',val}))
      .sort((a,b)=>b.val-a.val);
  }

  // Build pick order using real Sleeper draft_order when available
  const pickOrder=[];
  const year=$('draft-year-sel')?.value||'2026';
  const tradedPicks=S.tradedPicks||[];

  // Get real draft order from Sleeper drafts API
  const drafts=S.drafts||[];
  const upcomingDraft=drafts.find(d=>d.status==='pre_draft')||drafts[0];
  const sleeperDraftOrder=upcomingDraft?.draft_order||{};
  const draftType=upcomingDraft?.type||'snake';

  let rosterOrder;
  if(Object.keys(sleeperDraftOrder).length>0){
    // Use actual Sleeper draft order (user_id → slot)
    const slotMap=[];
    Object.entries(sleeperDraftOrder).forEach(([uid,slot])=>{
      const roster=S.rosters.find(r=>r.owner_id===uid);
      if(roster)slotMap.push({slot,roster});
    });
    slotMap.sort((a,b)=>a.slot-b.slot);
    rosterOrder=slotMap.map(s=>s.roster);
  }else{
    // Fallback: reverse standings (worst record picks first)
    rosterOrder=[...S.rosters].sort((a,b)=>(a.settings?.wins||0)-(b.settings?.wins||0));
  }

  for(let rd=1;rd<=draftRounds;rd++){
    const isReversed=draftType==='snake'&&rd%2===0;
    const order=isReversed?[...rosterOrder].reverse():[...rosterOrder];
    order.forEach((r,i)=>{
      // Check if this pick was traded
      const traded=tradedPicks.find(tp=>tp.round===rd&&tp.previous_owner_id===r.roster_id&&String(tp.season)===year);
      const actualOwner=traded?traded.owner_id:r.roster_id;
      pickOrder.push({round:rd,pick:i+1,rosterId:actualOwner,originalRosterId:r.roster_id,overall:pickOrder.length+1});
    });
  }

  // Pre-compute team assessments + owner DNA for AI picks
  const teamProfiles={};
  S.rosters.forEach(r=>{
    const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(r.roster_id):null;
    const ownerProfile=LI.ownerProfiles?.[r.roster_id]||{};
    const owner=(S.leagueUsers||[]).find(u=>u.user_id===r.owner_id);
    teamProfiles[r.roster_id]={
      assess,
      dna:ownerProfile.dna||'balanced',
      tier:assess?.tier||'CROSSROADS',
      needs:(assess?.needs||[]).slice(0,4).map(n=>typeof n==='string'?n:n.pos),
      teamName:(owner?.metadata?.team_name||owner?.display_name||'Team').substring(0,12),
    };
  });

  mockDraftPaused=false;
  _mockState={pool:[...pool],pickOrder,picks:[],currentIdx:0,teamProfiles,mode:_mockMode};
  renderMockDraftUI();
}
window.startMockDraft=startMockDraft;

function _mockPosBadge(pos){
  const cols={QB:'rgba(96,165,250,.2);color:#60a5fa',RB:'rgba(52,211,153,.2);color:#34d399',WR:'rgba(108,99,245,.2);color:#a78bfa',TE:'rgba(251,191,36,.2);color:#fbbf24',DL:'rgba(251,146,60,.2);color:#fb923c',LB:'rgba(167,139,250,.2);color:#a78bfa',DB:'rgba(244,114,182,.2);color:#f472b6'};
  const style=cols[pos]||'rgba(74,78,90,.2);color:#8b8f9a';
  return `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:${style};white-space:nowrap">${pos}</span>`;
}

function _mockPickCard(p,showTeam){
  const photoUrl=`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`;
  return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin-bottom:3px">
    <img src="${photoUrl}" onerror="this.style.display='none'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg4)">
    ${showTeam?`<span style="font-size:11px;color:var(--text3);min-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.teamName||'')}</span>`:''}
    <span style="font-size:13px;font-weight:600;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.playerName||p.name||'')}</span>
    ${_mockPosBadge(p.pos)}
    <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;flex-shrink:0">${(p.val||0).toLocaleString()}</span>
  </div>`;
}

function _mockDraftGrid(picks,pickOrder){
  if(!picks.length)return'';
  const rounds=Math.max(...picks.map(p=>p.round));
  const teamIds=[...new Set(pickOrder.map(p=>p.rosterId))];
  // Build team name lookup
  const teamNames={};
  teamIds.forEach(rid=>{
    const owner=(S.leagueUsers||[]).find(u=>{const r=S.rosters.find(r2=>r2.roster_id===rid);return r&&u.user_id===r.owner_id;});
    teamNames[rid]=(owner?.metadata?.team_name||owner?.display_name||'T'+rid).substring(0,8);
  });
  const cols=teamIds.length;
  let gridHtml=`<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Draft Board</div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table style="width:100%;border-collapse:collapse;font-size:10px;min-width:${cols*70}px">
    <thead><tr>
      <th style="padding:3px 4px;color:var(--text3);font-weight:700;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap">Rd</th>
      ${teamIds.map(rid=>`<th style="padding:3px 4px;color:${rid===S.myRosterId?'var(--accent)':'var(--text3)'};font-weight:600;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap">${escHtml(teamNames[rid])}</th>`).join('')}
    </tr></thead><tbody>`;
  for(let rd=1;rd<=rounds;rd++){
    gridHtml+=`<tr>`;
    gridHtml+=`<td style="padding:3px 4px;font-weight:700;color:var(--text3);border-bottom:1px solid var(--border)">${rd}</td>`;
    teamIds.forEach(rid=>{
      const pick=picks.find(p=>p.round===rd&&p.rosterId===rid);
      const isMe=rid===S.myRosterId;
      if(pick){
        gridHtml+=`<td style="padding:3px 4px;text-align:center;border-bottom:1px solid var(--border);${isMe?'background:rgba(212,175,55,.06)':''}" title="${pick.playerName} (${pick.pos})">
          <div style="font-weight:600;color:${isMe?'var(--accent)':'var(--text2)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65px">${(pick.playerName||'').split(' ').pop()}</div>
          <div style="font-size:9px;color:var(--text3)">${pick.pos}</div>
        </td>`;
      }else{
        gridHtml+=`<td style="padding:3px 4px;border-bottom:1px solid var(--border);color:var(--text3);text-align:center">—</td>`;
      }
    });
    gridHtml+=`</tr>`;
  }
  gridHtml+=`</tbody></table></div></div>`;
  return gridHtml;
}

function _mockPosBreakdown(picks){
  const myPicks=picks.filter(p=>p.rosterId===S.myRosterId);
  if(!myPicks.length)return'';
  const counts={};
  myPicks.forEach(p=>{counts[p.pos]=(counts[p.pos]||0)+1;});
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
    ${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([pos,ct])=>`<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--bg4);color:var(--text2)">${pos} x${ct}</span>`).join('')}
  </div>`;
}

function toggleMockDraftPause(){
  mockDraftPaused=!mockDraftPaused;
  if(!mockDraftPaused&&_mockState){
    // Resume — continue AI picks
    renderMockDraftUI();
  }
  // Update pause button label
  const btn=document.getElementById('mock-pause-btn');
  if(btn){
    btn.textContent=mockDraftPaused?'Resume':'Pause';
    btn.style.borderColor=mockDraftPaused?'var(--green)':'var(--border2)';
    btn.style.color=mockDraftPaused?'var(--green)':'var(--text3)';
  }
}
window.toggleMockDraftPause=toggleMockDraftPause;

function renderMockDraftUI(){
  const el=$('draft-mock');if(!el||!_mockState)return;
  const{pool,pickOrder,picks,currentIdx}=_mockState;

  // Pause/resume button HTML
  const pauseBtn=`<button id="mock-pause-btn" onclick="toggleMockDraftPause()" style="padding:5px 12px;font-size:11px;font-weight:600;background:none;border:1px solid ${mockDraftPaused?'var(--green)':'var(--border2)'};border-radius:8px;color:${mockDraftPaused?'var(--green)':'var(--text3)'};cursor:pointer;font-family:inherit;flex-shrink:0">${mockDraftPaused?'Resume':'Pause'}</button>`;

  if(currentIdx>=pickOrder.length){
    // Draft complete — show results with grade and consensus comparison
    const myPicks=picks.filter(p=>p.rosterId===S.myRosterId);

    // Calculate post-mock draft grade
    const totalVal=myPicks.reduce((s,p)=>s+p.val,0);
    const avgVal=myPicks.length?Math.round(totalVal/myPicks.length):0;
    const leagueAvgByTeam={};
    picks.forEach(p=>{leagueAvgByTeam[p.rosterId]=(leagueAvgByTeam[p.rosterId]||0)+p.val;});
    const leagueAvgs=Object.values(leagueAvgByTeam);
    const leagueAvg=leagueAvgs.length?Math.round(leagueAvgs.reduce((s,v)=>s+v,0)/leagueAvgs.length):0;
    const myRank=leagueAvgs.sort((a,b)=>b-a).indexOf(totalVal)+1||leagueAvgs.length;
    const gradePct=leagueAvgs.length?Math.round((1-((myRank-1)/leagueAvgs.length))*100):50;
    const gradeLabel=gradePct>=85?'A+':gradePct>=75?'A':gradePct>=65?'B+':gradePct>=55?'B':gradePct>=45?'C+':gradePct>=35?'C':'D';
    const gradeCol=gradePct>=65?'var(--green)':gradePct>=45?'var(--amber)':'var(--red)';

    // Consensus comparison — check if each pick was a reach or steal
    const pickAnalysis=myPicks.map(p=>{
      const csvP=typeof window.findProspect==='function'?window.findProspect(p.playerName):null;
      const consensusRank=csvP?.rank||null;
      const pickOverall=p.overall||0;
      let verdict='';
      if(consensusRank&&pickOverall){
        const diff=consensusRank-pickOverall;
        if(diff>=10)verdict='STEAL';
        else if(diff>=3)verdict='Value';
        else if(diff<=-10)verdict='REACH';
        else if(diff<=-3)verdict='Early';
      }
      return{...p,consensusRank,verdict};
    });

    el.innerHTML=`<div style="padding:14px;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--rl)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:48px;height:48px;border-radius:12px;background:${gradeCol};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:var(--bg1);font-family:'JetBrains Mono',monospace">${gradeLabel}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:var(--accent)">Mock Draft Complete</div>
          <div style="font-size:13px;color:var(--text3)">${picks.length} picks · Ranked #${myRank} of ${Object.keys(leagueAvgByTeam).length} teams · ${totalVal.toLocaleString()} total DHQ</div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Your Picks</div>
      <div style="display:flex;flex-direction:column;gap:2px">${pickAnalysis.map(p=>{
        const photoUrl='https://sleepercdn.com/content/nfl/players/thumb/'+p.pid+'.jpg';
        const verdictHtml=p.verdict?`<span style="font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:${p.verdict==='STEAL'||p.verdict==='Value'?'var(--greenL)':'var(--redL)'};color:${p.verdict==='STEAL'||p.verdict==='Value'?'var(--green)':'var(--red)'}">${p.verdict}</span>`:'';
        const consensusHtml=p.consensusRank?`<span style="font-size:10px;color:var(--text3)">C#${p.consensusRank}</span>`:'';
        return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px" onclick="openPlayerModal('${p.pid}')">
          <span style="font-size:11px;font-weight:700;color:var(--text3);font-family:'JetBrains Mono',monospace;min-width:32px">R${p.round}.${p.pick}</span>
          <img src="${photoUrl}" onerror="this.style.display='none'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg4)">
          <span style="font-size:13px;font-weight:700;color:var(--accent);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.playerName)}</span>
          ${_mockPosBadge(p.pos)}
          ${verdictHtml}
          ${consensusHtml}
          <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace">${p.val.toLocaleString()}</span>
        </div>`;
      }).join('')}</div>
      ${_mockPosBreakdown(picks)}
      ${_mockDraftGrid(picks,pickOrder)}
      <div style="display:flex;gap:8px;margin-top:10px">
        <button onclick="startMockDraft()" style="flex:1;padding:8px;font-size:13px;font-weight:700;background:var(--bg3);border:1px solid var(--accent);border-radius:8px;color:var(--accent);cursor:pointer;font-family:inherit">Run Again</button>
        <button onclick="sendDraftChatMsg('Grade my mock draft: ${myPicks.map(p=>p.playerName+' ('+p.pos+', R'+p.round+')').join(', ')}. How did I do? What would you change?')" style="flex:1;padding:8px;font-size:13px;font-weight:700;background:linear-gradient(135deg,var(--accent),#b8941f);border:none;border-radius:8px;color:var(--bg1);cursor:pointer;font-family:inherit">Ask Alex</button>
      </div>
      <button onclick="_saveMockTemplate()" style="width:100%;margin-top:6px;padding:6px;font-size:12px;font-weight:600;background:none;border:1px solid var(--border);border-radius:6px;color:var(--text3);cursor:pointer;font-family:inherit" id="save-mock-btn">Save Draft Template</button>
    </div>`;
    return;
  }

  const current=pickOrder[currentIdx];
  const isMyPick=current.rosterId===S.myRosterId;
  const profile=_mockState.teamProfiles?.[current.rosterId]||{};
  const teamName=profile.teamName||'Team '+current.pick;

  // Recent picks — enhanced with photos
  const recentHtml=picks.slice(-5).map(p=>_mockPickCard(p,true)).join('');

  if(isMyPick){
    // User picks — show 8 best available players with Alex recommendation
    const available=pool.slice(0,8);
    const myProfile=_mockState.teamProfiles?.[S.myRosterId]||{};
    const myNeeds=myProfile.needs||[];

    // Alex recommendation: top pick at need position or BPA
    let alexPick=null,alexReason='';
    for(const pos of myNeeds){
      const candidate=available.find(p=>p.pos===pos);
      if(candidate){alexPick=candidate;alexReason=`fills your ${pos} gap`;break;}
    }
    if(!alexPick&&available.length){alexPick=available[0];alexReason='best player available';}

    // Consensus rank for top picks
    const enriched=available.map(p=>{
      const csv=typeof window.findProspect==='function'?window.findProspect(p.name):null;
      return{...p,consensusRank:csv?.rank||null};
    });

    el.innerHTML=`<div style="padding:14px;background:var(--bg2);border:1px solid var(--accent);border-radius:var(--rl)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;font-weight:700">ON THE CLOCK — R${current.round}.${current.pick}</div>
          <div style="font-size:16px;font-weight:800;color:var(--text);margin-top:2px">Your Pick</div>
        </div>
        <button onclick="_toggleMockTendencies()" title="League draft tendencies" style="width:28px;height:28px;border-radius:50%;background:var(--bg3);border:1px solid var(--border2);color:var(--text3);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;padding:0" aria-label="Tendencies">📈</button>
        ${pauseBtn}
      </div>
      <div id="mock-tendencies-body" style="max-height:0;overflow:hidden;transition:max-height .28s ease;margin-bottom:0"></div>
      ${alexPick?`<div style="padding:8px 10px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.15);border-radius:8px;margin-bottom:8px;display:flex;align-items:center;gap:8px;cursor:pointer" onclick="mockDraftPick('${alexPick.pid}')">
        <div style="font-size:13px">💡</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--accent)">Alex says: take ${escHtml(alexPick.name)}</div>
          <div style="font-size:11px;color:var(--text3)">${escHtml(alexPick.pos)} · ${alexPick.val.toLocaleString()} DHQ · ${alexReason}</div>
        </div>
        ${_mockPosBadge(alexPick.pos)}
      </div>`:''}
      ${typeof _renderDNAIntelStrip==='function'?_renderDNAIntelStrip(current.round):''}
      ${recentHtml?'<div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)"><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Recent Picks</div>'+recentHtml+'</div>':''}
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Available Players</span>
        ${myNeeds.length?`<span style="font-size:10px;color:var(--accent)">Need: ${myNeeds.slice(0,3).join(', ')}</span>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">${enriched.map(p=>{
        const photoUrl='https://sleepercdn.com/content/nfl/players/thumb/'+p.pid+'.jpg';
        const isNeed=myNeeds.includes(p.pos);
        const pTag=window._playerTags?.[p.pid]||'';
        const tagBorder=pTag==='trade'?'rgba(251,191,36,.4)':pTag==='untouchable'?'rgba(52,211,153,.4)':pTag==='cut'?'rgba(248,113,113,.4)':'';
        const borderColor=tagBorder||(isNeed?'rgba(212,175,55,.2)':'var(--border)');
        // Skip csv_ PIDs for player modal (no Sleeper data)
        const canModal=!p.pid.startsWith('csv_');
        return `<div style="display:flex;align-items:center;gap:6px;padding:7px 10px;background:${isNeed?'rgba(212,175,55,.04)':'var(--bg3)'};border:1px solid ${borderColor};border-radius:8px;cursor:pointer;transition:border-color .15s" onclick="mockDraftPick('${p.pid}')" onmouseover="this.style.borderColor='rgba(212,175,55,.4)'" onmouseout="this.style.borderColor='${borderColor}'" >
          <img src="${photoUrl}" onerror="this.style.display='none'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg4)">
          <span onclick="event.stopPropagation();${canModal?`openPlayerModal('${p.pid}')`:`_mockShowInfo(${JSON.stringify(p)})`}" style="font-size:13px;font-weight:600;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:rgba(255,255,255,.15)">${escHtml(p.name)}</span>
          ${_mockPosBadge(p.pos)}
          ${p.consensusRank?`<span style="font-size:10px;color:var(--text3)">C#${p.consensusRank}</span>`:''}
          <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace">${p.val.toLocaleString()}</span>
          <span onclick="event.stopPropagation();_mockTag('${p.pid}','trade')" style="font-size:9px;cursor:pointer;padding:1px 4px;border-radius:3px;background:${pTag==='trade'?'var(--amberL)':'transparent'};color:${pTag==='trade'?'var(--amber)':'var(--text3)'}" title="Target">\u2605</span>
        </div>`;
      }).join('')}</div>
    </div>`;
  }else{
    // AI picks for other teams
    if(mockDraftPaused){
      // Paused — show current state without advancing
      el.innerHTML=`<div style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="flex:1">
            <div style="font-size:11px;color:var(--amber);text-transform:uppercase;letter-spacing:.06em;font-weight:700">PAUSED — R${current.round}.${current.pick}</div>
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-top:2px">${escHtml(teamName)} on the clock</div>
          </div>
          ${pauseBtn}
        </div>
        ${recentHtml?'<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Recent Picks</div>'+recentHtml:''}
      </div>`;
      return;
    }
    const profile=_mockState.teamProfiles?.[current.rosterId]||{};
    const needs=profile.needs||[];
    const dna=profile.dna||'balanced';
    const tier=profile.tier||'CROSSROADS';

    // AI pick logic: considers team needs, DNA style, and competitive tier
    let pick=null;
    if(dna==='hoarder'||tier==='REBUILDING'){
      // Rebuilders and hoarders prioritize BPA for upside
      pick=pool[0];
    }else if(dna==='aggressive'||tier==='ELITE'){
      // Aggressive owners and contenders target immediate starters at need positions
      for(const pos of needs){if(!pick)pick=pool.find(p=>p.pos===pos);}
      if(!pick)pick=pool[0];
    }else{
      // Balanced: fill top need if available in top 5 BPA, otherwise take BPA
      for(const pos of needs){
        const candidate=pool.findIndex(p=>p.pos===pos);
        if(candidate>=0&&candidate<5){pick=pool[candidate];break;}
      }
      if(!pick)pick=pool[0];
    }
    if(pick){
      pool.splice(pool.indexOf(pick),1);
      picks.push({...current,pid:pick.pid,playerName:pick.name,pos:pick.pos,val:pick.val,teamName});
      _mockState.currentIdx++;
      // Auto-advance AI picks with a small delay for feel
      setTimeout(()=>renderMockDraftUI(),80);
      const photoUrl='https://sleepercdn.com/content/nfl/players/thumb/'+pick.pid+'.jpg';
      el.innerHTML=`<div style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="flex:1;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">R${current.round}.${current.pick}</div>
          ${pauseBtn}
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2)">
          <img src="${photoUrl}" onerror="this.style.display='none'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--bg4)">
          ${escHtml(teamName)} ${needs.length?'(needs '+needs.join(', ')+')':''} selects
          <strong style="color:var(--text)">${escHtml(pick.name)}</strong>
          ${_mockPosBadge(pick.pos)}
        </div>
      </div>`;
    }else{
      _mockState.currentIdx++;
      renderMockDraftUI();
    }
  }
}

function mockDraftPick(pid){
  if(!_mockState)return;
  const{pool,pickOrder,picks,currentIdx}=_mockState;
  const current=pickOrder[currentIdx];
  const pIdx=pool.findIndex(p=>p.pid===pid);
  if(pIdx<0)return;
  const pick=pool.splice(pIdx,1)[0];
  const owner=(S.leagueUsers||[]).find(u=>u.user_id===current.rosterId);
  const teamName=owner?.metadata?.team_name||owner?.display_name||'You';
  picks.push({...current,pid:pick.pid,playerName:pick.name,pos:pick.pos,val:pick.val,teamName});
  _mockState.currentIdx++;
  renderMockDraftUI();
}
window.mockDraftPick=mockDraftPick;

// ── Auto-run scouting when draft tab opens ────────────────────────
let _draftScoutingRun=false;
function onDraftTabOpen(){
  renderTopProspects();
  // Auto-run scouting report if not already done
  if(!_draftScoutingRun&&LI_LOADED&&hasAnyAI()){
    _draftScoutingRun=true;
    const contentEl=$('draft-scout-content');
    if(contentEl)contentEl.style.display='block';
    runDraftScouting();
  }
  // Phase 9 v2: mode toggle removed — only rookie mock draft is available.
  // Startup is a future feature; the button is hidden and the force-rookie
  // gate in startMockDraft handles any leftover deep links.
  const mockEl=$('draft-mock');
  if(mockEl&&!_mockState){
    _mockMode='rookie';
    mockEl.innerHTML=`
      <div style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);margin-bottom:10px;text-align:center">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Rookie Mock Draft</div>
        <div style="font-size:12px;color:var(--text3);line-height:1.5">Simulate your upcoming rookie draft with real pool data, league draft order, and Alex's live picks.</div>
      </div>
      <button onclick="startMockDraft('rookie')" style="width:100%;padding:14px;font-size:15px;font-weight:800;background:linear-gradient(135deg,var(--accent),#e8cc6c);border:none;border-radius:var(--rl);color:var(--bg1);cursor:pointer;font-family:inherit;transition:all .15s">Start Rookie Mock Draft</button>`;
  }
}
window.onDraftTabOpen=onDraftTabOpen;

// ── Mock Draft Save/Load Templates ──────────────────────────────
const MOCK_TEMPLATES_KEY = () => 'wr_mock_templates_' + (S?.currentLeagueId || '');

function _saveMockTemplate() {
  if (!_mockState) return;
  const myPicks = _mockState.picks.filter(p => p.rosterId === S.myRosterId);
  if (!myPicks.length) return;
  try {
    let templates = [];
    try { templates = JSON.parse(localStorage.getItem(MOCK_TEMPLATES_KEY()) || '[]'); } catch (e) { templates = []; }
    const saved = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      mode: _mockState.mode || 'rookie',
      picks: myPicks.map(p => ({ name: p.playerName, pos: p.pos, round: p.round, pick: p.pick, val: p.val })),
    };
    templates.unshift(saved);
    localStorage.setItem(MOCK_TEMPLATES_KEY(), JSON.stringify(templates.slice(0, 10)));
    const btn = document.getElementById('save-mock-btn');
    if (btn) { btn.textContent = 'Saved!'; setTimeout(() => btn.textContent = 'Save Draft Template', 1500); }
    // Phase 7: log mock draft save to the field log
    if (window.addFieldLogEntry) {
      try {
        window.addFieldLogEntry('🎯', `Mock draft saved (${myPicks.length} picks)`, 'draft', { actionType: 'mock_saved', picks: saved.picks });
      } catch (e) {}
    }
  } catch (e) { console.warn('[MockDraft] Save error:', e); }
}
window._saveMockTemplate = _saveMockTemplate;

function _loadMockTemplates() {
  try { return JSON.parse(localStorage.getItem(MOCK_TEMPLATES_KEY()) || '[]'); } catch { return []; }
}
window._loadMockTemplates = _loadMockTemplates;

// ── Mock Draft Tagging ──────────────────────────────────────────
function _mockTag(pid, tag) {
  if (!window._playerTags) window._playerTags = {};
  if (window._playerTags[pid] === tag) {
    delete window._playerTags[pid];
  } else {
    window._playerTags[pid] = tag;
  }
  // Persist tags to localStorage
  try {
    localStorage.setItem('wr_player_tags_' + (S?.currentLeagueId || ''), JSON.stringify(window._playerTags));
  } catch {}
  renderMockDraftUI();
}
window._mockTag = _mockTag;

// ── Compact info popup for CSV-only prospects (no Sleeper PID) ───
function _mockShowInfo(p) {
  const existing = document.getElementById('mock-info-popup');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'mock-info-popup';
  div.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;font-family:"DM Sans",sans-serif';
  div.onclick = () => div.remove();
  div.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:16px;padding:20px;max-width:320px;width:90%;margin:0 16px" onclick="event.stopPropagation()">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="flex:1">
        <div style="font-size:16px;font-weight:800;color:var(--text)">${escHtml(p.name||'')}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${escHtml(p.pos||'')} · Rookie Prospect</div>
      </div>
      ${p.val>0?`<div style="font-size:14px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace">${p.val.toLocaleString()}</div>`:''}
    </div>
    ${p.consensusRank?`<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Consensus Rank: #${p.consensusRank}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button onclick="document.getElementById('mock-info-popup').remove()" style="flex:1;padding:8px;font-size:13px;font-weight:600;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text3);cursor:pointer;font-family:inherit">Close</button>
      <button onclick="document.getElementById('mock-info-popup').remove();mockDraftPick('${escHtml(p.pid||'')}')" style="flex:1;padding:8px;font-size:13px;font-weight:700;background:linear-gradient(135deg,var(--accent),#b8941f);border:none;border-radius:8px;color:var(--bg1);cursor:pointer;font-family:inherit">Draft</button>
    </div>
  </div>`;
  document.body.appendChild(div);
}
window._mockShowInfo = _mockShowInfo;

// ── Expose on window.App and window ─────────────────────────────
Object.assign(window.App, {
  idealDepth,
  renderDraftNeeds, runDraftScouting,
  renderRookieBoard, renderRookieProfiles,
  renderTopProspects, startMockDraft, onDraftTabOpen,
  toggleMockDraftPause, switchDraftView,
});
window.idealDepth          = idealDepth;
window.renderDraftNeeds    = renderDraftNeeds;
window.runDraftScouting    = runDraftScouting;
window.renderRookieBoard   = renderRookieBoard;
window.renderRookieProfiles = renderRookieProfiles;
// _rookieSortBy, _rookieFilter, _rookieToggle exposed inline via window.* above

// ── Event bus: re-render draft needs when LeagueIntel finishes loading ──
// dhq-engine.js emits 'li:loaded' after both fresh compute and cache hits.
// This replaces the direct renderDraftNeeds() call that was inside dhq-engine.js.
if(window.DhqEvents){
  DhqEvents.on('li:loaded',()=>{
    try{if(typeof renderDraftNeeds==='function')renderDraftNeeds();}
    catch(e){dhqLog('li:loaded.renderDraftNeeds',e);}
  });
}
