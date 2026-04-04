// ══════════════════════════════════════════════════════════════════
// reconai/js/app.js — State, utilities, connect flow, boot
// Loaded FIRST — sets up window.App namespace for all modules
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

// ── Dev Mode ────────────────────────────────────────────────────
const DEV_MODE = new URLSearchParams(window.location.search).has('dev') || window.location.hostname.includes('sandbox');
window.App.DEV_MODE = DEV_MODE;
window.DEV_MODE = DEV_MODE;
if(DEV_MODE){
  console.log('%c[DEV MODE] All features unlocked, auth bypassed','color:#fbbf24;font-weight:bold;font-size:14px');
  // Inject dev banner
  document.addEventListener('DOMContentLoaded',()=>{
    const b=document.createElement('div');
    b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;font-size:13px;font-weight:700;text-align:center;padding:3px;letter-spacing:.05em;font-family:monospace';
    b.textContent='⚡ SANDBOX — changes here do not affect production';
    document.body.prepend(b);
  });
}

// ── Global State ────────────────────────────────────────────────
let S={
  user:null,leagues:[],leagueUsers:[],rosters:[],matchups:{},
  transactions:{},tradedPicks:[],players:{},
  ownership:{},nflState:null,bracket:{w:[],l:[]},
  currentLeagueId:null,myRosterId:null,apiKey:'',aiProvider:'anthropic',aiModel:'',chatHistory:[],
  currentWeek:1,season:String(new Date().getFullYear()),
  tradeCalc:{a:[],b:[]},agentLog:[],lastDigest:null,
  playerStats:{},playerProj:{},depthCharts:{},posRanks:{}
};
window.App.S = S;
window.S = S; // global access for inline handlers

// ── Utilities ──────────────────────────────────────────────────
const $=id=>document.getElementById(id);
const ss=(id,msg,err)=>{const e=$(id);if(e){e.textContent=msg;e.className='status-txt'+(err?' err':'')}};
const posLabel=(slot,pid)=>{const mapped=window.App.posMap[slot];if(mapped&&mapped!=='BN'&&mapped!=='FLEX')return mapped;return pPos(pid)||slot||'?';};
function removeLoading(id){const e=$('ld-'+id);if(e)e.remove();}
const pName=id=>{if(!id)return'—';const p=S.players[id];if(!p)return id;if(p.position==='DEF')return(p.full_name||id)+' D/ST';return p.full_name||`${p.first_name||''} ${p.last_name||''}`.trim()||id};
const pNameShort=id=>{if(!id)return'—';const p=S.players[id];if(!p)return id;const f=p.first_name||'';const l=p.last_name||'';if(!f||!l)return pName(id);return f[0]+'. '+l;};
const pM=p=>{if(!p)return'';if(['DB','CB','S','SS','FS'].includes(p))return'DB';if(['DL','DE','DT','NT','IDL','EDGE'].includes(p))return'DL';if(['LB','OLB','ILB','MLB'].includes(p))return'LB';return p;};
const pTeam=id=>S.players[id]?.team||'';
const pPos=id=>S.players[id]?.position||'';
const pAge=id=>{
  const p=S.players[id]; if(!p) return '';
  if(p.age&&p.age>0) return p.age;
  if(p.birth_date){
    const birth=new Date(p.birth_date);
    const age=Math.floor((Date.now()-birth.getTime())/(365.25*24*60*60*1000));
    if(age>0&&age<50) return age;
  }
  if(p.years_exp===0) return 22;
  return '';
};
const pExp=id=>S.players[id]?.years_exp??'';
const getUser=oid=>{const u=S.leagueUsers.find(u=>u.user_id===oid);return u?(u.metadata?.team_name||u.display_name||u.username||'Team'):'Team'};
const myR=()=>S.rosters?.find(r=>r.roster_id===S.myRosterId||(r.co_owners||[]).includes(S.myUserId));
const prog=pct=>{const el=$('prog-bar');if(el)el.style.width=pct+'%';const dp=$('dhq-progress');const df=$('dhq-progress-fill');if(dp){dp.style.display=pct>0&&pct<100?'block':'none';if(df)df.style.width=pct+'%';}};
const setAgentStatus=(txt,active)=>{const t=$('agent-txt');const d=$('agent-dot');if(t)t.textContent=txt;if(d)d.className='status-dot'+(active?' thinking':active===false?' active':'')};

// Expose utilities globally (for inline onclick handlers and other modules)
Object.assign(window, {$,ss,posLabel,removeLoading,pName,pNameShort,pM,pTeam,pPos,pAge,pExp,getUser,myR,prog,setAgentStatus});
Object.assign(window.App, {$,ss,posLabel,removeLoading,pName,pNameShort,pM,pTeam,pPos,pAge,pExp,getUser,myR,prog,setAgentStatus});

// ── Season detection & Lineup tab visibility ──────────────────
function isNFLInSeason() {
  const st = S.nflState?.season_type;
  if (st === 'regular' || st === 'post') return true;
  if (st === 'pre' || st === 'off') return false;
  const m = new Date().getMonth();
  return m >= 8 || m <= 1;
}

function updateLineupTabVisibility() {
  const inSeason = isNFLInSeason();
  const lineupNav = document.getElementById('mnav-startsit');
  if (lineupNav) lineupNav.style.display = inSeason ? '' : 'none';

  const existingPromo = document.getElementById('lineup-promo-card');
  if (inSeason) {
    if (existingPromo) existingPromo.remove();
  } else if (!existingPromo) {
    const homePanel = document.getElementById('panel-digest');
    const chatModule = homePanel?.querySelector('.recon-chat-module');
    if (chatModule) {
      const promo = document.createElement('div');
      promo.id = 'lineup-promo-card';
      promo.style.cssText = 'margin:12px 0;padding:16px 18px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--rl);text-align:center;background-image:linear-gradient(135deg,rgba(124,107,248,.06),rgba(124,107,248,.02))';
      promo.innerHTML = '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">\u{1F3C8} START/SIT ASSISTANT \u2014 Coming Fall 2026</div><div style="font-size:13px;color:var(--text3);line-height:1.5">Get AI-powered lineup recommendations every week during the NFL season.</div>';
      chatModule.insertAdjacentElement('afterend', promo);
    }
  }
}
window.isNFLInSeason = isNFLInSeason;
window.updateLineupTabVisibility = updateLineupTabVisibility;
document.addEventListener('DOMContentLoaded', updateLineupTabVisibility);

// ── Tab switching ──────────────────────────────────────────────
function switchTab(tab,btn){
  // Guard: redirect to home if not connected (except settings)
  if(!S.user && tab!=='digest' && tab!=='settings'){
    tab='digest';btn=null;
    showToast('Connect your Sleeper account first');
    // Focus the username input
    setTimeout(()=>{const inp=$('u-input');if(inp)inp.focus();},200);
  }
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  if(btn)btn.classList.add('active');
  else{const homeBtn=document.querySelector('.tab[onclick*="digest"],.mobile-nav-item[onclick*="digest"]');if(homeBtn)homeBtn.classList.add('active');}
  const panel=$('panel-'+tab);
  if(panel)panel.classList.add('active');
  if(tab==='waivers'&&typeof loadMentality==='function')loadMentality();
  if(tab==='draftroom'&&typeof renderDraftNeeds==='function')renderDraftNeeds();
  if(tab==='digest'){
    if(typeof renderMobileHome==='function')renderMobileHome();
    else if(typeof renderHomeSnapshot==='function')renderHomeSnapshot();
  }
  if(tab==='settings'&&typeof updateSettingsStatus==='function')updateSettingsStatus();
  if(tab==='roster'&&typeof buildRosterTable==='function')buildRosterTable();
  if(tab==='startsit'&&typeof renderStartSit==='function')renderStartSit();
  if(tab==='trades'){
    if(typeof renderTradeIntel==='function')renderTradeIntel();
    // Initialize trade calc sub-tabs if data is loaded
    if(typeof initTradeCalc==='function')initTradeCalc();
  }
}
window.switchTab = switchTab;
window.App.switchTab = switchTab;

function showToast(msg='Copied!'){
  const t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}
window.showToast = showToast;
window.App.showToast = showToast;

function copyText(text,btn){
  navigator.clipboard.writeText(text).then(()=>{
    showToast(); if(btn){btn.textContent='Copied ✓';btn.classList.add('copied');setTimeout(()=>{btn.textContent='Copy';btn.classList.remove('copied')},2000);}
  });
}
window.copyText = copyText;
window.App.copyText = copyText;

// ── Connect ────────────────────────────────────────────────────
async function connect(){
  const uIn=$('u-input');const username=uIn?.value?.trim();if(!username)return;
  const btn=$('conn-btn');if(btn){btn.disabled=true;btn.textContent='Connecting...';}
  const progEl=$('prog');if(progEl)progEl.style.display='block';prog(5);
  ss('conn-status','Looking up user...');
  try{
    const sf=window.App.sf;
    const user=await sf(`/user/${username}`);
    if(!user?.user_id){ss('conn-status','User not found.',true);if(btn){btn.disabled=false;btn.textContent='Connect my league';}return;}
    S.user=user;const sUser=$('s-user');if(sUser)sUser.textContent=user.display_name||username;
    try{localStorage.setItem('dynastyhq_username',username);}catch(e){}
    // Acquire Supabase JWT for RLS (non-blocking — don't fail connect if this fails)
    prog(10);ss('conn-status','Authenticating...');
    try{
      if(window.OD?.acquireSessionToken){
        const session=await window.OD.acquireSessionToken(username);
        if(session?.token){
          console.log('[ReconAI] Supabase session acquired');
          if(window.OD.ensureUser)await window.OD.ensureUser(username);
        }else{
          console.log('[ReconAI] No Supabase session — localStorage fallback');
        }
      }
    }catch(e){console.warn('[ReconAI] Auth error (non-fatal):',e);}
    prog(12);ss('conn-status','Loading NFL state...');
    S.nflState=await sf('/state/nfl');
    S.currentWeek=S.nflState?.display_week||S.nflState?.week||1;
    const selEl=$('season-sel');
    const manualSeason=selEl?.value||String(new Date().getFullYear());
    const defaultSeason=String(new Date().getFullYear());
    S.season=manualSeason!==defaultSeason?manualSeason:(S.nflState?.league_create_season||S.nflState?.season||defaultSeason);
    const wpEl=$('week-pill');if(wpEl)wpEl.textContent='Wk '+S.currentWeek+' · '+S.season;
    if(selEl&&[...selEl.options].some(o=>o.value===S.season))selEl.value=S.season;
    prog(20);ss('conn-status','Loading leagues for '+S.season+'...');
    const leagues=await sf(`/user/${user.user_id}/leagues/nfl/${S.season}`);
    if(!leagues?.length){ss('conn-status','No leagues found for '+S.season+'. Try changing the season in Settings.',true);if(btn){btn.disabled=false;btn.textContent='Connect my league';}return;}
    S.leagues=leagues;
    prog(30);ss('conn-status','Loading player database (refreshing team assignments)...');
    S.players=await sf('/players/nfl');
    prog(50);
    showLeaguePicker(leagues,user.user_id);
    if(btn)btn.textContent='Connected ✓';ss('conn-status','');prog(60);
  }catch(e){
    ss('conn-status','Error: '+e.message,true);
    if(btn){btn.disabled=false;btn.textContent='Connect my league';}
  }
}
window.connect = connect;
window.App.connect = connect;

function showLeaguePicker(leagues,userId){
  try{
    // URL param from War Room takes priority
    const urlLeague=new URLSearchParams(window.location.search).get('league');
    if(urlLeague&&leagues.find(l=>l.league_id===urlLeague)){
      selectLeague(urlLeague,userId);
      return;
    }
    const savedLeague=localStorage.getItem('dynastyhq_league');
    if(savedLeague&&leagues.find(l=>l.league_id===savedLeague)){
      selectLeague(savedLeague,userId);
      return;
    }
  }catch(e){}
  if(leagues.length===1){
    selectLeague(leagues[0].league_id,userId);
    return;
  }
  const typeLabel=t=>(['Redraft','Keeper','Dynasty'][t]||'Unknown');
  const statusLabel=s=>({pre_draft:'Pre-draft',drafting:'Drafting',in_season:'In Season',complete:'Complete'}[s]||s||'');
  $('setup-block').innerHTML=`
    <h3 style="font-size:18px;text-align:center">Choose your league</h3>
    <p style="font-size:14px;color:var(--text2);margin-bottom:18px;line-height:1.6;text-align:center">Found ${leagues.length} league${leagues.length>1?'s':''} for ${S.season}. Select the one you want to manage.</p>
    <div id="league-pick-list" style="max-width:440px;margin:0 auto">
      ${leagues.map((l,i)=>`
        <div onclick="selectLeague('${l.league_id}','${userId}')" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rl);margin-bottom:8px;cursor:pointer;transition:all .2s;animation:cardIn .3s ease both;animation-delay:${i*0.05}s" onmouseover="this.style.borderColor='var(--accent)';this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 16px rgba(124,107,248,.15)'" onmouseout="this.style.borderColor='var(--border2)';this.style.transform='none';this.style.boxShadow='none'">
          ${l.avatar?`<div style="position:relative;width:40px;height:40px;flex-shrink:0"><img src="https://sleepercdn.com/avatars/thumbs/${l.avatar}" style="width:40px;height:40px;border-radius:10px;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><div style="display:none;width:40px;height:40px;border-radius:10px;background:var(--accentL);align-items:center;justify-content:center;font-size:16px">\u{1F3C8}</div></div>`:`<div style="width:40px;height:40px;border-radius:10px;background:var(--accentL);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">\u{1F3C8}</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em">${l.name||'Unnamed League'}</div>
            <div style="font-size:13px;color:var(--text3);margin-top:3px">${l.total_rosters} teams · ${typeLabel(l.settings?.type)} · ${statusLabel(l.status)}</div>
          </div>
          <div style="font-size:13px;color:var(--text3);text-align:right;flex-shrink:0">
            <div style="color:var(--accent);font-weight:600">${l.season}</div>
            <div style="margin-top:2px;font-weight:500">${l.settings?.type===2?'Dynasty':'Redraft'}</div>
          </div>
        </div>`).join('')}
    </div>`;
}
window.showLeaguePicker = showLeaguePicker;

function switchLeagueMode(){
  $('setup-block').style.display='block';
  const dc=$('digest-content');if(dc)dc.style.display='none';
  showLeaguePicker(S.leagues,S.user.user_id);
  switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
}
window.switchLeagueMode = switchLeagueMode;

async function selectLeague(leagueId,userId){
  S.currentLeagueId=leagueId;
  try{localStorage.setItem('dynastyhq_league',leagueId);}catch(e){}
  const league=S.leagues.find(l=>l.league_id===leagueId);
  const leagueName=(league?.name||'League').substring(0,20);
  const isDynasty=league?.settings?.type===2;
  const lpEl=$('league-pill');if(lpEl)lpEl.innerHTML='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+leagueName+(isDynasty?'':' (Redraft)')+'</span><span style="opacity:.5;font-size:13px;flex-shrink:0">\u21C4</span>';
  const sbEl=$('setup-block');if(sbEl)sbEl.innerHTML=`<div style="text-align:center;padding:20px 0">
    <div style="margin:0 auto 16px;width:52px;height:52px;background:linear-gradient(135deg,#7c6bf8,#5b4cc4);border-radius:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(124,107,248,0.3)">
      <span style="display:inline-block;width:24px;height:24px;border:2.5px solid rgba(255,255,255,.2);border-top-color:#c4b5fd;border-radius:50%;animation:spin .7s linear infinite"></span>
    </div>
    <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px">Scanning your league...</div>
    <div style="font-size:13px;color:var(--text3);line-height:1.5" id="scan-step">Fetching rosters and player data</div>
  </div>`;
  try{
    await loadLeague(leagueId,userId);
    const sb2=$('setup-block');if(sb2)sb2.style.display='none';
    const dc2=$('digest-content');if(dc2)dc2.style.display='block';
    switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
    prog(100);
    try{renderHomeSnapshot();}catch(e){}
    checkApiKeyCallout();
    if(typeof updateSettingsStatus==='function')updateSettingsStatus();
    Promise.resolve().then(()=>{
      console.log('loadAllData: triggered via microtask');
      loadAllData();
    });
  }catch(e){
    const sb=$('setup-block');
    if(sb)sb.innerHTML=`<div style="color:var(--red);font-size:14px">Error: ${e.message}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="connect()">Try again</button>`;
  }
}
window.selectLeague = selectLeague;

async function loadAllData(){
  if(!S.currentLeagueId||!S.myRosterId)return;
  console.log('loadAllData: starting...');
  const t0=Date.now();
  const loadBanner=$('dhq-loading-banner');
  if(loadBanner)loadBanner.style.display='none';
  prog(5);
  try{
    if(typeof updateSyncStatus==='function')updateSyncStatus();
    await Promise.all([
      loadRosterStats().catch(e=>{console.warn('Stats error:',e);return null;}),
      loadLeagueIntel().catch(e=>{console.warn('DHQ error:',e);return null;}),
      fetchTrending().catch(e=>{console.warn('Trending error:',e);return null;}),
    ]);
    console.log('loadAllData: complete in '+((Date.now()-t0)/1000).toFixed(1)+'s | stats:'+Object.keys(S.playerStats||{}).length+' | DHQ:'+Object.keys((window.App.LI||{}).playerScores||{}).length);
    // Validate core functions loaded
    const coreDeps = ['dynastyValue','assessTeamFromGlobal','getPlayerAction','buildRosterTable','renderMobileHome'];
    const missing = coreDeps.filter(fn => typeof window[fn] !== 'function');
    if (missing.length) console.warn('[ReconAI] Missing functions:', missing.join(', '));
    if(loadBanner)loadBanner.style.display='none';
    prog(100);
    if(typeof updateDataFreshness==='function')updateDataFreshness();
    if(typeof updateSyncStatus==='function')updateSyncStatus();
    if(typeof buildRosterTable==='function')buildRosterTable();
    try{if(typeof renderAvailable==='function')renderAvailable();}catch(e){console.warn('renderAvailable:',e);}
    try{if(typeof renderDraftNeeds==='function')renderDraftNeeds();}catch(e){console.warn('renderDraftNeeds:',e);}
    try{if(typeof renderHomeSnapshot==='function')renderHomeSnapshot();}catch(e){}
    try{if(typeof renderDailyBriefing==='function')renderDailyBriefing();}catch(e){console.warn('renderDailyBriefing:',e);}
    try{if(typeof renderStartSit==='function')renderStartSit();}catch(e){console.warn('renderStartSit:',e);}
    try{if(typeof renderInsightCards==='function')renderInsightCards();}catch(e){console.warn('renderInsightCards:',e);}
    try{if(typeof renderTeamOverview==='function')renderTeamOverview();}catch(e){console.warn('renderTeamOverview:',e);}
    try{if(typeof renderHealthTimeline==='function')renderHealthTimeline();}catch(e){console.warn('renderHealthTimeline:',e);}
    try{if(typeof renderLeaguePulse==='function')renderLeaguePulse();}catch(e){console.warn('renderLeaguePulse:',e);}
    try{if(typeof renderMobileHome==='function')renderMobileHome();}catch(e){console.warn('renderMobileHome:',e);}
    updateLineupTabVisibility(); // re-check with Sleeper nflState data
    try{if(typeof renderTradeIntel==='function')renderTradeIntel();}catch(e){console.warn('renderTradeIntel:',e);}
    try{checkForAlerts();}catch(e){console.warn('checkForAlerts:',e);}
    if(typeof checkApiKeyCallout==='function')checkApiKeyCallout();
    if(!localStorage.getItem('dhq_strategy_done')&&(S.apiKey||(typeof hasAnyAI==='function'&&hasAnyAI()))){
      setTimeout(()=>{if(typeof startStrategyWalkthrough==='function')startStrategyWalkthrough();},500);
    }
    try{if(typeof runMemoryCapture==='function')runMemoryCapture(S.currentLeagueId);}catch(e){}
    // Load player tags (syncs with War Room)
    if(window.OD?.loadPlayerTags){
      window.OD.loadPlayerTags(S.currentLeagueId).then(tags=>{
        window._playerTags=tags||{};
        // Re-render roster to show tags
        if(typeof buildRosterTable==='function')buildRosterTable();
      }).catch(()=>{});
    }
  }catch(e){
    console.warn('loadAllData error:',e);
    if(loadBanner)loadBanner.style.display='none';
  }
}
window.loadAllData = loadAllData;
window.App.loadAllData = loadAllData;

// ── Settings ───────────────────────────────────────────────────
function saveKey(){
  const k = ($('api-key-in')?.value||'').trim();
  const provider = $('ai-provider-sel')?.value || 'anthropic';
  const model = ($('ai-model-in')?.value||'').trim();
  const PROVIDERS = window.App.PROVIDERS || {};
  const p = PROVIDERS[provider];
  if(!k){ss('key-status','Enter an API key',true);return;}
  if(p?.validate && !p.validate(k)){ss('key-status','Key format looks wrong — double-check it',true);return;}
  S.apiKey = k;
  S.aiProvider = provider;
  S.aiModel = model || '';
  try{
    localStorage.setItem('dynastyhq_apikey', k);
    localStorage.setItem('dynastyhq_provider', provider);
    localStorage.setItem('dynastyhq_model', model);
  }catch(e){}
  const label = p?.name || provider;
  ss('key-status', label + ' key saved ✓');
  if(typeof updateSettingsStatus==='function')updateSettingsStatus();
  if(typeof checkApiKeyCallout==='function')checkApiKeyCallout();
}
window.saveKey = saveKey;

function clearKey(){
  S.apiKey=''; S.aiProvider='anthropic'; S.aiModel='';
  try{localStorage.removeItem('dynastyhq_apikey');localStorage.removeItem('dynastyhq_provider');localStorage.removeItem('dynastyhq_model');}catch(e){}
  const inp=$('api-key-in');if(inp)inp.value='';
  ss('key-status','Key cleared');
  if(typeof updateSettingsStatus==='function')updateSettingsStatus();
}
window.clearKey = clearKey;

// saveXaiKey — disabled until xAI API is available
function saveXaiKey(){}
window.saveXaiKey = saveXaiKey;

function reconnect(){
  const u=$('s-user-in')?.value?.trim();
  if(!u){showToast('Enter a username first');return;}
  S.user=null;S.leagues=[];S.rosters=[];S.myRosterId=null;
  S.playerStats={};S.posRanks={};
  const LI_ref = window.App;
  if(LI_ref){LI_ref.LI_LOADED=false;LI_ref.LI={};window._liLoading=false;}
  try{localStorage.removeItem('dhq_leagueintel_v10');
    Object.keys(localStorage).filter(k=>k.startsWith('dhq_hist_')).forEach(k=>localStorage.removeItem(k));
  }catch(e){}
  const sb=$('setup-block');
  if(sb){
    sb.style.display='block';
    sb.innerHTML=`<div style="text-align:center;margin-bottom:16px">
      <div style="font-size:28px;margin-bottom:8px">🔄</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">Switching account</div>
      <div style="font-size:13px;color:var(--text3)">Connecting as <strong style="color:var(--accent)">${u}</strong></div>
    </div>
    <div class="row" style="max-width:380px;margin:0 auto">
      <input type="text" id="u-input" value="${u}" placeholder="Sleeper username" style="font-size:15px;padding:12px 16px;border-radius:12px" onkeydown="if(event.key==='Enter')connect()"/>
      <button class="btn" id="conn-btn" onclick="connect()" style="padding:12px 24px;font-size:14px;font-weight:700;border-radius:12px">Connect</button>
    </div>
    <div id="conn-status" class="status-txt" style="text-align:center;margin-top:8px"></div>
    <div class="prog" id="prog" style="display:none;max-width:380px;margin:0 auto"><div class="prog-bar" id="prog-bar" style="width:0%"></div></div>`;
  }
  const dc=$('digest-content');if(dc)dc.style.display='none';
  try{localStorage.setItem('dynastyhq_username',u);}catch(e){}
  switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
  setTimeout(()=>connect(),100);
}
window.reconnect = reconnect;

function reloadSeason(){
  S.season=$('season-sel').value;
  S.leagues=[];S.matchups={};S.transactions={};S.rosters=[];
  if(S.user){
    const sb=$('setup-block');if(sb){sb.style.display='block';sb.innerHTML=`<div style="font-size:14px;color:var(--text2)">Reloading for ${S.season}...</div>`;}
    const dc=$('digest-content');if(dc)dc.style.display='none';
    connect();
  }
}
window.reloadSeason = reloadSeason;

function clearHistory(){S.chatHistory=[];if(typeof tradeChatHistory!=='undefined')tradeChatHistory=[];if(typeof draftChatHistory!=='undefined')draftChatHistory=[];}
window.clearHistory = clearHistory;

// ── IDP helpers ────────────────────────────────────────────────
function calcIDPScore(stats, sc){
  if(!stats)return 0;
  let pts=0;
  const add=(stat,mult)=>{pts+=(stats[stat]||0)*(mult||0);};
  add('idp_tkl_solo', sc.idp_tkl_solo??0.5);
  add('idp_tkl_ast', sc.idp_tkl_ast??0.25);
  add('idp_tkl_loss', sc.idp_tkl_loss??2);
  add('idp_sack', sc.idp_sack??4);
  add('idp_ff', sc.idp_ff??3);
  add('idp_int', sc.idp_int??5);
  add('idp_pass_def', sc.idp_pass_def??3);
  add('idp_qb_hit', sc.idp_qb_hit??1.25);
  add('idp_safe', sc.idp_safe??2);
  add('idp_blk_kick', sc.idp_blk_kick??3);
  add('idp_def_td', sc.idp_def_td??6);
  add('idp_pass_def_3p', sc.idp_pass_def_3p??1);
  return +pts.toFixed(1);
}
window.calcIDPScore = calcIDPScore;
window.App.calcIDPScore = calcIDPScore;

function idpTier(pos, sc){
  const eliteDL={idp_sack:10,idp_tkl_solo:40,idp_tkl_ast:20,idp_tkl_loss:8,idp_qb_hit:25,idp_ff:3};
  const eliteLB={idp_tkl_solo:80,idp_tkl_ast:30,idp_sack:5,idp_tkl_loss:10,idp_ff:3,idp_int:2,idp_pass_def:5};
  const eliteDB={idp_int:5,idp_pass_def:15,idp_tkl_solo:60,idp_tkl_ast:20,idp_def_td:1,idp_ff:2,idp_pass_def_3p:2};
  const scores={DL:calcIDPScore(eliteDL,sc),LB:calcIDPScore(eliteLB,sc),DB:calcIDPScore(eliteDB,sc)};
  return scores[pos]||0;
}
window.idpTier = idpTier;
window.App.idpTier = idpTier;

// ── Memory / localStorage ──────────────────────────────────────
const MEM_KEY='dynastyhq_memory';
function loadMemory(){try{return JSON.parse(localStorage.getItem(MEM_KEY)||'{}')}catch(e){return{};}}
function saveMemory(data){try{localStorage.setItem(MEM_KEY,JSON.stringify(data));}catch(e){}}
function getMemory(key,def=[]){return loadMemory()[key]??def;}
function setMemory(key,val){const d=loadMemory();d[key]=val;saveMemory(d);}
Object.assign(window, {loadMemory,saveMemory,getMemory,setMemory});
Object.assign(window.App, {loadMemory,saveMemory,getMemory,setMemory});

// ── Notifications ───────────────────────────────────────────
function enableNotifications(){
  if (typeof canAccess === 'function' && !canAccess('notifications')) {
    showUpgradePrompt('notifications', document.getElementById('notif-status')?.parentElement || document.body);
    return;
  }
  if(!('Notification' in window)){ss('notif-status','Notifications not supported in this browser',true);return;}
  Notification.requestPermission().then(perm=>{
    localStorage.setItem('dhq_notif_perm',perm);
    const btn=$('notif-btn');
    if(perm==='granted'){ss('notif-status','Notifications enabled ✓');if(btn)btn.textContent='Enabled ✓';}
    else if(perm==='denied'){ss('notif-status','Notifications blocked — check browser settings',true);if(btn)btn.textContent='Blocked';}
    else{ss('notif-status','Permission dismissed');}
  });
}
window.enableNotifications = enableNotifications;

function checkForAlerts(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const roster=myR();if(!roster?.players?.length)return;
  const prev=JSON.parse(localStorage.getItem('dhq_last_alerts')||'{}');
  const now={};const alerts=[];
  // 1. Injury alerts for rostered players
  roster.players.forEach(pid=>{
    const p=S.players[pid];if(!p)return;
    const status=p.injury_status||'';
    if(status==='Out'||status==='IR'){
      const key='inj_'+pid+'_'+status;
      now[key]=1;
      if(!prev[key])alerts.push({title:'\u{1F6A8} Injury Alert',body:pName(pid)+' has been ruled '+status});
    }
  });
  // 2. Trending pickups matching roster needs
  const trendingPlayers=window.App.trendingAdds||[];
  const rosterPositions=new Set(roster.players.map(pid=>pPos(pid)));
  trendingPlayers.slice(0,10).forEach(tp=>{
    const pid=tp.player_id||tp.id;const p=S.players[pid];if(!p)return;
    if(rosterPositions.has(p.position)){
      const key='trend_'+pid;
      now[key]=1;
      if(!prev[key])alerts.push({title:'\u{1F4C8} Trending Pickup',body:pName(pid)+' is trending on waivers \u2014 matches your roster needs'});
    }
  });
  // 3. Trade intel
  if(window.App.LI?.tradeTargets?.length){
    const key='trade_v'+Date.now().toString(36).slice(0,5);
    if(!prev.trade_seen){now.trade_seen=1;alerts.push({title:'\u{1F504} Trade Intel',body:'New trade intel available for your league'});}
    else{now.trade_seen=prev.trade_seen;}
  }
  // Fire notifications via SW if available, else fallback to Notification API
  const reg=navigator.serviceWorker?.controller?navigator.serviceWorker.ready:null;
  alerts.forEach(a=>{
    if(reg)reg.then(r=>r.showNotification(a.title,{body:a.body,icon:'./icons/icon-192.svg',badge:'./icons/icon-192.svg'}));
    else try{new Notification(a.title,{body:a.body,icon:'./icons/icon-192.svg'});}catch(e){}
  });
  localStorage.setItem('dhq_last_alerts',JSON.stringify(now));
}
window.checkForAlerts = checkForAlerts;

// ── Boot: Restore API key + auto-connect ───────────────────────
(function restoreApiKey(){
  try{
    // Check for Fantasy Wars email session or profile for Sleeper username
    try {
      if (!localStorage.getItem('dynastyhq_username')) {
        let fwUsername = null;
        // Try fw_session_v1 first
        const fwRaw = localStorage.getItem('fw_session_v1');
        if (fwRaw) { const fw = JSON.parse(fwRaw); fwUsername = fw?.user?.sleeperUsername; }
        // Fallback: od_profile_v1 (set during War Room onboarding)
        if (!fwUsername) {
          const profRaw = localStorage.getItem('od_profile_v1');
          if (profRaw) { const prof = JSON.parse(profRaw); fwUsername = prof?.sleeperUsername; }
        }
        // Fallback: od_auth_v1 (legacy War Room login)
        if (!fwUsername) {
          const authRaw = localStorage.getItem('od_auth_v1');
          if (authRaw) { const auth = JSON.parse(authRaw); fwUsername = auth?.sleeperUsername || auth?.username; }
        }
        if (fwUsername) {
          localStorage.setItem('dynastyhq_username', fwUsername);
          console.log('[ReconAI] Auto-connected from Fantasy Wars session:', fwUsername);
        }
      }
    } catch(e) {}

    const k = localStorage.getItem('dynastyhq_apikey');
    const prov = localStorage.getItem('dynastyhq_provider') || 'anthropic';
    const model = localStorage.getItem('dynastyhq_model') || '';
    if(k){
      S.apiKey = k;
      S.aiProvider = prov;
      S.aiModel = model;
      const inp = $('api-key-in');
      if(inp) inp.value = k;
      const sel = $('ai-provider-sel');
      if(sel) sel.value = prov;
      const mIn = $('ai-model-in');
      if(mIn) mIn.value = model;
      if(typeof updateProviderHint==='function')updateProviderHint();
    }
    const xk=localStorage.getItem('dynastyhq_xai_key');
    if(xk){const xIn=$('xai-key-in');if(xIn)xIn.value=xk;}
    // Restore notification button state
    if('Notification' in window&&Notification.permission==='granted'){const nb=$('notif-btn');if(nb)nb.textContent='Enabled \u2713';}
    const savedUser = localStorage.getItem('dynastyhq_username');
    if(savedUser){
      const uInput = $('u-input');
      if(uInput) uInput.value = savedUser;
      setTimeout(()=>{if(!S.user)connect();},500);
    } else {
      // First-time user: focus the username input so they know where to start
      setTimeout(()=>{const inp=$('u-input');if(inp)inp.focus();},600);
    }
    // Load user tier for paywall
    if (typeof loadUserTier === 'function') loadUserTier().catch(() => {});

    setTimeout(()=>{
      if(S.myRosterId&&!window.App.LI_LOADED&&!window._liLoading){
        console.log('FAILSAFE: data not loaded after 8s, forcing loadAllData');
        loadAllData();
      }
    },8000);
  }catch(e){}
})();

// ── Page unload memory save ────────────────────────────────────
window.addEventListener('beforeunload',function(){
  try{
    if(typeof homeChatHistory!=='undefined'&&homeChatHistory&&homeChatHistory.length>=4&&typeof autoSaveMemory==='function')autoSaveMemory(homeChatHistory,'Home');
    if(typeof tradeChatHistory!=='undefined'&&tradeChatHistory&&tradeChatHistory.length>=4&&typeof autoSaveMemory==='function')autoSaveMemory(tradeChatHistory,'Trades');
  }catch(e){}
});

// ── Keyboard shortcuts ─────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();}
  if(e.key==='Escape');
});

// ── Tooltip helper ──────────────────────────────────────────
function toggleTip(id){
  const el=document.getElementById(id);
  if(el)el.classList.toggle('show');
}
window.toggleTip=toggleTip;

// Click outside search results to close
document.addEventListener('click',e=>{
  const wrap=$('player-search-wrap');
  if(wrap&&!wrap.contains(e.target)){
    const res=$('player-search-results');
    if(res)res.style.display='none';
  }
});
