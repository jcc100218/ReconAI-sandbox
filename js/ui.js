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
function checkApiKeyCallout(){
  const el=$('api-key-callout');if(!el)return;
  // Hide callout if user has server-side AI (Supabase session) OR a client API key
  if(S.apiKey || (typeof hasAnyAI==='function' && hasAnyAI())){
    el.style.display='none';
  }else{
    el.style.display='block';
    // Update messaging if Supabase is available but no session yet
    if(window.OD?.isConfigured && window.OD.isConfigured()){
      el.innerHTML='<div style="font-size:13px;color:var(--amber);line-height:1.5">🔑 <strong>AI chat is included with your account.</strong> If chat isn\'t working, go to <a onclick="switchTab(\'settings\')" style="color:var(--accent);cursor:pointer;text-decoration:underline">Settings</a> and add a free <strong>Groq</strong> or <strong>Gemini</strong> key as backup.</div>';
    }
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
      return`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px">
        <span style="color:${isAdds?'var(--green)':'var(--red)'};font-weight:700;font-size:12px;min-width:14px">${isAdds?'▲':'▼'}</span>
        <span style="font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer" onclick="openPlayerModal('${item.player_id}')">${p.first_name} ${p.last_name}</span>
        <span class="pos ${posMap(p.position)==='QB'?'qb':posMap(p.position)==='RB'?'rb':posMap(p.position)==='WR'?'wr':posMap(p.position)==='TE'?'te':'idp'}" style="font-size:11px;padding:1px 4px">${posMap(p.position)}</span>
        ${val>0?`<span style="font-size:11px;color:${col};font-family:'JetBrains Mono',monospace">${val.toLocaleString()}</span>`:''}
        ${onMyTeam?'<span style="font-size:11px;color:var(--accent)" title="On your roster">✦</span>':''}
      </div>`;
    }).filter(Boolean).join('');
  };

  el.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em">League Pulse</span>
      <span style="font-size:11px;color:var(--text3)">Trending across Sleeper · Last 24h</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--green);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Most Added</div>
        ${renderList(t.adds,'adds',true)}
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Most Dropped</div>
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
      if(String(plObj?.player_id||plObj)===String(pid))return`#${order} ${dpos}`;
    }
  }
  return p?.depth_chart_order?`#${p.depth_chart_order} ${p.depth_chart_position||''}`.trim():'';
}

async function renderRoster(){
  const my=myR();if(!my)return;
  buildRosterTable();
}

// Peak age range helper (loadPeakCurves removed — use static defaults)
function peakYears(pid){
  const pos=pPos(pid);const age=pAge(pid)||0;
  // Research-backed peak ranges (EPA study 2014-2024)
  const peaks={QB:[28,33],RB:[25,27],WR:[26,30],TE:[27,30],DL:[25,29],LB:[24,28],DB:[25,29]};
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

// Roster sort/filter stubs
let rosterSortKey='val', rosterSortDir=-1, rosterFilter='all';
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
function resetRosterSort(){rosterSortKey='val';rosterSortDir=-1;rosterFilter='all';buildRosterTable();}

function buildRosterTable(){
  const my=myR();if(!my){
    $('roster-tbody').innerHTML='<tr><td colspan="14" style="padding:20px;text-align:center;color:var(--text3);font-size:14px">Connect to load roster.</td></tr>';
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

  // Build data rows
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
      isStarter:starters.has(pid),
      isReserve:isRes,
      isTaxi,
      pos:pPos(pid)||'?',
      name:pName(pid),
      age:p.age||99,
      rank:S.posRanks?.[pid]||999,
      avg:stats.seasonAvg||0,
      l3:stats.trail3||0,
      prev:stats.prevAvg||0,
      prevtot:stats.prevTotal||0,
      proj:S.playerProj?.[pid]||0,
      value:val,
      peak:pk.cls==='hi'?3:pk.cls==='near'?2:1,
    };
  });

  // Filter
  if(rosterFilter==='OFF')rows=rows.filter(r=>offPos.has(r.pos));
  if(rosterFilter==='IDP')rows=rows.filter(r=>idpPos.has(r.pos));
  if(rosterFilter==='taxi')rows=rows.filter(r=>r.isTaxi);

  // Sort
  const posOrder2=['QB','RB','WR','TE','DL','LB','DB','K','DEF','IDP','FLEX','SF'];
  rows.sort((a,b)=>{
    // Taxi and IR always at bottom
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

  const tbody=$('roster-tbody');
  let html='';
  let lastSection='';

  rows.forEach(r=>{
    const {pid,p,stats,val,pk,slot,isStarter,isReserve,isTaxi,pos,age,rank}=r;
    // Only show section headers for Taxi and IR — main roster is one continuous list
    const section=(r.isReserve||r.isTaxi)?(r.isReserve?'IR / Reserve':'Taxi Squad'):'';
    if(section&&section!==lastSection){
      html+=`<tr class="rt-section-row"><td colspan="9">${section}</td></tr>`;
      lastSection=section;
    }
    const rowCls=r.isStarter?'rt-row rt-starter':(r.isReserve||r.isTaxi)?'rt-row rt-reserve':'rt-row';
    const pc=posClass(pos);
    const inj=p.injury_status;
    const avg=stats.seasonAvg;
    const prev=stats.prevAvg;
    const {tier,col}=tradeValueTier(val);
    const initials=((p.first_name||'?')[0]+(p.last_name||'?')[0]).toUpperCase();

    // DHQ trend arrow (year-over-year PPG change)
    const dhqTrend=LI_LOADED&&LI.playerMeta?.[pid]?.trend||0;
    const trendHtml=dhqTrend>=15?'<span style="color:var(--green);font-size:12px;margin-left:2px" title="PPG up '+dhqTrend+'% YoY">▲</span>':dhqTrend<=-15?'<span style="color:var(--red);font-size:12px;margin-left:2px" title="PPG down '+Math.abs(dhqTrend)+'% YoY">▼</span>':'';

    html+=`<tr class="${rowCls}" onclick="openPlayerModal('${pid}')">
      <td><img class="rt-photo" src="https://sleepercdn.com/content/nfl/players/${pid}.jpg" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=rt-initials>${initials}</span>')" loading="lazy"/></td>
      <td><div class="rt-name">${pName(pid)}${isStarter?'<span class="rt-slot">'+posLabel(slot,pid)+'</span>':''}</div><div class="rt-team">${fullTeam(pTeam(pid))}</div></td>
      <td><span class="pos ${pc}" style="font-size:12px">${pos}</span></td>
      <td class="rt-num-cell rt-val">${age||'—'}</td>
      <td class="rt-num-cell" style="color:${col};font-weight:700;font-size:13px;font-family:'JetBrains Mono',monospace">${val>0?val.toLocaleString()+(LI_LOADED&&LI.playerMeta?.[pid]?.source==='FC_ROOKIE'?'<span style="font-size:9px;color:var(--blue);margin-left:3px;font-weight:600;vertical-align:super">R</span>':'')+trendHtml:LI_LOADED?'<span style="font-size:12px;color:var(--text3)">—</span>':'...'}</td>
      <td class="rt-num-cell rt-val ${avg&&avg>15?'hi':avg&&avg<8?'lo':''}">${avg?avg.toFixed(1):'—'}</td>
      <td class="rt-num-cell rt-val dim">${prev?prev.toFixed(1):'—'}</td>
      <td class="rt-peak ${pk.cls}"><div>${pk.label}</div><div style="font-size:12px;font-weight:400;color:var(--text3)">${pk.desc}</div></td>
      <td>${inj?`<span class="rt-inj">${inj}</span>`:''}</td>
    </tr>`;
  });

  tbody.innerHTML=html||'<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--text3)">No players found.</td></tr>';
}

// ── Draft pick values ──────────────────────────────────────────
const BASE_PICK_VALUES={
  '1.01':9000,'1.02':8200,'1.03':7500,'1.04':6800,'1.05':6200,
  '1.06':5600,'1.07':5100,'1.08':4700,'1.09':4300,'1.10':4000,
  '1.11':3700,'1.12':3400,
  '2.01':3100,'2.02':2900,'2.03':2700,'2.04':2500,'2.05':2300,
  '2.06':2100,'2.07':1950,'2.08':1800,'2.09':1650,'2.10':1500,
  '2.11':1400,'2.12':1300,
  '3.01':1200,'3.02':1100,'3.03':1000,'3.04':900,'3.05':820,
  '3.06':750,'3.07':680,'3.08':620,'3.09':560,'3.10':510,
  '3.11':460,'3.12':420,
  '4.01':380,'4.02':350,'4.03':320,'4.04':295,'4.05':270,
  '4.06':250,'4.07':230,'4.08':210,'4.09':195,'4.10':180,
  '4.11':165,'4.12':150,
  '5.01':140,'5.02':130,'5.03':120,'5.04':110,'5.05':100,
  '5.06':90,'5.07':80,'5.08':70,'5.09':65,'5.10':60,
  '5.11':55,'5.12':50,
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
  const budget=league?.settings?.waiver_budget||100;
  const spent=my?.settings?.waiver_budget_used||0;
  return{budget,spent,remaining:budget-spent};
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
  const m=getMemory('mentality',{mentality:'balanced',priority:'auto',notes:'',tradePrefs:'',neverDrop:'',window:'now',tradeStyle:'selective',riskTolerance:'moderate_risk',agePreference:'balanced_age',upgradePositions:'',targetPlayers:'',shoppingPlayers:''});
  const sel=$('mentality-sel');const pri=$('priority-sel');
  const notes=$('mentality-notes');const tp=$('trade-prefs');const nd=$('never-drop');
  if(sel)sel.value=m.mentality||'balanced';
  if(pri)pri.value=m.priority||'auto';
  if(notes)notes.value=m.notes||'';
  if(tp)tp.value=m.tradePrefs||'';
  if(nd)nd.value=m.neverDrop||'';
  // New fields
  const ws=$('window-sel');if(ws)ws.value=m.window||'now';
  const ts=$('trade-style-sel');if(ts)ts.value=m.tradeStyle||'selective';
  const rs=$('risk-sel');if(rs)rs.value=m.riskTolerance||'moderate_risk';
  const ap=$('age-pref-sel');if(ap)ap.value=m.agePreference||'balanced_age';
  const tgt=$('target-players');if(tgt)tgt.value=m.targetPlayers||'';
  const shop=$('shopping-players');if(shop)shop.value=m.shoppingPlayers||'';
  // Restore upgrade positions
  const up=$('upgrade-positions');if(up)up.value=m.upgradePositions||'';
  if(m.upgradePositions){
    m.upgradePositions.split(',').filter(Boolean).forEach(pos=>{
      const btns=document.querySelectorAll('#upgrade-pos-btns .rfbtn');
      btns.forEach(b=>{if(b.textContent.trim()===pos)b.classList.add('active');});
    });
  }
  return m;
}
function saveMentality(){
  const m={
    mentality:$('mentality-sel')?.value||'balanced',
    priority:$('priority-sel')?.value||'auto',
    notes:$('mentality-notes')?.value||'',
    tradePrefs:$('trade-prefs')?.value||'',
    neverDrop:$('never-drop')?.value||'',
    window:$('window-sel')?.value||'now',
    tradeStyle:$('trade-style-sel')?.value||'selective',
    riskTolerance:$('risk-sel')?.value||'moderate_risk',
    agePreference:$('age-pref-sel')?.value||'balanced_age',
    upgradePositions:$('upgrade-positions')?.value||'',
    targetPlayers:$('target-players')?.value||'',
    shoppingPlayers:$('shopping-players')?.value||''
  };
  setMemory('mentality',m);
  const saved=$('mentality-saved');
  if(saved){saved.style.display='block';setTimeout(()=>saved.style.display='none',2000);}
}

function toggleUpgradePos(btn,pos){
  btn.classList.toggle('active');
  const active=[];
  document.querySelectorAll('#upgrade-pos-btns .rfbtn.active').forEach(b=>active.push(b.textContent.trim()));
  const hidden=$('upgrade-positions');
  if(hidden)hidden.value=active.join(',');
}

// buildMentalityCtx: defined in ai-chat.js

// ── Setup Wizard ───────────────────────────────────────────────
const WIZARD_STEPS=[
  {
    id:'mentality',
    msg:`Hey! I'm your ReconAI agent. Let me ask you a few quick questions so every recommendation is tuned to your actual situation.\n\n**What's your current team strategy?**`,
    type:'choices',
    choices:['Win Now 🏆','Rebuild 🔄','Balanced ⚖️','Dynasty Prime ⭐'],
    values:['winnow','rebuild','balanced','prime']
  },
  {
    id:'tradeStyle',
    msg:`**How do you approach trades?**\n\nThis helps me know whether to suggest aggressive moves or patience.`,
    type:'choices',
    choices:['Aggressive — always looking to deal','Selective — only obvious wins','Conservative — rarely trade','Pick seller — love trading picks'],
    values:['aggressive','selective','conservative','pick_seller']
  },
  {
    id:'agePreference',
    msg:`**What's your player age philosophy?**`,
    type:'choices',
    choices:['Youth first — under 25 only','Balanced — best value wins','Vets OK — proven production','Age agnostic'],
    values:['youth','balanced_age','vets','agnostic']
  },
  {
    id:'riskTolerance',
    msg:`**How do you feel about high-risk, high-upside players?**\n\nThink injury-prone players, depth chart longshots, unproven rookies.`,
    type:'choices',
    choices:['Love the upside — go bold','Some risk is fine','Prefer proven commodities','Zero risk — show me safe floors'],
    values:['high_risk','moderate_risk','low_risk','no_risk']
  },
  {
    id:'tradePrefs',
    msg:`**Describe your trade philosophy in your own words.** This is what I'll use when drafting Sleeper messages and evaluating offers.`,
    type:'text',
    placeholder:'e.g. I love young WRs with route tree upside, will give picks for proven starters, never sell a QB early...'
  },
  {
    id:'neverDrop',
    msg:`Last one: **Any players you\'d never trade or drop no matter what?** I\'ll treat these as untouchable.`,
    type:'text',
    placeholder:'e.g. Travis Kelce, my 2026 1st... or type "none"'
  }
];
let wizardStep=0;
let wizardAnswers={};

function checkFirstTime(){
  const done=getMemory('wizardDone',false);
  if(!done&&(S.apiKey||(typeof hasAnyAI==='function'&&hasAnyAI())))startSetupWizard();
}

function startSetupWizard(){
  wizardStep=0;wizardAnswers={};
  $('setup-wizard').style.display='flex';
  $('wiz-messages').innerHTML='';
  showWizardStep(0);
}

function showWizardStep(i){
  const step=WIZARD_STEPS[i];if(!step){finishWizard();return;}
  $('wiz-title').textContent=`Setup ${i+1} of ${WIZARD_STEPS.length}`;
  // Add AI message
  const d=document.createElement('div');
  d.style.cssText='background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 13px;font-size:14px;color:var(--text);line-height:1.6;max-width:90%';
  d.innerHTML=step.msg.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  $('wiz-messages').appendChild(d);
  $('wiz-messages').scrollTop=99999;
  // Input area
  if(step.type==='choices'){
    $('wiz-input-area').innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap">${step.choices.map((c,ci)=>`
      <button class="btn btn-ghost" style="font-size:14px;padding:8px 16px" onclick="wizardAnswer('${step.values[ci]}','${c}')">${c}</button>`).join('')}</div>`;
  }else{
    $('wiz-input-area').innerHTML=`<div class="row"><input type="text" id="wiz-text-in" placeholder="${step.placeholder}" style="font-size:14px" onkeydown="if(event.key==='Enter')submitWizardText()"/><button class="btn" onclick="submitWizardText()">Next →</button></div>`;
    setTimeout(()=>$('wiz-text-in')?.focus(),100);
  }
}

function wizardAnswer(value,label){
  const step=WIZARD_STEPS[wizardStep];
  wizardAnswers[step.id]=value;
  addWizardUserMsg(label);
  wizardStep++;
  setTimeout(()=>showWizardStep(wizardStep),400);
}

function submitWizardText(){
  const val=$('wiz-text-in')?.value?.trim();
  if(!val)return;
  const step=WIZARD_STEPS[wizardStep];
  wizardAnswers[step.id]=val;
  addWizardUserMsg(val);
  wizardStep++;
  setTimeout(()=>showWizardStep(wizardStep),400);
}

function addWizardUserMsg(text){
  const d=document.createElement('div');
  d.style.cssText='background:var(--accentL);border:1px solid rgba(108,99,245,.22);border-radius:10px;padding:10px 13px;font-size:14px;color:var(--text);align-self:flex-end;max-width:90%;margin-left:auto';
  d.textContent=text;
  $('wiz-messages').appendChild(d);
  $('wiz-messages').scrollTop=99999;
}

async function finishWizard(){
  // Save all answers
  const existing=loadMentality();
  const merged={
    ...existing,
    mentality:wizardAnswers.mentality||existing.mentality,
    tradePrefs:wizardAnswers.tradePrefs||existing.tradePrefs,
    neverDrop:wizardAnswers.neverDrop==='none'?'':wizardAnswers.neverDrop||existing.neverDrop,
  };
  setMemory('mentality',merged);
  setMemory('wizardDone',true);
  // Sync settings UI
  loadMentality();
  // Show completion message
  const d=document.createElement('div');
  d.style.cssText='background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 13px;font-size:14px;color:var(--text);line-height:1.6';
  d.innerHTML=`<strong>All set!</strong> I've saved your strategy. Every recommendation I make — waivers, trades, start/sit, daily digest — will now reflect your <strong>${merged.mentality}</strong> approach. You can update this anytime in Settings.`;
  $('wiz-messages').appendChild(d);
  $('wiz-input-area').innerHTML=`<button class="btn" onclick="closeWizard()">Start using ReconAI →</button>`;
  $('wiz-messages').scrollTop=99999;
}

function closeWizard(){$('setup-wizard').style.display='none';}
function skipWizard(){setMemory('wizardDone',true);closeWizard();}

// ── Available players ──────────────────────────────────────────
function getAvailablePlayers(){
  const rostered=new Set(S.rosters.flatMap(r=>(r.players||[]).concat(r.taxi||[]).concat(r.reserve||[])).map(String));
  const offPos=['QB','RB','WR','TE'];
  const idpPos=['DL','LB','DB'];
  const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const results=[];

  // FAST PATH: scan DHQ player scores (LI.playerScores) for valued players
  if(LI_LOADED&&LI.playerScores){
    Object.keys(LI.playerScores).forEach(id=>{
      if(rostered.has(id))return;
      const p=S.players[id];if(!p)return;
      if(!offPos.includes(p.position)&&!idpPos.includes(p.position))return;
      if(p.status==='Inactive'||p.status==='Retired')return;
      // Skip rookies (FC imports) — they can only be added via rookie draft
      const meta=LI.playerMeta?.[id];
      if(meta?.source==='FC_ROOKIE')return;
      if((p.years_exp||0)===0&&!meta?.starterSeasons)return;
      const val=LI.playerScores[id]||0;
      if(val<=0)return;
      results.push({id,p,val,isIDP:idpPos.includes(p.position),rank:S.posRanks?.[id],proj:S.playerProj?.[id]});
    });
  }

  // Fallback: IDP players from stats (before DHQ loads)
  Object.keys(S.playerStats||{}).forEach(id=>{
    if(rostered.has(id))return;
    if(results.some(r=>r.id===id))return;
    const p=S.players[id];if(!p)return;
    if(!idpPos.includes(p.position)&&!offPos.includes(p.position))return;
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
let availSortDir=-1;
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
      <div style="font-size:11px;color:var(--text3);margin-top:8px">Building DHQ values...</div>
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
      const getFaab=(x)=>{const mP2=posMapFilter(x.p.position);const mk=fm[mP2];if(!mk||mk.count<3||!fb.budget)return 0;return Math.max(1,Math.min(Math.round(fb.remaining*0.15),Math.round(mk.avg*(x.val/4000))));};
      return(getFaab(b)-getFaab(a))*availSortDir;
    }
    return(b.val-a.val)*availSortDir;
  });

  const el=$('available-count');if(el)el.textContent=filtered.length===avail.length?`${avail.length} players available`:`${filtered.length} of ${avail.length} shown`;
  const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const faab=typeof getFAAB==='function'?getFAAB():{remaining:0,budget:0};
  const faabMarket=LI_LOADED&&LI.faabByPos?LI.faabByPos:{};

  // Tight roster-style table: Photo | Name+Team | Pos | Age | DHQ | PPG | FAAB | Ask
  const sortIcon=(key)=>availSortKey===key?(availSortDir===-1?'▼':'▲'):'';
  const hdrStyle='cursor:pointer;user-select:none';
  const header=`<div style="display:grid;grid-template-columns:24px 1fr 34px 28px 56px 38px 46px 32px;gap:3px;padding:5px 8px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--border2);align-items:center">
    <span></span><span>Player</span><span>Pos</span><span style="${hdrStyle}" onclick="availSortKey='age';availSortDir=availSortKey==='age'?-availSortDir:-1;renderAvailable()">Age ${sortIcon('age')}</span><span style="${hdrStyle}" onclick="availSortKey='value';availSortDir=availSortKey==='value'?-availSortDir:-1;renderAvailable()">DHQ ${sortIcon('value')}</span><span style="${hdrStyle}" onclick="availSortKey='ppg';availSortDir=availSortKey==='ppg'?-availSortDir:-1;renderAvailable()">PPG ${sortIcon('ppg')}</span><span style="${hdrStyle}" onclick="availSortKey='faab';availSortDir=availSortKey==='faab'?-availSortDir:-1;renderAvailable()">FAAB ${sortIcon('faab')}</span><span></span></div>`;

  const rows=filtered.slice(0,25).map(({id,p,val},i)=>{
    const stats=S.playerStats?.[id]||{};
    const {col}=tradeValueTier(val);
    const mPos=posMapFilter(p.position);
    const isIDP=['DL','LB','DB'].includes(mPos);
    const raw=stats?.prevRawStats;
    const ppg=isIDP&&raw?+(calcIDPScore(raw,sc)/Math.max(1,raw.gp||17)).toFixed(1):(stats.seasonAvg||stats.prevAvg||0);
    // FAAB suggestion based on league market data + player value
    const market=faabMarket[mPos];
    let faabSug='—';
    if(market&&market.count>=3&&faab.budget>0){
      const baseB=Math.round(market.avg*(val/4000)); // scale bid by value relative to starter
      const sug=Math.max(1,Math.min(Math.round(faab.remaining*0.15),baseB));
      faabSug='$'+sug;
    }

    return`<div style="display:grid;grid-template-columns:24px 1fr 34px 28px 56px 38px 46px 32px;gap:3px;padding:4px 8px;align-items:center;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s" onclick="openPlayerModal('${id}')" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      <div style="width:22px;height:22px;border-radius:50%;overflow:hidden;background:var(--bg4);display:flex;align-items:center;justify-content:center;flex-shrink:0"><img src="https://sleepercdn.com/content/nfl/players/${id}.jpg" style="width:22px;height:22px;border-radius:50%" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\\'font-size:9px;font-weight:700;color:var(--text3)\\'>'+(this.alt||'??')+'</span>'" alt="${(pName(id)||'??').split(' ').map(n=>n[0]).join('')}" loading="lazy"/></div>
      <div style="overflow:hidden"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pName(id)}</div><div style="font-size:11px;color:var(--text3)">${p.team||'FA'}</div></div>
      <span class="pos ${posClass(p.position)}" style="font-size:11px;padding:1px 4px">${p.position||'?'}</span>
      <span style="font-size:11px;color:var(--text2)">${p.age||'—'}</span>
      <span style="font-size:11px;font-weight:700;color:${col};font-family:'JetBrains Mono',monospace">${val>0?val.toLocaleString():'—'}</span>
      <span style="font-size:11px;color:${ppg>=8?'var(--green)':ppg>=4?'var(--text2)':'var(--text3)'}">${ppg?ppg.toFixed(1):'—'}</span>
      <span style="font-size:11px;font-weight:600;color:var(--amber)">${faabSug}</span>
      <button class="copy-btn" style="font-size:11px;padding:1px 4px" onclick="event.stopPropagation();goAsk('Should I add ${pName(id).replace(/'/g,'')}? What FAAB bid?')">Ask</button>
    </div>`;
  }).join('');

  tbody.innerHTML=header+rows+(filtered.length>10?`<div style="padding:6px 8px;font-size:12px;color:var(--text3);text-align:center">${filtered.length-10} more — filter by position</div>`:'');
}

function renderWaivers(){
  loadMentality();

  // FAAB status bar
  if(S.myRosterId){
    const faab=getFAAB();const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
    const slots=getRosterSlots();
    const leagueFaab=(()=>{
      const budgets=S.rosters.map(r=>(r.settings?.waiver_budget||200)-(r.settings?.waiver_budget_used||0));
      const avg=budgets.length?Math.round(budgets.reduce((a,b)=>a+b,0)/budgets.length):100;
      return{avg};
    })();
    const bar=$('faab-bar');if(bar)bar.style.display='flex';
    const faabHint=$('waiver-faab-hint');
    if(faabHint&&faab.budget>0){
      const pct=Math.round((faab.remaining/faab.budget)*100);
      faabHint.textContent=`$${faab.remaining} remaining (${pct}% of budget)`;
      faabHint.style.color=pct>50?'var(--green)':pct>25?'var(--amber)':'var(--red)';
    }
    const mineEl=$('faab-mine');if(mineEl)mineEl.textContent='$'+faab.remaining;
    const avgEl=$('faab-avg');if(avgEl)avgEl.textContent='$'+leagueFaab.avg;
    const slotsEl=$('bench-slots');if(slotsEl){
      slotsEl.textContent=slots.openBench;
      slotsEl.style.color=slots.openBench>0?'var(--green)':'var(--red)';
    }
    const wposEl=$('waiver-pos-display');if(wposEl)wposEl.textContent='#'+(myR()?.settings?.waiver_position||'?');
  }

  renderAvailable();


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
    const names=rids.map(id=>{const r=S.rosters.find(r=>r.roster_id===id);return r?getUser(r.owner_id):`Team ${id}`;});
    const sides={};rids.forEach(id=>sides[id]={players:[],picks:[]});
    Object.keys(t.adds||{}).forEach(pid=>{const d=t.adds[pid];if(sides[d])sides[d].players.push(pName(pid));});
    (t.draft_picks||[]).forEach(pk=>{if(sides[pk.owner_id])sides[pk.owner_id].picks.push(pk.season+' R'+pk.round);});
    const sideArr=rids.map(id=>({name:S.rosters.find(r=>r.roster_id===id)?getUser(S.rosters.find(r=>r.roster_id===id).owner_id):`T${id}`,gets:[...(sides[id]?.players||[]),...(sides[id]?.picks||[])]}));
    const isMe=rids.includes(S.myRosterId);
    const sidesTxt=sideArr.map(s=>s.name+' gets: '+s.gets.join(', ')).join('. ');
    return`<div class="card-sm" style="${isMe?'border-color:rgba(108,99,245,.3)':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <span style="font-size:13px;font-weight:500">${names.join(' ↔ ')}${isMe?' (you)':''}</span>
        <span class="tag tag-t">Trade</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 18px 1fr;gap:6px;font-size:12px">
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
      <div style="font-size:12px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Surplus — sell high</div>
      ${depth.length?depth.map(([pos,v])=>{
        const sell=sellByPos[pos];
        return`<div style="font-size:13px;color:var(--text2);margin-bottom:4px"><strong>${pos}</strong> ${v.have} rostered, +${v.surplus} over need${sell?' · <span style="color:var(--text3)">sell '+sell.name+'</span>':''}</div>`;
      }).join(''):'<div style="font-size:12px;color:var(--text3)">No surplus positions</div>'}
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:12px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Thin — buy low</div>
      ${weak.length?weak.map(([pos,v])=>`<div style="font-size:13px;color:var(--text2);margin-bottom:4px"><strong>${pos}</strong> ${v.have} rostered, need ${Math.abs(v.surplus)} more</div>`).join(''):'<div style="font-size:12px;color:var(--text3)">All positions covered</div>'}
    </div>
  </div>
  <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px;margin-top:8px">
    <div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Top trade chips</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${sellable.map(p=>`<span style="font-size:12px;padding:4px 10px;background:var(--bg3);border-radius:6px;color:var(--text2);cursor:pointer" onclick="openPlayerModal('${p.pid}')">${p.name} <span style="color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:11px">${p.val.toLocaleString()}</span></span>`).join('')}
      ${topPicks.map(p=>`<span style="font-size:12px;padding:4px 10px;background:var(--bg3);border-radius:6px;color:var(--amber)">${p}</span>`).join('')}
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
      +'<div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">'+yr+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
      +byYear[yr].map(p=>{
        const val=pickValue(p.season,p.round,teams);
        const valCol=val>4000?'var(--green)':val>2000?'var(--amber)':val>800?'var(--text2)':'var(--text3)';
        return'<div style="background:var(--bg3);border:1px solid '+(p.original?'var(--border2)':'rgba(124,107,248,.25)')+';border-radius:8px;padding:8px 12px;min-width:100px">'
          +'<div style="font-size:14px;font-weight:700;color:var(--accent)">Round '+p.round+'</div>'
          +'<div style="font-size:11px;color:'+(p.original?'var(--text3)':'var(--accent)')+';margin-top:2px">'+(p.original?'Own pick':'from '+p.from)+'</div>'
          +'<div style="font-size:13px;font-weight:600;color:'+valCol+';margin-top:4px;font-family:\'JetBrains Mono\',monospace">~'+val.toLocaleString()+'</div>'
          +'</div>';
      }).join('')
      +'</div></div>';
  }).join('')
  +(tradedAway.length?'<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Traded away</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+tradedAway.map(p=>'<div style="background:var(--redL);border:1px solid rgba(248,113,113,.15);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--red)">'+p.season+' R'+p.round+' → '+p.to+'</div>').join('')+'</div></div>':'')
  +'<div style="font-size:12px;color:var(--text3);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'+myPicks.length+' picks · Total value: <strong style="color:var(--accent);font-family:\'JetBrains Mono\',monospace">~'+totalVal.toLocaleString()+'</strong></div>';
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
${buildMentalityCtx()}
${buildCtx()}

Analyze my pick portfolio and give me:
1. SELL NOW — any picks I should trade away immediately while value is high
2. HOLD — picks worth keeping given my mentality
3. BUY — picks I should try to acquire from other teams (and who might sell)
4. OVERALL ASSESSMENT — am I pick-rich or pick-poor vs the league? How does this affect my dynasty timeline?

Be specific with round and year for each recommendation.`}]);
    $('picks-ai-content').innerHTML=`
      <div class="card" style="border-color:rgba(108,99,245,.2)">
        <div style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">AI Pick Analysis</div>
        <div style="font-size:14px;color:var(--text2);line-height:1.7">${reply.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--text)">$1</strong>').replace(/\n/g,'<br>')}</div>
      </div>`;
  }catch(e){$('picks-ai-content').innerHTML=`<div style="color:var(--red);font-size:13px">Error: ${e.message}</div>`;}
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
      dot.style.background='var(--green)';fcEl.style.color='var(--text2)';
      fcEl.lastChild.textContent=' DHQ ✓ ('+Object.keys(LI.playerScores||{}).length+')';
    } else{dot.style.background='var(--text3)';fcEl.style.color='var(--text3)';fcEl.lastChild.textContent=' DHQ...';}
  }
  if(statsEl){
    const dot=statsEl.querySelector('span');
    const count=Object.keys(S.playerStats||{}).length;
    if(count>0){dot.style.background='var(--green)';statsEl.style.color='var(--text2)';statsEl.lastChild.textContent=' Stats ✓ ('+count+')';}
    else{dot.style.background='var(--amber)';statsEl.style.color='var(--amber)';statsEl.lastChild.textContent=' Stats...';}
  }
  if(liEl){
    const dot=liEl.querySelector('span');
    if(LI_LOADED){
      const dCount=LI.totalPicks||0;
      dot.style.background='var(--green)';liEl.style.color='var(--text2)';
      liEl.lastChild.textContent=` Intel ✓ (${dCount} picks, ${LI.leagueYears?.length||0}yr${LI.rookieCount?' + '+LI.rookieCount+' rookies':''})`;
    }
    else{dot.style.background='var(--text3)';liEl.lastChild.textContent=' Intel...';}
  }
}

async function resyncAllData(){
  if(!S.currentLeagueId){showToast('Connect first');return;}
  showToast('Resyncing all data...');
  try{
    localStorage.removeItem('dhq_leagueintel_v9');
    Object.keys(localStorage).filter(k=>k.startsWith('dhq_hist_')).forEach(k=>localStorage.removeItem(k));
  }catch(e){}
  _availCache=null;LI_LOADED=false;LI={};S.playerStats={};window._liLoading=false;
  updateSyncStatus();
  await loadAllData();
  showToast('Data refreshed ✓');
}

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

  if(!matches.length){results.innerHTML='<div style="padding:12px;font-size:12px;color:var(--text3)">No players found</div>';return;}
  const posMapS=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
  results.innerHTML=matches.map(({id,p,name,val})=>{
    const meta=LI_LOADED?LI.playerMeta?.[id]:null;
    const isRookie=meta?.source==='FC_ROOKIE';
    const {col}=tradeValueTier(val);
    return`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s" onclick="openPlayerModal('${id}');$('player-search-results').style.display='none';$('player-search-in').value=''" onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background=''">
      <img src="https://sleepercdn.com/content/nfl/players/${id}.jpg" style="width:28px;height:28px;border-radius:50%" onerror="this.style.display='none'" loading="lazy"/>
      <div style="flex:1;overflow:hidden">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}${isRookie?'<span style="font-size:11px;color:var(--blue);margin-left:4px">ROOKIE</span>':''}</div>
        <div style="font-size:12px;color:var(--text3)">${posMapS(p.position)||'?'} · ${p.team||'FA'} · Age ${p.age||'?'}</div>
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
});

// ── Home Snapshot ──────────────────────────────────────────────
function renderHomeSnapshot(){
  const my=myR();if(!my)return;
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const sorted=[...S.rosters].sort((a,b)=>(b.settings?.wins||0)-(a.settings?.wins||0));
  const s=my.settings||{};
  const faab=getFAAB();
  const sessions=loadConvMemory();
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

  const el=$('home-snapshot');if(!el)return;
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <div style="font-size:20px;font-weight:800;color:var(--text);letter-spacing:-.03em">${S.user?.display_name||'GM'}</div>
        <div style="font-size:13px;color:var(--text3);margin-top:2px">${league?.name||''}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:12px;flex-wrap:wrap">
        <div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${s.wins||0}-${s.losses||0}</div>
          <div style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Record</div>
        </div>
        <div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:${myAvg!=='—'&&parseFloat(myAvg)>=parseFloat(leagueAvg)?'var(--green)':'var(--amber)'};font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${myAvg}</div>
          <div style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">My PPG</div>
        </div>
        <div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:var(--text2);font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">${leagueAvg}</div>
          <div style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">Lg Avg</div>
        </div>
        ${faab.budget>0?`<div style="text-align:center;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:8px 14px;min-width:56px">
          <div style="font-size:22px;font-weight:800;color:var(--green);font-family:'JetBrains Mono',monospace;letter-spacing:-.03em">$${faab.remaining}</div>
          <div style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;font-weight:600">FAAB</div>
        </div>`:''}
      </div>
    </div>
    ${lastSession?`<div style="background:rgba(124,107,248,.06);border:1px solid rgba(124,107,248,.15);border-radius:var(--r);padding:10px 14px;font-size:12px;color:var(--text3);line-height:1.5">
      <span style="color:var(--accent);font-weight:700">Last session (${lastSession.date}):</span> ${lastSession.text}
    </div>`:''}`;
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
  const leagueAvgByPos={};
  positions.forEach(pos=>{
    let totalVal2=0,totalCount=0;
    S.rosters.forEach(r=>{
      (r.players||[]).forEach(pid=>{
        if(pM(pPos(pid))===pos){
          const v=dynastyValue(pid);
          if(v>0){totalVal2+=v;totalCount++;}
        }
      });
    });
    leagueAvgByPos[pos]=totalCount>0?Math.round(totalVal2/totalCount):1500;
  });

  const gradeColor=(avgVal,pos)=>{
    const la=leagueAvgByPos[pos]||1500;
    const pct=avgVal/la;
    return pct>=1.4?'var(--green)':pct>=1.0?'var(--accent)':pct>=0.7?'var(--amber)':'var(--red)';
  };
  const gradeLetter=(avgVal,pos)=>{
    const la=leagueAvgByPos[pos]||1500;
    const pct=avgVal/la;
    return pct>=1.4?'A':pct>=1.1?'B':pct>=0.85?'C':pct>=0.6?'D':'F';
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

  // ── Health Score (War Room formula — exact 1:1 port) ──────────
  const WEEKLY_TARGET_H=243;
  const POS_WEIGHTS_H={QB:14,RB:14,WR:14,TE:8,K:3,DL:13,LB:10,DB:12};
  const TOTAL_WEIGHT_H=Object.values(POS_WEIGHTS_H).reduce((a,b)=>a+b,0);
  const MIN_STARTER_QUALITY_H={QB:2,RB:3,WR:3,TE:2,K:1,DL:4,LB:5,DB:4};
  const NFL_STARTER_POOL_H={QB:32,RB:40,WR:64,TE:32,K:32,DL:64,LB:64,DB:64};

  // Build NFL starter sets — rank ALL players by season pts, take top N per position
  // This matches War Room's calcNflStarterSet exactly
  const nflStarterSet={};
  const depthPositions=['QB','RB','WR','TE','K','DL','LB','DB'];
  depthPositions.forEach(pos=>{
    const poolSize=NFL_STARTER_POOL_H[pos]||32;
    const allAtPos=[];
    Object.keys(S.players).forEach(pid=>{
      const p=S.players[pid];if(!p)return;
      if(pM(p.position)!==pos)return;
      if(!p.team)return; // skip released/cut
      const pts=S.playerStats?.[pid]?.seasonTotal||S.playerStats?.[pid]?.prevTotal||0;
      if(pts>0)allAtPos.push({pid,pts});
    });
    allAtPos.sort((a,b)=>b.pts-a.pts);
    nflStarterSet[pos]=new Set(allAtPos.slice(0,poolSize).map(p=>p.pid));
  });

  // Position assessment — count how many of MY players are NFL-starter quality
  const posAssessment={};
  depthPositions.forEach(pos=>{
    const myAtPos=(my.players||[]).filter(pid=>pM(pPos(pid))===pos);
    const minQuality=MIN_STARTER_QUALITY_H[pos]||1;
    const starterSet=nflStarterSet[pos]||new Set();
    const nflStarters=myAtPos.filter(pid=>starterSet.has(pid)).length;
    posAssessment[pos]={nflStarters,minQuality,actual:myAtPos.length};
  });

  // Scoring component (60%) — uses hardcoded 243 target like War Room
  const weeklyTarget=WEEKLY_TARGET_H;
  const scoringScore=Math.min(60,(myContenderPPG/weeklyTarget)*60);

  // Coverage component (40%) — weighted by position importance, using NFL starter ratio
  let coverageScore=0;
  const rosterSlots=league?.roster_positions||[];
  depthPositions.forEach(pos=>{
    const pa=posAssessment[pos];if(!pa)return;
    const ratio=Math.min(1,pa.nflStarters/(pa.minQuality||1));
    coverageScore+=ratio*((POS_WEIGHTS_H[pos]||0)/TOTAL_WEIGHT_H)*40;
  });

  // Projection bonus: elite teams score above target
  const projBonus=myContenderPPG>weeklyTarget+10?3:myContenderPPG>=weeklyTarget?1:0;
  const healthScore=Math.min(100,Math.round(scoringScore+coverageScore+projBonus));

  // Tier classification (War Room tiers)
  let hTier,hCol;
  if(myContenderPPG>0){
    if(myContenderPPG>weeklyTarget+10){hTier='Elite';hCol='var(--green)';}
    else if(myContenderPPG>=weeklyTarget-15){hTier='Contender';hCol='var(--accent)';}
    else if(myContenderPPG>=weeklyTarget*0.85){hTier='Crossroads';hCol='var(--amber)';}
    else{hTier='Rebuilding';hCol='var(--red)';}
  }else{
    if(coverageScore>=36){hTier='Contender';hCol='var(--accent)';}
    else if(coverageScore>=26){hTier='Crossroads';hCol='var(--amber)';}
    else{hTier='Rebuilding';hCol='var(--red)';}
  }

  // Panic meter (0-5)
  let panic=0;
  if(myContenderPPG>0&&myContenderPPG<weeklyTarget*0.85)panic+=2;
  else if(myContenderPPG>0&&myContenderPPG<weeklyTarget)panic+=1;
  const criticals=depthPositions.filter(pos=>{
    const pa=posAssessment[pos];if(!pa)return false;
    return pa.nflStarters<pa.minQuality;
  }).length;
  if(criticals>=3)panic+=2;else if(criticals>=1)panic+=1;
  const played=(my.settings?.wins||0)+(my.settings?.losses||0)+(my.settings?.ties||0);
  if(played>0&&(my.settings?.losses||0)/played>0.6)panic+=1;
  panic=Math.min(5,panic);

  const scoringPct=Math.min(100,Math.round((myContenderPPG/weeklyTarget)*100));
  const depthPct=Math.round(coverageScore/40*100);

  const cCol=myContenderRank<=3?'var(--green)':myContenderRank<=8?'var(--accent)':'var(--amber)';
  const dCol=myValRank<=3?'var(--green)':myValRank<=8?'var(--accent)':'var(--amber)';
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Health Score</div>
      <div style="display:flex;align-items:baseline;gap:6px">
        <span style="font-size:26px;font-weight:800;color:${hCol};font-family:'JetBrains Mono',monospace">${healthScore}</span>
        <span style="font-size:12px;font-weight:600;color:${hCol}">${hTier}</span>
        ${panic>=3?'<span style="font-size:11px;color:var(--red);margin-left:4px">🔥 Panic '+panic+'/5</span>':''}
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">Scoring ${scoringPct}% · Depth ${depthPct}%${criticals?' · '+criticals+' pos gap'+(criticals>1?'s':''):''}</div>
      <div style="background:var(--bg4);border-radius:2px;height:3px;margin-top:4px;overflow:hidden"><div style="width:${healthScore}%;height:100%;background:${hCol};border-radius:2px"></div></div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Contender</div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:22px;font-weight:800;color:${cCol};font-family:'JetBrains Mono',monospace">#${myContenderRank}</span>
        <span style="font-size:12px;color:var(--text2)">/${teams}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">${myContenderPPG.toFixed(1)} starter PPG</div>
      <div style="background:var(--bg4);border-radius:2px;height:3px;margin-top:4px;overflow:hidden"><div style="width:${Math.round(myContenderPPG/topContender*100)}%;height:100%;background:${cCol};border-radius:2px"></div></div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Dynasty</div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:22px;font-weight:800;color:${dCol};font-family:'JetBrains Mono',monospace">#${myValRank}</span>
        <span style="font-size:12px;color:var(--text2)">/${teams}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">${totalVal.toLocaleString()} DHQ</div>
      <div style="background:var(--bg4);border-radius:2px;height:3px;margin-top:4px;overflow:hidden"><div style="width:${Math.round(totalVal/topVal*100)}%;height:100%;background:var(--accent);border-radius:2px"></div></div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:10px 12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Draft Capital</div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:22px;font-weight:800;color:var(--text);font-family:'JetBrains Mono',monospace">${totalPicks}</span>
        <span style="font-size:12px;color:var(--text2)">picks</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">${myPickCount.map(p=>`'${String(p.yr).slice(2)}: ${p.count}`).join(' · ')}</div>
    </div>
  </div>`;

  // Position grades grid
  html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Position Grades</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">`;
  positions.forEach(pos=>{
    const g=posGroups[pos];if(!g||!g.count)return;
    const avgVal=Math.round(g.total/g.count);
    const topP=g.top[0];
    const topCol=topP?tradeValueTier(topP.val).col:'var(--text2)';
    html+=`<div style="background:var(--bg3);border-radius:var(--r);padding:8px 10px;min-height:62px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:13px;font-weight:700">${pos}</span>
        <span style="font-size:15px;font-weight:800;color:${gradeColor(avgVal,pos)}">${gradeLetter(avgVal,pos)}</span>
      </div>
      <div style="font-size:12px;color:var(--text2)">${g.count}p · ${avgVal.toLocaleString()}</div>
      ${topP?`<div style="font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${topP.name} <span style="color:${topCol};font-family:'JetBrains Mono',monospace;font-size:11px">${topP.val.toLocaleString()}</span></div>`:''}
    </div>`;
  });
  html+=`</div></div>`;

  // Crown jewels
  const topPlayers=players.map(pid=>({pid,val:dynastyValue(pid),name:pName(pid),pos:pM(pPos(pid)),age:pAge(pid)}))
    .filter(p=>p.val>0).sort((a,b)=>b.val-a.val).slice(0,5);
  if(topPlayers.length){
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Crown Jewels</div>`;
    html+=topPlayers.map((p,i)=>{
      const {col}=tradeValueTier(p.val);
      const meta=LI_LOADED?LI.playerMeta?.[p.pid]:null;
      const peakStr=meta?.peakYrsLeft>0?meta.peakYrsLeft+'yr peak':'past peak';
      const reasons=[];
      if(meta?.peakYrsLeft>=4)reasons.push('long peak window');
      else if(meta?.peakYrsLeft>=2)reasons.push('in prime');
      if(meta?.starterSeasons>=3)reasons.push(meta.starterSeasons+'yr starter');
      if(meta?.sitMult>=1.20&&p.age<=25)reasons.push('elite young producer');
      const trend=meta?.trend||0;
      if(trend>=20)reasons.push('trending up');
      else if(trend<=-20)reasons.push('declining');
      const reasonStr=reasons.length?reasons.slice(0,2).join(', '):'';
      return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0${i<4?';border-bottom:1px solid var(--border)':''};cursor:pointer" onclick="openPlayerModal('${p.pid}')">
        <span style="font-size:12px;font-weight:700;color:var(--text3);min-width:14px">${i+1}</span>
        <img src="https://sleepercdn.com/content/nfl/players/${p.pid}.jpg" style="width:24px;height:24px;border-radius:50%" onerror="this.style.display='none'" loading="lazy"/>
        <div style="flex:1;overflow:hidden">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:12px;color:var(--text3)">${p.pos} · ${p.age} · ${peakStr}${reasonStr?' · '+reasonStr:''}</div>
        </div>
        <span style="font-size:13px;font-weight:700;color:${col};font-family:'JetBrains Mono',monospace">${p.val.toLocaleString()}</span>
      </div>`;
    }).join('');
    html+=`</div>`;
  }

  el.innerHTML=html;
}

// homeAsk: defined in ai-chat.js
// goAsk: defined in ai-chat.js
// expandChat: defined in ai-chat.js

// ── Strategy Walkthrough ───────────────────────────────────────
const STRATEGY_QUESTIONS=[
  {q:"First, are you trying to **win the championship this year**, or are you **rebuilding for the future**?",opts:['Win now','Rebuild','Competing but flexible']},
  {q:"How aggressive are you with trades? Do you prefer to **hold and develop**, or are you always looking for a deal?",opts:['Hold and develop','Active trader','Only if the value is right']},
  {q:"How do you feel about **IDP players** on your roster? Are they important to your strategy, or do you mostly focus on offense?",opts:['IDP is a priority','Offense first, IDP secondary','I draft IDP late']},
  {q:"When it comes to the **rookie draft**, do you prefer to draft the best player available (BPA), or do you target specific positions of need?",opts:['Best player available','Draft for need','Mix of both']},
  {q:"Last one — how do you feel about **aging veteran players** on your roster? Are you comfortable riding them while they produce, or do you want to sell high before they decline?",opts:['Ride them until the wheels fall off','Sell high when I can','Depends on the player']},
];

async function startStrategyWalkthrough(){
  if(!(S.apiKey||(typeof hasAnyAI==='function'&&hasAnyAI()))||localStorage.getItem('dhq_strategy_done'))return;
  const msgs=$('home-chat-msgs');if(!msgs)return;

  msgs.innerHTML+=`<div class="hc-msg-a" style="font-size:13px;line-height:1.6">
    <div style="font-weight:700;color:var(--accent);margin-bottom:4px">Welcome to ReconAI! Let's set up your strategy.</div>
    I'll ask you 5 quick questions so I can tailor my advice to how you like to play. This takes about 30 seconds.
  </div>`;

  const answers=[];
  for(let i=0;i<STRATEGY_QUESTIONS.length;i++){
    const sq=STRATEGY_QUESTIONS[i];
    msgs.innerHTML+=`<div class="hc-msg-a" style="font-size:13px;line-height:1.6;margin-top:6px">${sq.q}</div>`;
    msgs.innerHTML+=`<div id="strat-opts-${i}" style="display:flex;gap:6px;flex-wrap:wrap;padding:6px 0">${sq.opts.map((o,j)=>`<button class="chip" style="font-size:12px" onclick="selectStrategyAnswer(${i},${j})">${o}</button>`).join('')}</div>`;
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
  try{localStorage.setItem('dhq_strategy',JSON.stringify(strategy));localStorage.setItem('dhq_strategy_done','1');}catch(e){}

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

${buildCtx()}

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
  try{return JSON.parse(localStorage.getItem('dhq_strategy')||'null');}catch(e){return null;}
}

// ── Player Modal ───────────────────────────────────────────────
// _newsCache already declared in ai-chat.js (Grok news) — reuse it for player news too
// Both caches key by player ID so they don't conflict

async function fetchPlayerNews(playerId){
  if(_newsCache[playerId])return _newsCache[playerId];
  const p=S.players[playerId];if(!p)return null;
  const name=p.first_name+' '+p.last_name;
  const pos=p.position||'';
  const team=p.team||'FA';
  const result=await callGrokNews(`What is the latest news about ${name} (${pos}, ${team}) specifically? ONLY discuss ${name}, no other players. Include any recent trades, signings, injuries, or dynasty fantasy football community reaction from X/Twitter.`);
  if(result)_newsCache[playerId]=result;
  return result;
}

async function loadPlayerNewsNow(playerId){
  const newsEl=$('pm-news');if(!newsEl)return;
  newsEl.innerHTML='<div style="color:var(--text3);font-size:12px;display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></span>Loading from X...</div>';
  try{
    const news=await fetchPlayerNews(playerId);
    if(news){
      newsEl.innerHTML=`<div style="font-size:13px;color:var(--text2);line-height:1.5">${news.replace(/\n/g,'<br>')}</div><div style="font-size:12px;color:var(--text3);margin-top:4px">via Grok · X/Twitter</div>`;
    }else{
      newsEl.innerHTML='<div style="color:var(--text3);font-size:12px">No recent news found for this player.</div>';
    }
  }catch(e){
    newsEl.innerHTML='<div style="color:var(--red);font-size:12px">Error loading news. Check your xAI key in Settings.</div>';
  }
}

function openPlayerModal(playerId){
  const p=S.players[playerId];if(!p)return;
  window._pmPid=playerId;
  const pos=p.position||'?';const age=p.age||26;const val=dynastyValue(playerId);
  const exp=p.years_exp??0;
  const peakMap={QB:[27,31],RB:[23,26],WR:[25,29],TE:[25,29],DL:[24,29],LB:[24,28],DB:[24,28]};
  const [pLo,pHi]=(()=>{ const pos=pPos(playerId); const peaks={QB:[27,33],RB:[22,26],WR:[24,29],TE:[25,30],DL:[24,29],LB:[23,28],DB:[24,29]}; return peaks[pos]||[24,29]; })();
  const peak=Math.round((pLo+pHi)/2);
  const onMyTeam=(myR()?.players||[]).includes(String(playerId));
  const stats=S.playerStats?.[playerId]||{};
  const proj=S.playerProj?.[playerId];
  const {tier,col}=tradeValueTier(val);
  const pk=peakYears(playerId);
  const dcLbl=getDcLabel(playerId);
  const posRank=S.posRanks?.[playerId];

  // Banner
  $('pm-photo').src=`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
  $('pm-photo').style.display='';
  $('pm-initials').textContent=((p.first_name||'?')[0]+(p.last_name||'?')[0]).toUpperCase();
  $('pm-initials').style.display='none';
  $('pm-pos-badge').textContent=pos;
  $('pm-pos-badge').className='';
  $('pm-pos-badge').style.cssText=`position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;${getPosBadgeStyle(pos)}`;
  $('pm-name').innerHTML=`${pName(playerId)} ${onMyTeam?'<span style="font-size:13px;color:var(--green);font-weight:400">✓ on roster</span>':''}`;
  $('pm-bio').innerHTML=`${pos} · ${fullTeam(p.team)} · Age ${age} · ${exp}yr exp${p.college?' · '+p.college:''}`;
  // IDP scoring badge
  const isIDPModal=['DL','LB','DB'].includes(pos);
  const scModal=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const rawModal=S.playerStats?.[playerId]?.prevRawStats;
  const idpBadge=$('pm-idp-badge');
  if(idpBadge)idpBadge.innerHTML='';
  if(isIDPModal&&rawModal){
    const gp=rawModal.gp||17;
    const idpPPGModal=+(calcIDPScore(rawModal,scModal)/Math.max(1,gp)).toFixed(1);
    const idpBadge2=$('pm-idp-badge');
    if(idpBadge2&&idpPPGModal>0){
      const sacks=(rawModal.idp_sack||0).toFixed(1);
      const tkl=Math.round((rawModal.idp_tkl_solo||0)+(rawModal.idp_tkl_ast||0));
      const ints=rawModal.idp_int||0;
      const pds=rawModal.idp_pass_def||0;
      const ff=rawModal.idp_ff||0;
      const qbhits=rawModal.idp_qb_hit||0;
      const statParts=[];
      if(sacks>0)statParts.push(sacks+' sacks');
      if(ints>0)statParts.push(ints+' INT');
      if(pds>0)statParts.push(pds+' PD');
      if(qbhits>0)statParts.push(qbhits+' QBhit');
      if(tkl>0)statParts.push(tkl+' tkl');
      if(ff>0)statParts.push(ff+' FF');
      idpBadge2.innerHTML=
        '<div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;padding:8px 12px;margin:6px 0">'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        +'<span style="font-size:15px;font-weight:800;color:var(--green)">⚡ '+idpPPGModal+' IDP PPG</span>'
        +'<span style="font-size:11px;color:var(--text3)">2024 season ('+gp+'gp)</span>'
        +'</div>'
        +(statParts.length?'<div style="font-size:12px;color:var(--text2);margin-top:4px">'+statParts.join(' · ')+'</div>':'')
        +'</div>';
    }
  }
  const idpPPGModal=isIDPModal&&rawModal?+(calcIDPScore(rawModal,scModal)/Math.max(1,rawModal.gp||17)).toFixed(1):null;

  // Value insight blurb
  const insightEl=$('pm-insight');
  if(insightEl){
    const meta=LI_LOADED?LI.playerMeta?.[playerId]:null;
    if(meta&&val>0){
      const mappedPos=meta.pos||pos;
      const [peakStart,peakEnd]=(LI.peakWindows||{})[mappedPos]||[23,29];
      const yrsPast=Math.max(0,age-peakEnd);
      const trend=meta.trend||0;
      const gp=meta.recentGP||17;
      const yrsExp=p.years_exp||0;

      let blurb='',blurbColor='var(--amber)';

      if(meta.source==='FC_ROOKIE'){
        blurb=`Incoming rookie with ${meta.peakYrsLeft||'?'} peak years ahead. Value based on DHQ dynasty consensus — no NFL production yet.`;
        blurbColor='var(--green)';
      }else if(meta.sitMult<=0.45){
        blurb=`Not rostered by anyone in the league and no NFL team. ${yrsPast>=2?'Likely retired or out of football.':'Needs a landing spot to have any value.'}`;
        blurbColor='var(--red)';
      }else if(yrsPast>=5){
        const extra=gp<=12?` Only played ${gp} games last year.`:'';
        const trendNote=trend<=-15?` Production down ${Math.abs(trend)}%.`:'';
        blurb=`${yrsExp>8?yrsExp+'-year veteran, ':''}${yrsPast} years past ${mappedPos} prime at age ${age}. On borrowed time — sell if anyone's buying.${extra}${trendNote}`;
        blurbColor='var(--red)';
      }else if(yrsPast>=2){
        const trendNote=trend<=-20?` PPG dropped ${Math.abs(trend)}% last season.`:trend>=15?` Still trending up ${trend}% — defying age.`:'';
        const gpNote=gp<=12?` Durability concern — only ${gp} games.`:'';
        blurb=`${yrsPast} years past ${mappedPos} peak at age ${age}. ${meta.starterSeasons>=4?'Proven producer but ':''}Dynasty value declining.${trendNote}${gpNote}`;
        blurbColor='var(--red)';
      }else if(yrsPast===1){
        const trendNote=trend<=-20?` PPG fell ${Math.abs(trend)}% — the decline may be starting.`:trend>=15?` Still improving (+${trend}%) — could have more in the tank.`:' Watch closely this season.';
        blurb=`Just exited ${mappedPos} peak window at age ${age}.${trendNote}`;
        blurbColor='var(--amber)';
      }else if(age<=peakStart&&meta.peakYrsLeft>=5){
        const prodNote=meta.starterSeasons>=2?` Already a ${meta.starterSeasons}-year starter at just ${age} — rare.`:meta.starterSeasons===1?' Showed starter-level production in year one.':' Still developing.';
        const trendNote=trend>=20?` PPG up ${trend}% — breakout trajectory.`:'';
        blurb=`${meta.peakYrsLeft} peak years ahead at age ${age}.${prodNote}${trendNote} Dynasty stock rising.`;
        blurbColor='var(--green)';
      }else if(meta.peakYrsLeft>=3){
        const eliteNote=meta.sitMult>=1.30&&age<=25?' Elite young producer — exactly what dynasty is about.':'';
        const trendNote=trend>=20?` PPG up ${trend}% year-over-year.`:'';
        blurb=`In prime with ${meta.peakYrsLeft} peak years left. ${meta.starterSeasons>=3?meta.starterSeasons+'-year proven starter. ':''}${eliteNote}${trendNote}`;
        blurbColor='var(--green)';
      }else if(meta.peakYrsLeft>=1){
        const trendNote=trend<=-20?` Production declining (${trend}%).`:'';
        blurb=`${meta.peakYrsLeft} peak year${meta.peakYrsLeft>1?'s':''} left at age ${age}. Window closing${meta.starterSeasons>=3?' but still a reliable starter':''}.${trendNote}`;
        blurbColor='var(--amber)';
      }else{
        blurb=`At the edge of ${mappedPos} peak at age ${age}. Value peaks now — it only goes down from here.`;
        blurbColor='var(--amber)';
      }

      if(gp<=8&&gp>0&&!blurb.includes('games'))blurb+=` ⚠️ Only ${gp} games last season.`;

      if(blurb){
        const bg=blurbColor==='var(--red)'?'rgba(248,113,113,.06)':blurbColor==='var(--green)'?'rgba(52,211,153,.06)':'rgba(251,191,36,.06)';
        insightEl.innerHTML=`<div style="font-size:12px;color:${blurbColor};line-height:1.5;padding:8px 12px;background:${bg};border-radius:8px">${blurb}</div>`;
      }else insightEl.innerHTML='';
    }else insightEl.innerHTML='';
  }

  // Tags
  const tags=[];
  if(p.injury_status)tags.push(`<span style="background:var(--redL);color:var(--red);font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px">${p.injury_status}</span>`);
  if(dcLbl)tags.push(`<span style="background:var(--bg4);color:var(--text2);font-size:11px;padding:2px 7px;border-radius:20px">${dcLbl}</span>`);
  if(posRank)tags.push(`<span style="background:var(--accentL);color:var(--accent);font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px">${pos}${posRank} in league</span>`);
  if(p.height||p.weight)tags.push(`<span style="background:var(--bg4);color:var(--text3);font-size:11px;padding:2px 7px;border-radius:20px">${[(p.height?Math.floor((p.height||0)/12)+"'"+(( p.height||0)%12)+'"':''),p.weight?p.weight+'lbs':''].filter(Boolean).join(' · ')}</span>`);
  $('pm-tags').innerHTML=tags.join('');

  // Stats bar
  const prevYr=String(parseInt(S.season)-1).slice(2);
  const fcRankData=getPlayerRank(playerId);
  const fcTrend=fcRankData?.trend||0;
  const trendLabel=fcTrend>100?'▲ Rising':fcTrend<-100?'▼ Falling':'Stable';
  const trendCol=fcTrend>100?'var(--green)':fcTrend<-100?'var(--red)':'var(--text3)';
  const statBoxes=[
    {val:val>0?val.toLocaleString():'—',lbl:'DHQ Value',col:col},
    {val:fcRankData?'#'+fcRankData.pos:'—',lbl:'Pos Rank',col:'var(--accent)'},
    {val:stats.prevAvg?.toFixed(1)||stats.seasonAvg?.toFixed(1)||'—',lbl:`'${prevYr} PPG`,col:stats.prevAvg>15?'var(--green)':stats.prevAvg&&stats.prevAvg<8?'var(--red)':'var(--text)'},
    {val:stats.prevTotal?Math.round(stats.prevTotal):'—',lbl:`'${prevYr} Total`,col:'var(--text2)'},
    {val:trendLabel,lbl:'30d Trend',col:trendCol},
  ];
  $('pm-stats-bar').innerHTML=statBoxes.map(s=>`<div class="pm-stat-box"><div class="pm-stat-box-val" style="color:${s.col}">${s.val}</div><div class="pm-stat-box-lbl">${s.lbl}</div></div>`).join('');

  // Age curve
  const ages=Array.from({length:17},(_,i)=>i+20);
  const segColor=a=>{
    if(a<pLo-3)return'rgba(96,165,250,.3)';
    if(a<pLo)return'rgba(52,211,153,.5)';
    if(a>=pLo&&a<=pHi)return'rgba(52,211,153,.8)';
    if(a<=pHi+2)return'rgba(251,191,36,.5)';
    return'rgba(248,113,113,.4)';
  };
  $('pm-curve').innerHTML=ages.map(a=>`<div class="acb-seg" style="background:${segColor(a)};opacity:${a===age?1:0.6};outline:${a===age?'2px solid white':'none'};outline-offset:-1px" title="Age ${a}">${a===age?age:''}</div>`).join('');
  $('pm-curve-lbl').innerHTML=`<span>20</span><span>Peak ${pLo}–${pHi}</span><span>36</span>`;
  $('pm-peak-tag').textContent=`Currently age ${age} · ${pk.label} · ${pk.desc}`;

  // Sparkline
  const weeklyPts=stats.weeklyPts||[];
  if(weeklyPts.length){
    $('pm-spark-wrap').style.display='block';
    const maxWk=Math.max(...weeklyPts,1);
    $('pm-spark').innerHTML=weeklyPts.map(w=>{
      const h=Math.max(3,Math.round((w/maxWk)*36));
      const col2=w===Math.max(...weeklyPts)?'var(--green)':w===Math.min(...weeklyPts)?'var(--red)':'var(--accent)';
      return`<div style="flex:1;height:${h}px;border-radius:2px 2px 0 0;background:${col2};opacity:.8" title="${w.toFixed(1)}pts"></div>`;
    }).join('');
    $('pm-spark-lbl').innerHTML=weeklyPts.map((_,i)=>`<span style="flex:1;text-align:center">W${i+1}</span>`).join('');
  }else{$('pm-spark-wrap').style.display='none';}

  // Trade value + peak
  $('pm-trade-val').textContent=val>0?val.toLocaleString():LI_LOADED?'Not valued':'Loading...';
  $('pm-trade-tier').innerHTML=val>0?`<span style="color:${col}">${tier}</span>${fcRankData?' · Overall #'+fcRankData.overall:''}`:LI_LOADED?'<span style="color:var(--text3)">No DHQ production data</span>':'<span style="color:var(--text3)">DHQ engine loading...</span>';
  $('pm-peak-years').textContent=pk.label;
  $('pm-peak-desc').textContent=pk.desc;

  // Action buttons
  $('pm-ask-btn').textContent='Scout Report ↗';
  $('pm-ask-btn').onclick=()=>goAsk(`SEARCH FOR CURRENT INFO FIRST: Look up ${pName(playerId)} ${pos} ${fullTeam(p.team)} current situation, depth chart, and dynasty outlook for 2026. Then give a dynasty buy/sell/hold recommendation with current team context, role, and trade value. DHQ value: ${dynastyValue(playerId).toLocaleString()}.`);
  $('pm-trade-btn').textContent=onMyTeam?'Trade Finder ↗':'Trade for ↗';
  $('pm-trade-btn').onclick=()=>{
    const ownerCtx=LI_LOADED&&LI.ownerProfiles?Object.entries(LI.ownerProfiles).filter(([rid])=>parseInt(rid)!==S.myRosterId).map(([rid,p2])=>{
      if(!p2.trades)return null;
      const name=S.leagueUsers.find(u=>{const r=S.rosters.find(r2=>r2.roster_id===parseInt(rid));return r&&u.user_id===r.owner_id;})?.display_name||'Team';
      return`${name}(${p2.dna}${p2.targetPos?',wants '+p2.targetPos:''})`;
    }).filter(Boolean).slice(0,6).join('; '):'';
    const histCtx=LI.playerTradeHistory?.[playerId]?.length?`This player has been traded ${LI.playerTradeHistory[playerId].length} time(s) in this league.`:'';
    if(onMyTeam){
      goAsk(`Find the best trade partner for ${pName(playerId)} (${pos}, DHQ ${dynastyValue(playerId).toLocaleString()}). ${histCtx} Consider which owner needs a ${pos} and what I should ask for in return. Owner profiles: ${ownerCtx}. Draft a Sleeper-ready trade message.`);
    }else{
      goAsk(`I want to acquire ${pName(playerId)} (${pos}, DHQ ${dynastyValue(playerId).toLocaleString()}). ${histCtx} Who owns them and what would be a fair offer? Owner profiles: ${ownerCtx}. Draft a Sleeper-ready trade message.`);
    }
  };

  // Show modal
  const modal=$('player-modal');
  modal.style.display='flex';
  modal.onclick=e=>{if(e.target===modal)closePlayerModal();};

  // News
  const xaiKey=localStorage.getItem('dynastyhq_xai_key')||(S.aiProvider==='grok'?S.apiKey:'');
  if(_newsCache[playerId]){
    $('pm-news').innerHTML=`<div style="font-size:13px;color:var(--text2);line-height:1.5">${_newsCache[playerId].replace(/\n/g,'<br>')}</div><div style="font-size:12px;color:var(--text3);margin-top:4px">via Grok · X/Twitter (cached)</div>`;
  }else if(xaiKey){
    $('pm-news').innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:2px 0">
      <button class="btn btn-sm" onclick="loadPlayerNewsNow('${playerId}')" style="font-size:12px">Load news from X ↗</button>
      <span style="font-size:11px;color:var(--text3)">Powered by Grok</span>
    </div>`;
  }else{
    $('pm-news').innerHTML='<div style="color:var(--text3);font-size:12px;padding:4px 0">Add an xAI key in Settings for live X/Twitter news.</div>';
  }
  // Load career stats
  const cardWrap=$('pm-card-stats');if(cardWrap)cardWrap.style.display='none';
  loadPlayerCardStats(playerId);
}

function getPosBadgeStyle(pos){
  const styles={QB:'background:rgba(96,165,250,.2);color:#60a5fa',RB:'background:rgba(52,211,153,.2);color:#34d399',WR:'background:rgba(108,99,245,.2);color:#a78bfa',TE:'background:rgba(251,191,36,.2);color:#fbbf24',DL:'background:rgba(251,146,60,.2);color:#fb923c',LB:'background:rgba(167,139,250,.2);color:#a78bfa',DB:'background:rgba(244,114,182,.2);color:#f472b6',K:'background:rgba(139,143,154,.15);color:#8b8f9a',DEF:'background:rgba(248,113,113,.15);color:#f87171'};
  return styles[pos]||'background:rgba(74,78,90,.2);color:#8b8f9a';
}

async function loadPlayerCardStats(playerId){
  const p=S.players[playerId];if(!p)return;
  const pos=p.position;
  const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const wrap=$('pm-card-stats');const inner=$('pm-card-stats-inner');
  if(!wrap||!inner)return;

  const pStats=S.playerStats?.[playerId]||{};
  const curRaw=pStats.curRawStats||null;
  const prevRaw=pStats.prevRawStats||null;
  const curYear=parseInt(S.season)||2025;
  const prevYear=curYear-1;

  if(!curRaw&&!prevRaw){
    wrap.style.display='block';
    inner.innerHTML='<div style="color:var(--text3);font-size:12px;padding:4px 0">Stats load automatically with your roster. If empty, check the Stats tab to load data.</div>';
    return;
  }

  wrap.style.display='block';

  const isIDP=['DL','LB','DB','DE','DT','CB','S'].includes(pos);
  const isQB=pos==='QB';
  const isRB=pos==='RB';
  const isK=pos==='K';

  let cols=[];
  if(isQB)cols=[{k:'gp',l:'GP'},{k:'pass_cmp',l:'CMP'},{k:'pass_att',l:'ATT'},{k:'pass_yd',l:'YDS'},{k:'pass_td',l:'TD'},{k:'pass_int',l:'INT'},{k:'rush_yd',l:'RUSH'},{k:'fpts',l:'FPTS'}];
  else if(isRB)cols=[{k:'gp',l:'GP'},{k:'rush_att',l:'ATT'},{k:'rush_yd',l:'YDS'},{k:'rush_td',l:'TD'},{k:'rec',l:'REC'},{k:'rec_yd',l:'REC YD'},{k:'rec_tgt',l:'TGT'},{k:'fpts',l:'FPTS'}];
  else if(['WR','TE'].includes(pos))cols=[{k:'gp',l:'GP'},{k:'rec_tgt',l:'TGT'},{k:'rec',l:'REC'},{k:'rec_yd',l:'YDS'},{k:'rec_td',l:'TD'},{k:'rush_yd',l:'RUSH'},{k:'fpts',l:'FPTS'}];
  else if(isK)cols=[{k:'gp',l:'GP'},{k:'fgm',l:'FGM'},{k:'fga',l:'FGA'},{k:'fgm_50p',l:'50+'},{k:'xpm',l:'XPM'},{k:'xpa',l:'XPA'},{k:'fpts',l:'FPTS'}];
  else if(isIDP)cols=[{k:'gp',l:'GP'},{k:'idp_tkl',l:'TKL'},{k:'idp_sack',l:'SACK'},{k:'idp_int',l:'INT'},{k:'idp_pass_def',l:'PD'},{k:'idp_qb_hit',l:'QBH'},{k:'idp_ff',l:'FF'},{k:'fpts',l:'FPTS'}];
  else cols=[{k:'gp',l:'GP'},{k:'fpts',l:'FPTS'}];

  const gridCols=`36px 28px ${cols.map(()=>'1fr').join(' ')}`;

  const toRow=(raw,yr)=>{
    if(!raw||!Object.keys(raw).length)return null;
    const g=(...keys)=>{for(const k of keys){if(raw[k]!=null&&raw[k]!==0)return raw[k];}return 0;};
    const gp=g('gp','games_played')||Math.round((pStats.weeklyPts?.length||pStats.prevWeeklyPts?.length||1));
    const fpts=yr===curYear?(pStats.seasonTotal||calcFantasyPts(raw,sc)):(pStats.prevTotal||calcFantasyPts(raw,sc));
    return{
      yr,gp,fpts:+fpts.toFixed(1),
      pass_cmp:g('pass_cmp'),pass_att:g('pass_att'),pass_yd:g('pass_yd'),pass_td:g('pass_td'),pass_int:g('pass_int'),
      rush_att:g('rush_att'),rush_yd:g('rush_yd'),rush_td:g('rush_td'),
      rec:g('rec'),rec_yd:g('rec_yd'),rec_td:g('rec_td'),
      rec_tgt:g('rec_tgt','targets','tgt'),
      idp_tkl:g('idp_tkl_solo','tkl_solo')+g('idp_tkl_ast','tkl_ast'),
      idp_sack:g('idp_sack','sack'),
      idp_int:g('idp_int','def_int','int'),
      idp_pass_def:g('idp_pass_def','def_pass_def','pass_defended'),
      idp_qb_hit:g('idp_qb_hit','qb_hit'),
      idp_ff:g('idp_ff','ff','fumble_forced'),
      fgm:g('fgm','fg_made'),fga:g('fga','fg_att'),
      fgm_50p:g('fgm_50p','fgm_50_plus','fg_made_50_plus'),
      xpm:g('xpm','xp_made'),xpa:g('xpa','xp_att'),
    };
  };

  const rows=[toRow(curRaw,curYear),toRow(prevRaw,prevYear)].filter(Boolean);

  if(!rows.length){
    inner.innerHTML='<div style="color:var(--text3);font-size:12px;padding:4px 0">No stats recorded for this player yet.</div>';
    return;
  }

  const fmt=(v,k)=>{
    if(!v&&v!==0)return'<span style="color:var(--text3)">—</span>';
    if(v===0)return'<span style="color:var(--text3)">0</span>';
    if(k==='fpts')return`<span style="color:var(--accent);font-weight:700">${v}</span>`;
    if(['pass_yd','rush_yd','rec_yd'].includes(k))return`<strong>${Math.round(v).toLocaleString()}</strong>`;
    if(['idp_sack','idp_int','idp_ff','idp_qb_hit'].includes(k)&&v>=5)return`<span style="color:var(--green);font-weight:600">${Number.isInteger(v)?v:v.toFixed(1)}</span>`;
    if(k==='idp_tkl'&&v>=80)return`<span style="color:var(--green);font-weight:600">${Math.round(v)}</span>`;
    if(k==='fgm_50p'&&v>=3)return`<span style="color:var(--green);font-weight:600">${v}</span>`;
    return Number.isInteger(v)?v:v.toFixed(1);
  };

  inner.innerHTML=`
    <div style="display:grid;grid-template-columns:${gridCols};align-items:center;padding:0 0 5px;border-bottom:2px solid var(--border2);margin-bottom:2px;gap:4px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase">YR</div>
      <div style="font-size:12px;font-weight:700;color:var(--text3)">TM</div>
      ${cols.map(c=>`<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;text-align:right">${c.l}</div>`).join('')}
    </div>
    ${rows.map(r=>`
      <div style="display:grid;grid-template-columns:${gridCols};align-items:center;padding:6px 0;border-bottom:1px solid var(--border);gap:4px">
        <div style="font-size:12px;font-weight:700;color:var(--text3)">${r.yr}</div>
        <div style="font-size:12px;font-weight:700;padding:2px 4px;border-radius:4px;background:var(--bg4);color:var(--text3);text-align:center">${p.team||'FA'}</div>
        ${cols.map(c=>`<div style="font-size:13px;font-weight:600;text-align:right">${fmt(r[c.k],c.k)}</div>`).join('')}
      </div>`).join('')}`;
}

function closePlayerModal(){$('player-modal').style.display='none';}

async function getPlayerFullCard(playerId){
  if(!hasAnyAI())return;
  const p=S.players[playerId];if(!p)return;
  const name=pName(playerId);const pos=p.position;const age=p.age||'?';const team=p.team||'FA';
  $('pm-news').innerHTML='<div style="color:var(--text3);font-size:12px">🔍 Searching for news...</div>';
  try{
    const reply=await callClaude([{role:'user',content:`IMPORTANT: Search for news ONLY about ${name} (${pos}, ${fullTeam(team)}, age ${age}). Do NOT include news about any other player. If you cannot find recent news specifically about ${name}, say "No recent news found for ${name}."
Return JSON only: {"news":[{"source":"source","text":"one sentence about ${name} only","date":"date"}],"tweet":"@ReconAI_FW dynasty take on ${name} specifically, max 280 chars"}`}],true,1,500);

    let data={news:[],tweet:''};
    try{
      const clean=reply.replace(/```json|```/g,'').trim();
      const start=clean.indexOf('{');const end=clean.lastIndexOf('}');
      if(start>=0)data=JSON.parse(clean.substring(start,end+1));
    }catch(e){$('pm-news').innerHTML=`<div style="font-size:13px;color:var(--text2);line-height:1.6">${reply.replace(/\n/g,'<br>')}</div>`;return;}

    const playerLast=p.last_name||'';
    if(data.news)data.news=data.news.filter(n=>n.text&&(n.text.includes(playerLast)||n.text.includes(name)));

    $('pm-news').innerHTML=data.news?.length?data.news.slice(0,3).map(n=>`
      <div style="padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="font-size:11px;color:var(--accent);font-weight:600">${n.source||'NFL'}</span>
          ${n.date?`<span style="font-size:11px;color:var(--text3)">${n.date}</span>`:''}
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.5">${n.text}</div>
      </div>`).join('')
    :'<div style="color:var(--text3);font-size:13px">No recent news found for '+name+'.</div>';

    if(data.tweet&&data.tweet.includes(playerLast)){
      $('pm-tweet').style.display='block';
      $('pm-tweet').innerHTML=`
        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rl);padding:12px 14px;margin-top:8px">
          <div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:5px">@ReconAI_FW</div>
          <div style="font-size:14px;color:var(--text);line-height:1.6">${data.tweet}</div>
        </div>
        <button class="copy-btn" style="margin-top:8px" onclick="copyText(${JSON.stringify(data.tweet)},this)">Copy tweet</button>`;
    }else{$('pm-tweet').style.display='none';}
  }catch(e){$('pm-news').innerHTML=`<div style="color:var(--red);font-size:12px">Error: ${e.message}</div>`;}
}

// ── Opponent Scouting ──────────────────────────────────────────
// idealDepth: default depth targets per position (may be overridden by other modules)
const idealDepth=window.idealDepth||{QB:3,RB:6,WR:7,TE:3,K:1,DL:5,LB:5,DB:5};
// ── Draft Room ─────────────────────────────────────────────────
// draftChatHistory declared in ai-chat.js

function renderDraftNeeds(){
  const needsEl=$('draft-needs');if(!needsEl)return;
  if(!S.myRosterId)return;
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
  const peaks=LI_LOADED&&LI.peakWindows?LI.peakWindows:{QB:[24,33],RB:[22,27],WR:[22,30],TE:[23,30],DL:[23,29],LB:[23,28],DB:[23,29]};

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
    const elite=withData.filter(p=>p.dhqVal>=7000);
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

  // === RENDER: Best Bet ===
  const bestBetEl=$('draft-best-bet');
  if(bestBetEl&&LI_LOADED&&LI.hitRateByRound){
    const topNeed=posAnalysis[0];
    const lateRounds=ownPickRounds.filter(r=>r>=4);
    const lateIdpHits={DL:0,LB:0,DB:0};
    lateRounds.forEach(r=>{
      (LI.hitRateByRound[r]?.bestPos||[]).forEach(bp=>{
        if(bp.pos in lateIdpHits)lateIdpHits[bp.pos]+=bp.starters||bp.hits||0;
      });
    });
    const bestLateIDP=Object.entries(lateIdpHits).sort((a,b)=>b[1]-a[1])[0];
    const earlyRounds=ownPickRounds.filter(r=>r<=3);
    const skipEarly=new Set(['K','DL','LB','DB']);
    const bestEarlyNeed=earlyRounds[0]<=3
      ?posAnalysis.find(p=>p.needScore>0&&!skipEarly.has(p.pos))||posAnalysis.find(p=>p.needScore>0&&p.pos!=='K')
      :posAnalysis.find(p=>p.needScore>0&&p.pos!=='K');

    let betHtml='';
    if(earlyRounds.length&&bestEarlyNeed){
      const reasons=[];
      if(bestEarlyNeed.starterGap>0)reasons.push(`${bestEarlyNeed.startable}/${bestEarlyNeed.slotsNeeded} starters`);
      if(bestEarlyNeed.aging>0)reasons.push(`${bestEarlyNeed.aging} aging past peak`);
      if(bestEarlyNeed.elite===0&&bestEarlyNeed.slotsNeeded>0)reasons.push('no elite talent');
      if(bestEarlyNeed.young===0)reasons.push('no young depth');
      const reasonStr=reasons.length?reasons.join(', '):'biggest positional need';
      betHtml+=`<div style="margin-bottom:10px;padding:10px 14px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.15);border-radius:var(--r);font-size:13px;color:var(--green);line-height:1.5">
        🎯 <strong>Priority target:</strong> Use your R${earlyRounds[0]} pick on <strong>${bestEarlyNeed.pos}</strong> — ${reasonStr}.
      </div>`;
    } else if(!earlyRounds.length&&ownPickRounds.length){
      const bestMidNeed=posAnalysis.find(p=>p.needScore>0&&p.pos!=='K');
      if(bestMidNeed){
        const reasons=[];
        if(bestMidNeed.starterGap>0)reasons.push(`${bestMidNeed.startable}/${bestMidNeed.slotsNeeded} starters`);
        if(bestMidNeed.aging>0)reasons.push(`${bestMidNeed.aging} aging past peak`);
        const reasonStr=reasons.length?reasons.join(', '):'biggest need';
        betHtml+=`<div style="margin-bottom:10px;padding:10px 14px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.15);border-radius:var(--r);font-size:13px;color:var(--green);line-height:1.5">
          🎯 <strong>Priority target:</strong> Look for <strong>${bestMidNeed.pos}</strong> value in mid rounds — ${reasonStr}.
        </div>`;
      }
    }
    if(lateRounds.length&&bestLateIDP&&bestLateIDP[1]>0){
      const avgLateHit=lateRounds.map(r=>LI.hitRateByRound[r]?.rate||0).reduce((a,b)=>a+b,0)/lateRounds.length;
      betHtml+=`<div style="margin-bottom:10px;padding:10px 14px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15);border-radius:var(--r);font-size:13px;color:var(--amber);line-height:1.5">
        ⚠️ Late picks (R${lateRounds.join(', R')}): ${avgLateHit.toFixed(0)}% starter rate. Best bet: <strong>${bestLateIDP[0]}</strong> — highest late-round hit rate in your league's history.
      </div>`;
    }
    bestBetEl.innerHTML=betHtml;
  }

  // === RENDER: Your Picks ===
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

    pickEl.innerHTML=ownedPicks.length?ownedPicks.map(p=>{
      const fromRoster=p.own?S.myRosterId:p.fromRosterId;
      const estPos=getPickPos(fromRoster);
      const val=pickValue(year,p.round,teams,estPos);
      const pickLabel=p.round+'.'+String(estPos).padStart(2,'0');
      const fromName=p.own?'Own':'From '+p.from;
      return`<div style="display:inline-flex;align-items:center;gap:6px;background:${p.own?'var(--bg4)':'rgba(124,107,248,.12)'};border:1px solid ${p.own?'var(--border2)':'rgba(124,107,248,.25)'};border-radius:8px;padding:6px 12px">
        <span style="font-size:14px;font-weight:700;color:${p.own?'var(--text)':'var(--accent)'}">${pickLabel}</span>
        <span style="font-size:12px;color:var(--text3)">${fromName}</span>
        <span style="font-size:11px;font-weight:600;color:var(--text3);font-family:'JetBrains Mono',monospace">~${val.toLocaleString()}</span>
      </div>`;
    }).join(''):`<span style="color:var(--text3);font-size:13px">No picks for ${year}</span>`;
  }

  // === RENDER: Draft Priority ===
  const summaryEl=$('draft-summary');
  const summaryContent=$('draft-summary-content');
  if(!summaryEl||!summaryContent)return;
  summaryEl.style.display='block';

  const gradeColorD=ns=>ns>=50?'var(--red)':ns>=20?'var(--amber)':ns>0?'var(--text2)':'var(--green)';
  const gradeLabelD=ns=>ns>=50?'Critical':ns>=20?'Need':ns>0?'Thin':'Solid';

  let dhtml=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
    <span style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em">Draft priority</span>
    ${LI_LOADED?`<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(52,211,153,.1);color:var(--green)">DHQ · ${LI.leagueYears?.length||0}yr</span>`:''}
    <span style="font-size:12px;color:var(--text3);margin-left:auto">Picks: ${ownPickRounds.map(r=>'R'+r).join(', ')||'none'}</span>
  </div>`;

  dhtml+=posAnalysis.map(p=>{
    const bar=Math.min(100,Math.max(5,p.needScore*1.2));
    const barCol=gradeColorD(p.needScore);
    return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
      <span style="font-size:12px;font-weight:700;min-width:24px;color:${barCol}">${p.pos}</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:${barCol};min-width:44px">${gradeLabelD(p.needScore)}</span>
          <div style="flex:1;background:var(--bg4);border-radius:2px;height:4px;overflow:hidden"><div style="width:${bar}%;height:100%;background:${barCol};border-radius:2px"></div></div>
        </div>
        <span style="font-size:12px;color:var(--text3)">${p.startable}/${p.slotsNeeded} starters${p.aging?' · '+p.aging+' aging':''}${p.young?' · '+p.young+' young':''}</span>
      </div>
    </div>`;
  }).join('');

  summaryContent.innerHTML=dhtml;
  needsEl.style.display='none';

  // === RENDER: Historical success ===
  const histEl=$('draft-history-section');
  if(histEl&&LI_LOADED&&LI.hitRateByRound){
    histEl.style.display='block';
    let hHtml=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:14px">
      <div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Historical starter rate by round — ${LI.totalPicks||0} picks across ${LI.draftMeta?.length||0} drafts</div>`;

    hHtml+=`<div style="display:grid;grid-template-columns:40px 1fr 50px 1fr;gap:4px 8px;align-items:center;font-size:11px;margin-bottom:6px">
      <span style="font-weight:700;color:var(--text3)">Round</span><span style="font-weight:700;color:var(--text3)">League-wide</span><span style="font-weight:700;color:var(--text3)">Rate</span><span style="font-weight:700;color:var(--text3)">Best positions</span>`;

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

      hHtml+=`
        <span style="font-weight:700;color:${isMine?'var(--accent)':'var(--text)'}">${isMine?'► ':''}R${rd}</span>
        <div style="background:var(--bg4);border-radius:2px;height:5px;overflow:hidden"><div style="width:${Math.max(3,rate)}%;height:100%;background:${hitColor};border-radius:2px"></div></div>
        <span style="color:${hitColor};font-weight:600">${rate}%</span>
        <span style="color:var(--text3)">${posRecs||'—'}</span>`;
    }

    hHtml+=`</div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px;padding-top:6px;border-top:1px solid var(--border)">% = starter rate (top 15% at position). 🎯 = matches your need. ► = you have this pick.</div>
    </div>`;
    histEl.innerHTML=hHtml;
  }
}

async function runDraftScouting(){
  if(!hasAnyAI()){switchTab('settings');return;}
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
      return`${pos}:${posPlayers.length}rostered/${starterSlots[pos]}slots${aging?'('+aging+' aging)':''}`;
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

    const prompt=`${year} rookie draft scouting for ${teams}-team dynasty league.
${buildCtx()}
MY NEEDS: ${needsStr}
MY PICKS: ${pickStr}
${buildMentalityCtx()}
${historyCtx}
IDP:sack=${sc7.idp_sack||4},INT=${sc7.idp_int||5},PD=${sc7.idp_pass_def||3}

Based on the ${year} rookie class and my league's ACTUAL historical draft data:

1. TOP 3 POSITIONS TO TARGET — ranked by my roster need + what historically hits at my pick slots. Don't recommend positions where I'm already stacked or where hit rates are terrible at my slots.

2. DRAFT BOARD — 6 specific rookies to target. For each: name, pos, NFL team, which of my rounds to target them, and why they fit MY roster (1 sentence).

3. PICK STRATEGY — should I trade up/down given my pick slots? What's the value play based on hit rates?

4. AVOID — positions or rounds where my league's history shows poor returns.

Search the web for current ${year} rookie rankings. Be specific with prospect names.`;

    const reply=await callClaude([{role:'user',content:prompt}],true,2,1200);
    $('draft-scout-content').innerHTML=`
      <div class="card" style="border-color:rgba(108,99,245,.2)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="font-size:15px;font-weight:600">${year} Draft Scouting Report</div>
          <button class="copy-btn" style="margin-left:auto" onclick="copyText(${JSON.stringify(reply)},this)">Copy</button>
        </div>
        <div style="font-size:14px;color:var(--text2);line-height:1.7">${reply.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--text)">$1</strong>').replace(/#{1,3} /g,'').replace(/\n\n/g,'</p><p style="margin-top:10px">').replace(/\n/g,'<br>')}</div>
      </div>`;
    draftChatHistory=[];
    addDraftMsg(`I've analyzed your ${year} draft position. What would you like to dig into?`,'a');
  }catch(e){$('draft-scout-content').innerHTML=`<div class="card"><div class="empty" style="color:var(--red)">Error: ${e.message}</div></div>`;}
  btn.textContent='Scout ↗';btn.disabled=false;
}

// sendDraftChatMsg: defined in ai-chat.js
// addDraftMsg: defined in ai-chat.js

// ── Mobile nav ─────────────────────────────────────────────────
function mobileTab(tab, btn) {
  document.querySelectorAll('.mobile-nav-item').forEach(b=>b.classList.remove('active'));
  if(btn){btn.classList.add('active');}
  else{
    const map={digest:'mnav-home',draftroom:'mnav-draft',waivers:'mnav-waivers',trades:'mnav-trades'};
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
  MEM_KEY,
  loadConvMemory, saveConvMemory, addConvMemory, buildMemoryCtx,
  autoSaveMemory,
  renderStatsTable,

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
  loadMentality, saveMentality, toggleUpgradePos,

  // Setup Wizard
  WIZARD_STEPS, checkFirstTime, startSetupWizard,
  showWizardStep, wizardAnswer, submitWizardText,
  addWizardUserMsg, finishWizard, closeWizard, skipWizard,

  // Available players
  getAvailablePlayers, availSort, renderAvailable, renderWaivers,

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
  renderHomeSnapshot, renderTeamOverview,

  // Strategy
  STRATEGY_QUESTIONS, startStrategyWalkthrough,
  selectStrategyAnswer, loadStrategy,

  // Player Modal
  fetchPlayerNews, loadPlayerNewsNow,
  openPlayerModal, getPosBadgeStyle, loadPlayerCardStats,
  closePlayerModal, getPlayerFullCard,

  // Opponent Scouting
  idealDepth,

  // Draft Room
  renderDraftNeeds, runDraftScouting,

  // Mobile nav
  mobileTab,

  // Stats stub
  statsData,
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
window.toggleUpgradePos = toggleUpgradePos;
window.checkFirstTime = checkFirstTime;
window.startSetupWizard = startSetupWizard;
window.showWizardStep = showWizardStep;
window.wizardAnswer = wizardAnswer;
window.submitWizardText = submitWizardText;
window.finishWizard = finishWizard;
window.closeWizard = closeWizard;
window.skipWizard = skipWizard;
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
window.startStrategyWalkthrough = startStrategyWalkthrough;
window.selectStrategyAnswer = selectStrategyAnswer;
window.loadStrategy = loadStrategy;
window.fetchPlayerNews = fetchPlayerNews;
window.loadPlayerNewsNow = loadPlayerNewsNow;
window.openPlayerModal = openPlayerModal;
window.getPosBadgeStyle = getPosBadgeStyle;
window.loadPlayerCardStats = loadPlayerCardStats;
window.closePlayerModal = closePlayerModal;
window.getPlayerFullCard = getPlayerFullCard;
window.renderDraftNeeds = renderDraftNeeds;
window.runDraftScouting = runDraftScouting;
window.mobileTab = mobileTab;
window.checkApiKeyCallout = checkApiKeyCallout;
window.renderLeaguePulse = renderLeaguePulse;
window.getMemory = getMemory;
window.setMemory = setMemory;
window.loadMemory = loadMemory;
window.saveMemory = saveMemory;
window.loadConvMemory = loadConvMemory;
window.addConvMemory = addConvMemory;
window.autoSaveMemory = autoSaveMemory;
window.buildMemoryCtx = buildMemoryCtx;
window.renderStatsTable = renderStatsTable;
