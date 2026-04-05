// ══════════════════════════════════════════════════════════════════
// warroom-scout/js/app.js — State, utilities, connect flow, boot
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

// ── State Registry ──────────────────────────────────────────────
// All global state containers — canonical access is always window.App.*
// Never add new state containers without registering them here.
//
//  window.App.S / window.S             Primary app state: players, rosters, leagues, stats, etc.
//  window.App.LI / window.LI           League Intel: DHQ player scores, owner profiles, peak windows.
//                                      Set by shared/dhq-engine.js; loads asynchronously.
//  window.LI_LOADED                    Boolean: LI has finished loading (dhq-engine.js)
//  window._liLoading                   Boolean: LI load in progress (dhq-engine.js)
//  window._playerTags                  { [pid]: tag } — player tag overrides (ui.js / player-modal.js)
//
// Chat state — in ai-chat.js, added to window.App after that module loads:
//  window.App.homeChatHistory          Home tab chat messages array
//  window.App.tradeChatHistory         Trade tab chat messages array
//  window.App.draftChatHistory         Draft tab chat messages array
//  window.App.tradeBuilderAssets       { mine:[], theirs:[] } trade builder working state

// ── Utilities ──────────────────────────────────────────────────
const escHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
Object.assign(window, {escHtml,$,ss,posLabel,removeLoading,pName,pNameShort,pM,pTeam,pPos,pAge,pExp,getUser,myR,prog,setAgentStatus});
Object.assign(window.App, {escHtml,$,ss,posLabel,removeLoading,pName,pNameShort,pM,pTeam,pPos,pAge,pExp,getUser,myR,prog,setAgentStatus});

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
  if (existingPromo) existingPromo.remove();
}
window.isNFLInSeason = isNFLInSeason;
window.updateLineupTabVisibility = updateLineupTabVisibility;
document.addEventListener('DOMContentLoaded', updateLineupTabVisibility);

// Bulk sync any pending field log entries on app load
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to let Supabase client initialize
  setTimeout(() => {
    if (window.OD?.syncPendingFieldLog) {
      window.OD.syncPendingFieldLog().then(count => {
        if (count > 0 && typeof renderFieldLogCard === 'function') {
          renderFieldLogCard();
          renderFieldLogPanel();
        }
      }).catch(() => {});
    }
  }, 1500);
});

// ── Tab switching ──────────────────────────────────────────────
function switchTab(tab,btn){
  // Guard: redirect to home if not connected (except settings, league, fieldlog)
  if(!S.user && tab!=='digest' && tab!=='settings' && tab!=='league' && tab!=='fieldlog'){
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
  if(tab==='settings'&&typeof updateTrialSettingsSection==='function')updateTrialSettingsSection();
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
    DhqStorage.setStr(STORAGE_KEYS.USERNAME, username);
    // Acquire Supabase JWT for RLS (non-blocking — don't fail connect if this fails)
    prog(10);ss('conn-status','Authenticating...');
    try{
      if(window.OD?.acquireSessionToken){
        const session=await window.OD.acquireSessionToken(username);
        if(session?.token){
          console.log('[Scout] Supabase session acquired');
          if(window.OD.ensureUser)await window.OD.ensureUser(username);
        }else{
          console.log('[Scout] No Supabase session — localStorage fallback');
        }
      }
    }catch(e){console.warn('[Scout] Auth error (non-fatal):',e);}
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

// ── Platform tab toggle ────────────────────────────────────────
function showPlatformTab(platform){
  const forms={sleeper:'form-sleeper',espn:'form-espn',mfl:'form-mfl',yahoo:'form-yahoo'};
  const tabs={sleeper:'tab-sleeper',espn:'tab-espn',mfl:'tab-mfl',yahoo:'tab-yahoo'};
  Object.values(forms).forEach(id=>{const el=$(id);if(el)el.style.display='none';});
  Object.values(tabs).forEach(id=>{const el=$(id);if(el){el.style.background='transparent';el.style.color='var(--text3)';}});
  const formEl=$(forms[platform]||forms.sleeper);
  const tabEl=$(tabs[platform]||tabs.sleeper);
  if(formEl)formEl.style.display='block';
  if(tabEl){tabEl.style.background='var(--bg)';tabEl.style.color='var(--text)';}
  // Platform-specific init
  if(platform==='mfl'){const yrEl=$('mfl-year');if(yrEl&&!yrEl.value)yrEl.value=String(new Date().getFullYear());}
}
window.showPlatformTab = showPlatformTab;

// ── ESPN Connect ───────────────────────────────────────────────
async function connectESPN(){
  const leagueIdRaw=($('espn-league-id')?.value||'').trim();
  if(!leagueIdRaw){ss('conn-status','Enter your ESPN League ID',true);return;}
  // ESPN league IDs are numeric
  const leagueId=leagueIdRaw.replace(/\D/g,'');
  if(!leagueId){ss('conn-status','League ID must be a number (from your ESPN URL)',true);return;}

  const espnS2=($('espn-s2')?.value||'').trim();
  const swid=($('espn-swid')?.value||'').trim();

  const btn=$('espn-conn-btn');
  if(btn){btn.disabled=true;btn.textContent='Connecting...';}
  const progEl=$('prog');if(progEl)progEl.style.display='block';
  prog(5);ss('conn-status','Connecting to ESPN...');

  try{
    if(!window.ESPN){throw new Error('ESPN connector not loaded — refresh and try again.');}

    // Use current season from settings or current year
    const selEl=$('season-sel');
    const year=parseInt(selEl?.value||String(new Date().getFullYear()));

    // Load Sleeper player DB for crosswalk (if not already loaded)
    prog(15);ss('conn-status','Loading player database...');
    if(!S.players||Object.keys(S.players).length<100){
      try{
        S.players=await window.App.sf('/players/nfl');
      }catch(e){
        console.warn('[ESPN] Could not load Sleeper player DB — crosswalk will be limited:',e);
        S.players=S.players||{};
      }
    }

    prog(35);ss('conn-status','Fetching ESPN league data...');
    const result=await window.ESPN.connectLeague(leagueId,year,espnS2,swid);

    prog(70);ss('conn-status','Mapping rosters...');

    // Show team picker — user must identify their own team
    if(btn){btn.disabled=false;btn.textContent='Connect ESPN League';}
    prog(80);
    showESPNTeamPicker(result,leagueId,year,espnS2,swid);

  }catch(e){
    ss('conn-status','Error: '+e.message,true);
    if(btn){btn.disabled=false;btn.textContent='Connect ESPN League';}
    if(progEl)progEl.style.display='none';
  }
}
window.connectESPN = connectESPN;

function showESPNTeamPicker(result,leagueId,year,espnS2,swid){
  const{rosters,league}=result;
  const setupEl=$('setup-block');
  if(!setupEl)return;

  const teamRows=rosters.map(r=>`
    <div onclick="selectESPNTeam('${r.roster_id}','${leagueId}','${year}','${escHtml(espnS2||'')}','${escHtml(swid||'')}')"
      style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border2)'">
      <div style="width:36px;height:36px;border-radius:9px;background:#e03e2d;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${r.roster_id}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r._team_name||'Team '+r.roster_id)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${r.players.length} players · ${r.settings.wins}-${r.settings.losses}</div>
      </div>
    </div>`).join('');

  setupEl.innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;background:#e03e2d;color:#fff;border-radius:6px;padding:3px 10px;margin-bottom:10px;letter-spacing:.06em">ESPN</div>
      <h3 style="font-size:18px;font-weight:700;margin-bottom:6px">${escHtml(league.name)}</h3>
      <p style="font-size:13px;color:var(--text3)">${league.total_rosters} teams · ${year} · Select your team below</p>
    </div>
    <div id="espn-team-list" style="max-width:440px;margin:0 auto">${teamRows}</div>`;
}
window.showESPNTeamPicker = showESPNTeamPicker;

async function selectESPNTeam(rosterId,leagueId,year,espnS2,swid){
  const S_ref=window.S||window.App?.S;
  if(!S_ref)return;

  // Set my roster
  S_ref.myRosterId=String(rosterId);

  // Show scanning spinner
  const setupEl=$('setup-block');
  if(setupEl)setupEl.innerHTML=`<div style="text-align:center;padding:30px 0">
    <span style="display:inline-block;width:24px;height:24px;border:2.5px solid rgba(255,255,255,.2);border-top-color:#e03e2d;border-radius:50%;animation:spin .7s linear infinite"></span>
    <div style="font-size:16px;font-weight:700;margin:14px 0 6px">Loading your league...</div>
    <div style="font-size:13px;color:var(--text3)">Mapping ESPN data to ReconAI</div>
  </div>`;

  try{
    // Persist ESPN credentials
    try{
      localStorage.setItem('espn_league_id',leagueId);
      localStorage.setItem('espn_year',String(year));
      if(espnS2)localStorage.setItem('espn_s2',espnS2);
      if(swid)localStorage.setItem('espn_swid',swid);
      localStorage.setItem('espn_my_team',String(rosterId));
    }catch(e){}

    // Update league pill with ESPN badge
    _updateLeaguePillESPN(S_ref.leagues[0]?.name||'ESPN League');

    // Show the main dashboard
    const sb=$('setup-block');if(sb)sb.style.display='none';
    const dc=$('digest-content');if(dc)dc.style.display='block';
    switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
    prog(100);

    try{if(typeof renderHomeSnapshot==='function')renderHomeSnapshot();}catch(e){}
    try{if(typeof checkApiKeyCallout==='function')checkApiKeyCallout();}catch(e){}
    try{if(typeof updateSettingsStatus==='function')updateSettingsStatus();}catch(e){}

    // Load DHQ intel + stats (uses Sleeper IDs from crosswalk, works for matched players)
    Promise.resolve().then(()=>loadAllData());

  }catch(e){
    console.error('[ESPN] selectESPNTeam error:',e);
    if(setupEl)setupEl.innerHTML=`<div style="color:var(--red);font-size:14px;text-align:center">Error: ${escHtml(e.message)}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="connectESPN()">Try again</button>`;
  }
}
window.selectESPNTeam = selectESPNTeam;

function _updateLeaguePillESPN(leagueName){
  const lp=$('league-pill');
  if(lp)lp.innerHTML=`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(leagueName)}</span><span id="platform-badge" style="font-size:10px;font-weight:700;background:#e03e2d;color:#fff;border-radius:4px;padding:1px 5px;flex-shrink:0;letter-spacing:.04em">ESPN</span><span style="opacity:.5;font-size:13px;flex-shrink:0">⇄</span>`;
}

// ── MFL Connect ───────────────────────────────────────────────
async function connectMFL(){
  const leagueIdRaw=($('mfl-league-id')?.value||'').trim();
  if(!leagueIdRaw){ss('conn-status','Enter your MFL League ID',true);return;}
  const leagueId=leagueIdRaw.replace(/\D/g,'');
  if(!leagueId){ss('conn-status','League ID must be a number (from your MFL URL)',true);return;}

  const yearRaw=($('mfl-year')?.value||String(new Date().getFullYear())).trim();
  const year=parseInt(yearRaw)||new Date().getFullYear();
  const apiKey=($('mfl-api-key')?.value||'').trim();

  const btn=$('mfl-conn-btn');
  if(btn){btn.disabled=true;btn.textContent='Connecting...';}
  const progEl=$('prog');if(progEl)progEl.style.display='block';
  prog(5);ss('conn-status','Connecting to MFL...');

  try{
    if(!window.MFL){throw new Error('MFL connector not loaded — refresh and try again.');}

    prog(15);ss('conn-status','Loading player database...');
    if(!S.players||Object.keys(S.players).length<100){
      try{
        S.players=await window.App.sf('/players/nfl');
      }catch(e){
        console.warn('[MFL] Could not load Sleeper player DB — crosswalk will be limited:',e);
        S.players=S.players||{};
      }
    }

    prog(35);ss('conn-status','Fetching MFL league data...');
    const result=await window.MFL.connectLeague(leagueId,year,apiKey);

    prog(70);ss('conn-status','Mapping rosters...');
    if(btn){btn.disabled=false;btn.textContent='Connect MFL League';}
    prog(80);
    showMFLTeamPicker(result,leagueId,year,apiKey);

  }catch(e){
    ss('conn-status','Error: '+e.message,true);
    if(btn){btn.disabled=false;btn.textContent='Connect MFL League';}
    if(progEl)progEl.style.display='none';
  }
}
window.connectMFL = connectMFL;

function showMFLTeamPicker(result,leagueId,year,apiKey){
  const{rosters,league}=result;
  const setupEl=$('setup-block');
  if(!setupEl)return;

  const teamRows=rosters.map(r=>`
    <div onclick="selectMFLTeam('${r.roster_id}','${leagueId}','${year}','${escHtml(apiKey||'')}')"
      style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border2)'">
      <div style="width:36px;height:36px;border-radius:9px;background:#0057b8;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${r.roster_id}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r._team_name||'Team '+r.roster_id)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${escHtml(r._owner_name||'')} · ${r.players.length} players</div>
      </div>
    </div>`).join('');

  setupEl.innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;background:#0057b8;color:#fff;border-radius:6px;padding:3px 10px;margin-bottom:10px;letter-spacing:.06em">MFL</div>
      <h3 style="font-size:18px;font-weight:700;margin-bottom:6px">${escHtml(league.name)}</h3>
      <p style="font-size:13px;color:var(--text3)">${league.total_rosters} teams · ${year} · Select your team below</p>
    </div>
    <div id="mfl-team-list" style="max-width:440px;margin:0 auto">${teamRows}</div>`;
}
window.showMFLTeamPicker = showMFLTeamPicker;

async function selectMFLTeam(rosterId,leagueId,year,apiKey){
  const S_ref=window.S||window.App?.S;
  if(!S_ref)return;

  S_ref.myRosterId=String(rosterId);

  const setupEl=$('setup-block');
  if(setupEl)setupEl.innerHTML=`<div style="text-align:center;padding:30px 0">
    <span style="display:inline-block;width:24px;height:24px;border:2.5px solid rgba(255,255,255,.2);border-top-color:#0057b8;border-radius:50%;animation:spin .7s linear infinite"></span>
    <div style="font-size:16px;font-weight:700;margin:14px 0 6px">Loading your league...</div>
    <div style="font-size:13px;color:var(--text3)">Mapping MFL data to ReconAI</div>
  </div>`;

  try{
    try{
      localStorage.setItem('mfl_league_id',leagueId);
      localStorage.setItem('mfl_year',String(year));
      if(apiKey)localStorage.setItem('mfl_api_key',apiKey);
      localStorage.setItem('mfl_my_franchise',String(rosterId));
    }catch(e){}

    _updateLeaguePillMFL(S_ref.leagues[0]?.name||'MFL League');

    const sb=$('setup-block');if(sb)sb.style.display='none';
    const dc=$('digest-content');if(dc)dc.style.display='block';
    switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
    prog(100);

    try{if(typeof renderHomeSnapshot==='function')renderHomeSnapshot();}catch(e){}
    try{if(typeof checkApiKeyCallout==='function')checkApiKeyCallout();}catch(e){}
    try{if(typeof updateSettingsStatus==='function')updateSettingsStatus();}catch(e){}

    Promise.resolve().then(()=>loadAllData());

  }catch(e){
    console.error('[MFL] selectMFLTeam error:',e);
    if(setupEl)setupEl.innerHTML=`<div style="color:var(--red);font-size:14px;text-align:center">Error: ${escHtml(e.message)}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="connectMFL()">Try again</button>`;
  }
}
window.selectMFLTeam = selectMFLTeam;

function _updateLeaguePillMFL(leagueName){
  const lp=$('league-pill');
  if(lp)lp.innerHTML=`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(leagueName)}</span><span id="platform-badge" style="font-size:10px;font-weight:700;background:#0057b8;color:#fff;border-radius:4px;padding:1px 5px;flex-shrink:0;letter-spacing:.04em">MFL</span><span style="opacity:.5;font-size:13px;flex-shrink:0">⇄</span>`;
}

// ── Yahoo Connect ──────────────────────────────────────────────
// OAuth flow: "Connect with Yahoo" → redirects to Yahoo → Yahoo redirects to
// yahoo-proxy Edge Function → Edge Function stores tokens → redirects back to
// app with ?yahoo_session=UUID → boot section detects param, shows league picker.
async function connectYahoo(){
  if(!window.Yahoo){ss('conn-status','Yahoo connector not loaded — refresh and try again.',true);return;}

  const btn=$('yahoo-conn-btn');
  if(btn){btn.disabled=true;btn.textContent='Connecting...';}
  const progEl=$('prog');if(progEl)progEl.style.display='block';
  prog(5);ss('conn-status','Opening Yahoo sign-in...');

  try{
    // startAuth() redirects the page — no return value.
    await window.Yahoo.startAuth();
    // Execution stops here; Yahoo will redirect back to this page.
  }catch(e){
    ss('conn-status','Error: '+e.message,true);
    if(btn){btn.disabled=false;btn.textContent='Connect with Yahoo';}
    if(progEl)progEl.style.display='none';
  }
}
window.connectYahoo = connectYahoo;

// Manual league key entry — requires Yahoo session already established via OAuth.
async function connectYahooManual(){
  const keyRaw=($('yahoo-league-key')?.value||'').trim();
  if(!keyRaw){ss('conn-status','Enter your Yahoo league key (e.g. 423.l.12345)',true);return;}
  if(!window.Yahoo){ss('conn-status','Yahoo connector not loaded — refresh and try again.',true);return;}
  if(!localStorage.getItem('yahoo_session_id')){
    ss('conn-status','Authenticate with Yahoo first by clicking "Connect with Yahoo".',true);return;
  }

  const progEl=$('prog');if(progEl)progEl.style.display='block';
  prog(20);ss('conn-status','Fetching Yahoo league...');

  try{
    if(!S.players||Object.keys(S.players).length<100){
      try{S.players=await window.App.sf('/players/nfl');}catch(e){S.players=S.players||{};}
    }
    await _connectYahooLeague(keyRaw,null);
  }catch(e){
    ss('conn-status','Error: '+e.message,true);
    if(progEl)progEl.style.display='none';
  }
}
window.connectYahooManual = connectYahooManual;

function showYahooLeaguePicker(leagues){
  const setupEl=$('setup-block');
  if(!setupEl)return;

  const rows=leagues.map(l=>`
    <div onclick="selectYahooLeague('${escHtml(l.leagueKey)}')"
      style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border2)'">
      <div style="width:36px;height:36px;border-radius:9px;background:#6001d2;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${(l.season||'').slice(-2)||'NFL'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(l.name)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${l.numTeams} teams · ${l.season} · ${escHtml(l.leagueKey)}</div>
      </div>
    </div>`).join('');

  setupEl.innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;background:#6001d2;color:#fff;border-radius:6px;padding:3px 10px;margin-bottom:10px;letter-spacing:.06em">YAHOO</div>
      <h3 style="font-size:18px;font-weight:700;margin-bottom:6px">Your Yahoo Leagues</h3>
      <p style="font-size:13px;color:var(--text3)">Select the league you want to manage</p>
    </div>
    <div style="max-width:440px;margin:0 auto">${rows}</div>`;
}
window.showYahooLeaguePicker = showYahooLeaguePicker;

async function selectYahooLeague(leagueKey){
  const setupEl=$('setup-block');
  if(setupEl)setupEl.innerHTML=`<div style="text-align:center;padding:30px 0">
    <span style="display:inline-block;width:24px;height:24px;border:2.5px solid rgba(255,255,255,.2);border-top-color:#6001d2;border-radius:50%;animation:spin .7s linear infinite"></span>
    <div style="font-size:16px;font-weight:700;margin:14px 0 6px">Loading league...</div>
    <div style="font-size:13px;color:var(--text3)">Fetching rosters from Yahoo</div>
  </div>`;
  try{
    prog(40);ss('conn-status','Fetching league rosters...');
    const result=await window.Yahoo.connectLeague(leagueKey,null);
    prog(80);
    showYahooTeamPicker(result,leagueKey);
  }catch(e){
    if(setupEl)setupEl.innerHTML=`<div style="color:var(--red);font-size:14px;text-align:center">Error: ${escHtml(e.message)}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="connectYahoo()">Try again</button>`;
  }
}
window.selectYahooLeague = selectYahooLeague;

async function _connectYahooLeague(leagueKey,myTeamId){
  prog(50);ss('conn-status','Fetching league rosters...');
  const teamKey=myTeamId?leagueKey+'.t.'+myTeamId:null;
  const result=await window.Yahoo.connectLeague(leagueKey,teamKey);
  prog(80);
  showYahooTeamPicker(result,leagueKey);
}

function showYahooTeamPicker(result,leagueKey){
  const{rosters,league}=result;
  const setupEl=$('setup-block');
  if(!setupEl)return;

  const teamRows=rosters.map(r=>`
    <div onclick="selectYahooTeam('${r.roster_id}','${escHtml(leagueKey)}')"
      style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border2);border-radius:10px;margin-bottom:6px;cursor:pointer;transition:all .15s"
      onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border2)'">
      <div style="width:36px;height:36px;border-radius:9px;background:#6001d2;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${r.roster_id}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r._team_name||'Team '+r.roster_id)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${escHtml(r._owner_name||'')} · ${r.players.length} players · ${r.settings.wins}-${r.settings.losses}</div>
      </div>
    </div>`).join('');

  setupEl.innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;background:#6001d2;color:#fff;border-radius:6px;padding:3px 10px;margin-bottom:10px;letter-spacing:.06em">YAHOO</div>
      <h3 style="font-size:18px;font-weight:700;margin-bottom:6px">${escHtml(league.name)}</h3>
      <p style="font-size:13px;color:var(--text3)">${league.total_rosters} teams · ${league.season} · Select your team below</p>
    </div>
    <div id="yahoo-team-list" style="max-width:440px;margin:0 auto">${teamRows}</div>`;
}
window.showYahooTeamPicker = showYahooTeamPicker;

async function selectYahooTeam(teamId,leagueKey){
  const S_ref=window.S||window.App?.S;
  if(!S_ref)return;
  S_ref.myRosterId=String(teamId);

  const setupEl=$('setup-block');
  if(setupEl)setupEl.innerHTML=`<div style="text-align:center;padding:30px 0">
    <span style="display:inline-block;width:24px;height:24px;border:2.5px solid rgba(255,255,255,.2);border-top-color:#6001d2;border-radius:50%;animation:spin .7s linear infinite"></span>
    <div style="font-size:16px;font-weight:700;margin:14px 0 6px">Loading your league...</div>
    <div style="font-size:13px;color:var(--text3)">Mapping Yahoo data to ReconAI</div>
  </div>`;

  try{
    try{
      localStorage.setItem('yahoo_league_key',leagueKey);
      localStorage.setItem('yahoo_my_team',String(teamId));
    }catch(e){}

    _updateLeaguePillYahoo(S_ref.leagues[0]?.name||'Yahoo League');

    const sb=$('setup-block');if(sb)sb.style.display='none';
    const dc=$('digest-content');if(dc)dc.style.display='block';
    switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
    prog(100);

    try{if(typeof renderHomeSnapshot==='function')renderHomeSnapshot();}catch(e){}
    try{if(typeof checkApiKeyCallout==='function')checkApiKeyCallout();}catch(e){}
    try{if(typeof updateSettingsStatus==='function')updateSettingsStatus();}catch(e){}

    Promise.resolve().then(()=>loadAllData());

  }catch(e){
    console.error('[Yahoo] selectYahooTeam error:',e);
    if(setupEl)setupEl.innerHTML=`<div style="color:var(--red);font-size:14px;text-align:center">Error: ${escHtml(e.message)}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="connectYahoo()">Try again</button>`;
  }
}
window.selectYahooTeam = selectYahooTeam;

function _updateLeaguePillYahoo(leagueName){
  const lp=$('league-pill');
  if(lp)lp.innerHTML=`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(leagueName)}</span><span id="platform-badge" style="font-size:10px;font-weight:700;background:#6001d2;color:#fff;border-radius:4px;padding:1px 5px;flex-shrink:0;letter-spacing:.04em">YAHOO</span><span style="opacity:.5;font-size:13px;flex-shrink:0">⇄</span>`;
}

// Auto-restore ESPN session on page load
function _tryRestoreESPN(){
  try{
    const leagueId=localStorage.getItem('espn_league_id');
    const year=localStorage.getItem('espn_year');
    const myTeam=localStorage.getItem('espn_my_team');
    if(!leagueId||!year||!myTeam)return false;
    // Check if we have the data already
    if(S.platform==='espn'&&S.currentLeagueId)return true;
    return false; // Needs fresh fetch — caller handles
  }catch(e){return false;}
}

function showLeaguePicker(leagues,userId){
  try{
    // URL param from War Room takes priority
    const urlLeague=new URLSearchParams(window.location.search).get('league');
    if(urlLeague&&leagues.find(l=>l.league_id===urlLeague)){
      selectLeague(urlLeague,userId);
      return;
    }
    const savedLeague=DhqStorage.getStr(STORAGE_KEYS.LEAGUE);
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
  // Determine which league is "unlocked" for free users:
  // the currently active/saved league, or the first in the list if none yet.
  const isFree=typeof getTier==='function'?getTier()==='free':false;
  const savedLeagueId=DhqStorage.getStr(STORAGE_KEYS.LEAGUE)||S.currentLeagueId||'';
  const unlockedId=isFree?(savedLeagueId&&leagues.find(l=>l.league_id===savedLeagueId)?savedLeagueId:leagues[0]?.league_id):null;
  $('setup-block').innerHTML=`
    <h3 style="font-size:18px;text-align:center">Choose your league</h3>
    <p style="font-size:14px;color:var(--text2);margin-bottom:18px;line-height:1.6;text-align:center">Found ${leagues.length} league${leagues.length>1?'s':''} for ${S.season}. Select the one you want to manage.</p>
    ${isFree?`<div style="max-width:440px;margin:0 auto 14px;padding:10px 14px;background:var(--accentL);border:1px solid var(--accent);border-radius:var(--rl);display:flex;align-items:center;gap:10px;font-size:13px;color:var(--accent)"><span style="font-size:16px">🔒</span><span>Free plan — 1 league. <strong>Upgrade</strong> to access all your leagues.</span></div>`:''}
    <div id="league-pick-list" style="max-width:440px;margin:0 auto">
      ${leagues.map((l,i)=>{
        const locked=isFree&&l.league_id!==unlockedId;
        return `
        <div onclick="trySelectLeague('${l.league_id}','${userId}')" style="position:relative;display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rl);margin-bottom:8px;cursor:pointer;transition:all .2s;animation:cardIn .3s ease both;animation-delay:${i*0.05}s;${locked?'opacity:.65;':''}${locked?'filter:grayscale(.3);':''}" onmouseover="this.style.borderColor='${locked?'var(--border2)':'var(--accent)'}';${locked?'':'this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 16px rgba(212,175,55,.15)\'}'}" onmouseout="this.style.borderColor='var(--border2)';this.style.transform='none';this.style.boxShadow='none'">
          ${l.avatar?`<div style="position:relative;width:40px;height:40px;flex-shrink:0"><img src="https://sleepercdn.com/avatars/thumbs/${l.avatar}" style="width:40px;height:40px;border-radius:10px;object-fit:cover" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><div style="display:none;width:40px;height:40px;border-radius:10px;background:var(--accentL);align-items:center;justify-content:center;font-size:16px">\u{1F3C8}</div></div>`:`<div style="width:40px;height:40px;border-radius:10px;background:var(--accentL);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">\u{1F3C8}</div>`}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em">${l.name||'Unnamed League'}</div>
            <div style="font-size:13px;color:var(--text3);margin-top:3px">${locked?`<span style="color:var(--accent);font-weight:600">🔒 Upgrade to unlock</span>`:`${l.total_rosters} teams · ${typeLabel(l.settings?.type)} · ${statusLabel(l.status)}`}</div>
          </div>
          <div style="font-size:13px;color:var(--text3);text-align:right;flex-shrink:0">
            <div style="color:var(--accent);font-weight:600">${l.season}</div>
            <div style="margin-top:2px;font-weight:500">${l.settings?.type===2?'Dynasty':'Redraft'}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
window.showLeaguePicker = showLeaguePicker;

// ── League limit enforcement ───────────────────────────────────
// trySelectLeague — gate for free users. Paid users proceed directly.
// Free users: if clicking a league that isn't their current one, show
// the upgrade prompt (with option to switch). Otherwise proceed.
function trySelectLeague(leagueId,userId){
  const isFree=typeof getTier==='function'?getTier()==='free':false;
  if(!isFree){selectLeague(leagueId,userId);return;}
  const currentId=S.currentLeagueId||DhqStorage.getStr(STORAGE_KEYS.LEAGUE)||'';
  // No current league yet (first-time picker) — just pick it freely
  if(!currentId){selectLeague(leagueId,userId);return;}
  // Same league as currently active — allow (re-selecting same league is fine)
  if(leagueId===currentId){selectLeague(leagueId,userId);return;}
  // Free user trying a different league — show upgrade prompt
  const target=S.leagues.find(l=>l.league_id===leagueId);
  const current=S.leagues.find(l=>l.league_id===currentId);
  showLeagueUpgradePrompt(target,current,leagueId,userId);
}
window.trySelectLeague = trySelectLeague;
window.App.trySelectLeague = trySelectLeague;

// showLeagueUpgradePrompt — modal shown when a free user taps a locked league.
// Lists other available leagues as a teaser and offers upgrade + switch paths.
function showLeagueUpgradePrompt(targetLeague,currentLeague,leagueId,userId){
  const existing=document.getElementById('league-limit-modal');
  if(existing)existing.remove();
  const connectedName=escHtml(currentLeague?.name||'your league');
  const otherLeagues=(S.leagues||[]).filter(l=>l.league_id!==(currentLeague?.league_id));
  const avatarHtml=l=>l.avatar
    ?`<img src="https://sleepercdn.com/avatars/thumbs/${l.avatar}" style="width:28px;height:28px;border-radius:7px;object-fit:cover" onerror="this.style.display='none'"/>`
    :`<div style="width:28px;height:28px;border-radius:7px;background:var(--accentL);display:flex;align-items:center;justify-content:center;font-size:11px">\u{1F3C8}</div>`;
  const teaserHtml=otherLeagues.slice(0,4).map(l=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rl)">
      ${avatarHtml(l)}
      <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${escHtml(l.name||'League')}</span>
      <span style="font-size:12px;color:var(--text3)">🔒</span>
    </div>`).join('');
  const modal=document.createElement('div');
  modal.id='league-limit-modal';
  modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)';
  modal.innerHTML=`
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:18px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,.5)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:32px;margin-bottom:12px">🔒</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;letter-spacing:-.02em">You're connected to ${connectedName}</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6">Upgrade to add all your leagues and switch between them instantly.</div>
      </div>
      ${otherLeagues.length>0?`
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Your other leagues</div>
        <div style="display:flex;flex-direction:column;gap:6px">${teaserHtml}</div>
      </div>`:''}
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="document.getElementById('league-limit-modal').remove();if(window.App?.openUpgradeModal)window.App.openUpgradeModal('leagues-multi');else showToast('Upgrade at warroom.fantasy');" style="padding:13px 20px;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:-.01em">Upgrade to unlock all leagues →</button>
        <button onclick="document.getElementById('league-limit-modal').remove();selectLeague('${leagueId}','${userId}')" style="padding:10px 20px;background:transparent;color:var(--text2);border:1px solid var(--border2);border-radius:12px;font-size:13px;font-weight:500;cursor:pointer">Switch to this league instead</button>
        <button onclick="document.getElementById('league-limit-modal').remove()" style="padding:8px;background:transparent;color:var(--text3);border:none;font-size:13px;cursor:pointer">Cancel</button>
      </div>
    </div>`;
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
}
window.showLeagueUpgradePrompt = showLeagueUpgradePrompt;
window.App.showLeagueUpgradePrompt = showLeagueUpgradePrompt;

function switchLeagueMode(){
  $('setup-block').style.display='block';
  const dc=$('digest-content');if(dc)dc.style.display='none';
  showLeaguePicker(S.leagues,S.user.user_id);
  switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
}
window.switchLeagueMode = switchLeagueMode;

async function selectLeague(leagueId,userId){
  S.currentLeagueId=leagueId;
  DhqStorage.setStr(STORAGE_KEYS.LEAGUE, leagueId);
  const league=S.leagues.find(l=>l.league_id===leagueId);
  const leagueName=(league?.name||'League').substring(0,20);
  const isDynasty=league?.settings?.type===2;
  const lpEl=$('league-pill');if(lpEl)lpEl.innerHTML='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(leagueName)+(isDynasty?'':' (Redraft)')+'</span><span style="opacity:.5;font-size:13px;flex-shrink:0">\u21C4</span>';
  const sbEl=$('setup-block');if(sbEl)sbEl.innerHTML=`<div style="text-align:center;padding:20px 0">
    <div style="margin:0 auto 16px;width:52px;height:52px;background:linear-gradient(135deg,#d4af37,#b8941f);border-radius:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(212,175,55,0.3)">
      <span style="display:inline-block;width:24px;height:24px;border:2.5px solid rgba(255,255,255,.2);border-top-color:#d4af37;border-radius:50%;animation:spin .7s linear infinite"></span>
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
    try{renderHomeSnapshot();}catch(e){dhqLog('selectLeague.renderHomeSnapshot',e);}
    checkApiKeyCallout();
    if(typeof updateSettingsStatus==='function')updateSettingsStatus();
    Promise.resolve().then(()=>{
      console.log('loadAllData: triggered via microtask');
      loadAllData();
    });
  }catch(e){
    const sb=$('setup-block');
    if(sb)sb.innerHTML=`<div style="color:var(--red);font-size:14px">Error: ${escHtml(e.message)}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="connect()">Try again</button>`;
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
    if (missing.length) console.warn('[Scout] Missing functions:', missing.join(', '));
    if(loadBanner)loadBanner.style.display='none';
    prog(100);
    if(typeof updateDataFreshness==='function')updateDataFreshness();
    if(typeof updateSyncStatus==='function')updateSyncStatus();
    if(typeof buildRosterTable==='function')buildRosterTable();
    try{if(typeof renderAvailable==='function')renderAvailable();}catch(e){console.warn('renderAvailable:',e);}
    try{if(typeof renderDraftNeeds==='function')renderDraftNeeds();}catch(e){console.warn('renderDraftNeeds:',e);}
    try{if(typeof renderHomeSnapshot==='function')renderHomeSnapshot();}catch(e){dhqLog('loadAllData.renderHomeSnapshot',e);}
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
    if(!DhqStorage.getStr(STORAGE_KEYS.STRATEGY_DONE)&&(S.apiKey||(typeof hasAnyAI==='function'&&hasAnyAI()))){
      setTimeout(()=>{if(typeof startStrategyWalkthrough==='function')startStrategyWalkthrough();},500);
    }
    try{if(typeof runMemoryCapture==='function')runMemoryCapture(S.currentLeagueId);}catch(e){dhqLog('loadAllData.runMemoryCapture',e);}
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
  DhqStorage.setStr(STORAGE_KEYS.API_KEY, k);
  DhqStorage.setStr(STORAGE_KEYS.API_PROVIDER, provider);
  DhqStorage.setStr(STORAGE_KEYS.API_MODEL, model);
  const label = p?.name || provider;
  ss('key-status', label + ' key saved ✓');
  if(typeof updateSettingsStatus==='function')updateSettingsStatus();
  if(typeof checkApiKeyCallout==='function')checkApiKeyCallout();
}
window.saveKey = saveKey;

function clearKey(){
  S.apiKey=''; S.aiProvider='anthropic'; S.aiModel='';
  DhqStorage.remove(STORAGE_KEYS.API_KEY);
  DhqStorage.remove(STORAGE_KEYS.API_PROVIDER);
  DhqStorage.remove(STORAGE_KEYS.API_MODEL);
  const inp=$('api-key-in');if(inp)inp.value='';
  ss('key-status','Key cleared');
  if(typeof updateSettingsStatus==='function')updateSettingsStatus();
}
window.clearKey = clearKey;

function reconnect(){
  const u=$('s-user-in')?.value?.trim();
  if(!u){showToast('Enter a username first');return;}
  S.user=null;S.leagues=[];S.rosters=[];S.myRosterId=null;
  S.playerStats={};S.posRanks={};
  const LI_ref = window.App;
  if(LI_ref){LI_ref.LI_LOADED=false;LI_ref.LI={};window._liLoading=false;}
  DhqStorage.remove('dhq_leagueintel_v10'); // old v10 key — clear on reconnect
  DhqStorage.removeByPrefix(STORAGE_KEYS.HIST_PREFIX);
  const sb=$('setup-block');
  if(sb){
    sb.style.display='block';
    sb.innerHTML=`<div style="text-align:center;margin-bottom:16px">
      <div style="font-size:28px;margin-bottom:8px">🔄</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">Switching account</div>
      <div style="font-size:13px;color:var(--text3)">Connecting as <strong style="color:var(--accent)">${escHtml(u)}</strong></div>
    </div>
    <div class="row" style="max-width:380px;margin:0 auto">
      <input type="text" id="u-input" value="${escHtml(u)}" placeholder="Sleeper username" style="font-size:15px;padding:12px 16px;border-radius:12px" onkeydown="if(event.key==='Enter')connect()"/>
      <button class="btn" id="conn-btn" onclick="connect()" style="padding:12px 24px;font-size:14px;font-weight:700;border-radius:12px">Connect</button>
    </div>
    <div id="conn-status" class="status-txt" style="text-align:center;margin-top:8px"></div>
    <div class="prog" id="prog" style="display:none;max-width:380px;margin:0 auto"><div class="prog-bar" id="prog-bar" style="width:0%"></div></div>`;
  }
  const dc=$('digest-content');if(dc)dc.style.display='none';
  DhqStorage.setStr(STORAGE_KEYS.USERNAME, u);
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
function loadMemory(){return DhqStorage.get(STORAGE_KEYS.MEMORY, {});}
function saveMemory(data){DhqStorage.set(STORAGE_KEYS.MEMORY, data);}
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
    DhqStorage.setStr(STORAGE_KEYS.NOTIF_PERM, perm);
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
  const prev=DhqStorage.get(STORAGE_KEYS.LAST_ALERTS, {});
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
  DhqStorage.set(STORAGE_KEYS.LAST_ALERTS, now);
}
window.checkForAlerts = checkForAlerts;

// ── Boot: Restore API key + auto-connect ───────────────────────
(function restoreApiKey(){
  try{
    // Check for Fantasy Wars email session or profile for Sleeper username
    try {
      if (!DhqStorage.getStr(STORAGE_KEYS.USERNAME)) {
        let fwUsername = null;
        // Try fw_session_v1 first
        const fw = DhqStorage.get(STORAGE_KEYS.FW_SESSION);
        if (fw) fwUsername = fw?.user?.sleeperUsername;
        // Fallback: od_profile_v1 (set during War Room onboarding)
        if (!fwUsername) {
          const prof = DhqStorage.get(STORAGE_KEYS.OD_PROFILE);
          if (prof) fwUsername = prof?.sleeperUsername;
        }
        // Fallback: od_auth_v1 (legacy War Room login)
        if (!fwUsername) {
          const auth = DhqStorage.get(STORAGE_KEYS.OD_AUTH);
          if (auth) fwUsername = auth?.sleeperUsername || auth?.username;
        }
        if (fwUsername) {
          DhqStorage.setStr(STORAGE_KEYS.USERNAME, fwUsername);
          console.log('[Scout] Auto-connected from Fantasy Wars session:', fwUsername);
        }
      }
    } catch(e) {}

    const k = DhqStorage.getStr(STORAGE_KEYS.API_KEY);
    const prov = DhqStorage.getStr(STORAGE_KEYS.API_PROVIDER) || 'anthropic';
    const model = DhqStorage.getStr(STORAGE_KEYS.API_MODEL);
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
    const xk=DhqStorage.getStr(STORAGE_KEYS.XAI_KEY);
    if(xk){const xIn=$('xai-key-in');if(xIn)xIn.value=xk;}
    // Restore notification button state
    if('Notification' in window&&Notification.permission==='granted'){const nb=$('notif-btn');if(nb)nb.textContent='Enabled \u2713';}
    const savedUser = DhqStorage.getStr(STORAGE_KEYS.USERNAME);

    // ── Yahoo OAuth callback detection ────────────────────────────
    // After Yahoo OAuth, the edge function redirects back with ?yahoo_session=UUID.
    const _yahooSessionParam = new URLSearchParams(window.location.search).get('yahoo_session');
    if (_yahooSessionParam) {
      // Store session ID and clean URL without reloading
      try{ if(window.Yahoo) window.Yahoo.handleCallback(_yahooSessionParam); else localStorage.setItem('yahoo_session_id',_yahooSessionParam); }catch(e){}
      try{ window.history.replaceState({},document.title,window.location.pathname); }catch(e){}
      // Load player DB and show Yahoo league picker
      setTimeout(async()=>{
        if(S.user)return;
        try{
          ss('conn-status','Loading your Yahoo leagues...');
          const _pEl=$('prog');if(_pEl)_pEl.style.display='block'; prog(20);
          if(!S.players||Object.keys(S.players).length<100){
            try{S.players=await window.App.sf('/players/nfl');}catch(e){S.players=S.players||{};}
          }
          prog(50);
          const _raw=await window.Yahoo.fetchUserLeagues();
          const _leagues=window.Yahoo.parseUserLeagues(_raw);
          prog(75);ss('conn-status','');
          if(!_leagues.length){ss('conn-status','No Yahoo NFL leagues found. Check your account.',true);return;}
          const _sb=$('setup-block');if(_sb)_sb.style.display='block';
          if(_leagues.length===1){
            await _connectYahooLeague(_leagues[0].leagueKey,null);
          } else {
            showYahooLeaguePicker(_leagues);
          }
        }catch(e){
          console.warn('[Yahoo] Post-OAuth flow failed:',e.message);
          ss('conn-status','Yahoo connect failed: '+e.message,true);
          const _pF=$('prog');if(_pF)_pF.style.display='none';
        }
      },500);
    // ── Yahoo session auto-restore ────────────────────────────────
    } else {
      const _yahooLeagueKey = localStorage.getItem('yahoo_league_key');
      const _yahooMyTeam    = localStorage.getItem('yahoo_my_team');
      const _yahooSessionId = localStorage.getItem('yahoo_session_id');
      if (_yahooLeagueKey && _yahooMyTeam && _yahooSessionId) {
        setTimeout(async()=>{
          if(S.user)return;
          try{
            if(!window.Yahoo){
              console.warn('[Yahoo] window.Yahoo not loaded — falling back to Sleeper');
              if(savedUser){const ui=$('u-input');if(ui)ui.value=savedUser;connect();}
              return;
            }
            ss('conn-status','Reconnecting to Yahoo...');
            const _pEl=$('prog');if(_pEl)_pEl.style.display='block'; prog(5);
            if(!S.players||Object.keys(S.players).length<100){
              try{S.players=await window.App.sf('/players/nfl');}catch(e){S.players=S.players||{};}
            }
            prog(30);
            const _teamKey=_yahooLeagueKey+'.t.'+_yahooMyTeam;
            const _res=await window.Yahoo.connectLeague(_yahooLeagueKey,_teamKey);
            S.myRosterId=String(_yahooMyTeam);
            if(!S.user)S.user={user_id:'yahoo_user',display_name:_res.league.name,username:'yahoo_user'};
            _updateLeaguePillYahoo(_res.league.name);
            const _sb=$('setup-block');if(_sb)_sb.style.display='none';
            const _dc=$('digest-content');if(_dc)_dc.style.display='block';
            switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
            prog(100);ss('conn-status','');
            try{renderHomeSnapshot();}catch(e){}
            try{checkApiKeyCallout();}catch(e){}
            if(typeof updateSettingsStatus==='function')try{updateSettingsStatus();}catch(e){}
            Promise.resolve().then(()=>loadAllData());
          }catch(e){
            console.warn('[Yahoo] Auto-restore failed:',e.message);
            ss('conn-status',''); prog(0);
            const _pF=$('prog');if(_pF)_pF.style.display='none';
            localStorage.removeItem('yahoo_league_key');
            localStorage.removeItem('yahoo_my_team');
            localStorage.removeItem('yahoo_session_id');
            if(savedUser){const ui=$('u-input');if(ui)ui.value=savedUser;connect();}
          }
        },500);
    // ── ESPN session restore ───────────────────────────────────────
    // If a previous ESPN session exists, reconnect it instead of Sleeper.
    // Uses a 500ms delay so all modules (including window.ESPN) are loaded.
      } else {
    const _espnSavedId   = localStorage.getItem('espn_league_id');
    const _espnSavedTeam = localStorage.getItem('espn_my_team');
    if (_espnSavedId && _espnSavedTeam) {
      setTimeout(async () => {
        if (S.user) return; // Already connected via another path
        try {
          const _yr   = parseInt(localStorage.getItem('espn_year') || String(new Date().getFullYear()));
          const _s2   = localStorage.getItem('espn_s2')   || '';
          const _sw   = localStorage.getItem('espn_swid') || '';
          if (!window.ESPN) {
            console.warn('[ESPN] window.ESPN not loaded — falling back to Sleeper');
            if (savedUser) { const ui=$('u-input');if(ui)ui.value=savedUser; connect(); }
            return;
          }
          ss('conn-status','Reconnecting to ESPN...');
          const _pEl=$('prog');if(_pEl)_pEl.style.display='block'; prog(5);
          // Load Sleeper player DB for crosswalk (best-effort)
          if(!S.players||Object.keys(S.players).length<100){
            try{ S.players=await window.App.sf('/players/nfl'); }catch(e){ S.players=S.players||{}; }
          }
          prog(30);
          const _res=await window.ESPN.connectLeague(_espnSavedId,_yr,_s2||null,_sw||null);
          S.myRosterId=String(_espnSavedTeam);
          if(!S.user) S.user={user_id:'espn_user',display_name:_res.league.name,username:'espn_user'};
          S.myUserId='espn_user';
          _updateLeaguePillESPN(_res.league.name);
          const _sb=$('setup-block');if(_sb)_sb.style.display='none';
          const _dc=$('digest-content');if(_dc)_dc.style.display='block';
          switchTab('digest',document.querySelector('.tab[onclick*="digest"]'));
          prog(100);ss('conn-status','');
          try{renderHomeSnapshot();}catch(e){}
          try{checkApiKeyCallout();}catch(e){}
          if(typeof updateSettingsStatus==='function')try{updateSettingsStatus();}catch(e){}
          Promise.resolve().then(()=>loadAllData());
        } catch(e) {
          console.warn('[ESPN] Auto-restore failed:',e.message);
          ss('conn-status',''); prog(0);
          const _pF=$('prog');if(_pF)_pF.style.display='none';
          // Clear bad session so Sleeper connect shows next time
          localStorage.removeItem('espn_league_id');
          localStorage.removeItem('espn_my_team');
          if(savedUser){const ui=$('u-input');if(ui)ui.value=savedUser;connect();}
        }
      }, 500);
    } else if(savedUser){
      const uInput = $('u-input');
      if(uInput) uInput.value = savedUser;
      setTimeout(()=>{if(!S.user)connect();},500);
    } else {
      // First-time user: focus the username input so they know where to start
      setTimeout(()=>{const inp=$('u-input');if(inp)inp.focus();},600);
    }
      } // end no-Yahoo else block
    } // end Yahoo/ESPN/Sleeper dispatch
    // Load user tier for paywall
    if (typeof loadUserTier === 'function') loadUserTier().catch(() => {});

    setTimeout(()=>{
      if(S.myRosterId&&!window.App.LI_LOADED&&!window._liLoading){
        console.log('FAILSAFE: data not loaded after 8s, forcing loadAllData');
        loadAllData();
      }
    },8000);
  }catch(e){dhqLog('restoreApiKey',e);}
})();

// ── Page unload memory save ────────────────────────────────────
window.addEventListener('beforeunload',function(){
  try{
    if(typeof homeChatHistory!=='undefined'&&homeChatHistory&&homeChatHistory.length>=4&&typeof autoSaveMemory==='function')autoSaveMemory(homeChatHistory,'Home');
    if(typeof tradeChatHistory!=='undefined'&&tradeChatHistory&&tradeChatHistory.length>=4&&typeof autoSaveMemory==='function')autoSaveMemory(tradeChatHistory,'Trades');
  }catch(e){dhqLog('beforeunload.autoSaveMemory',e);}
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
