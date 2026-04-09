// ═══════════════════════════════════════════════════════════════
// ui.js — All UI rendering functions extracted from index.html
// ═══════════════════════════════════════════════════════════════
// Functions that live in other modules and are accessed via globals:
//   S, $, LI, LI_LOADED — from index.html / sleeper-api
//   pName, pNameShort, pPos, pAge, pTeam, fullTeam, getUser, myR,
//   posClass, posLabel, posMap — from index.html (helpers)
//   showToast, copyText, switchTab, ss — from index.html (UI helpers)
//   calcIDPScore, calcFantasyPts, idpTier — from index.html (scoring)
//   callClaude, callGrokNews — from index.html (AI layer)
//   buildCtx, buildCtxCompact, buildMentalityCtx, buildMemoryCtx — from index.html (context builders)
//   loadConvMemory, addConvMemory, autoSaveMemory — from index.html (memory)
//   PROVIDERS, updateProviderHint — from index.html (settings)
//
// NOTE: Some functions like dynastyValue, tradeValueTier, pickValue are
// defined here AND may exist in other modules. Last-loaded wins, or
// callers use window.App.* references. We will sort out duplicates later.
// ═══════════════════════════════════════════════════════════════

window.App = window.App || {};

// ── Memory / localStorage ──────────────────────────────────────
// MEM_KEY, CONV_MEM_KEY, loadMemory, saveMemory, getMemory, setMemory
// defined in app.js. loadConvMemory, saveConvMemory, addConvMemory,
// buildMemoryCtx, autoSaveMemory defined in ai-chat.js.
// All available as globals from earlier script loads.

// ── API Key Callout ────────────────────────────────────────────
// ── Settings: System Status ────────────────────────────────────
function updateSettingsStatus(){
  // AI status
  const aiDot=$('st-ai-dot');const aiLabel=$('st-ai-label');
  const aiBadge=$('ai-setup-badge');
  if(aiDot&&aiLabel){
    const hasServer=typeof hasServerAI==='function'&&hasServerAI();
    const hasKey=!!S.apiKey;
    const hasAI2=hasServer||hasKey;
    const providerName=hasServer?'Server AI':S.aiProvider==='anthropic'?'Claude':S.aiProvider==='gemini'?'Gemini':'None';
    if(hasAI2){
      aiDot.style.background='var(--green)';
      aiLabel.style.color='var(--green)';
      aiLabel.textContent='Connected ('+providerName+')';
      if(aiBadge)aiBadge.textContent=providerName;
      const det=$('ai-setup-details');
      if(det)det.removeAttribute('open');
    }else{
      aiDot.style.background='var(--red)';
      aiLabel.style.color='var(--red)';
      aiLabel.textContent='Not connected — some features limited';
      if(aiBadge)aiBadge.textContent='Not set';
    }
  }
  // Server AI status indicator
  const sDot=$('ai-server-dot');const sLabel=$('ai-server-label');const sDetail=$('ai-server-detail');
  if(sDot){
    const hasServer=typeof hasServerAI==='function'&&hasServerAI();
    const hasKey=!!S.apiKey;
    if(hasServer){
      sDot.style.background='var(--green)';
      if(sLabel)sLabel.textContent='AI Active — Server';
      if(sDetail)sDetail.textContent='Powered by your account. No API key needed.';
    }else if(hasKey){
      sDot.style.background='var(--green)';
      if(sLabel)sLabel.textContent='AI Active — Your Key';
      if(sDetail)sDetail.textContent='Using your '+(S.aiProvider==='anthropic'?'Claude':'Gemini')+' API key.';
    }else{
      sDot.style.background='var(--amber)';
      if(sLabel)sLabel.textContent='AI Not Connected';
      if(sDetail)sDetail.textContent='Connect your account or add an API key below to enable AI features.';
    }
  }
  // League status
  const lgDot=$('st-league-dot');const lgLabel=$('st-league-label');
  if(lgDot&&lgLabel){
    const league=S.leagues?.find(l=>l.league_id===S.currentLeagueId);
    if(league){
      lgDot.style.background='var(--green)';
      lgLabel.style.color='var(--text)';
      lgLabel.textContent=(league.name||'League')+' · '+S.season;
    }else{
      lgDot.style.background='var(--text3)';
      lgLabel.textContent='Not connected';
    }
  }
  // Strategy status
  const strDot=$('st-strat-dot');const strLabel=$('st-strat-label');const stratBadge=$('strat-badge');
  if(strDot&&strLabel){
    const strat=typeof getMemory==='function'?getMemory('mentality',{}):{};
    const labels={balanced:'Balanced',winnow:'Win Now',rebuild:'Rebuild',prime:'Dynasty Prime'};
    const m=strat.mentality||'balanced';
    if(m!=='balanced'){
      strDot.style.background='var(--green)';
      strLabel.style.color='var(--text)';
      strLabel.textContent=labels[m]||m;
      if(stratBadge)stratBadge.textContent=labels[m]||m;
    }else{
      strDot.style.background='var(--accent)';
      strLabel.style.color='var(--text)';
      strLabel.textContent='Balanced (default)';
      if(stratBadge)stratBadge.textContent='Balanced';
    }
  }
}

function checkApiKeyCallout(){
  const el=$('api-key-callout');if(!el)return;
  // Hide callout if user has server-side AI (Supabase session) OR a client API key
  const hasAI=S.apiKey || (typeof hasServerAI==='function' && hasServerAI()) || (typeof hasAnyAI==='function' && hasAnyAI());
  if(hasAI){
    el.style.display='none';
  }else{
    el.style.display='block';
    // Core features (briefing, lineup, insights) work without AI.
    // AI chat is the only feature that needs a key or subscription.
    el.innerHTML='<div style="font-size:13px;color:var(--text2);line-height:1.5">Your GM Briefing, lineup optimizer, and trade tools work without AI. To unlock <strong style="color:var(--accent)">AI chat and scouting</strong>, sign in or subscribe — <a onclick="switchTab(\'settings\')" style="color:var(--accent);cursor:pointer;text-decoration:underline">set up your account in Settings</a>.</div>';
  }
}

// ── League Pulse ───────────────────────────────────────────────
function renderLeaguePulse(){
  const el=$('league-pulse');if(!el)return;
  const t=S.trending;
  if(!t||!t.adds?.length){el.innerHTML='';return;}
  const myPlayers=new Set(myR()?.players||[]);
  const posMap=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};

  const renderList=(list,label,isAdds)=>{
    return list.slice(0,8).map(item=>{
      const p=S.players[item.player_id];
      if(!p)return'';
      const onMyTeam=myPlayers.has(item.player_id);
      const val=dynastyValue(item.player_id);
      const {col}=tradeValueTier(val);
      return`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:13px">
        <span style="color:${isAdds?'var(--green)':'var(--red)'};font-weight:700;font-size:13px;min-width:14px">${isAdds?'▲':'▼'}</span>
        <span style="font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" onclick="openPlayerModal('${item.player_id}')">${p.first_name} ${p.last_name}</span>
        <span class="pos ${posMap(p.position)==='QB'?'qb':posMap(p.position)==='RB'?'rb':posMap(p.position)==='WR'?'wr':posMap(p.position)==='TE'?'te':'idp'}" style="font-size:13px;padding:1px 4px">${posMap(p.position)}</span>
        ${val>0?`<span style="font-size:13px;color:${col};font-family:'JetBrains Mono',monospace">${val.toLocaleString()}</span>`:''}
        ${onMyTeam?'<span style="font-size:13px;color:var(--accent)" title="On your roster">✦</span>':''}
      </div>`;
    }).filter(Boolean).join('');
  };

  el.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em">League Pulse</span>
      <span style="font-size:13px;color:var(--text3)">Trending across Sleeper · Last 24h</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Most Added</div>
        ${renderList(t.adds,'adds',true)}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Most Dropped</div>
        ${renderList(t.drops,'drops',false)}
      </div>
    </div>
  </div>`;
}

// ── Roster ─────────────────────────────────────────────────────
function getDcLabel(pid){
  const p=S.players[pid];const team=pTeam(pid);
  const dc=S.depthCharts[team]||{};
  for(const[dpos,dplayers] of Object.entries(dc)){
    for(const[order,plObj] of Object.entries(dplayers||{})){
      const plId=typeof plObj==='object'?plObj?.player_id:plObj;
      if(plId!=null&&String(plId)===String(pid))return`${dpos}${order}`;
    }
  }
  return p?.depth_chart_order!=null?`${p.depth_chart_position||p.position||''}${p.depth_chart_order+1}`:'';
}

async function renderRoster(){
  const my=myR();if(!my)return;
  buildRosterTable();
}

// Peak age range helper (loadPeakCurves removed — use static defaults)
function peakYears(pid){
  const pos=pPos(pid);const age=pAge(pid)||0;
  // Research-backed peak ranges (EPA study 2014-2024)
  const peaks=window.App.peakWindows;
  const [lo,hi]=peaks[pos]||[25,29];
  if(!age)return{label:'—',desc:'',cls:'',color:'var(--text3)'};
  const yrsToPeak=lo-age;
  const yrsLeft=hi-age;
  const yrsPast=age-hi;

  // Bloom → Peak → Fade lifecycle
  if(age<lo-3)return{label:'Seedling',desc:(lo-age)+'yr to peak',cls:'seedling',color:'rgba(96,165,250,.7)'}; // light blue - young prospect
  if(age<lo)return{label:'Rising',desc:yrsToPeak+'yr to peak',cls:'rising',color:'rgba(52,211,153,.7)'}; // green - approaching prime
  if(age<=hi)return{label:'Peak',desc:yrsLeft<=0?'final yr':'~'+yrsLeft+'yr left',cls:'peak',color:'var(--green)'}; // bright green - prime
  if(age<=hi+2)return{label:'Veteran',desc:yrsPast+'yr past peak',cls:'veteran',color:'rgba(251,191,36,.8)'}; // amber - still productive
  return{label:'Declining',desc:yrsPast+'yr past peak',cls:'declining',color:'rgba(248,113,113,.8)'}; // red - sell window
}

// Roster sort/filter
let rosterSortKey='value', rosterSortDir=-1, rosterFilter='all';
const _rosterSortCycle=[
  {key:'value',dir:-1,label:'Value ↓'},
  {key:'pos',dir:1,label:'Position'},
  {key:'age',dir:1,label:'Age ↑'},
  {key:'age',dir:-1,label:'Age ↓'},
  {key:'name',dir:1,label:'Name A-Z'},
];
let _rosterSortIdx=0;

function cycleRosterSort(){
  _rosterSortIdx=(_rosterSortIdx+1)%_rosterSortCycle.length;
  const s=_rosterSortCycle[_rosterSortIdx];
  rosterSortKey=s.key;rosterSortDir=s.dir;
  const btn=$('roster-sort-btn');
  if(btn)btn.textContent='Sort: '+s.label;
  buildRosterTable();
}
function sortRoster(key){
  if(rosterSortKey===key)rosterSortDir*=-1;else{rosterSortKey=key;rosterSortDir=-1;}
  buildRosterTable();
}
function setRosterFilter(f, btn){
  rosterFilter=f;
  document.querySelectorAll('#roster-filter-btns .rfbtn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  buildRosterTable();
}
function resetRosterSort(){rosterSortKey='value';rosterSortDir=-1;rosterFilter='all';_rosterSortIdx=0;buildRosterTable();}

// Recon verdict helper — delegates to shared getPlayerAction()
function _reconVerdict(pid){
  if(typeof getPlayerAction!=='function')return null;
  const v=getPlayerAction(pid);
  if(!v||v.action==='HOLD'&&v.reason==='Not enough data')return null;
  return v;
}

function buildRosterTable(){
  const my=myR();if(!my){
    $('roster-tbody').innerHTML='<div style="padding:20px;text-align:center;color:var(--text3);font-size:14px">Connect to load roster.</div>';
    return;
  }
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const positions=league?.roster_positions||[];
  const starters=new Set(my.starters||[]);
  const reserve=new Set(my.reserve||[]);
  const taxi=new Set(my.taxi||[]);
  const allPlayers=my.players||[];
  const offPos=new Set(['QB','RB','WR','TE','K']);
  const idpPos=new Set(['DL','LB','DB']);

  let rows=allPlayers.map(pid=>{
    const p=S.players[pid]||{};
    const stats=S.playerStats?.[pid]||{};
    const val=dynastyValue(pid);
    const pk=peakYears(pid);
    const slotIdx=[...starters].indexOf(pid);
    const isTaxi=taxi.has(pid);
    const isRes=reserve.has(pid);
    const slot=slotIdx>=0?(positions[slotIdx]||'FLEX'):isRes?'IR':isTaxi?'Taxi':pPos(pid)||'BN';
    return{
      pid,p,stats,val,pk,slot,
      isStarter:starters.has(pid),isReserve:isRes,isTaxi,
      pos:pPos(pid)||'?',name:pName(pid),
      age:p.age||99,value:val,
      avg:stats.seasonAvg||0,prev:stats.prevAvg||0,
    };
  });

  if(rosterFilter==='OFF')rows=rows.filter(r=>offPos.has(r.pos));
  if(rosterFilter==='IDP')rows=rows.filter(r=>idpPos.has(r.pos));
  if(rosterFilter==='taxi')rows=rows.filter(r=>r.isTaxi);

  const posOrder2=['QB','RB','WR','TE','DL','LB','DB','K','DEF'];
  rows.sort((a,b)=>{
    if(rosterFilter!=='taxi'){
      const sec=r=>r.isReserve?2:r.isTaxi?2:0;
      const sd=sec(a)-sec(b);if(sd!==0)return sd;
    }
    let av=a[rosterSortKey]??'',bv=b[rosterSortKey]??'';
    if(rosterSortKey==='name'){av=av.toLowerCase();bv=bv.toLowerCase();}
    if(rosterSortKey==='pos'){av=posOrder2.indexOf(av)<0?99:posOrder2.indexOf(av);bv=posOrder2.indexOf(bv)<0?99:posOrder2.indexOf(bv);}
    if(av<bv)return -1*rosterSortDir;
    if(av>bv)return 1*rosterSortDir;
    return 0;
  });

  // Count display
  const countEl=$('roster-count');
  if(countEl)countEl.textContent=rows.length+' player'+(rows.length!==1?'s':'');

  const wrap=$('roster-tbody');
  let html=`<div class="roster-header-sticky" style="display:flex;align-items:center;gap:8px;padding:4px 14px 6px;font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;opacity:.6">
    <span style="min-width:36px"></span><span style="flex:1">Player</span><span style="min-width:54px;text-align:right">DHQ</span><span style="min-width:44px;text-align:right">PPG</span><span style="min-width:42px;text-align:right">Phase</span>
  </div>`;
  let lastSection='';

  rows.forEach(r=>{
    const {pid,p,stats,val,pk,isStarter,isReserve,isTaxi,pos,age}=r;

    // Section headers
    const section=(r.isReserve||r.isTaxi)?(r.isReserve?'IR / Reserve':'Taxi Squad'):'';
    if(section&&section!==lastSection){
      html+=`<div class="rr-section-hdr">${section}</div>`;
      lastSection=section;
    }

    const {col}=tradeValueTier(val);
    const initials=((p.first_name||'?')[0]+(p.last_name||'?')[0]).toUpperCase();
    const inj=p.injury_status;
    const meta=LI_LOADED?LI.playerMeta?.[pid]:null;
    const dhqTrend=meta?.trend||0;
    const trendHtml=dhqTrend>=15?'<span class="rr-trend" style="color:var(--green)">▲</span>':dhqTrend<=-15?'<span class="rr-trend" style="color:var(--red)">▼</span>':'';
    const ppg=stats.prevAvg||stats.seasonAvg||0;
    const verdict=_reconVerdict(pid);
    const isRookie=meta?.source==='FC_ROOKIE';

    // Phase color
    const phaseCol=pk.cls==='peak'?'var(--green)':pk.cls==='rising'?'var(--green)':pk.cls==='seedling'?'var(--blue)':pk.cls==='veteran'?'var(--amber)':'var(--red)';
    const cardCls='rr-card'+(isStarter?' rr-starter':'')+(isReserve||isTaxi?' rr-reserve':'');

    const playerTag=window._playerTags?.[pid];
    const tagHtml=playerTag?'<span style="font-size:10px;padding:1px 5px;border-radius:4px;font-weight:700;background:'+(playerTag==='trade'?'var(--amberL)':playerTag==='cut'?'var(--redL)':playerTag==='untouchable'?'var(--greenL)':'var(--blueL)')+';color:'+(playerTag==='trade'?'var(--amber)':playerTag==='cut'?'var(--red)':playerTag==='untouchable'?'var(--green)':'var(--blue)')+'">'+( playerTag==='trade'?'TB':playerTag==='cut'?'CUT':playerTag==='untouchable'?'UT':'W')+'</span>':'';

    html+=`<div class="${cardCls}" onclick="openPlayerModal('${pid}')">
      <img class="rr-photo" src="https://sleepercdn.com/content/nfl/players/${pid}.jpg" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=rr-initials>${initials}</span>')" loading="lazy"/>
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="rr-name">${pName(pid)}</span>
          <span class="rr-pos" style="${getPosBadgeStyle(pos)}">${pos}</span>
          ${inj?'<span class="rr-inj">'+inj+'</span>':''}
          ${isRookie?'<span style="font-size:10px;color:var(--blue);font-weight:700">R</span>':''}
          ${tagHtml}
          ${verdict?`<span class="rr-verdict-chip" style="color:${verdict.col};background:${verdict.bg};font-size:10px;padding:1px 5px"${verdict.label==='Sell'||verdict.label==='Sell High'?' onclick="event.stopPropagation();mobileTab(\'trades\')"':''}>${verdict.label}</span>`:''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px;font-size:13px;color:var(--text3)">
          <span>${p.team||'FA'} · ${age||'?'}</span>
          <span class="rr-val" style="color:${col};font-weight:700;font-family:'JetBrains Mono',monospace">${val>0?val.toLocaleString():'—'}${trendHtml}</span>
          ${ppg?'<span>'+ppg.toFixed(1)+'</span>':''}
          <span style="color:${phaseCol};font-size:11px;font-weight:600">${pk.label}</span>
        </div>
      </div>
      <div class="rr-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;
  });

  wrap.innerHTML=html||'<div style="padding:20px;text-align:center;color:var(--text3)">No players found.</div>';
}

// ── Draft pick values ──────────────────────────────────────────
const BASE_PICK_VALUES={
  '1.01':10050,'1.02':9150,'1.03':8350,'1.04':7600,'1.05':6900,
  '1.06':6250,'1.07':5700,'1.08':5250,'1.09':4800,'1.10':4450,
  '1.11':4150,'1.12':3800,
  '2.01':4650,'2.02':4350,'2.03':4050,'2.04':3750,'2.05':3450,
  '2.06':3150,'2.07':2950,'2.08':2700,'2.09':2500,'2.10':2250,
  '2.11':2100,'2.12':1950,
  '3.01':2650,'3.02':2400,'3.03':2200,'3.04':2000,'3.05':1800,
  '3.06':1650,'3.07':1500,'3.08':1350,'3.09':1250,'3.10':1100,
  '3.11':1000,'3.12':925,
  '4.01':1300,'4.02':1200,'4.03':1100,'4.04':1000,'4.05':925,
  '4.06':850,'4.07':775,'4.08':725,'4.09':675,'4.10':600,
  '4.11':550,'4.12':500,
  '5.01':700,'5.02':650,'5.03':600,'5.04':550,'5.05':500,
  '5.06':450,'5.07':400,'5.08':350,'5.09':325,'5.10':300,
  '5.11':275,'5.12':250,
};

function pickValue(season,round,totalTeams,pickInRound){
  const curSeason=parseInt(S.season)||2025;
  const pickSeason=parseInt(season)||curSeason;
  const teams=totalTeams||S.rosters?.length||16;

  // DHQ pick values (league-derived) — primary
  if(LI_LOADED&&LI.dhqPickValues){
    // Use specific pick position if known, otherwise mid-round
    const pos=pickInRound||Math.ceil(teams/2);
    const pick=(round-1)*teams+Math.min(pos,teams);
    const base=LI.dhqPickValues[pick]?.value||LI.dhqPickValues[pick-1]?.value||LI.dhqPickValues[pick+1]?.value||0;
    if(base>0){
      const yearDiscount=Math.pow(0.88,Math.max(0,pickSeason-curSeason));
      return Math.round(base*yearDiscount);
    }
  }

  // Hardcoded fallback with year discount
  const yearDiscount=Math.pow(0.92,Math.max(0,pickSeason-curSeason));
  const midPick=Math.ceil((teams)/2);
  const key=`${round}.${String(midPick).padStart(2,'0')}`;
  const base=BASE_PICK_VALUES[key]||BASE_PICK_VALUES[`${round}.06`]||500;
  return Math.round(base*yearDiscount);
}

// ── FAAB / Roster slot helpers ─────────────────────────────────
function getFAAB(){
  const my=myR();
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const waiverType = league?.settings?.waiver_type; // 0=normal, 1=FAAB, 2=continuous
  const isFAAB = waiverType === 2 || (league?.settings?.waiver_budget > 0);
  const budget = isFAAB ? (league?.settings?.waiver_budget || 0) : 0;
  const spent = my?.settings?.waiver_budget_used || 0;
  const minBid = isFAAB ? (league?.settings?.waiver_budget_min ?? 0) : 0;
  return { budget, spent, remaining: Math.max(0, budget - spent), isFAAB, minBid };
}

function getRosterSlots(){
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const positions=league?.roster_positions||[];
  const my=myR();
  const totalSlots=positions.filter(p=>p!=='BN'&&p!=='IR'&&p!=='Taxi').length +
    positions.filter(p=>p==='BN').length;
  const currentPlayers=(my?.players||[]).length;
  const taxiSlots=positions.filter(p=>p==='Taxi').length;
  const irSlots=positions.filter(p=>p==='IR').length;
  const taxiUsed=(my?.taxi||[]).length;
  const irUsed=(my?.reserve||[]).length;
  const rosterMax=positions.filter(p=>p!=='Taxi').length;
  const benchSlots=positions.filter(p=>p==='BN').length;
  const activePlayers=(my?.players||[]).filter(p=>!(my?.taxi||[]).includes(p)&&!(my?.reserve||[]).includes(p)).length;
  const openBench=Math.max(0,benchSlots-(activePlayers-(positions.filter(p=>p!=='BN'&&p!=='IR'&&p!=='Taxi').length)));
  return{totalSlots,benchSlots,openBench,taxiSlots,irSlots,taxiUsed,irUsed,rosterMax,activePlayers};
}

// ── Mentality ──────────────────────────────────────────────────
function loadMentality(){
  const m=getMemory('mentality',{mentality:'balanced',neverDrop:'',notes:''});
  const sel=$('mentality-sel');
  const notes=$('mentality-notes');const nd=$('never-drop');
  if(sel)sel.value=m.mentality||'balanced';
  if(notes)notes.value=m.notes||'';
  if(nd)nd.value=m.neverDrop||'';
  return m;
}
function saveMentality(){
  const m={
    mentality:$('mentality-sel')?.value||'balanced',
    neverDrop:$('never-drop')?.value||'',
    notes:$('mentality-notes')?.value||''
  };
  setMemory('mentality',m);
  const saved=$('mentality-saved');
  if(saved){saved.style.display='block';setTimeout(()=>saved.style.display='none',2000);}
  if(typeof updateSettingsStatus==='function')updateSettingsStatus();
}

// buildMentalityCtx: defined in ai-chat.js

// ── Available players ──────────────────────────────────────────
function getAvailablePlayers(){
  const rostered=new Set(S.rosters.flatMap(r=>(r.players||[]).concat(r.taxi||[]).concat(r.reserve||[])).map(String));
  const offPos=['QB','RB','WR','TE','K'];
  const idpPos=['DL','LB','DB'];
  const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const results=[];

  // FAST PATH: scan DHQ player scores (LI.playerScores) for valued players
  if(LI_LOADED&&LI.playerScores){
    Object.keys(LI.playerScores).forEach(id=>{
      if(rostered.has(id))return;
      const p=S.players[id];if(!p)return;
      const mappedPos=(['DE','DT'].includes(p.position)?'DL':['CB','S'].includes(p.position)?'DB':p.position);
      if(!offPos.includes(mappedPos)&&!idpPos.includes(mappedPos))return;
      if(p.status==='Inactive'||p.status==='Retired')return;
      // Skip rookies (FC imports) — they can only be added via rookie draft
      const meta=LI.playerMeta?.[id];
      if(meta?.source==='FC_ROOKIE')return;
      if((p.years_exp||0)===0&&!meta?.starterSeasons)return;
      const val=dynastyValue(id);
      if(val<=0)return;
      results.push({id,p,val,isIDP:idpPos.includes(p.position),rank:S.posRanks?.[id],proj:S.playerProj?.[id]});
    });
  }

  // Fallback: IDP players from stats (before DHQ loads)
  Object.keys(S.playerStats||{}).forEach(id=>{
    if(rostered.has(id))return;
    if(results.some(r=>r.id===id))return;
    const p=S.players[id];if(!p)return;
    const mappedPos2=(['DE','DT'].includes(p.position)?'DL':['CB','S'].includes(p.position)?'DB':p.position);
    if(!idpPos.includes(mappedPos2)&&!offPos.includes(mappedPos2))return;
    if(p.status==='Inactive'||p.status==='Retired')return;
    const stats=S.playerStats[id];
    if(!stats?.prevAvg&&!stats?.seasonAvg)return;
    const val=dynastyValue(id)||(stats.seasonAvg||stats.prevAvg||0)*100;
    if(val<=0)return;
    results.push({id,p,val,isIDP:idpPos.includes(p.position),rank:S.posRanks?.[id],proj:S.playerProj?.[id]});
  });

  return results.sort((a,b)=>b.val-a.val).slice(0,250);
}

let _availCache=null;
let _availCacheKey='';
let availSortDir=1;
let availSortKey='value';

function availSort(key){
  availSortKey=key;
  ['val','age'].forEach(k=>{
    const btn=$(`avail-sort-${k}`);
    if(btn)btn.classList.toggle('active',key===({val:'value',age:'age'}[k]||k));
  });
  renderAvailable();
}

function renderAvailable(){
  const tbody=$('avail-tbody');if(!tbody)return;

  if(!LI_LOADED&&Object.keys(S.playerStats||{}).length===0){
    tbody.innerHTML=`<div style="padding:12px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="skeleton" style="height:14px;width:70%"></div>
        <div class="skeleton" style="height:14px;width:55%"></div>
        <div class="skeleton" style="height:14px;width:65%"></div>
      </div>
      <div style="font-size:13px;color:var(--text3);margin-top:8px">Building DHQ values...</div>
    </div>`;
    return;
  }

  const cacheKey=LI_LOADED+'_'+(S.rosters?.length||0)+'_'+(Object.keys(S.playerStats||{}).length);
  let avail;
  if(_availCache&&_availCacheKey===cacheKey){avail=_availCache;}
  else{avail=getAvailablePlayers();_availCache=avail;_availCacheKey=cacheKey;}

  if(!avail.length){tbody.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3)">No available players found.</div>';return;}
  const posFilter=$('avail-pos-sel')?.value||'';
  const posMapFilter=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
  let filtered=posFilter?avail.filter(a=>posMapFilter(a.p.position)===posFilter||a.p.position===posFilter):avail;
  const _wFloorTeams=S.rosters?.length||12;
  const _wFloor=_wFloorTeams>=14?1800:_wFloorTeams>=12?1500:_wFloorTeams>=10?1200:800;
  filtered=filtered.filter(a=>a.val>=_wFloor);

  // Team mode gate: rebuilding teams skip old low-value players
  const _avMyAssess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  const _avIsRebuilding=_avMyAssess?.tier==='REBUILDING'||_avMyAssess?.window==='REBUILDING';
  if(_avIsRebuilding){
    filtered=filtered.filter(a=>{
      const age=S.players[a.id]?.age||25;
      const dhq=dynastyValue(a.id)||0;
      return age<=25||dhq>=2000; // Only young or valuable
    });
  }
  filtered=[...filtered].sort((a,b)=>{
    const sc2=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
    const getPPG=(x)=>{
      const st=S.playerStats?.[x.id]||{};
      const mP=posMapFilter(x.p.position);
      const isI=['DL','LB','DB'].includes(mP);
      const raw2=st?.prevRawStats;
      return isI&&raw2?+(calcIDPScore(raw2,sc2)/Math.max(1,raw2.gp||17)).toFixed(1):(st.seasonAvg||st.prevAvg||0);
    };
    if(availSortKey==='age')return((a.p.age||99)-(b.p.age||99))*availSortDir;
    if(availSortKey==='ppg')return(getPPG(b)-getPPG(a))*availSortDir;
    if(availSortKey==='faab'){
      const fm=LI_LOADED&&LI.faabByPos?LI.faabByPos:{};
      const fb=typeof getFAAB==='function'?getFAAB():{remaining:0,budget:0};
      const getFaab=(x)=>{const mP2=posMapFilter(x.p.position);const mk=fm[mP2];if(!mk||mk.count<3||!fb.budget)return 0;const fl=fb.minBid||1;return Math.max(fl,Math.min(Math.round(fb.remaining*0.25),Math.round(mk.avg*(x.val/4000))));};
      return(getFaab(b)-getFaab(a))*availSortDir;
    }
    return(b.val-a.val)*availSortDir;
  });

  const el=$('available-count');if(el)el.textContent=filtered.length===avail.length?`${avail.length} players available`:`${filtered.length} of ${avail.length} shown`;
  const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const faab=typeof getFAAB==='function'?getFAAB():{remaining:0,budget:0};
  const faabMarket=LI_LOADED&&LI.faabByPos?LI.faabByPos:{};

  // Mobile card rows
  const rows=filtered.slice(0,25).map(({id,p,val},i)=>{
    const stats=S.playerStats?.[id]||{};
    const {col}=tradeValueTier(val);
    const mPos=posMapFilter(p.position);
    const isIDP=['DL','LB','DB'].includes(mPos);
    const raw=stats?.prevRawStats;
    const ppg=isIDP&&raw?+(calcIDPScore(raw,sc)/Math.max(1,raw.gp||17)).toFixed(1):(stats.seasonAvg||stats.prevAvg||0);
    const initials=((p.first_name||'?')[0]+(p.last_name||'?')[0]).toUpperCase();

    // FAAB calc
    const market=faabMarket[mPos];
    let faabStr='';let conf='';let confCol='var(--text3)';
    if(market&&market.count>=3&&faab.budget>0){
      const baseB=Math.round(market.avg*(val/4000));
      const fl=faab.minBid||1;
      const sug=Math.max(fl,Math.min(Math.round(faab.remaining*0.25),baseB));
      const lo=Math.max(fl,Math.round(sug*0.7));
      const hi=Math.min(faab.remaining,Math.round(sug*1.3));
      faabStr=`$${lo}–${hi}`;
      conf=val>=4000?'High':val>=2000?'Med':'Low';
      confCol=conf==='High'?'var(--green)':conf==='Med'?'var(--amber)':'var(--text3)';
    } else if(faab.budget>0&&val>0){
      // No FAAB history — estimated from dynasty value
      const fl=faab.minBid||1;
      const est=Math.max(fl,Math.round(val/500));
      faabStr=`~$${est}`;
      conf='No FAAB history — estimated from dynasty value';confCol='var(--text3)';
    }

    // Priority tag
    let prioLabel='';let prioBg='';let prioCol='';
    if(i<3&&val>=3000){prioLabel='Must Add';prioBg='var(--greenL)';prioCol='var(--green)';}
    else if(i<8&&val>=2000){prioLabel='Strong';prioBg='var(--accentL)';prioCol='var(--accent)';}
    else if(val>=1000){prioLabel='Depth';prioBg='rgba(255,255,255,.04)';prioCol='var(--text3)';}
    else{prioLabel='Spec';prioBg='rgba(255,255,255,.03)';prioCol='var(--text3)';}

    return`<div class="wv-avail-card" onclick="openPlayerModal('${id}')">
      <img class="rr-photo" src="https://sleepercdn.com/content/nfl/players/${id}.jpg" style="width:32px;height:32px" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=rr-initials style=width:32px;height:32px;font-size:13px>${initials}</span>')" loading="lazy"/>
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pName(id)}</span>
          <span class="rr-pos" style="${getPosBadgeStyle(p.position)}">${mPos}</span>
          ${prioLabel?'<span class="wv-priority-tag" style="color:'+prioCol+';background:'+prioBg+'">'+prioLabel+'</span>':''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px;font-size:13px;color:var(--text3)">
          <span>${p.team||'FA'} · ${p.age||'?'}</span>
          <span class="rr-val" style="color:${col}">${val>0?val.toLocaleString():'—'}</span>
          ${ppg?'<span>'+ppg.toFixed(1)+' PPG</span>':''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        ${faabStr?`<div class="wv-faab-badge">${faabStr}</div><div class="wv-conf-badge" style="color:${confCol}">${conf}</div>`:''}
      </div>
      <div class="rr-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;
  }).join('');

  tbody.innerHTML=rows||(filtered.length===0?'<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No strong waiver adds this week.</div>':'');
}

// ── Top 5 Available (always-visible waiver section) ───────────
window._waiverPosFilter = 'All';
window._waiverSort = 'dhq';

function filterWaiverTop5(pos) {
  window._waiverPosFilter = pos;
  renderWaiverTop5();
}
window.filterWaiverTop5 = filterWaiverTop5;

function sortWaiverTop5(field) {
  window._waiverSort = field;
  renderWaiverTop5();
}
window.sortWaiverTop5 = sortWaiverTop5;

function renderWaiverTop5() {
  const filtersEl = $('waiver-pos-filters');
  const listEl = $('waiver-top5-list');
  const sortsEl = $('waiver-top5-sorts');
  if (!listEl) return;

  // Position filter buttons
  const positions = ['All','QB','RB','WR','TE','K','DL','LB','DB'];
  const curPos = window._waiverPosFilter || 'All';
  if (filtersEl) {
    filtersEl.innerHTML = positions.map(pos =>
      `<button onclick="filterWaiverTop5('${pos}')" id="waiver-filter-${pos}" style="padding:4px 10px;font-size:11px;font-weight:700;border-radius:4px;border:1px solid ${pos === curPos ? 'var(--accent)' : 'var(--border)'};background:${pos === curPos ? 'var(--accent)' : 'transparent'};color:${pos === curPos ? 'var(--bg1)' : 'var(--text2)'};cursor:pointer;font-family:inherit;text-transform:uppercase">${pos}</button>`
    ).join('');
  }

  // Sort buttons
  const curSort = window._waiverSort || 'dhq';
  if (sortsEl) {
    const sorts = [
      { key: 'dhq', label: 'DHQ' },
      { key: 'age', label: 'Age' },
      { key: 'ppg', label: 'PPG' }
    ];
    sortsEl.innerHTML = sorts.map(s =>
      `<button onclick="sortWaiverTop5('${s.key}')" style="padding:3px 8px;font-size:10px;font-weight:700;border-radius:4px;border:1px solid ${s.key === curSort ? 'var(--accent)' : 'var(--border)'};background:${s.key === curSort ? 'var(--accent)' : 'transparent'};color:${s.key === curSort ? 'var(--bg1)' : 'var(--text3)'};cursor:pointer;font-family:inherit;text-transform:uppercase">${s.label}</button>`
    ).join('');
  }

  // Loading state
  if (!LI_LOADED && Object.keys(S.playerStats || {}).length === 0) {
    listEl.innerHTML = `<div style="padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl)">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="skeleton" style="height:14px;width:70%"></div>
        <div class="skeleton" style="height:14px;width:55%"></div>
        <div class="skeleton" style="height:14px;width:65%"></div>
      </div>
      <div style="font-size:13px;color:var(--text3);margin-top:8px">Building DHQ values...</div>
    </div>`;
    return;
  }

  // Get available players
  const avail = getAvailablePlayers();
  if (!avail.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl)">No available players found.</div>';
    return;
  }

  // Position mapping helper
  const posMapFilter = p => { if (['DE','DT'].includes(p)) return 'DL'; if (['CB','S'].includes(p)) return 'DB'; return p; };

  // Filter by position
  let filtered = curPos !== 'All' ? avail.filter(a => posMapFilter(a.p.position) === curPos || a.p.position === curPos) : avail;

  // Only show players with meaningful value
  filtered = filtered.filter(a => a.val > 0);

  // Sort
  const sc = S.leagues?.find(l => l.league_id === S.currentLeagueId)?.scoring_settings || {};
  const getPPG = (x) => {
    const st = S.playerStats?.[x.id] || {};
    const mP = posMapFilter(x.p.position);
    const isI = ['DL','LB','DB'].includes(mP);
    const raw = st?.prevRawStats;
    return isI && raw ? +(calcIDPScore(raw, sc) / Math.max(1, raw.gp || 17)).toFixed(1) : (st.seasonAvg || st.prevAvg || 0);
  };

  if (curSort === 'age') {
    filtered = [...filtered].sort((a, b) => (a.p.age || 99) - (b.p.age || 99));
  } else if (curSort === 'ppg') {
    filtered = [...filtered].sort((a, b) => getPPG(b) - getPPG(a));
  } else {
    // DHQ (default) — already sorted by val desc from getAvailablePlayers
    filtered = [...filtered].sort((a, b) => b.val - a.val);
  }

  // Top 5
  const top5 = filtered.slice(0, 5);

  if (!top5.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl)">No players match this filter.</div>';
    return;
  }

  // Strategy context for alignment badges
  const _wStrat = window.GMStrategy?.getStrategy ? window.GMStrategy.getStrategy() : {};
  const _wTargetPos = _wStrat.targetPositions || [];
  const _wMyAssess = typeof assessTeamFromGlobal === 'function' ? assessTeamFromGlobal(S.myRosterId) : null;
  const _wNeedPos = (_wMyAssess?.needs || []).map(n => typeof n === 'string' ? n : n.pos).filter(Boolean);

  // Render cards
  const rows = top5.map(({ id, p, val }) => {
    const stats = S.playerStats?.[id] || {};
    const { col } = tradeValueTier(val);
    const mPos = posMapFilter(p.position);
    const isIDP = ['DL','LB','DB'].includes(mPos);
    const raw = stats?.prevRawStats;
    const ppg = isIDP && raw ? +(calcIDPScore(raw, sc) / Math.max(1, raw.gp || 17)).toFixed(1) : (stats.seasonAvg || stats.prevAvg || 0);
    const initials = ((p.first_name || '?')[0] + (p.last_name || '?')[0]).toUpperCase();
    const isNeed = _wNeedPos[0] === mPos;
    const isTarget = _wTargetPos.includes(mPos);
    const alignBadge = isTarget
      ? '<span style="font-size:9px;font-weight:700;padding:1px 4px;border-radius:5px;background:rgba(212,175,55,.15);color:var(--accent)">TARGET</span>'
      : isNeed
      ? '<span style="font-size:9px;font-weight:700;padding:1px 4px;border-radius:5px;background:rgba(52,211,153,.12);color:var(--green)">NEED</span>'
      : '';

    return `<div class="wv-avail-card" onclick="openPlayerModal('${id}')">
      <img class="rr-photo" src="https://sleepercdn.com/content/nfl/players/${id}.jpg" style="width:32px;height:32px" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=rr-initials style=width:32px;height:32px;font-size:13px>${initials}</span>')" loading="lazy"/>
      <div style="flex:1;min-width:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pName(id)}</span>
          <span class="rr-pos" style="${getPosBadgeStyle(p.position)}">${mPos}</span>
          ${alignBadge}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px;font-size:13px;color:var(--text3)">
          <span>${p.team || 'FA'} · ${p.age || '?'}</span>
          <span class="rr-val" style="color:${col}">${val > 0 ? val.toLocaleString() : '—'}</span>
          ${ppg ? '<span>' + ppg.toFixed(1) + ' PPG</span>' : ''}
        </div>
      </div>
      <div class="rr-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;
  }).join('');

  listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px">${rows}</div>`;
}
window.renderWaiverTop5 = renderWaiverTop5;

function renderTopPickupHero(){
  const el=$('wv-top-pickup');if(!el)return;
  if(!LI_LOADED||!S.rosters?.length){el.innerHTML='';return;}
  const avail=getAvailablePlayers();

  // Strategy context for FAAB scaling
  const strat=window.GMStrategy?.getStrategy?window.GMStrategy.getStrategy():{};
  const aggression=strat.aggression||'medium';
  const aggrMult=aggression==='high'?1.4:aggression==='low'?0.7:1.0;
  const targetPositions=strat.targetPositions||[];

  const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  const faab=getFAAB();
  const faabMarket=LI_LOADED&&LI.faabByPos?LI.faabByPos:{};
  const posMapF=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};

  // Find best pickup — prefer needs then target positions, then highest value (floor scales with league size)
  const _heroFloorTeams=S.rosters?.length||12;
  const _heroFloor=_heroFloorTeams>=14?1800:_heroFloorTeams>=12?1500:_heroFloorTeams>=10?1200:800;
  const qualAvail=avail.filter(a=>a.val>=_heroFloor);
  let best=null;
  if(assess?.needs?.length){
    const need=assess.needs[0];
    best=qualAvail.find(a=>posMapF(a.p.position)===need.pos);
  }
  // Also try target positions if no need match
  if(!best&&targetPositions.length){
    best=qualAvail.find(a=>targetPositions.includes(posMapF(a.p.position)));
  }
  // Final fallback: highest value or first available regardless of floor
  if(!best)best=qualAvail[0]||avail[0];
  if(!best){el.innerHTML='<div style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);font-size:13px;color:var(--text3);text-align:center">No waiver recommendations yet — connect your league to see options.</div>';return;}

  const p=best.p;const pid=best.id;const pos=posMapF(p.position);
  const val=best.val;
  const stats=S.playerStats?.[pid]||{};
  const ppg=stats.prevAvg||stats.seasonAvg||0;
  const pk=peakYears(pid);
  const meta=LI.playerMeta?.[pid];
  const peakYrs=meta?.peakYrsLeft||0;
  const isNeedFit=assess?.needs?.length&&posMapF(p.position)===assess.needs[0].pos;
  const isTargetFit=targetPositions.includes(pos);

  // FAAB calc (scaled by aggression setting)
  const market=faabMarket[pos];
  let bidAmt=0;
  if(market&&market.count>=3&&faab.budget>0&&faab.isFAAB){
    const floor=faab.minBid||1;
    const raw=Math.round(faab.remaining*0.12)*aggrMult;
    bidAmt=Math.max(floor,Math.min(Math.round(raw),Math.round(market.avg*(val/4000)*aggrMult),faab.remaining));
  }else if(faab.budget>0&&faab.isFAAB&&val>0){
    const floor=faab.minBid||1;
    bidAmt=Math.max(floor,Math.min(Math.round(faab.remaining*0.10*aggrMult),Math.round(val/200*aggrMult),faab.remaining));
  }

  // Alex Says headline
  const alexHeadline=bidAmt
    ?`Bid $${bidAmt} on ${pName(pid)}.`
    :`Add ${pName(pid)}.`;
  const alexWhy=isNeedFit
    ?`Fills your ${pos} gap.`
    :isTargetFit
    ?`Hits your ${pos} target.`
    :ppg
    ?`${ppg.toFixed(1)} PPG last season.`
    :`${val.toLocaleString()} DHQ value available.`;

  const urgencyColor=aggression==='high'?'var(--red)':aggression==='low'?'var(--text3)':'var(--amber)';
  const urgencyLabel=aggression==='high'?'Act now':aggression==='low'?'Worth a look':'This week';

  el.innerHTML=`
    <div class="wv-hero" onclick="openPlayerModal('${pid}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em">Alex says</span>
        <span style="font-size:10px;color:var(--text3)">·</span>
        <span style="font-size:10px;font-weight:700;color:${urgencyColor}">${urgencyLabel}</span>
        ${isNeedFit||isTargetFit?'<span style="font-size:9px;font-weight:700;color:var(--green);padding:1px 5px;border:1px solid rgba(52,211,153,.3);border-radius:6px;margin-left:auto">ALIGNED</span>':''}
      </div>
      <div class="wv-hero-title" style="font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.2">${alexHeadline} <span style="color:var(--text3);font-weight:500;font-size:16px">${alexWhy}</span></div>
      <div class="wv-hero-sub">${pos} · ${fullTeam(p.team)||p.team||'FA'} · Age ${p.age||'?'} · ${pk.label}</div>
      ${bidAmt?`<div style="margin:8px 0;font-size:13px;color:var(--text2)"><strong style="color:var(--accent)">Suggested bid: $${bidAmt}</strong>${aggression==='high'?' — aggressive budget':''}${aggression==='low'?' — conservative':''}. ${faab.remaining?'You have $'+faab.remaining+' remaining.':''}</div>`:''}
      <div class="wv-hero-actions">
        <button class="wv-hero-cta" onclick="event.stopPropagation();mobileTab('waivers')">${bidAmt?'View · ~$'+bidAmt:'View in Waivers →'}</button>
        <button class="pm-action-btn" onclick="event.stopPropagation();openPlayerModal('${pid}')" style="flex:0 0 auto;padding:12px 16px">Details</button>
      </div>
    </div>`;
}

function renderWaivers(){
  loadMentality();

  // FAAB context banner
  if(S.myRosterId){
    const faab=getFAAB();
    const slots=getRosterSlots();
    const leagueFaab=(()=>{
      const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
      const leagueBudget=league?.settings?.waiver_budget||200;
      const budgets=S.rosters.filter(r=>r.settings).map(r=>Math.max(0,leagueBudget-(r.settings?.waiver_budget_used||0)));
      const avg=budgets.length?Math.round(budgets.reduce((a,b)=>a+b,0)/budgets.length):leagueBudget;
      return{avg:Math.max(0,avg)};
    })();
    const bar=$('faab-bar');if(bar)bar.style.display='block';

    // Context line
    const ctxLine=$('faab-context-line');
    if(ctxLine){
      if(faab.isFAAB&&faab.budget>0){
        const pct=Math.round((faab.remaining/faab.budget)*100);
        const tone=pct>70?'Healthy budget — be strategic':pct>40?'Solid budget remaining':pct>15?'Budget getting tight':'Low budget — be selective';
        ctxLine.innerHTML=`$${faab.remaining} FAAB <span style="color:var(--text3);font-weight:400">(${pct}%)</span> — <span style="color:${pct>50?'var(--green)':pct>25?'var(--amber)':'var(--red)'}">${tone}</span>`;
      }else{
        ctxLine.textContent='Waiver priority: #'+(myR()?.settings?.waiver_position||'?');
      }
    }

    // Sub-stats
    const mineEl=$('faab-mine');if(mineEl)mineEl.innerHTML=faab.isFAAB?'FAAB: $'+faab.remaining:'';
    const avgEl=$('faab-avg');if(avgEl)avgEl.innerHTML=faab.isFAAB?'Lg avg: $'+leagueFaab.avg:'';
    const slotsEl=$('bench-slots');if(slotsEl){
      slotsEl.innerHTML=`<span style="color:${slots.openBench>0?'var(--green)':'var(--red)'}">` + slots.openBench+'</span> open slots';
    }
    const wposEl=$('waiver-pos-display');if(wposEl)wposEl.innerHTML='Priority: #'+(myR()?.settings?.waiver_position||'?');
  }

  // Top pickup hero
  renderTopPickupHero();
  renderAvailable();
  renderWaiverTop5();


  // League waiver claims
  const claimsEl=$('waiver-claims');
  if(claimsEl){
  const claims=(S.transactions['w'+S.currentWeek]||[]).filter(t=>t.type==='free_agent'||t.type==='waiver').slice(0,12);
  claimsEl.innerHTML=claims.length?claims.map(t=>{
    const adds=Object.keys(t.adds||{});const drops=Object.keys(t.drops||{});
    const r=S.rosters.find(r=>t.roster_ids?.includes(r.roster_id));
    const owner=r?getUser(r.owner_id):'?';
    const isMe=r?.roster_id===S.myRosterId;
    return`<div class="pr" ${isMe?'style="background:var(--accentL);border-radius:6px;padding:7px 8px;margin:0 -8px"':''}>
      <span class="pn" style="font-weight:${isMe?500:400}">${owner}${isMe?' (you)':''}</span>
      <span class="pm">${adds.map(p=>`<span style="color:var(--green)">+${pName(p)}</span>`).join(', ')}${drops.length?' / '+drops.map(p=>`<span style="color:var(--red)">-${pName(p)}</span>`).join(', '):''}${t.settings?.waiver_bid?` <span style="color:var(--amber)">$${t.settings.waiver_bid}</span>`:''}</span>
    </div>`;
  }).join(''):'<div class="empty">No claims this week.</div>';
  }
}

// ── Trades ─────────────────────────────────────────────────────
function renderTrades(){
  const week=S.currentWeek;
  const trades=(S.transactions['w'+week]||[]).filter(t=>t.type==='trade');
  const el=$('trades-recent');if(!el)return;
  el.innerHTML=trades.length?trades.map(t=>{
    const rids=t.roster_ids||[];
    const names=rids.map(id=>{const r=S.rosters.find(r=>r.roster_id===id);const n=r?getUser(r.owner_id):`Team ${id}`;return id===S.myRosterId?n+' (you)':n;});
    const sides={};rids.forEach(id=>sides[id]={players:[],picks:[]});
    Object.keys(t.adds||{}).forEach(pid=>{const d=t.adds[pid];if(sides[d])sides[d].players.push(pName(pid));});
    (t.draft_picks||[]).forEach(pk=>{if(sides[pk.owner_id])sides[pk.owner_id].picks.push(pk.season+' R'+pk.round);});
    const sideArr=rids.map(id=>({name:S.rosters.find(r=>r.roster_id===id)?getUser(S.rosters.find(r=>r.roster_id===id).owner_id):`T${id}`,gets:[...(sides[id]?.players||[]),...(sides[id]?.picks||[])]}));
    const isMe=rids.includes(S.myRosterId);
    const sidesTxt=sideArr.map(s=>s.name+' gets: '+s.gets.join(', ')).join('. ');
    return`<div class="card-sm" style="${isMe?'border-color:rgba(212,175,55,.3)':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <span style="font-size:13px;font-weight:500">${names.join(' ↔ ')}</span>
        <span class="tag tag-t">Trade</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 18px 1fr;gap:6px;font-size:13px">
        <div><div style="color:var(--text3);margin-bottom:3px">${sideArr[0]?.name} gets</div><div style="color:var(--text2)">${sideArr[0]?.gets?.join(', ')||'—'}</div></div>
        <div style="display:flex;align-items:center;justify-content:center;color:var(--text3)">⇄</div>
        <div><div style="color:var(--text3);margin-bottom:3px">${sideArr[1]?.name} gets</div><div style="color:var(--text2)">${sideArr[1]?.gets?.join(', ')||'—'}</div></div>
      </div>
      <button class="copy-btn" style="margin-top:8px" onclick="goAsk('Analyze this trade: ${sidesTxt}. Who won from a dynasty perspective?')">Analyze ↗</button>
    </div>`;
  }).join(''):'<div class="empty">No trades yet this season.</div>';
  renderTradeIntel();
}

function renderTradeIntel(){
  const el=$('trade-intel');if(!el||!LI_LOADED)return;
  const my=myR();if(!my)return;
  const players=my.players||[];
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const rp=league?.roster_positions||[];
  const pM=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};

  // Count starters needed per position
  const needs={};const counts={};
  ['QB','RB','WR','TE','K','DL','LB','DB'].forEach(pos=>{
    const slotsNeeded=rp.filter(s=>s===pos||
      (s==='FLEX'&&['RB','WR','TE'].includes(pos))||
      (s==='SUPER_FLEX'&&pos==='QB')||
      (s==='IDP_FLEX'&&['DL','LB','DB'].includes(pos))
    ).length;
    const mine=players.filter(pid=>pM(pPos(pid))===pos&&dynastyValue(pid)>0);
    counts[pos]=mine.length;
    needs[pos]={have:mine.length,need:Math.max(1,Math.round(slotsNeeded)),surplus:mine.length-Math.max(1,Math.round(slotsNeeded))};
  });

  const depth=Object.entries(needs).filter(([,v])=>v.surplus>=2).sort((a,b)=>b[1].surplus-a[1].surplus).slice(0,3);
  const weak=Object.entries(needs).filter(([,v])=>v.surplus<0).sort((a,b)=>a[1].surplus-b[1].surplus).slice(0,3);

  // Top tradeable assets — players with high value that aren't your top starter at their position
  const tradeableAssets=players.map(pid=>({pid,val:dynastyValue(pid),pos:pM(pPos(pid)),name:pNameShort(pid)}))
    .filter(p=>p.val>1500)
    .sort((a,b)=>b.val-a.val);
  // Remove the top player at each position (you want to keep those)
  const topByPos={};
  tradeableAssets.forEach(p=>{if(!topByPos[p.pos])topByPos[p.pos]=p.pid;});
  const sellable=tradeableAssets.filter(p=>p.pid!==topByPos[p.pos]).slice(0,3);

  // Top pick assets
  const myPicks=S.tradedPicks.filter(p=>p.owner_id===S.myRosterId&&parseInt(p.season)>=parseInt(S.season));
  const topPicks=myPicks.filter(p=>p.round<=2).slice(0,3).map(p=>p.season+' R'+p.round);

  // Find top sellable player per surplus position
  const sellByPos={};
  tradeableAssets.filter(p=>p.pid!==topByPos[p.pos]).forEach(p=>{
    if(!sellByPos[p.pos])sellByPos[p.pos]=p;
  });

  el.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">Surplus — sell high</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:6px">by roster depth</div>
      ${depth.length?depth.map(([pos,v])=>{
        const sell=sellByPos[pos];
        return`<div style="font-size:13px;color:var(--text2);margin-bottom:4px"><strong>${pos}</strong> ${v.have} rostered, +${v.surplus} over need${sell?' · <span style="color:var(--text3)">sell '+sell.name+'</span>':''}</div>`;
      }).join(''):'<div style="font-size:13px;color:var(--text3)">No surplus positions</div>'}
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">Thin — buy low</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:6px">by roster depth</div>
      ${weak.length?weak.map(([pos,v])=>`<div style="font-size:13px;color:var(--text2);margin-bottom:4px"><strong>${pos}</strong> ${v.have} rostered, need ${Math.abs(v.surplus)} more</div>`).join(''):'<div style="font-size:13px;color:var(--text3)">All positions covered</div>'}
    </div>
  </div>
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px;margin-top:8px">
    <div style="font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Top trade chips</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${sellable.map(p=>`<span style="font-size:13px;padding:4px 10px;background:var(--bg3);border-radius:6px;color:var(--text2);cursor:pointer" onclick="openPlayerModal('${p.pid}')">${p.name} <span style="color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:13px">${p.val.toLocaleString()}</span></span>`).join('')}
      ${topPicks.map(p=>`<span style="font-size:13px;padding:4px 10px;background:var(--bg3);border-radius:6px;color:var(--amber)">${p}</span>`).join('')}
    </div>
  </div>`;
}

// ── Picks ──────────────────────────────────────────────────────
function renderPicks(){
  const all=S.tradedPicks;
  const teams=S.rosters.length||12;
  const el=$('picks-mine');if(!el)return;
  const curYear=parseInt(S.season||new Date().getFullYear());
  const years=[curYear, curYear+1, curYear+2];
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const totalRounds=league?.settings?.draft_rounds||5;

  // Build complete pick picture using the same logic as renderDraftNeeds
  const myPicks=[];

  years.forEach(yr=>{
    for(let rd=1;rd<=totalRounds;rd++){
      // Check if I traded away my OWN pick this round
      const myTradedAway=all.find(p=>parseInt(p.season)===yr&&p.round===rd&&p.roster_id===S.myRosterId&&p.owner_id!==S.myRosterId);
      // If not traded away, I still own my own pick
      if(!myTradedAway){
        myPicks.push({season:yr,round:rd,from:'Own pick',mine:true,original:true});
      }
      // Find ALL picks acquired from other rosters at this round (could be multiple!)
      const acquired=all.filter(p=>parseInt(p.season)===yr&&p.round===rd&&p.owner_id===S.myRosterId&&p.roster_id!==S.myRosterId);
      acquired.forEach(acq=>{
        const origOwner=getUser(S.rosters.find(r=>r.roster_id===acq.roster_id)?.owner_id);
        myPicks.push({season:yr,round:rd,from:origOwner,mine:true,original:false,fromRosterId:acq.roster_id});
      });
    }
  });

  myPicks.sort((a,b)=>a.season-b.season||a.round-b.round);

  if(!myPicks.length){el.innerHTML='<div class="card"><div class="empty">No picks found.</div></div>';return;}

  // Group by year
  const byYear={};
  myPicks.forEach(p=>{const yr=String(p.season);if(!byYear[yr])byYear[yr]=[];byYear[yr].push(p);});
  const totalVal=myPicks.reduce((s,p)=>s+pickValue(p.season,p.round,teams),0);

  // Check for traded-away picks
  const tradedAway=[];
  years.forEach(yr=>{
    for(let rd=1;rd<=totalRounds;rd++){
      const t=all.find(p=>parseInt(p.season)===yr&&p.round===rd&&p.roster_id===S.myRosterId&&p.owner_id!==S.myRosterId);
      if(t)tradedAway.push({season:yr,round:rd,to:getUser(S.rosters.find(r=>r.roster_id===t.owner_id)?.owner_id)});
    }
  });

  el.innerHTML=Object.keys(byYear).sort().map(yr=>{
    return'<div style="margin-bottom:10px">'
      +'<div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">'+yr+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
      +byYear[yr].map(p=>{
        const val=pickValue(p.season,p.round,teams);
        const valCol=val>4000?'var(--green)':val>2000?'var(--amber)':val>800?'var(--text2)':'var(--text3)';
        return'<div style="background:var(--bg3);border:1px solid '+(p.original?'var(--border2)':'rgba(212,175,55,.25)')+';border-radius:8px;padding:8px 12px;min-width:100px">'
          +'<div style="font-size:14px;font-weight:700;color:var(--accent)">Round '+p.round+'</div>'
          +'<div style="font-size:13px;color:'+(p.original?'var(--text3)':'var(--accent)')+';margin-top:2px">'+(p.original?'Own pick':'from '+p.from)+'</div>'
          +'<div style="font-size:13px;font-weight:600;color:'+valCol+';margin-top:4px;font-family:\'JetBrains Mono\',monospace">~'+val.toLocaleString()+'</div>'
          +'</div>';
      }).join('')
      +'</div></div>';
  }).join('')
  +'<div style="font-size:13px;color:var(--text3);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'+myPicks.length+' picks · Total value: <strong style="color:var(--accent);font-family:\'JetBrains Mono\',monospace">~'+totalVal.toLocaleString()+'</strong></div>';
}

async function runPicksAI(){
  if(!hasAnyAI()){switchTab('settings');return;}
  const btn=$('picks-ai-btn');btn.textContent='Analyzing...';btn.disabled=true;
  $('picks-ai-content').innerHTML='<div class="empty">Analyzing your pick assets vs the league...</div>';
  try{
    const teams=S.rosters.length||12;
    const mine=S.tradedPicks.filter(p=>p.owner_id===S.myRosterId);
    const myPickStr=mine.map(p=>`${p.season} Round ${p.round} (orig: ${getUser(S.rosters.find(r=>r.roster_id===p.roster_id)?.owner_id)}, val ~${pickValue(p.season,p.round,teams).toLocaleString()})`).join(', ');
    const allLeaguePicks=S.tradedPicks.map(p=>`${p.season}R${p.round} owned by ${getUser(S.rosters.find(r=>r.roster_id===p.owner_id)?.owner_id)}`).join(', ');
    const reply=await callClaude([{role:'user',content:`Dynasty pick asset advisor.

MY PICKS: ${myPickStr||'No traded picks — only own my own picks'}
ALL LEAGUE TRADED PICKS: ${allLeaguePicks}
${dhqBuildMentalityContext()}
${dhqContext(false)}

Analyze my pick portfolio and give me:
1. SELL NOW — any picks I should trade away immediately while value is high
2. HOLD — picks worth keeping given my mentality
3. BUY — picks I should try to acquire from other teams (and who might sell)
4. OVERALL ASSESSMENT — am I pick-rich or pick-poor vs the league? How does this affect my dynasty timeline?

Be specific with round and year for each recommendation.`}]);
    $('picks-ai-content').innerHTML=`
      <div class="card" style="border-color:rgba(212,175,55,.2)">
        <div style="font-size:13px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">AI Pick Analysis</div>
        <div style="font-size:14px;color:var(--text2);line-height:1.7">${reply.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--text)">$1</strong>').replace(/\n/g,'<br>')}</div>
      </div>`;
  }catch(e){$('picks-ai-content').innerHTML=`<div style="color:var(--red);font-size:13px">Error: ${escHtml(e.message)}</div>`;}
  btn.textContent='AI analysis ↗';btn.disabled=false;
}

function updateDataFreshness(){
  const pill=$('week-pill');if(!pill)return;
  const base='Wk '+S.currentWeek+' · '+S.season;
  pill.textContent=base;
  if(LI_LOADED){
    pill.title='DHQ values: '+Object.keys(LI.playerScores||{}).length+' players';
    pill.className='pill pg';
  }else{
    pill.title='DHQ loading...';
  }
}

function updateSyncStatus(){
  const fcEl=$('sync-fc');const statsEl=$('sync-stats');const liEl=$('sync-li');
  // FC indicator repurposed to show DHQ status
  if(fcEl){
    const dot=fcEl.querySelector('span');
    if(LI_LOADED){
      if(dot)dot.style.background='var(--green)';fcEl.style.color='var(--text2)';
      if(fcEl.lastChild)fcEl.lastChild.textContent=' DHQ ✓ ('+Object.keys(LI.playerScores||{}).length+')';
    } else{if(dot)dot.style.background='var(--text3)';fcEl.style.color='var(--text3)';if(fcEl.lastChild)fcEl.lastChild.textContent=' DHQ...';}
  }
  if(statsEl){
    const dot=statsEl.querySelector('span');
    const count=Object.keys(S.playerStats||{}).length;
    if(count>0){if(dot)dot.style.background='var(--green)';statsEl.style.color='var(--text2)';if(statsEl.lastChild)statsEl.lastChild.textContent=' Stats ✓ ('+count+')';}
    else{if(dot)dot.style.background='var(--amber)';statsEl.style.color='var(--amber)';if(statsEl.lastChild)statsEl.lastChild.textContent=' Stats...';}
  }
  if(liEl){
    const dot=liEl.querySelector('span');
    if(LI_LOADED){
      const dCount=LI.totalPicks||0;
      if(dot)dot.style.background='var(--green)';liEl.style.color='var(--text2)';
      if(liEl.lastChild)liEl.lastChild.textContent=` Intel ✓ (${dCount} picks, ${LI.leagueYears?.length||0}yr${LI.rookieCount?' + '+LI.rookieCount+' rookies':''})`;
    }
    else{if(dot)dot.style.background='var(--text3)';if(liEl.lastChild)liEl.lastChild.textContent=' Intel...';}
  }
}

async function resyncAllData(){
  if(!S.currentLeagueId){showToast('Connect first');return;}
  showToast('Resyncing all data...');
  DhqStorage.remove('dhq_leagueintel_v10'); // old v10 key — clear on resync
  DhqStorage.removeByPrefix(STORAGE_KEYS.HIST_PREFIX);
  _availCache=null;LI_LOADED=false;LI={};S.playerStats={};window._liLoading=false;
  updateSyncStatus();
  await loadAllData();
  showToast('Data refreshed ✓');
}

async function handleRefreshClick(){
  const btn=document.getElementById('refresh-btn');
  const icon=document.getElementById('refresh-icon');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  if(icon)icon.style.animation='spin .7s linear infinite';
  btn.style.opacity='1';btn.style.color='var(--accent)';
  try{await resyncAllData();}finally{
    if(icon)icon.style.animation='';
    btn.style.opacity='.7';btn.style.color='var(--text3)';
    btn.disabled=false;
  }
}
window.handleRefreshClick=handleRefreshClick;

// tradeValueTier: defined in shared/constants.js
// dynastyValue: defined in shared/dhq-engine.js
// getPlayerRank: defined in shared/dhq-engine.js
// isNoValue: defined in shared/dhq-engine.js

function assetValue(id){
  if(String(id).startsWith('pick:')){
    const[,season,round]=String(id).split(':');
    return pickValue(season,parseInt(round),S.rosters.length||12);
  }
  return dynastyValue(id);
}
function assetName(id){
  if(String(id).startsWith('pick:')){
    const[,season,round]=String(id).split(':');
    return`${season} Round ${round} Pick`;
  }
  return pName(id);
}

// ── Player Search ──────────────────────────────────────────────
function handlePlayerSearch(query){
  const results=$('player-search-results');if(!results)return;
  if(!query||query.length<2){results.innerHTML='';results.style.display='none';return;}
  results.style.display='block';
  const q=query.toLowerCase();
  const matches=Object.entries(S.players)
    .filter(([id,p])=>{
      const name=(p.first_name+' '+p.last_name).toLowerCase();
      return name.includes(q)&&(p.status==='Active'||dynastyValue(id)>0);
    })
    .map(([id,p])=>({id,p,name:p.first_name+' '+p.last_name,val:dynastyValue(id)}))
    .sort((a,b)=>b.val-a.val)
    .slice(0,8);

  if(!matches.length){results.innerHTML='<div style="padding:12px;font-size:13px;color:var(--text3)">No players found</div>';return;}
  const posMapS=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
  results.innerHTML=matches.map(({id,p,name,val})=>{
    const meta=LI_LOADED?LI.playerMeta?.[id]:null;
    const isRookie=meta?.source==='FC_ROOKIE';
    const {col}=tradeValueTier(val);
    const ini=((p.first_name||'?')[0]+(p.last_name||'?')[0]).toUpperCase();
    return`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s" onclick="openPlayerModal('${id}');$('player-search-results').style.display='none';$('player-search-in').value=''" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      <img src="https://sleepercdn.com/content/nfl/players/${id}.jpg" style="width:28px;height:28px;border-radius:50%" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=rr-initials style=width:28px;height:28px;font-size:13px>${ini}</span>')" loading="lazy"/>
      <div style="flex:1;overflow:hidden">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}${isRookie?'<span style="font-size:13px;color:var(--blue);margin-left:4px">ROOKIE</span>':''}</div>
        <div style="font-size:13px;color:var(--text3)">${posMapS(p.position)||'?'} · ${p.team||'FA'} · Age ${p.age||'?'}</div>
      </div>
      <span style="font-size:13px;font-weight:700;color:${col};font-family:'JetBrains Mono',monospace">${val>0?val.toLocaleString():'—'}</span>
    </div>`;
  }).join('');
}
// Close search on outside click
document.addEventListener('click',e=>{
  const wrap=$('player-search-wrap');
  if(wrap&&!wrap.contains(e.target)){
    const r=$('player-search-results');if(r)r.style.display='none';
  }
  // Close global search bar if clicking outside it
  const gsBar=$('global-search-bar');
  const gsBtn=$('global-search-btn');
  if(gsBar&&gsBar.style.display!=='none'&&!gsBar.contains(e.target)&&e.target!==gsBtn&&!gsBtn?.contains(e.target)){
    gsBar.style.display='none';
    const gsResults=$('gsearch-results');if(gsResults)gsResults.style.display='none';
    const gsIn=$('gsearch-in');if(gsIn)gsIn.value='';
  }
});

// ── Global Player Search (header search bar) ──────────────────
function toggleGlobalSearch(){
  const bar=$('global-search-bar');if(!bar)return;
  const isOpen=bar.style.display!=='none';
  if(isOpen){
    bar.style.display='none';
    const r=$('gsearch-results');if(r)r.style.display='none';
    const inp=$('gsearch-in');if(inp)inp.value='';
  }else{
    bar.style.display='';
    setTimeout(()=>{const inp=$('gsearch-in');if(inp)inp.focus();},50);
  }
}
window.toggleGlobalSearch=toggleGlobalSearch;

function handleGlobalPlayerSearch(query){
  const results=$('gsearch-results');if(!results)return;
  if(!query||query.length<2){results.innerHTML='';results.style.display='none';return;}
  results.style.display='block';
  const q=query.toLowerCase();
  const posMapS=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
  const matches=Object.entries(S.players||{})
    .filter(([id,p])=>{
      const name=(p.first_name+' '+p.last_name).toLowerCase();
      return name.includes(q)&&(p.status==='Active'||dynastyValue(id)>0);
    })
    .map(([id,p])=>({id,p,name:p.first_name+' '+p.last_name,val:dynastyValue(id)}))
    .sort((a,b)=>b.val-a.val)
    .slice(0,10);
  if(!matches.length){results.innerHTML='<div style="padding:12px;font-size:13px;color:var(--text3)">No players found</div>';return;}
  results.innerHTML=matches.map(({id,p,name,val})=>{
    const meta=LI_LOADED?LI.playerMeta?.[id]:null;
    const isRookie=meta?.source==='FC_ROOKIE';
    const {col}=tradeValueTier(val);
    const ini=((p.first_name||'?')[0]+(p.last_name||'?')[0]).toUpperCase();
    return`<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s" onclick="openPlayerModal('${id}');toggleGlobalSearch()" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      <img src="https://sleepercdn.com/content/nfl/players/${id}.jpg" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span style=width:32px;height:32px;border-radius:50%;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text3);flex-shrink:0>${ini}</span>')" loading="lazy"/>
      <div style="flex:1;overflow:hidden;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}${isRookie?'<span style="font-size:12px;color:var(--blue);margin-left:4px">ROOKIE</span>':''}</div>
        <div style="font-size:12px;color:var(--text3)">${posMapS(p.position)||'?'} · ${p.team||'FA'} · Age ${p.age||'?'}</div>
      </div>
      <span style="font-size:13px;font-weight:700;color:${col};font-family:'JetBrains Mono',monospace;flex-shrink:0">${val>0?val.toLocaleString():'—'}</span>
    </div>`;
  }).join('');
}
window.handleGlobalPlayerSearch=handleGlobalPlayerSearch;

// ── Home Snapshot ──────────────────────────────────────────────
function renderHomeSnapshot(){
  const my=myR();if(!my)return;
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const sorted=[...S.rosters].sort((a,b)=>(b.settings?.wins||0)-(a.settings?.wins||0));
  const s=my.settings||{};
  const faab=getFAAB();
  const sessions=typeof loadConvMemory==='function'?loadConvMemory():[];
  const lastSession=sessions.length?sessions[sessions.length-1]:null;

  // Calculate avg PPG for my team and league
  const myPts=((s.fpts||0)+(s.fpts_decimal||0)/100);
  const weeks=Math.max(1,(s.wins||0)+(s.losses||0)+(s.ties||0));
  const hasGames=(s.wins||0)+(s.losses||0)+(s.ties||0)>0;
  const myAvg=hasGames?(myPts/weeks).toFixed(1):'—';
  const leagueAvgs=S.rosters.map(r=>{
    const rs=r.settings||{};
    const pts=(rs.fpts||0)+(rs.fpts_decimal||0)/100;
    const w=Math.max(1,(rs.wins||0)+(rs.losses||0)+(rs.ties||0));
    return w>0?pts/w:0;
  }).filter(v=>v>0);
  const leagueAvg=leagueAvgs.length?(leagueAvgs.reduce((a,b)=>a+b,0)/leagueAvgs.length).toFixed(1):'—';

  // Championship badge
  const championships = window.App?.LI?.championships || {};
  const myChamps = Object.values(championships).filter(c => c.champion === S.myRosterId).length;
  const champBadge = myChamps > 0 ? `<span style="font-size:13px;color:var(--amber);font-weight:700;margin-left:8px">${myChamps > 1 ? myChamps + 'x ' : ''}Champion</span>` : '';

  const el=$('home-snapshot');if(!el)return;
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--text);letter-spacing:-.03em">${S.user?.display_name||'GM'}${champBadge}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:2px">${league?.name||''}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:12px;flex-wrap:wrap">
        <div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${s.wins||0}-${s.losses||0}</div>
          <div style="font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Record</div>
        </div>
        <div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:${myAvg!=='—'&&parseFloat(myAvg)>=parseFloat(leagueAvg)?'var(--green)':'var(--amber)'};font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${myAvg}</div>
          <div style="font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">My PPG</div>
        </div>
        <div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${leagueAvg}</div>
          <div style="font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Lg Avg</div>
        </div>
        ${faab.isFAAB?`<div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:var(--green);font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">$${faab.remaining}</div>
          <div style="font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">FAAB</div>
        </div>`:''}
      </div>
    </div>
    ${lastSession?`<div style="background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.15);border-radius:var(--r);padding:10px 14px;font-size:13px;color:var(--text3);line-height:1.5">
      <span style="color:var(--accent);font-weight:700">Last session (${lastSession.date}):</span> ${lastSession.text}
    </div>`:''}`;
}

// ═══════════════════════════════════════════════════════════════
// GM BRIEFING — Three pillars: DO NOW, MONITOR, PREPARE
// Every item carries a productized rationale from DHQ engine data.
// ═══════════════════════════════════════════════════════════════

function _buildRationale(parts) { return parts.filter(Boolean).join(' \u00B7 '); }

function renderDailyBriefing(){
  const wrap=$('home-briefing');if(!wrap)return;
  if(!LI_LOADED||!S.rosters?.length){wrap.innerHTML='';return;}
  const my=myR();if(!my)return;
  const myPids=my.players||[];
  const mySet=new Set(myPids);
  const peaks=window.App.peakWindows;
  const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  const faab=getFAAB();
  const trending=S.trending||{};
  const league=S.leagues?.find(l=>l.league_id===S.currentLeagueId);
  const teams=S.rosters?.length||12;

  // ── DO THIS NOW ──────────────────────────────────────
  const doNow=[];

  // Waiver pickup at weakest position
  if(assess?.needs?.length){
    const need=assess.needs[0];
    const avail=typeof getAvailablePlayers==='function'?getAvailablePlayers():[];
    const bestAtNeed=avail.filter(a=>(normPos(S.players?.[a.id]?.position)||'')=== need.pos).sort((a,b)=>dynastyValue(b.id)-dynastyValue(a.id))[0];
    if(bestAtNeed){
      const val=dynastyValue(bestAtNeed.id);
      const p=S.players?.[bestAtNeed.id];
      const age=p?.age||'?';
      const ppg=S.playerStats?.[bestAtNeed.id]?.seasonAvg||S.playerStats?.[bestAtNeed.id]?.prevAvg||0;
      const peakW=peaks[need.pos]||[24,29];
      const peakYrs=Math.max(0,peakW[1]-(p?.age||25));
      // Count competing teams
      let competitors=0;
      S.rosters.forEach(r=>{if(r.roster_id===S.myRosterId)return;const cnt=(r.players||[]).filter(pid=>(normPos(S.players?.[pid]?.position)||'')=== need.pos).length;const req=(league?.roster_positions||[]).filter(s=>s===need.pos||s==='FLEX'||s==='SUPER_FLEX').length;if(cnt<req)competitors++;});
      const comp=competitors===0?'no competition':competitors<=2?competitors+' competing teams':competitors+' teams bidding';
      const faabHint=faab.isFAAB&&val>0?'Suggested bid: $'+Math.max(faab.minBid||1,Math.min(Math.round(faab.remaining*0.12),Math.round(val/200))):'';
      doNow.push({
        action:`Add ${pName(bestAtNeed.id)}`,
        rationale:_buildRationale([`fills ${need.pos} ${need.urgency}`,val>0?val.toLocaleString()+' DHQ':'',ppg?ppg.toFixed(1)+' PPG':'',peakYrs+'yr peak window',comp,faabHint])
      });
    }
  }

  // Sell declining asset
  const declining=myPids.map(pid=>{const meta=LI.playerMeta?.[pid];const val=dynastyValue(pid);if(!meta||val<2000)return null;const [,pHi]=peaks[meta.pos]||[24,29];const pastPeak=meta.age-pHi;if(pastPeak>=2&&(meta.trend||0)<=-10)return{pid,val,pastPeak,trend:meta.trend||0,pos:meta.pos,age:meta.age};return null;}).filter(Boolean).sort((a,b)=>b.val-a.val);
  if(declining.length){
    const d=declining[0];
    doNow.push({
      action:`Sell ${pName(d.pid)}`,
      rationale:_buildRationale([d.val.toLocaleString()+' DHQ',d.pastPeak+'yr past '+d.pos+' peak','PPG down '+Math.abs(d.trend)+'%','value will only decline from here'])
    });
  }

  // ── MONITOR THIS ─────────────────────────────────────
  const monitor=[];

  // Trending player on your roster
  const hotDrop=(trending.drops||[]).find(d=>mySet.has(d.player_id));
  const hotAdd=(trending.adds||[]).find(a=>mySet.has(a.player_id));
  if(hotDrop){
    const val=dynastyValue(hotDrop.player_id);
    monitor.push({
      action:`${pName(hotDrop.player_id)} trending down league-wide`,
      rationale:_buildRationale([val>0?val.toLocaleString()+' DHQ':'','dropping across Sleeper','watch for injury news or role change before acting'])
    });
  }
  if(hotAdd){
    const val=dynastyValue(hotAdd.player_id);
    monitor.push({
      action:`${pName(hotAdd.player_id)} gaining league-wide attention`,
      rationale:_buildRationale([val>0?val.toLocaleString()+' DHQ':'','you own them \u2014 hold','value may be rising'])
    });
  }

  // Value movers
  myPids.forEach(pid=>{
    const meta=LI.playerMeta?.[pid];if(!meta)return;
    const trend=meta.trend||0;const val=dynastyValue(pid);
    if(Math.abs(trend)>=20&&val>2000&&!declining.find(d=>d.pid===pid)){
      monitor.push({
        action:`${pName(pid)} value ${trend>0?'up':'down'} ${Math.abs(trend)}%`,
        rationale:_buildRationale([val.toLocaleString()+' DHQ',meta.pos,meta.age?'age '+meta.age:'',trend>0?'stock rising \u2014 hold':'monitor for further decline'])
      });
    }
  });

  // Rival activity
  const recentTrades=(S.transactions||{});
  // Cap monitor at 3
  const monitorCapped=monitor.slice(0,3);

  // ── PREPARE FOR THIS ─────────────────────────────────
  const prepare=[];

  // Aging risk
  const agingStars=myPids.map(pid=>{const meta=LI.playerMeta?.[pid];const val=dynastyValue(pid);if(!meta||val<2500)return null;const [,pHi]=peaks[meta.pos]||[24,29];if(meta.age>pHi)return{pid,age:meta.age,val,pos:meta.pos,yrs:meta.age-pHi};return null;}).filter(Boolean).sort((a,b)=>b.val-a.val);
  if(agingStars.length>=2){
    const totalAtRisk=agingStars.reduce((s,a)=>s+a.val,0);
    prepare.push({
      action:`${agingStars.length} aging assets (${totalAtRisk.toLocaleString()} DHQ at risk)`,
      rationale:_buildRationale([agingStars.slice(0,3).map(a=>pName(a.pid)+' ('+a.age+')').join(', '),'find successors before value erodes','target younger replacements in trades or draft'])
    });
  }

  // Draft prep
  const picks=typeof buildPicksByOwner==='function'?buildPicksByOwner():null;
  const myPicks=picks?picks[S.myRosterId]||[]:[];
  if(myPicks.length){
    const nextPick=myPicks.sort((a,b)=>a.year-b.year||a.round-b.round)[0];
    const biggestNeed=assess?.needs?.[0];
    prepare.push({
      action:`Draft: target ${biggestNeed?biggestNeed.pos:'BPA'} with ${nextPick.year} R${nextPick.round}`,
      rationale:_buildRationale([myPicks.length+' picks total',biggestNeed?biggestNeed.pos+' is your biggest gap':'',biggestNeed?.urgency==='deficit'?'critical need \u2014 prioritize':'depth play'])
    });
  }

  // Trade window
  if(assess?.strengths?.length&&assess?.needs?.length){
    prepare.push({
      action:`Trade ${assess.strengths[0]} surplus for ${assess.needs[0].pos}`,
      rationale:_buildRationale(['you have depth at '+assess.strengths.join(', '),assess.needs[0].pos+' is '+assess.needs[0].urgency,'check Trade Finder for specific offers'])
    });
  }

  const prepareCapped=prepare.slice(0,3);

  // ── RENDER ───────────────────────────────────────────
  const renderSection=(title,color,icon,items)=>{
    if(!items.length)return'';
    return`
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:16px">${icon}</span>
          <span style="font-size:14px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.1em">${title}</span>
        </div>
        ${items.map(it=>`
          <div style="padding:10px 14px;background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--r);margin-bottom:6px">
            <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">${it.action}</div>
            <div style="font-size:13px;color:var(--text3);line-height:1.5">${it.rationale}</div>
          </div>`).join('')}
      </div>`;
  };

  wrap.innerHTML=renderSection('Do This Now','var(--green)','\u26A1',doNow)
    +renderSection('Monitor This','var(--amber)','\uD83D\uDC41',monitorCapped)
    +renderSection('Prepare For This','var(--accent)','\uD83C\uDFAF',prepareCapped);
  if(typeof trackUsage==='function')trackUsage('briefings_received');
}

// ═══════════════════════════════════════════════════════════════
// LINEUP — Decision-support optimizer (mobile-first)
// ═══════════════════════════════════════════════════════════════

// Shared lineup state so optimize/toggle can reuse data
let _luState=null;

function _buildLineupState(){
  const my=myR();if(!my||!S.leagues)return null;
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  if(!league)return null;
  const positions=league.roster_positions||[];
  const starterSlots=positions.filter(p=>p!=='BN'&&p!=='IR'&&p!=='TAXI');
  const myPids=my.players||[];
  if(!myPids.length)return null;

  const scored=myPids.map(pid=>{
    const p=S.players?.[pid];if(!p)return null;
    const stats=S.playerStats?.[pid]||{};
    const proj=S.playerProj?.[pid]||0;
    const ppg=stats.seasonAvg||stats.trail3||stats.prevAvg||0;
    const score=proj||ppg;
    const pos=normPos(p.position)||p.position;
    return{pid,pos,score,name:p.full_name||pName(pid),team:p.team||'FA',injury:p.injury_status};
  }).filter(Boolean);

  const flexMap={SUPER_FLEX:['QB','RB','WR','TE'],WRTQ:['QB','RB','WR','TE'],FLEX:['RB','WR','TE'],REC_FLEX:['WR','TE'],IDP_FLEX:['DL','LB','DB']};
  const used=new Set();
  const lineup=[];

  // Fixed positions first
  starterSlots.filter(s=>!flexMap[s]).forEach(slot=>{
    const pos=normPos(slot)||slot;
    const displaySlot=slot;
    const best=scored.filter(p=>p.pos===pos&&!used.has(p.pid)).sort((a,b)=>b.score-a.score)[0];
    if(best){used.add(best.pid);lineup.push({slot:displaySlot,player:best,isFlex:false});}
    else lineup.push({slot:displaySlot,player:null,isFlex:false});
  });

  // Flex slots
  starterSlots.filter(s=>flexMap[s]).forEach(slot=>{
    const eligible=flexMap[slot]||[];
    const best=scored.filter(p=>eligible.includes(p.pos)&&!used.has(p.pid)).sort((a,b)=>b.score-a.score)[0];
    const label=slot==='SUPER_FLEX'?'SF':slot==='IDP_FLEX'?'IDP_FLX':slot==='REC_FLEX'?'R_FLX':'FLX';
    if(best){used.add(best.pid);lineup.push({slot:label,player:best,isFlex:true});}
    else lineup.push({slot:label,player:null,isFlex:true});
  });

  // Bench alternatives by position
  const benchByPos={};
  scored.filter(p=>!used.has(p.pid)).forEach(p=>{
    if(!benchByPos[p.pos])benchByPos[p.pos]=[];
    benchByPos[p.pos].push(p);
  });
  Object.values(benchByPos).forEach(arr=>arr.sort((a,b)=>b.score-a.score));

  // Confidence + swap analysis for each starter
  const analyzed=lineup.map(l=>{
    if(!l.player)return{...l,confidence:'empty',bestAlt:null,delta:0};
    const alts=(benchByPos[l.player.pos]||[]);
    const bestAlt=alts[0]||null;
    const delta=bestAlt?(bestAlt.score-l.player.score):0;

    let confidence='locked';
    if(delta>1)confidence='suboptimal';
    else if(delta>-0.5&&bestAlt)confidence='close';

    return{...l,confidence,bestAlt,delta};
  });

  const totalProj=analyzed.reduce((s,l)=>s+(l.player?.score||0),0);
  const suboptimalCount=analyzed.filter(l=>l.confidence==='suboptimal').length;
  const closeCount=analyzed.filter(l=>l.confidence==='close').length;
  const allBench=scored.filter(p=>!used.has(p.pid)).sort((a,b)=>b.score-a.score);

  // Better options: bench players that outscore or are close to starters
  const betterOptions=[];
  analyzed.forEach(l=>{
    if(!l.player||!l.bestAlt)return;
    if(l.delta>0){
      betterOptions.push({benchPlayer:l.bestAlt,starter:l.player,slot:l.slot,delta:l.delta});
    }
  });
  betterOptions.sort((a,b)=>b.delta-a.delta);

  return{analyzed,totalProj,suboptimalCount,closeCount,allBench,betterOptions,scored,used};
}

function renderStartSit(){
  _luState=_buildLineupState();
  if(!_luState){
    const wrap=$('startsit-content');
    if(wrap)wrap.innerHTML='';
    return;
  }

  const{analyzed,totalProj,suboptimalCount,closeCount,betterOptions}=_luState;

  // Header
  const weekTitle=$('lineup-week-title');
  if(weekTitle)weekTitle.textContent='Week '+(S.currentWeek||'?')+' Lineup';
  const projEl=$('lineup-total-proj');
  if(projEl)projEl.textContent=totalProj.toFixed(1);
  const subEl=$('lineup-subtitle');
  if(subEl){
    if(suboptimalCount)subEl.textContent=suboptimalCount+' swap'+(suboptimalCount>1?'s':'')+' recommended';
    else if(closeCount)subEl.textContent='Optimal \u2014 '+closeCount+' close call'+(closeCount>1?'s':'');
    else subEl.textContent='Lineup is optimized';
  }

  // Optimize bar
  const optBar=$('lineup-optimize-bar');
  if(optBar){
    if(suboptimalCount>0){
      const gain=betterOptions.reduce((s,b)=>s+b.delta,0);
      optBar.innerHTML=`<div class="optimize-bar">
        <div class="optimize-count has-swaps">${suboptimalCount}</div>
        <div class="optimize-text">
          <div class="optimize-title">${suboptimalCount} better option${suboptimalCount>1?'s':''} found</div>
          <div class="optimize-sub">+${gain.toFixed(1)} projected points available</div>
        </div>
        <button class="optimize-btn" onclick="optimizeLineup()">Optimize</button>
      </div>`;
    } else {
      optBar.innerHTML=`<div class="optimize-bar clean">
        <div class="optimize-count optimal">\u2713</div>
        <div class="optimize-text">
          <div class="optimize-title" style="color:var(--green)">Lineup is optimal</div>
          <div class="optimize-sub">No better options on your bench</div>
        </div>
      </div>`;
    }
  }

  // Render starters
  _renderStartersView(analyzed);

  // Render bench/better options
  _renderBenchView(_luState);

  // Update bench tab label
  const benchSeg=$('lu-seg-bench');
  if(benchSeg){
    benchSeg.textContent=betterOptions.length?'Better Options ('+betterOptions.length+')':'Bench';
  }
}

function _renderStartersView(analyzed){
  const wrap=$('startsit-content');if(!wrap)return;

  // Group by position category for section headers
  const posOrder=['QB','RB','WR','TE','FLX','SF','R_FLX','K','DL','LB','DB','IDP_FLX'];
  const offPos=new Set(['QB','RB','WR','TE']);
  const idpPos=new Set(['DL','LB','DB']);

  let html='';
  let lastGroup='';

  analyzed.forEach((l,idx)=>{
    // Section headers
    const slot=l.slot;
    let group='';
    if(offPos.has(slot))group=slot;
    else if(idpPos.has(slot))group='IDP';
    else if(['FLX','SF','R_FLX','IDP_FLX'].includes(slot))group='FLEX';
    else group=slot;

    if(group!==lastGroup){
      const groupLabel=group==='FLEX'?'Flex':group==='IDP'?'IDP':group;
      html+=`<div class="lu-pos-group">${groupLabel}</div>`;
      lastGroup=group;
    }

    // Empty slot
    if(!l.player){
      html+=`<div class="lu-row lu-empty"><div class="lu-slot lu-slot-fixed">${slot}</div><div class="lu-info"><div class="lu-name" style="color:var(--text3)">Empty slot</div></div></div>`;
      return;
    }

    const p=l.player;
    const dhq=dynastyValue(p.pid);
    const dhqCol=dhq>=7000?'var(--green)':dhq>=4000?'var(--accent)':dhq>=2000?'var(--text2)':'var(--text3)';
    const scoreCol=p.score>=15?'var(--green)':p.score>=8?'var(--text)':'var(--text3)';

    // Confidence class and label
    let confCls='lu-locked',confIcon='\u2713',confLabel='Locked';
    if(l.confidence==='suboptimal'){confCls='lu-suboptimal';confIcon='!';confLabel='Swap';}
    else if(l.confidence==='close'){confCls='lu-close-call';confIcon='\u2248';confLabel='Close';}

    const confLabelCls=l.confidence==='suboptimal'?'lu-conf-sub':l.confidence==='close'?'lu-conf-close':'lu-conf-locked';
    const rowCls='lu-row '+(l.confidence==='suboptimal'?'lu-suboptimal':l.confidence==='close'?'lu-close-call':'lu-locked');

    const injHtml=p.injury?`<span class="lu-inj">${p.injury}</span>`:'';

    html+=`<div class="${rowCls}" onclick="openPlayerModal('${p.pid}')">
      <div class="lu-slot ${l.isFlex?'lu-slot-flex':'lu-slot-fixed'}">${slot}</div>
      <div class="lu-info">
        <div class="lu-name">${p.name}${injHtml}</div>
        <div class="lu-meta">
          <span>${p.team}</span>
          ${dhq>0?`<span style="color:${dhqCol};font-weight:600">${dhq.toLocaleString()}</span>`:''}
        </div>
      </div>
      <div class="lu-score-col">
        <div class="lu-score" style="color:${scoreCol}">${p.score.toFixed(1)}</div>
        <div class="lu-confidence ${confLabelCls}">${confLabel}</div>
      </div>
      <div class="lu-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
    </div>`;

    // Inline swap hint for suboptimal starters
    if(l.confidence==='suboptimal'&&l.bestAlt){
      html+=`<div class="lu-swap-hint" onclick="event.stopPropagation();openPlayerModal('${l.bestAlt.pid}')">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/></svg>
        Start instead: ${l.bestAlt.name}
        <span class="lu-swap-delta">+${l.delta.toFixed(1)}</span>
      </div>`;
    }
  });

  wrap.innerHTML=html||'<div style="padding:20px;text-align:center;color:var(--text3)">Connect to build your lineup.</div>';
}

function _renderBenchView(state){
  const wrap=$('lineup-bench-content');if(!wrap)return;
  const{betterOptions,allBench}=state;

  let html='';

  // Better options section
  if(betterOptions.length){
    html+=`<div style="margin-bottom:14px">
      <div class="lu-pos-group" style="color:var(--amber)">Upgrades Available</div>
      ${betterOptions.map(bo=>{
        const dhq=dynastyValue(bo.benchPlayer.pid);
        const dhqCol=dhq>=7000?'var(--green)':dhq>=4000?'var(--accent)':dhq>=2000?'var(--text2)':'var(--text3)';
        return`<div class="lu-bench-card lu-upgrade" onclick="openPlayerModal('${bo.benchPlayer.pid}')">
          <div style="flex:1;min-width:0">
            <div class="lu-name">${bo.benchPlayer.name} <span class="lu-upgrade-badge">+${bo.delta.toFixed(1)}</span></div>
            <div class="lu-meta">
              <span>${bo.benchPlayer.pos} \u00B7 ${bo.benchPlayer.team}</span>
              ${dhq>0?`<span style="color:${dhqCol};font-weight:600">${dhq.toLocaleString()}</span>`:''}
              <span style="color:var(--text3)">replaces ${bo.starter.name}</span>
            </div>
          </div>
          <div class="lu-score-col">
            <div class="lu-score" style="color:var(--amber)">${bo.benchPlayer.score.toFixed(1)}</div>
          </div>
          <div class="lu-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // Remaining bench
  const upgradeIds=new Set(betterOptions.map(b=>b.benchPlayer.pid));
  const rest=allBench.filter(b=>!upgradeIds.has(b.pid));
  if(rest.length){
    html+=`<div class="lu-pos-group">Bench</div>`;
    html+=rest.slice(0,12).map(b=>{
      const dhq=dynastyValue(b.pid);
      const dhqCol=dhq>=7000?'var(--green)':dhq>=4000?'var(--accent)':dhq>=2000?'var(--text2)':'var(--text3)';
      return`<div class="lu-bench-card" onclick="openPlayerModal('${b.pid}')">
        <div class="lu-slot lu-slot-fixed">${b.pos}</div>
        <div style="flex:1;min-width:0;overflow:hidden">
          <div class="lu-name">${b.name}</div>
          <div class="lu-meta">
            <span>${b.team}</span>
            ${dhq>0?`<span style="color:${dhqCol};font-weight:600">${dhq.toLocaleString()}</span>`:''}
          </div>
        </div>
        <div class="lu-score-col">
          <div class="lu-score" style="color:var(--text3)">${b.score.toFixed(1)}</div>
        </div>
        <div class="lu-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`;
    }).join('');
  }

  if(!html)html='<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No bench players with projections.</div>';
  wrap.innerHTML=html;
}

// View toggle
function switchLineupView(view){
  const starters=$('lineup-starters-view');
  const bench=$('lineup-bench-view');
  const segS=$('lu-seg-starters');
  const segB=$('lu-seg-bench');
  if(!starters||!bench)return;

  if(view==='bench'){
    starters.style.display='none';bench.style.display='block';
    segS?.classList.remove('active');segB?.classList.add('active');
  } else {
    starters.style.display='block';bench.style.display='none';
    segS?.classList.add('active');segB?.classList.remove('active');
  }
}

// Optimize lineup — show diff then re-render
function optimizeLineup(){
  if(!_luState)return;
  const{betterOptions,totalProj}=_luState;
  if(!betterOptions.length)return;

  const gain=betterOptions.reduce((s,b)=>s+b.delta,0);
  const newProj=totalProj+gain;

  // Show diff
  const wrap=$('startsit-content');if(!wrap)return;
  let diffHtml=`<div class="lu-diff-list">
    <div style="font-size:13px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Lineup optimized \u2014 +${gain.toFixed(1)} pts</div>
    ${betterOptions.map(bo=>`<div class="lu-diff-item">
      <span class="lu-diff-icon">\u2191</span>
      <span class="lu-diff-text"><strong>${bo.benchPlayer.name}</strong> in for <span style="color:var(--text3)">${bo.starter.name}</span> at ${bo.slot}</span>
      <span class="lu-diff-pts">+${bo.delta.toFixed(1)}</span>
    </div>`).join('')}
  </div>`;

  // Build optimized lineup: swap suboptimal starters with their best alternatives
  const optimized=_luState.analyzed.map(l=>{
    if(l.confidence==='suboptimal'&&l.bestAlt){
      return{...l,player:l.bestAlt,confidence:'locked',bestAlt:l.player,delta:-l.delta};
    }
    return{...l,confidence:l.player?'locked':l.confidence,bestAlt:null,delta:0};
  });

  // Update header projection
  const projEl=$('lineup-total-proj');
  if(projEl)projEl.textContent=newProj.toFixed(1);
  const subEl=$('lineup-subtitle');
  if(subEl)subEl.textContent='Lineup is optimized';

  // Update optimize bar
  const optBar=$('lineup-optimize-bar');
  if(optBar)optBar.innerHTML=`<div class="optimize-bar clean">
    <div class="optimize-count optimal">\u2713</div>
    <div class="optimize-text">
      <div class="optimize-title" style="color:var(--green)">Lineup optimized</div>
      <div class="optimize-sub">+${gain.toFixed(1)} pts \u2014 ${betterOptions.length} swap${betterOptions.length>1?'s':''} applied</div>
    </div>
  </div>`;

  // Render diff then optimized starters below it
  // Save current wrap reference, render optimized lineup, capture HTML, restore
  const savedHTML=wrap.innerHTML;
  _renderStartersView(optimized);
  const optimizedHTML=wrap.innerHTML;
  wrap.innerHTML=diffHtml+optimizedHTML;

  // Switch to starters view
  switchLineupView('starters');

  // Update bench tab
  const benchSeg=$('lu-seg-bench');
  if(benchSeg)benchSeg.textContent='Bench';
}

// ═══════════════════════════════════════════════════════════════
// ROSTER SNAPSHOT — compact health + position grades below briefing
// ═══════════════════════════════════════════════════════════════
function renderInsightCards(){
  const wrap=$('home-insights');if(!wrap)return;
  if(!LI_LOADED){wrap.innerHTML='';return;}
  const my=myR();if(!my)return;
  const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  if(!assess){wrap.innerHTML='';return;}

  // Build position grades
  const _POS_ORD={QB:0,RB:1,WR:2,TE:3,K:4,DL:5,LB:6,DB:7};
  const posGrades=Object.entries(assess.posAssessment||{}).sort((a,b)=>(_POS_ORD[a[0]]??9)-(_POS_ORD[b[0]]??9)).map(([pos,data])=>{
    const status=data.status||'ok';
    const grade=status==='surplus'?'A':status==='ok'?'B':status==='thin'?'C':'D';
    const col=grade==='A'?'var(--green)':grade==='B'?'var(--text2)':grade==='C'?'var(--amber)':'var(--red)';
    return{pos,grade,col,status,starters:data.nflStarters||data.actual||0,ideal:data.ideal||1};
  });

  wrap.innerHTML=`
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Roster Health</span>
        <span style="font-size:20px;font-weight:800;color:${assess.tierColor||'var(--text)'};font-family:'JetBrains Mono',monospace">${assess.healthScore}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:6px">
        ${posGrades.map(g=>`
          <div style="text-align:center;padding:6px 4px;background:var(--bg3);border-radius:6px;border:1px solid ${g.col}30">
            <div style="font-size:15px;font-weight:800;color:${g.col}">${g.grade}</div>
            <div style="font-size:13px;color:var(--text3);font-weight:600">${g.pos}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function renderTeamOverview(){
  const el=$('home-team-overview');if(!el)return;
  const my=myR();if(!my){el.innerHTML='';return;}
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const teams=S.rosters.length||16;
  const players=my?.players||[];
  const pM=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};

  // Roster value by position
  const posGroups={};
  let totalVal=0;
  players.forEach(pid=>{
    const pos=pM(pPos(pid));if(!pos)return;
    const val=dynastyValue(pid);
    if(!posGroups[pos])posGroups[pos]={total:0,count:0,top:[]};
    posGroups[pos].total+=val;posGroups[pos].count++;
    if(val>0)posGroups[pos].top.push({name:pNameShort(pid),val,age:pAge(pid)||'?'});
    totalVal+=val;
  });
  Object.values(posGroups).forEach(g=>g.top.sort((a,b)=>b.val-a.val));

  // League rank by total value
  const rosterVals=S.rosters.map(r=>{
    const val=(r.players||[]).reduce((s,pid)=>s+dynastyValue(pid),0);
    return{rid:r.roster_id,val};
  }).sort((a,b)=>b.val-a.val);
  const myValRank=rosterVals.findIndex(r=>r.rid===S.myRosterId)+1;
  const topVal=rosterVals[0]?.val||1;

  // Draft capital
  const year=parseInt(S.season)||2026;
  const draftRounds=league?.settings?.draft_rounds||7;
  const allTP=S.tradedPicks;
  const myPickCount=[];
  for(let yr=year;yr<=year+2;yr++){
    let count=0;
    for(let rd=1;rd<=draftRounds;rd++){
      const tradedAway=allTP.find(p=>parseInt(p.season)===yr&&p.round===rd&&p.roster_id===S.myRosterId&&p.owner_id!==S.myRosterId);
      const acquired=allTP.filter(p=>parseInt(p.season)===yr&&p.round===rd&&p.owner_id===S.myRosterId&&p.roster_id!==S.myRosterId);
      if(!tradedAway)count++;
      count+=acquired.length;
    }
    myPickCount.push({yr,count});
  }
  const totalPicks=myPickCount.reduce((s,p)=>s+p.count,0);

  // Position grades — RELATIVE to league average at each position
  const positions=['QB','RB','WR','TE','K','DL','LB','DB'];
  const leagueTotalByPos={};
  positions.forEach(pos=>{
    const teamTotals=S.rosters.map(r=>{
      return (r.players||[]).reduce((sum,pid)=>{
        if(pM(pPos(pid))===pos) sum+=dynastyValue(pid);
        return sum;
      },0);
    });
    leagueTotalByPos[pos]=teamTotals.length?Math.round(teamTotals.reduce((a,b)=>a+b,0)/teamTotals.length):5000;
  });

  const gradeColor=(myTotal,pos)=>{
    const la=leagueTotalByPos[pos]||5000;
    const pct=myTotal/la;
    return pct>=1.3?'var(--green)':pct>=1.0?'var(--accent)':pct>=0.75?'var(--amber)':'var(--red)';
  };
  const gradeLetter=(myTotal,pos)=>{
    const la=leagueTotalByPos[pos]||5000;
    const pct=myTotal/la;
    return pct>=1.3?'A':pct>=1.05?'B':pct>=0.85?'C':pct>=0.65?'D':'F';
  };

  let html='';

  // ── Compute CONTENDER SCORE: optimal starting lineup PPG for every team ──
  const rp=league?.roster_positions||[];
  const slotCounts={QB:0,RB:0,WR:0,TE:0,FLEX:0,SUPER_FLEX:0,DL:0,LB:0,DB:0,IDP_FLEX:0};
  rp.forEach(s=>{
    if(s==='DE'||s==='DT')slotCounts.DL++;
    else if(s==='CB'||s==='S')slotCounts.DB++;
    else if(s in slotCounts)slotCounts[s]++;
    else if(s==='REC_FLEX')slotCounts.FLEX++;
    else if(s==='BN'||s==='IR'||s==='TAXI'){}
    else slotCounts.FLEX++;
  });

  function calcOptimalPPG(rosterPids){
    const byPos={};
    (rosterPids||[]).forEach(pid=>{
      const rawPos=pPos(pid);const pos=pM(rawPos);
      const ppg=S.playerStats?.[pid]?.seasonAvg||S.playerStats?.[pid]?.prevAvg||0;
      if(ppg<=0)return;
      if(!byPos[pos])byPos[pos]=[];
      byPos[pos].push({pid,ppg,pos});
    });
    Object.values(byPos).forEach(arr=>arr.sort((a,b)=>b.ppg-a.ppg));

    const used=new Set();
    let total=0;

    ['QB','RB','WR','TE','DL','LB','DB'].forEach(pos=>{
      const need=slotCounts[pos]||0;
      const avail=byPos[pos]||[];
      for(let i=0;i<need&&i<avail.length;i++){
        total+=avail[i].ppg;used.add(avail[i].pid);
      }
    });

    const flexPool=['RB','WR','TE'].flatMap(pos=>(byPos[pos]||[]).filter(p=>!used.has(p.pid))).sort((a,b)=>b.ppg-a.ppg);
    for(let i=0;i<(slotCounts.FLEX||0)&&i<flexPool.length;i++){
      total+=flexPool[i].ppg;used.add(flexPool[i].pid);
    }

    const sfPool=['QB','RB','WR','TE'].flatMap(pos=>(byPos[pos]||[]).filter(p=>!used.has(p.pid))).sort((a,b)=>b.ppg-a.ppg);
    for(let i=0;i<(slotCounts.SUPER_FLEX||0)&&i<sfPool.length;i++){
      total+=sfPool[i].ppg;used.add(sfPool[i].pid);
    }

    const idpPool=['DL','LB','DB'].flatMap(pos=>(byPos[pos]||[]).filter(p=>!used.has(p.pid))).sort((a,b)=>b.ppg-a.ppg);
    for(let i=0;i<(slotCounts.IDP_FLEX||0)&&i<idpPool.length;i++){
      total+=idpPool[i].ppg;used.add(idpPool[i].pid);
    }

    return +total.toFixed(1);
  }

  const contenderRanks=S.rosters.map(r=>({rid:r.roster_id,ppg:calcOptimalPPG(r.players||[])})).sort((a,b)=>b.ppg-a.ppg);
  const myContenderPPG=contenderRanks.find(r=>r.rid===S.myRosterId)?.ppg||0;
  const myContenderRank=contenderRanks.findIndex(r=>r.rid===S.myRosterId)+1;
  const topContender=contenderRanks[0]?.ppg||1;

  // ── Health Score — delegates to shared team-assess.js (War Room formula) ──
  const myAssessment=assessTeamFromGlobal(S.myRosterId);
  const healthScore=myAssessment?.healthScore||0;
  const panic=myAssessment?.panic||0;
  const criticals=Object.values(myAssessment?.posAssessment||{}).filter(p=>p.status==='deficit').length;

  // Tier display — map shared UPPER tier keys to display labels & CSS vars
  const tierDisplayMap={ELITE:['Elite','var(--green)'],CONTENDER:['Contender','var(--accent)'],CROSSROADS:['Crossroads','var(--amber)'],REBUILDING:['Rebuilding','var(--red)']};
  const [hTier,hCol]=tierDisplayMap[myAssessment?.tier]||['Rebuilding','var(--red)'];

  // Scoring / coverage breakdowns for the detail line
  // Derive weekly target the same way shared module does: median of all teams' PPG * 1.05
  const allPPGs=contenderRanks.map(r=>r.ppg).filter(v=>v>0).sort((a,b)=>a-b);
  const _weeklyTarget=allPPGs.length?allPPGs[Math.floor(allPPGs.length/2)]*1.05:150;
  const scoringPct=myContenderPPG>0?Math.min(100,Math.round((myContenderPPG/_weeklyTarget)*100)):0;
  const _scoringComponent=Math.min(60,(myContenderPPG/_weeklyTarget)*60);
  const _projBonus=myContenderPPG>_weeklyTarget+10?3:myContenderPPG>=_weeklyTarget?1:0;
  const coverageScore=Math.max(0,healthScore-_scoringComponent-_projBonus);
  const depthPct=Math.round(coverageScore/40*100);

  const cCol=myContenderRank<=3?'var(--green)':myContenderRank<=8?'var(--accent)':'var(--amber)';
  const dCol=myValRank<=3?'var(--green)':myValRank<=8?'var(--accent)':'var(--amber)';
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Health Score <span class="tip-icon" onclick="toggleTip('tip-health')">?</span></div>
      <div style="display:flex;align-items:baseline;gap:6px">
        <span style="font-size:26px;font-weight:800;color:${hCol};font-family:'JetBrains Mono',monospace">${healthScore}</span>
        <span style="font-size:13px;font-weight:600;color:${hCol}">${hTier}</span>
        ${panic>=3?'<span style="font-size:13px;color:var(--red);margin-left:4px">🔥 Panic '+panic+'/5</span>':''}
      </div>
      <div style="font-size:13px;color:var(--text3);margin-top:2px">Scoring ${scoringPct}% · Depth ${depthPct}%${criticals?' · '+criticals+' pos gap'+(criticals>1?'s':''):''}</div>
      <div style="background:var(--bg4);border-radius:2px;height:3px;margin-top:4px;overflow:hidden"><div style="width:${healthScore}%;height:100%;background:${hCol};border-radius:2px"></div></div>
      <div class="tip-box" id="tip-health">
        <strong>Health Score (0-100)</strong> measures your team's competitive readiness.<br><br>
        <strong>60% Scoring</strong> — your optimal starting lineup's weekly PPG vs the league median. Higher = more weekly firepower.<br>
        <strong>40% Coverage</strong> — how many NFL-starter-quality players you have at each position, weighted by importance (QB/RB/WR matter most).<br>
        <strong>+Bonus</strong> for elite teams scoring above the league target.<br><br>
        <div class="tip-scale">
          <span style="background:var(--greenL);color:var(--green)">90+ Elite</span>
          <span style="background:var(--accentL);color:var(--accent)">75+ Contender</span>
          <span style="background:var(--amberL);color:var(--amber)">60+ Crossroads</span>
          <span style="background:var(--redL);color:var(--red)">&lt;60 Rebuilding</span>
        </div>
      </div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Contender <span class="tip-icon" onclick="toggleTip('tip-contender')">?</span></div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:22px;font-weight:800;color:${cCol};font-family:'JetBrains Mono',monospace">#${myContenderRank}</span>
        <span style="font-size:13px;color:var(--text2)">/${teams}</span>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-top:2px">${myContenderPPG.toFixed(1)} avg starter PPG</div>
      <div style="background:var(--bg4);border-radius:2px;height:3px;margin-top:4px;overflow:hidden"><div style="width:${Math.round(myContenderPPG/topContender*100)}%;height:100%;background:${cCol};border-radius:2px"></div></div>
      <div class="tip-box" id="tip-contender">
        <strong>Contender Rank</strong> ranks all teams by historical average starter PPG — your best possible weekly score based on past performance using your league's actual scoring settings and roster positions. The Lineup tab shows week-specific projections which may differ.
      </div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Dynasty <span class="tip-icon" onclick="toggleTip('tip-dynasty')">?</span></div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:22px;font-weight:800;color:${dCol};font-family:'JetBrains Mono',monospace">#${myValRank}</span>
        <span style="font-size:13px;color:var(--text2)">/${teams}</span>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-top:2px">${totalVal.toLocaleString()} DHQ</div>
      <div style="background:var(--bg4);border-radius:2px;height:3px;margin-top:4px;overflow:hidden"><div style="width:${Math.round(totalVal/topVal*100)}%;height:100%;background:var(--accent);border-radius:2px"></div></div>
      <div class="tip-box" id="tip-dynasty">
        <strong>Dynasty Rank</strong> ranks all teams by total DHQ value — the sum of every player's dynasty trade value on your roster. This measures long-term asset strength, not just weekly scoring. A team with young stars and draft picks can rank high here even with a losing record.
      </div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Draft Capital</div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:22px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace">${totalPicks}</span>
        <span style="font-size:13px;color:var(--text2)">picks</span>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-top:2px">${myPickCount.map(p=>`'${String(p.yr).slice(2)}: ${p.count}`).join(' · ')}</div>
    </div>
  </div>`;

  // Position grades and crown jewels removed from roster tab — available on home tab

  el.innerHTML=html;
  recordHealthSnapshot(healthScore,hTier);
}

// ── Health Timeline ────────────────────────────────────────────
function recordHealthSnapshot(score,tier){
  if(!S.currentLeagueId||!score)return;
  const key=STORAGE_KEYS.HEALTH_TIMELINE(S.currentLeagueId);
  let timeline=DhqStorage.get(key, []);
  // Only record if last entry > 24h ago
  if(timeline.length){
    const last=new Date(timeline[timeline.length-1].date).getTime();
    if(Date.now()-last<24*60*60*1000)return;
  }
  const today=new Date().toISOString().slice(0,10);
  timeline.push({date:today,score,tier});
  if(timeline.length>20)timeline=timeline.slice(-20);
  DhqStorage.set(key, timeline);
}

function renderHealthTimeline(){
  const el=$('home-team-overview');if(!el)return;
  if(!S.currentLeagueId)return;
  const key=STORAGE_KEYS.HEALTH_TIMELINE(S.currentLeagueId);
  const timeline=DhqStorage.get(key, []);
  if(timeline.length<2)return; // need at least 2 points

  const pts=timeline.slice(-10);
  const high=pts.reduce((a,b)=>b.score>a.score?b:a,pts[0]);
  const low=pts.reduce((a,b)=>b.score<a.score?b:a,pts[0]);
  const current=pts[pts.length-1];

  const fmtDate=d=>{const m=new Date(d+'T12:00:00');return m.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  const tierCol=tier=>{
    if(tier==='Elite'||tier==='Contender')return'var(--green)';
    if(tier==='Crossroads')return'var(--amber)';
    return'var(--red)';
  };

  const maxH=40; // max bar height in px
  const bars=pts.map(p=>{
    const h=Math.max(3,Math.round((p.score/100)*maxH));
    const col=tierCol(p.tier);
    return`<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0">
      <span style="font-size:13px;font-weight:600;color:var(--text2);font-family:'JetBrains Mono',monospace">${p.score}</span>
      <div style="width:100%;max-width:20px;height:${h}px;background:${col};border-radius:2px;transition:height .3s"></div>
      <span style="font-size:13px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42px">${fmtDate(p.date)}</span>
    </div>`;
  }).join('');

  const card=document.createElement('div');
  card.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px;margin-top:12px">
    <div style="font-size:13px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Roster Health Timeline</div>
    <div style="display:flex;align-items:flex-end;gap:4px;padding:0 2px;min-height:${maxH+30}px">
      ${bars}
    </div>
    <div style="margin-top:8px;font-size:13px;color:var(--text2);line-height:1.6">
      <span style="color:var(--green);font-weight:600">High: ${high.score}</span> <span style="color:var(--text3)">(${fmtDate(high.date)})</span>
      <span style="margin:0 4px;color:var(--border)">·</span>
      <span style="color:var(--red);font-weight:600">Low: ${low.score}</span> <span style="color:var(--text3)">(${fmtDate(low.date)})</span>
      <span style="margin:0 4px;color:var(--border)">·</span>
      <span style="font-weight:600;color:${tierCol(current.tier)}">Current: ${current.score}</span>
    </div>
  </div>`;
  el.appendChild(card.firstElementChild);
}

// homeAsk: defined in ai-chat.js
// goAsk: defined in ai-chat.js
// expandChat: defined in ai-chat.js

// ═══════════════════════════════════════════════════════════════
// SHARED: Strategy context helper
// ═══════════════════════════════════════════════════════════════
function _strategyContextLine(){
  const strat=typeof getMemory==='function'?getMemory('mentality',{}):{};
  const labels={balanced:'Balanced',winnow:'Win Now',rebuild:'Rebuild',prime:'Dynasty Prime'};
  const m=strat.mentality;
  if(!m)return'';
  return`<span style="font-size:13px;color:var(--text3);font-weight:500">Based on your <strong style="color:var(--accent)">${labels[m]||m}</strong> strategy</span>`;
}

// ═══════════════════════════════════════════════════════════════
// MOBILE-FIRST HOME SCREEN — New rendering layer
// These functions consume the same data as the original briefing/
// overview but render into the new mobile-optimized containers.
// ═══════════════════════════════════════════════════════════════

function renderHeroAction(){
  const el=$('home-hero-action');if(!el)return;
  if(!LI_LOADED||!S.rosters?.length){el.innerHTML='';return;}
  const my=myR();if(!my)return;
  const myPids=my.players||[];
  const mySet=new Set(myPids);
  const peaks=window.App.peakWindows;
  const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  const faab=getFAAB();
  const league=S.leagues?.find(l=>l.league_id===S.currentLeagueId);

  // Try waiver pickup first
  let hero=null;
  if(assess?.needs?.length){
    const need=assess.needs[0];
    const avail=typeof getAvailablePlayers==='function'?getAvailablePlayers():[];
    const bestAtNeed=avail.filter(a=>(normPos(S.players?.[a.id]?.position)||'')=== need.pos).sort((a,b)=>dynastyValue(b.id)-dynastyValue(a.id))[0];
    if(bestAtNeed){
      const val=dynastyValue(bestAtNeed.id);
      const p=S.players?.[bestAtNeed.id];
      const peakW=peaks[need.pos]||[24,29];
      const peakYrs=Math.max(0,peakW[1]-(p?.age||25));
      const ppg=S.playerStats?.[bestAtNeed.id]?.seasonAvg||S.playerStats?.[bestAtNeed.id]?.prevAvg||0;
      let competitors=0;
      S.rosters.forEach(r=>{if(r.roster_id===S.myRosterId)return;const cnt=(r.players||[]).filter(pid=>(normPos(S.players?.[pid]?.position)||'')=== need.pos).length;const req=(league?.roster_positions||[]).filter(s=>s===need.pos||s==='FLEX'||s==='SUPER_FLEX').length;if(cnt<req)competitors++;});
      const comp=competitors===0?'No real competition on waivers':competitors<=2?'Only '+competitors+' teams competing':''+competitors+' teams may bid';
      const bidAmt=faab.isFAAB&&val>0?Math.max(faab.minBid||1,Math.min(Math.round(faab.remaining*0.12),Math.round(val/200))):0;
      hero={
        type:'add',
        pid:bestAtNeed.id,
        title:'Add '+pName(bestAtNeed.id),
        subtitle:need.pos+' \u00B7 '+peakYrs+'-year peak window',
        reasons:['Fills biggest '+need.pos+' gap'+(need.urgency==='deficit'?' (critical)':''),comp,ppg?ppg.toFixed(1)+' PPG':'',bidAmt?'Suggested bid: $'+bidAmt:''],
        ctaLabel:bidAmt?'View in Waivers · ~$'+bidAmt:'View in Waivers →',
        ctaAction:"mobileTab('waivers')"
      };
    }
  }

  // Fallback: sell declining asset
  if(!hero){
    const declining=myPids.map(pid=>{const meta=LI.playerMeta?.[pid];const val=dynastyValue(pid);if(!meta||val<2000)return null;const [,pHi]=peaks[meta.pos]||[24,29];const pastPeak=meta.age-pHi;if(pastPeak>=2&&(meta.trend||0)<=-10)return{pid,val,pastPeak,trend:meta.trend||0,pos:meta.pos,age:meta.age};return null;}).filter(Boolean).sort((a,b)=>b.val-a.val);
    if(declining.length){
      const d=declining[0];
      hero={
        type:'sell',
        pid:d.pid,
        title:'Sell '+pName(d.pid),
        subtitle:d.pos+' \u00B7 Age '+d.age,
        reasons:[d.val.toLocaleString()+' DHQ \u2014 value dropping',d.pastPeak+'yr past '+d.pos+' peak','PPG down '+Math.abs(d.trend)+'%','Trade while value remains'],
        ctaLabel:'Find trade partner',
        ctaAction:"mobileTab('trades')"
      };
    }
  }

  if(!hero){el.innerHTML='';return;}

  const reasonsHtml=hero.reasons.filter(Boolean).map(r=>'<li>'+r+'</li>').join('');
  el.innerHTML=`
    <div class="hero-action-card" onclick="openPlayerModal('${hero.pid}')">
      ${_strategyContextLine()?'<div style="margin-bottom:6px">'+_strategyContextLine()+'</div>':''}
      <div class="hero-title">${hero.title}</div>
      <div class="hero-subtitle">${hero.subtitle}</div>
      <div class="hero-reason"><ul>${reasonsHtml}</ul></div>
      <button class="hero-cta" onclick="event.stopPropagation();${hero.ctaAction}">
        ${hero.ctaLabel}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
}

function renderPrepareCards(){
  const el=$('home-prepare');if(!el)return;
  if(!LI_LOADED||!S.rosters?.length){el.innerHTML='';return;}
  const my=myR();if(!my)return;
  const myPids=my.players||[];
  const peaks=window.App.peakWindows;
  const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  const items=[];

  // Draft prep
  const picks=typeof buildPicksByOwner==='function'?buildPicksByOwner():null;
  const myPicks=picks?picks[S.myRosterId]||[]:[];
  if(myPicks.length){
    const nextPick=myPicks.sort((a,b)=>a.year-b.year||a.round-b.round)[0];
    const biggestNeed=assess?.needs?.[0];
    items.push({
      title:'Draft: target '+(biggestNeed?biggestNeed.pos:'BPA')+' with '+nextPick.year+' R'+nextPick.round,
      sub:myPicks.length+' picks total'+(biggestNeed?' \u00B7 '+biggestNeed.pos+' is biggest gap':''),
      action:"mobileTab('draftroom')"
    });
  }

  // Trade surplus
  if(assess?.strengths?.length&&assess?.needs?.length){
    items.push({
      title:'Trade '+assess.strengths[0]+' surplus for '+assess.needs[0].pos+' help',
      sub:'Depth at '+assess.strengths.join(', ')+' \u00B7 '+assess.needs[0].pos+' is '+assess.needs[0].urgency,
      action:"mobileTab('trades')"
    });
  }

  if(!items.length){el.innerHTML='';return;}

  el.innerHTML=`<div style="margin-bottom:14px">
    <div class="home-sec-title">Prepare for this</div>
    ${items.slice(0,2).map(it=>`
      <div class="prepare-card" onclick="${it.action}">
        <div class="prepare-text">
          <div class="prepare-title">${it.title}</div>
          <div class="prepare-sub">${it.sub}</div>
        </div>
        <div class="prepare-chevron"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`).join('')}
  </div>`;
}

function renderTeamSnapshot(){
  const el=$('home-team-snapshot');if(!el)return;
  if(!LI_LOADED||!S.rosters?.length){el.innerHTML='';return;}
  const my=myR();if(!my)return;
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const teams=S.rosters.length||16;

  // Health score
  const myAssessment=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  const healthScore=myAssessment?.healthScore||0;
  const panic=myAssessment?.panic||0;
  const tierDisplayMap={ELITE:['Elite','var(--green)'],CONTENDER:['Contender','var(--accent)'],CROSSROADS:['Crossroads','var(--amber)'],REBUILDING:['Rebuilding','var(--red)']};
  const [hTier,hCol]=tierDisplayMap[myAssessment?.tier]||['—','var(--text3)'];

  // Contender rank
  const rp=league?.roster_positions||[];
  const slotCounts={QB:0,RB:0,WR:0,TE:0,FLEX:0,SUPER_FLEX:0,DL:0,LB:0,DB:0,IDP_FLEX:0};
  rp.forEach(s=>{
    if(s==='DE'||s==='DT')slotCounts.DL++;
    else if(s==='CB'||s==='S')slotCounts.DB++;
    else if(s in slotCounts)slotCounts[s]++;
    else if(s==='REC_FLEX')slotCounts.FLEX++;
    else if(s==='BN'||s==='IR'||s==='TAXI'){}
    else slotCounts.FLEX++;
  });
  const _pM=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
  function _calcPPG(pids){
    const byPos={};
    (pids||[]).forEach(pid=>{
      const pos=_pM(pPos(pid));const ppg=S.playerStats?.[pid]?.seasonAvg||S.playerStats?.[pid]?.prevAvg||0;
      if(ppg<=0)return;if(!byPos[pos])byPos[pos]=[];byPos[pos].push({pid,ppg,pos});
    });
    Object.values(byPos).forEach(arr=>arr.sort((a,b)=>b.ppg-a.ppg));
    const used=new Set();let total=0;
    ['QB','RB','WR','TE','DL','LB','DB'].forEach(pos=>{const need=slotCounts[pos]||0;const avail=byPos[pos]||[];for(let i=0;i<need&&i<avail.length;i++){total+=avail[i].ppg;used.add(avail[i].pid);}});
    const fp=['RB','WR','TE'].flatMap(pos=>(byPos[pos]||[]).filter(p=>!used.has(p.pid))).sort((a,b)=>b.ppg-a.ppg);
    for(let i=0;i<(slotCounts.FLEX||0)&&i<fp.length;i++){total+=fp[i].ppg;used.add(fp[i].pid);}
    const sfp=['QB','RB','WR','TE'].flatMap(pos=>(byPos[pos]||[]).filter(p=>!used.has(p.pid))).sort((a,b)=>b.ppg-a.ppg);
    for(let i=0;i<(slotCounts.SUPER_FLEX||0)&&i<sfp.length;i++){total+=sfp[i].ppg;used.add(sfp[i].pid);}
    const ip=['DL','LB','DB'].flatMap(pos=>(byPos[pos]||[]).filter(p=>!used.has(p.pid))).sort((a,b)=>b.ppg-a.ppg);
    for(let i=0;i<(slotCounts.IDP_FLEX||0)&&i<ip.length;i++){total+=ip[i].ppg;used.add(ip[i].pid);}
    return +total.toFixed(1);
  }
  const contenderRanks=S.rosters.map(r=>({rid:r.roster_id,ppg:_calcPPG(r.players||[])})).sort((a,b)=>b.ppg-a.ppg);
  const myContenderRank=contenderRanks.findIndex(r=>r.rid===S.myRosterId)+1;
  const myContenderPPG=contenderRanks.find(r=>r.rid===S.myRosterId)?.ppg||0;

  // Dynasty rank
  const rosterVals=S.rosters.map(r=>({rid:r.roster_id,val:(r.players||[]).reduce((s,pid)=>s+dynastyValue(pid),0)})).sort((a,b)=>b.val-a.val);
  const myValRank=rosterVals.findIndex(r=>r.rid===S.myRosterId)+1;
  const totalVal=rosterVals.find(r=>r.rid===S.myRosterId)?.val||0;

  // Draft capital
  const year=parseInt(S.season)||2026;
  const draftRounds=league?.settings?.draft_rounds||7;
  const allTP=S.tradedPicks;
  let totalPicks=0;
  const pickYears=[];
  for(let yr=year;yr<=year+2;yr++){
    let count=0;
    for(let rd=1;rd<=draftRounds;rd++){
      const tradedAway=allTP.find(p=>parseInt(p.season)===yr&&p.round===rd&&p.roster_id===S.myRosterId&&p.owner_id!==S.myRosterId);
      const acquired=allTP.filter(p=>parseInt(p.season)===yr&&p.round===rd&&p.owner_id===S.myRosterId&&p.roster_id!==S.myRosterId);
      if(!tradedAway)count++;count+=acquired.length;
    }
    totalPicks+=count;pickYears.push("'"+String(yr).slice(2)+': '+count);
  }

  const cCol=myContenderRank<=3?'var(--green)':myContenderRank<=8?'var(--accent)':'var(--amber)';
  const dCol=myValRank<=3?'var(--green)':myValRank<=8?'var(--accent)':'var(--amber)';

  el.innerHTML=`
    <div class="home-sec-title">Team Snapshot</div>
    <div class="snapshot-scroll">
      <div class="snapshot-card glass-card" onclick="toggleTip('tip-health')">
        <div class="snap-label">Health <span class="tip-icon" style="opacity:.5">?</span></div>
        <div class="snap-value" style="color:${hCol}">${healthScore}</div>
        <div class="snap-detail">${hTier}${panic>=3?' \u00B7 Panic '+panic+'/5':''}</div>
        <div class="snap-bar"><div class="snap-bar-fill" style="width:${healthScore}%;background:${hCol}"></div></div>
        <div class="tip-box" id="tip-health" style="font-size:13px;margin-top:4px">
          Health Score combines scoring potential (starter PPG), roster depth (position coverage), and dynasty value into a 0-100 scale. Higher = more competitive.
        </div>
      </div>
      <div class="snapshot-card glass-card" onclick="toggleTip('tip-contender-snap')">
        <div class="snap-label">Contender <span class="tip-icon" style="opacity:.5">?</span></div>
        <div class="snap-value" style="color:${cCol}">#${myContenderRank}<span style="font-size:13px;color:var(--text3);font-weight:500">/${teams}</span></div>
        <div class="snap-detail">${myContenderPPG.toFixed(1)} avg starter PPG</div>
        <div class="snap-bar"><div class="snap-bar-fill" style="width:${Math.round(myContenderPPG/(contenderRanks[0]?.ppg||1)*100)}%;background:${cCol}"></div></div>
        <div class="tip-box" id="tip-contender-snap" style="font-size:13px;margin-top:4px">
          Contender rank is based on your optimal starting lineup PPG compared to other teams. Higher PPG = better chance of winning weekly matchups.
        </div>
      </div>
      <div class="snapshot-card glass-card" onclick="toggleTip('tip-dynasty-snap')">
        <div class="snap-label">Dynasty <span class="tip-icon" style="opacity:.5">?</span></div>
        <div class="snap-value" style="color:${dCol}">#${myValRank}<span style="font-size:13px;color:var(--text3);font-weight:500">/${teams}</span></div>
        <div class="snap-detail">${totalVal.toLocaleString()} DHQ</div>
        <div class="snap-bar"><div class="snap-bar-fill" style="width:${Math.round(totalVal/(rosterVals[0]?.val||1)*100)}%;background:${dCol}"></div></div>
        <div class="tip-box" id="tip-dynasty-snap" style="font-size:13px;margin-top:4px">
          Dynasty rank is based on your total roster DHQ value. Higher = more long-term dynasty capital across all players and picks.
        </div>
      </div>
      <div class="snapshot-card glass-card" onclick="mobileTab('draftroom')">
        <div class="snap-label">Draft Capital</div>
        <div class="snap-value" style="color:var(--text)">${totalPicks}<span style="font-size:13px;color:var(--text3);font-weight:500"> picks</span></div>
        <div class="snap-detail">${pickYears.join(' \u00B7 ')}</div>
      </div>
    </div>`;

  // Strategy mismatch warning
  const userMentality=getMemory('mentality',{}).mentality||'balanced';
  const assessedTier=(myAssessment?.tier||'').toUpperCase();
  const tierToMentality={REBUILDING:'rebuild',ELITE:'winnow',CONTENDER:'winnow'};
  const suggestedMentality=tierToMentality[assessedTier];
  if(suggestedMentality&&userMentality!==suggestedMentality&&userMentality==='balanced'&&assessedTier==='REBUILDING'){
    el.innerHTML+=`<div style="background:var(--amberL);border:1px solid var(--amber);border-radius:var(--rl);padding:10px 12px;margin-top:8px;font-size:13px;color:var(--amber);line-height:1.4">
      Your team is assessed as <strong>${hTier}</strong> but strategy is set to <strong>Balanced</strong>. Consider switching to <strong>Rebuild</strong> in Settings for better AI recommendations.
    </div>`;
  }

  // Also run original functions to keep data recording
  if(typeof recordHealthSnapshot==='function')recordHealthSnapshot(healthScore,hTier);
}

function renderHomeSkeletons(){
  const snap=$('home-team-snapshot');
  if(snap&&!snap.innerHTML.trim()) snap.innerHTML='<div class="skel-snapshot">'+'<div class="skel-snapshot-card"></div>'.repeat(4)+'</div>';
  const hero=$('home-hero-action');
  if(hero&&!hero.innerHTML.trim()) hero.innerHTML='<div class="skel-hero"></div>';
  const prep=$('home-prepare');
  if(prep&&!prep.innerHTML.trim()) prep.innerHTML='<div class="skel-prepare"><div class="skel-prepare-card"></div><div class="skel-prepare-card"></div></div>';
  const needs=$('home-biggest-needs');
  if(needs&&!needs.innerHTML.trim()) needs.innerHTML='<div class="skel-needs-grid">'+'<div class="skel-needs-item"></div>'.repeat(6)+'</div>';
}

function renderBiggestNeeds(){
  const el=$('home-biggest-needs');if(!el)return;
  if(!LI_LOADED||!S.rosters?.length){el.innerHTML='';return;}
  const assess=typeof assessTeamFromGlobal==='function'?assessTeamFromGlobal(S.myRosterId):null;
  if(!assess){el.innerHTML='';return;}
  const pa=assess.posAssessment||{};
  const entries=Object.entries(pa).sort((a,b)=>{
    const ord={deficit:0,thin:1,ok:2,surplus:3};
    return(ord[a[1].status]||2)-(ord[b[1].status]||2);
  });
  if(!entries.length){el.innerHTML='';return;}
  const gradeMap={deficit:{l:'D',c:'var(--red)',bg:'var(--redL)',bar:'bar-fill-d'},thin:{l:'C',c:'var(--amber)',bg:'var(--amberL)',bar:'bar-fill-c'},ok:{l:'B',c:'var(--green)',bg:'var(--greenL)',bar:'bar-fill-b'},surplus:{l:'A',c:'var(--green)',bg:'var(--greenL)',bar:'bar-fill-a'}};
  const myPlayers=(myR()?.players||[]);
  el.innerHTML=`
    <div class="home-sec-title">Position Grades</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${entries.map(([pos,d])=>{
        const g=gradeMap[d.status]||gradeMap.ok;
        const fill=Math.min(100,Math.round((d.nflStarters/(d.minQuality||1))*100));
        const criticalCls=d.nflStarters===0?' pulse-critical':'';
        const atPos=myPlayers.filter(pid=>{const p=S.players[pid];return p&&(pPos(pid)===pos);})
          .map(pid=>({pid,name:pNameShort(pid),dhq:dynastyValue(pid),peakYrs:(LI.playerMeta?.[pid]?.peakYrsLeft||0)}))
          .sort((a,b)=>b.dhq-a.dhq).slice(0,4);
        const playersHtml=atPos.length?atPos.map(pl=>{
          const dhqCol=pl.dhq>=7000?'var(--green)':pl.dhq>=4000?'var(--accent)':pl.dhq>=2000?'var(--text2)':'var(--text3)';
          return`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:13px;cursor:pointer" onclick="event.stopPropagation();openPlayerModal('${pl.pid}')">
            <span style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.name}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${dhqCol};font-size:13px">${pl.dhq>0?pl.dhq.toLocaleString():'—'}</span>
            ${pl.peakYrs>0?'<span style="font-size:13px;color:var(--text3)">'+pl.peakYrs+'yr</span>':''}
          </div>`;
        }).join(''):'<div style="font-size:13px;color:var(--text3);padding:3px 0">No players</div>';
        const cardId='pos-grade-'+pos;
        return`<div class="glass-card${criticalCls}" id="${cardId}" style="padding:8px 10px;cursor:pointer" onclick="(function(e){var det=document.getElementById('${cardId}-detail');if(det){det.style.display=det.style.display==='none'?'block':'none';}e.stopPropagation();})(event)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px;font-weight:800;color:${g.c};min-width:20px">${g.l}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${pos}</div>
              <div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-top:3px"><div class="${g.bar} bar-animated" style="height:100%;--bar-w:${fill}%;border-radius:2px"></div></div>
            </div>
            <span style="font-size:13px;color:var(--text3)">${d.nflStarters}/${d.minQuality||d.startingReq}</span>
          </div>
          <div id="${cardId}-detail" style="display:none;margin-top:6px;border-top:1px solid var(--border);padding-top:6px">${playersHtml}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderCrownJewels(){
  const el=$('home-crown-jewels');if(el)el.innerHTML='';
}

function toggleJewels(){}

// ── Master home render — v4 components only ──────────────────
function renderMobileHome(){
  if(typeof renderScoutBriefing==='function')renderScoutBriefing();
  if(typeof renderFieldLogCard==='function')renderFieldLogCard();
  if(typeof renderTeamBar==='function')renderTeamBar();
}

// ── Strategy Walkthrough ───────────────────────────────────────
const STRATEGY_QUESTIONS=[
  {q:"First, are you trying to **win the championship this year**, or are you **rebuilding for the future**?",opts:['Win now','Rebuild','Competing but flexible']},
  {q:"How aggressive are you with trades? Do you prefer to **hold and develop**, or are you always looking for a deal?",opts:['Hold and develop','Active trader','Only if the value is right']},
  {q:"How do you feel about **IDP players** on your roster? Are they important to your strategy, or do you mostly focus on offense?",opts:['IDP is a priority','Offense first, IDP secondary','I draft IDP late']},
  {q:"When it comes to the **rookie draft**, do you prefer to draft the best player available (BPA), or do you target specific positions of need?",opts:['Best player available','Draft for need','Mix of both']},
  {q:"Last one — how do you feel about **aging veteran players** on your roster? Are you comfortable riding them while they produce, or do you want to sell high before they decline?",opts:['Ride them until the wheels fall off','Sell high when I can','Depends on the player']},
];

async function startStrategyWalkthrough(){
  if(!(S.apiKey||(typeof hasAnyAI==='function'&&hasAnyAI()))||DhqStorage.getStr(STORAGE_KEYS.STRATEGY_DONE))return;
  const msgs=$('home-chat-msgs');if(!msgs)return;

  msgs.innerHTML+=`<div class="hc-msg-a" style="font-size:13px;line-height:1.6">
    <div style="font-weight:700;color:var(--accent);margin-bottom:4px">Welcome to War Room Scout! Let's set up your strategy.</div>
    I'll ask you 5 quick questions so I can tailor my advice to how you like to play. This takes about 30 seconds.
  </div>`;

  const answers=[];
  for(let i=0;i<STRATEGY_QUESTIONS.length;i++){
    const sq=STRATEGY_QUESTIONS[i];
    msgs.innerHTML+=`<div class="hc-msg-a" style="font-size:13px;line-height:1.6;margin-top:6px">${sq.q}</div>`;
    msgs.innerHTML+=`<div id="strat-opts-${i}" style="display:flex;gap:6px;flex-wrap:wrap;padding:6px 0">${sq.opts.map((o,j)=>`<button class="chip" style="font-size:13px" onclick="selectStrategyAnswer(${i},${j})">${o}</button>`).join('')}</div>`;
    msgs.scrollTop=msgs.scrollHeight;

    await new Promise(resolve=>{
      window['_stratResolve'+i]=resolve;
    });
    answers.push(window['_stratAnswer'+i]);
  }

  const strategy={
    mode:answers[0],
    tradeStyle:answers[1],
    idpApproach:answers[2],
    draftApproach:answers[3],
    veteranApproach:answers[4],
    setAt:new Date().toISOString()
  };
  DhqStorage.set(STORAGE_KEYS.STRATEGY, strategy);
  DhqStorage.setStr(STORAGE_KEYS.STRATEGY_DONE, '1');

  msgs.innerHTML+=`<div class="hc-msg-a" style="font-size:13px;line-height:1.6;margin-top:6px">
    <div style="font-weight:700;color:var(--green);margin-bottom:4px">Strategy saved! ✓</div>
    <strong>${strategy.mode}</strong> mode · <strong>${strategy.tradeStyle}</strong> · <strong>${strategy.idpApproach}</strong> · Draft: <strong>${strategy.draftApproach}</strong> · Veterans: <strong>${strategy.veteranApproach}</strong>
    <div style="margin-top:6px;color:var(--text3)">I'll use this to personalize all my advice. You can change it anytime in Settings.</div>
  </div>`;
  msgs.scrollTop=msgs.scrollHeight;

  if((S.apiKey||(typeof hasAnyAI==='function'&&hasAnyAI()))&&LI_LOADED){
    msgs.innerHTML+=`<div class="hc-msg-a" style="font-size:13px;color:var(--text3)">Analyzing your roster with your strategy...</div>`;
    msgs.scrollTop=msgs.scrollHeight;
    try{
      const reply=await callClaude([{role:'user',content:`You are a dynasty fantasy football advisor. The user just set their strategy:
Mode: ${strategy.mode}
Trade style: ${strategy.tradeStyle}
IDP approach: ${strategy.idpApproach}
Draft approach: ${strategy.draftApproach}
Veteran approach: ${strategy.veteranApproach}

${dhqContext(false)}

Give a brief (3-4 sentences) personalized assessment of their roster given their strategy. Be specific about players. End with one actionable recommendation.`}]);
      msgs.lastElementChild.outerHTML=`<div class="hc-msg-a" style="font-size:13px;line-height:1.6">${reply.replace(/\n/g,'<br>')}</div>`;
    }catch(e){
      msgs.lastElementChild.outerHTML=`<div class="hc-msg-a" style="font-size:13px;color:var(--text3)">Strategy saved! Ask me anything about your team.</div>`;
    }
    msgs.scrollTop=msgs.scrollHeight;
  }
}

function selectStrategyAnswer(qIdx,optIdx){
  const opt=STRATEGY_QUESTIONS[qIdx].opts[optIdx];
  window['_stratAnswer'+qIdx]=opt;
  const el=$('strat-opts-'+qIdx);
  if(el)el.outerHTML=`<div class="hc-msg-u" style="font-size:13px">${opt}</div>`;
  if(window['_stratResolve'+qIdx])window['_stratResolve'+qIdx]();
}

function loadStrategy(){
  return DhqStorage.get(STORAGE_KEYS.STRATEGY, null);
}


// ── Draft room and player modal moved to js/draft-ui.js and js/player-modal.js ──

// ── Mobile nav ─────────────────────────────────────────────────
function mobileTab(tab, btn) {
  document.querySelectorAll('.mobile-nav-item').forEach(b=>b.classList.remove('active'));
  if(btn){btn.classList.add('active');}
  else{
    // v4 nav ids (scout-ui.js patches this further for league/fieldlog tabs)
    const map={digest:'mnav-home',draftroom:'mnav-draft',waivers:'mnav-waivers',league:'mnav-league',fieldlog:'mnav-fieldlog',startsit:'mnav-home',roster:'mnav-home',trades:'mnav-home'};
    const navId=map[tab];
    if(navId){const el=$(navId);if(el)el.classList.add('active');}
  }
  switchTab(tab, null);
}

// ── Stats stub ─────────────────────────────────────────────────
// statsData declared in app.js

// beforeunload handler in app.js (not duplicated here)

// ═══════════════════════════════════════════════════════════════
// Expose all public functions on window.App
// ═══════════════════════════════════════════════════════════════
Object.assign(window.App, {
  // Memory
  loadMemory, saveMemory, getMemory, setMemory,
  loadConvMemory: typeof loadConvMemory==='function'?loadConvMemory:()=>[],
  saveConvMemory: typeof saveConvMemory==='function'?saveConvMemory:()=>{},
  addConvMemory: typeof addConvMemory==='function'?addConvMemory:()=>{},
  buildMemoryCtx: typeof buildMemoryCtx==='function'?buildMemoryCtx:()=>'',
  autoSaveMemory: typeof autoSaveMemory==='function'?autoSaveMemory:()=>{},

  // API Key Callout
  checkApiKeyCallout,

  // League Pulse
  renderLeaguePulse,

  // Roster
  getDcLabel, renderRoster, peakYears,
  sortRoster, setRosterFilter, resetRosterSort,
  buildRosterTable,

  // Pick values
  BASE_PICK_VALUES, pickValue,

  // FAAB / Roster slots
  getFAAB, getRosterSlots,

  // Mentality
  loadMentality, saveMentality,

  // Available players
  getAvailablePlayers, availSort, renderAvailable, renderWaivers,
  renderWaiverTop5, filterWaiverTop5, sortWaiverTop5,

  // Trades
  renderTrades, renderTradeIntel,

  // Picks
  renderPicks, runPicksAI,

  // Value system
  updateDataFreshness, updateSyncStatus, resyncAllData,
  assetValue, assetName,

  // Player Search
  handlePlayerSearch,

  // Home
  renderHomeSnapshot, renderTeamOverview, recordHealthSnapshot, renderHealthTimeline,
  renderHomeSkeletons, renderBiggestNeeds,

  // Strategy
  STRATEGY_QUESTIONS, startStrategyWalkthrough,
  selectStrategyAnswer, loadStrategy,

  // Player Modal — now in js/player-modal.js
  // Draft Room — now in js/draft-ui.js

  // Mobile nav
  mobileTab,

});

// Also expose key functions directly on window for inline onclick handlers
window.getDcLabel = getDcLabel;
window.renderRoster = renderRoster;
window.peakYears = peakYears;
window.sortRoster = sortRoster;
window.setRosterFilter = setRosterFilter;
window.resetRosterSort = resetRosterSort;
window.buildRosterTable = buildRosterTable;
window.pickValue = pickValue;
window.getFAAB = getFAAB;
window.getRosterSlots = getRosterSlots;
window.loadMentality = loadMentality;
window.saveMentality = saveMentality;
window.getAvailablePlayers = getAvailablePlayers;
window.availSort = availSort;
window.renderAvailable = renderAvailable;
window.renderWaivers = renderWaivers;
window.renderTrades = renderTrades;
window.renderTradeIntel = renderTradeIntel;
window.renderPicks = renderPicks;
window.runPicksAI = runPicksAI;
window.updateDataFreshness = updateDataFreshness;
window.updateSyncStatus = updateSyncStatus;
window.resyncAllData = resyncAllData;
window.assetValue = assetValue;
window.assetName = assetName;
window.handlePlayerSearch = handlePlayerSearch;
window.renderHomeSnapshot = renderHomeSnapshot;
window.renderTeamOverview = renderTeamOverview;
window.recordHealthSnapshot = recordHealthSnapshot;
window.renderHealthTimeline = renderHealthTimeline;
window.renderHomeSkeletons = renderHomeSkeletons;
window.renderBiggestNeeds = renderBiggestNeeds;
window.startStrategyWalkthrough = startStrategyWalkthrough;
window.selectStrategyAnswer = selectStrategyAnswer;
window.loadStrategy = loadStrategy;
// fetchPlayerNews, openPlayerModal, closePlayerModal etc. → js/player-modal.js
// renderDraftNeeds, renderRookieBoard, runDraftScouting → js/draft-ui.js
window.mobileTab = mobileTab;
window.checkApiKeyCallout = checkApiKeyCallout;
window.renderLeaguePulse = renderLeaguePulse;
window.getMemory = getMemory;
window.setMemory = setMemory;
window.loadMemory = loadMemory;
window.saveMemory = saveMemory;
if(typeof loadConvMemory==='function')window.loadConvMemory = loadConvMemory;
if(typeof addConvMemory==='function')window.addConvMemory = addConvMemory;
if(typeof autoSaveMemory==='function')window.autoSaveMemory = autoSaveMemory;
window.buildMemoryCtx = buildMemoryCtx;
// renderStatsTable removed — function does not exist

// ── Event bus: re-render waivers when LeagueIntel finishes loading ──
// dhq-engine.js emits 'li:loaded' after both fresh compute and cache hits.
// This replaces the direct renderAvailable() call that was inside dhq-engine.js.
if(window.DhqEvents){
  DhqEvents.on('li:loaded',()=>{
    try{if(typeof renderAvailable==='function')renderAvailable();}
    catch(e){dhqLog('li:loaded.renderAvailable',e);}
    try{if(typeof renderWaiverTop5==='function')renderWaiverTop5();}
    catch(e){dhqLog('li:loaded.renderWaiverTop5',e);}
  });
}
