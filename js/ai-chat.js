/*  ai-chat.js  — AI chat functions extracted from index.html.bak
 *  Exposes everything on window.App.
 *  Globals expected on window: S, LI, LI_LOADED, $, pName, pPos, pAge,
 *    pNameShort, pM, myR, dynastyValue, switchTab, closePlayerModal,
 *    getAvailablePlayers, getFAAB, getRosterSlots, calcIDPScore, idpTier,
 *    fullTeam, loadMentality, loadStrategy
 */
window.App = window.App || {};

// ── Chat history state ─────────────────────────────────────────
let homeChatHistory=[];
let tradeChatHistory=[];
let tradeBuilderAssets={mine:[],theirs:[]};
let draftChatHistory=[];

// ── Persistent Conversation Memory ──────────────────────────────
const CONV_MEM_KEY='dhq_sessions';

function loadConvMemory(){
  try{return JSON.parse(localStorage.getItem(CONV_MEM_KEY)||'[]');}catch(e){return[];}
}
function saveConvMemory(arr){
  try{localStorage.setItem(CONV_MEM_KEY,JSON.stringify(arr.slice(-6)));}catch(e){}
}
function addConvMemory(summary){
  if(!summary||summary.length<10)return;
  const arr=loadConvMemory();
  arr.push({ts:Date.now(),date:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),text:summary});
  saveConvMemory(arr);
}
function buildMemoryCtx(){
  const arr=loadConvMemory();
  if(!arr.length)return'';
  return'PAST SESSIONS (most recent first):\n'+[...arr].reverse().slice(0,4).map(m=>`[${m.date}] ${m.text}`).join('\n');
}
async function autoSaveMemory(history,label){
  if(!hasAnyAI()||!history||history.length<2)return;
  try{
    const recent=history.slice(-4).map(m=>m.role.toUpperCase()+': '+String(m.content).slice(0,150)).join('\n');
    const reply=await callClaude([{role:'user',content:'Summarize this dynasty fantasy football conversation in ONE sentence, max 15 words. Be specific about players/decisions.\n\n'+recent}],false,1,80);
    if(reply&&reply.length>5)addConvMemory((label?label+': ':'')+reply.trim().replace(/^["']/,'').replace(/["']$/,''));
  }catch(e){}
}
function buildMentalityCtx(){
  const m=loadMentality();
  const s={winnow:'WIN NOW',rebuild:'REBUILD',balanced:'BALANCED',prime:'2-3YR WINDOW'};
  const w={now:'competing now','1yr':'1yr out','2yr':'2-3yr out',far:'full rebuild'};
  const t={aggressive:'aggressive',selective:'selective',conservative:'conservative',pick_seller:'sells picks',pick_hoarder:'hoards picks'};
  const a={youth:'youth<25',balanced_age:'age neutral',vets:'vet friendly',agnostic:'age agnostic'};
  const r={high_risk:'high risk',moderate_risk:'moderate risk',low_risk:'low risk',no_risk:'zero risk'};
  const parts=[
    s[m.mentality]||m.mentality||'balanced',
    w[m.window]||'',
    t[m.tradeStyle]||'',
    a[m.agePreference]||'',
    r[m.riskTolerance]||'',
  ].filter(Boolean);
  const lines=['GM:'+parts.join(',')];
  if(m.upgradePositions)lines.push('UPGRADING:'+m.upgradePositions);
  if(m.targetPlayers)lines.push('TARGETS:'+m.targetPlayers);
  if(m.shoppingPlayers)lines.push('SELLING:'+m.shoppingPlayers);
  if(m.tradePrefs)lines.push('TRADE STYLE:'+m.tradePrefs.substring(0,150));
  if(m.neverDrop)lines.push('UNTOUCHABLE:'+m.neverDrop);
  if(m.notes)lines.push('NOTES:'+m.notes.substring(0,150));
  // Inject strategy walkthrough answers if available
  const strat=loadStrategy();
  if(strat){
    lines.push('STRATEGY:'+strat.mode+',trades:'+strat.tradeStyle+',IDP:'+strat.idpApproach+',draft:'+strat.draftApproach+',vets:'+strat.veteranApproach);
  }
  return lines.join('\n');
}

// ── Context builders ───────────────────────────────────────────
function buildCtx(){
  if(!S.user)return 'No account connected.';
  const my=myR();const s=my?.settings||{};
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const sc=league?.scoring_settings||{};
  const sorted=[...S.rosters].sort((a,b)=>(b.settings?.wins||0)-(a.settings?.wins||0));
  const rank=sorted.findIndex(r=>r.roster_id===S.myRosterId)+1;

  // Compact player string: "Name(WR,24,DHQ8200)"
  const pStr=(pid)=>{
    const val=dynastyValue(pid);const age=pAge(pid);
    return pName(pid)+'('+pPos(pid)+(age?','+age:'')+(val>0?',DHQ'+val:'')+')';
  };

  // Starters
  const starters=(my?.starters||[]).filter(p=>p&&p!=='0').map(pStr);

  // Top bench by DHQ value — keep it tight
  const benchPids=(my?.players||[]).filter(p=>!(my?.starters||[]).includes(p)&&!(my?.reserve||[]).includes(p)&&!(my?.taxi||[]).includes(p));
  const bench=benchPids.map(p=>({pid:p,val:dynastyValue(p)})).filter(x=>x.val>0).sort((a,b)=>b.val-a.val).slice(0,8).map(x=>pStr(x.pid));

  const totalVal=(my?.players||[]).reduce((sum,p)=>sum+dynastyValue(p),0);

  // Positional gaps
  const rp=league?.roster_positions||[];
  const slots={QB:0,RB:0,WR:0,TE:0,DL:0,LB:0,DB:0};
  rp.forEach(slot=>{
    if(slot in slots)slots[slot]++;
    else if(slot==='FLEX'){slots.RB+=0.4;slots.WR+=0.4;slots.TE+=0.2;}
    else if(slot==='SUPER_FLEX'){slots.QB+=0.5;slots.WR+=0.25;slots.RB+=0.25;}
    else if(slot==='IDP_FLEX'){slots.DL+=0.35;slots.LB+=0.35;slots.DB+=0.3;}
  });
  Object.keys(slots).forEach(p=>slots[p]=Math.round(slots[p]));

  const idpThresh={DL:Math.round(idpTier('DL',sc)*0.4),LB:Math.round(idpTier('LB',sc)*0.4),DB:Math.round(idpTier('DB',sc)*0.4)};
  const offThresh={QB:18,RB:10,WR:10,TE:8};
  const gaps=[];const surpluses=[];
  const players=my?.players||[];
  ['QB','RB','WR','TE','DL','LB','DB'].forEach(pos=>{
    const need=slots[pos]||0;if(!need)return;
    const thresh=idpThresh[pos]||offThresh[pos]||10;
    const mine=players.filter(p=>pPos(p)===pos);
    const startable=mine.filter(p=>(S.playerStats?.[p]?.seasonAvg||0)>=thresh).length;
    if(startable<need)gaps.push(pos+':'+(need-startable)+' short');
    else if(startable>need+1)surpluses.push(pos+':+'+(startable-need));
  });

  const picks=S.tradedPicks.filter(p=>p.owner_id===S.myRosterId).map(p=>p.season+'R'+p.round).join(',');
  const memCtx=buildMemoryCtx();

  // Trending data from Sleeper (real-time signal)
  let trendingCtx='';
  if(S.trending?.adds?.length){
    const topAdds=S.trending.adds.slice(0,5).map(t=>{const p=S.players[t.player_id];return p?(p.first_name+' '+p.last_name+' '+p.position):t.player_id;}).join(', ');
    const topDrops=(S.trending.drops||[]).slice(0,5).map(t=>{const p=S.players[t.player_id];return p?(p.first_name+' '+p.last_name+' '+p.position):t.player_id;}).join(', ');
    trendingCtx='TRENDING(24h): Most added: '+topAdds+'. Most dropped: '+topDrops+'.';
  }

  return [
    S.user.display_name+'|#'+rank+'/'+S.rosters.length+'|'+(s.wins||0)+'-'+(s.losses||0)+'|DHQ total:'+totalVal.toLocaleString(),
    'STARTERS:'+starters.join(';'),
    bench.length?'BENCH(top8):'+bench.join(';'):'',
    gaps.length?'NEEDS:'+gaps.join(','):'',
    surpluses.length?'SURPLUS:'+surpluses.join(','):'',
    picks?'PICKS:'+picks:'',
    'IDP:sack='+((sc.idp_sack)||4)+',INT='+((sc.idp_int)||5)+',PD='+((sc.idp_pass_def)||3)+',TKL='+((sc.idp_tkl_solo)||0.5),
    'Trade values=DHQ(0-10000 scale, league-derived, NOT dollars). Higher=better. 7000+=elite, 4000+=starter, 2000+=depth.',
    trendingCtx,
    memCtx||'',
  ].filter(Boolean).join('\n');
}

// Compact context for chat — keeps under ~1500 chars to avoid token limits
function buildCtxCompact(){
  if(!S.user)return'';
  const my=myR();if(!my)return'';
  const s=my.settings||{};
  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const sorted=[...S.rosters].sort((a,b)=>(b.settings?.wins||0)-(a.settings?.wins||0));
  const rank=sorted.findIndex(r=>r.roster_id===S.myRosterId)+1;
  // Top 5 starters only
  const starterPids=(my.starters||[]).filter(p=>p&&p!=='0');
  const topStarters=starterPids.map(pid=>({pid,val:dynastyValue(pid)})).sort((a,b)=>b.val-a.val).slice(0,5)
    .map(x=>pName(x.pid)+'('+pPos(x.pid)+','+dynastyValue(x.pid)+')').join('; ');
  const totalVal=(my.players||[]).reduce((sum,p)=>sum+dynastyValue(p),0);
  // Gaps only
  const gaps=[];
  const rp=league?.roster_positions||[];
  const sc=league?.scoring_settings||{};
  const mentalityStr=buildMentalityCtx();
  const picks=S.tradedPicks.filter(p=>p.owner_id===S.myRosterId&&parseInt(p.season)===parseInt(S.season)).map(p=>'R'+p.round).join(',');
  return[
    S.user.display_name+'|#'+rank+'/'+S.rosters.length+'|'+(s.wins||0)+'-'+(s.losses||0)+'|DHQ:'+totalVal.toLocaleString(),
    'TOP5:'+topStarters,
    picks?'PICKS:'+picks:'',
    mentalityStr||'',
    'DHQ scale 0-10000. 7000+=elite 4000+=starter. ALWAYS refer to values as "DHQ" not "FC" or "FantasyCalc".'
  ].filter(Boolean).join('\n');
}

// ── AI Provider layer ─────────────────────────────────────────
const PROVIDERS = {
  anthropic: {
    name: 'Claude (Anthropic)',
    placeholder: 'sk-ant-...',
    hint: 'Get your key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>. Supports web search.',
    defaultModel: 'claude-sonnet-4-20250514',
    validate: k => k.startsWith('sk-'),
  },
  groq: {
    name: 'Groq (Free)',
    placeholder: 'gsk_...',
    hint: 'Free tier at <a href="https://console.groq.com" target="_blank">console.groq.com</a>. Fast Llama 3.3 70B. No web search.',
    defaultModel: 'llama-3.3-70b-versatile',
    validate: k => k.startsWith('gsk_'),
  },
  gemini: {
    name: 'Gemini Flash (Free)',
    placeholder: 'AIza...',
    hint: 'Free tier at <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com</a>. 1M tokens/day free. No web search.',
    defaultModel: 'gemini-1.5-flash',
    validate: k => k.length > 10,
  },
  openai: {
    name: 'GPT-4o (OpenAI)',
    placeholder: 'sk-...',
    hint: 'Get your key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>. Pay-per-use.',
    defaultModel: 'gpt-4o',
    validate: k => k.startsWith('sk-'),
  },
  grok: {
    name: 'Grok (xAI)',
    placeholder: 'xai-...',
    hint: 'Get your key at <a href="https://console.x.ai" target="_blank">console.x.ai</a>. Pay-per-use.',
    defaultModel: 'grok-3-mini',
    validate: k => k.length > 10,
  },
};

function updateProviderHint(){
  const sel=$('ai-provider-sel');if(!sel)return;
  const prov=sel.value;
  const hints={
    anthropic:{text:'Claude Sonnet — best quality, requires paid API key',color:'var(--accent)'},
    groq:{text:'Groq Llama 3.3 — FREE tier, fast, great for most tasks',color:'var(--green)'},
    gemini:{text:'Gemini Flash — FREE tier, good quality',color:'var(--green)'},
    openai:{text:'GPT-4o — requires paid API key',color:'var(--text2)'},
    grok:{text:'Grok — requires xAI API key',color:'var(--text2)'},
  };
  const h=hints[prov]||{text:'',color:'var(--text3)'};
  const el=$('provider-hint');
  if(el){el.textContent=h.text;el.style.color=h.color;}
}

// ── Helper: check if server-side AI is available ─────────────
function hasServerAI(){
  return !!(window.OD?.callAI && window.OD?.getSessionToken && window.OD.getSessionToken());
}
window.hasServerAI = hasServerAI;
window.App.hasServerAI = hasServerAI;

// ── Helper: check if ANY AI is available (server or client key) ─
function hasAnyAI(){
  return !!(S.apiKey || hasServerAI());
}
window.hasAnyAI = hasAnyAI;
window.App.hasAnyAI = hasAnyAI;

// ── Core AI call ──────────────────────────────────────────────
// Priority: 1) Server-side via OD.callAI (no user key needed)
//           2) Client-side via user's API key (existing behavior)
async function callClaude(messages, useWebSearch=false, _retries=2, maxTok=600){
  const sys = 'Dynasty FF advisor. Values from DHQ (0-10000 scale, league-derived). Be specific with player names and DHQ values. Sleeper-ready messages when asked.';

  // ── SERVER-SIDE PATH: use OD.callAI Edge Function ──────────
  // Available when user has a Supabase session (no API key required)
  if(hasServerAI()){
    try{
      // Build a single context string from the messages array
      const lastUserMsg = [...messages].reverse().find(m=>m.role==='user');
      const contextParts = messages.map(m => m.role.toUpperCase()+': '+m.content).join('\n');
      const result = await window.OD.callAI({
        type: 'recon-chat',
        context: JSON.stringify({
          system: sys,
          messages: messages,
          userMessage: lastUserMsg?.content || '',
          maxTokens: maxTok,
          useWebSearch: useWebSearch,
        }),
      });
      const reply = result?.analysis || result?.response || result?.text ||
        (typeof result === 'string' ? result : JSON.stringify(result));
      // Cache the response in Supabase
      if(window.OD.saveAIAnalysis && S.currentLeagueId){
        window.OD.saveAIAnalysis(
          S.currentLeagueId,
          'recon-chat',
          (lastUserMsg?.content||'').substring(0,200),
          reply
        ).catch(()=>{}); // fire and forget
      }
      return reply || 'No response.';
    }catch(serverErr){
      console.warn('[ReconAI] Server AI failed, falling back to client:', serverErr.message);
      // Fall through to client-side if user has an API key
      if(!S.apiKey) throw serverErr;
    }
  }

  // ── CLIENT-SIDE PATH: direct API calls with user's key ─────
  if(!S.apiKey) throw new Error('No AI available. Connect your account or add an API key in Settings.');

  const provider = S.aiProvider || 'anthropic';
  const apiKey = S.apiKey;
  const model = S.aiModel || PROVIDERS[provider]?.defaultModel || 'claude-sonnet-4-20250514';
  // Web search only works with Anthropic — silently disable for other providers
  if(provider !== 'anthropic') useWebSearch = false;

  for(let attempt=0; attempt<=_retries; attempt++){
    let res, data;
    try{
      if(provider === 'anthropic'){
        const body = {model, max_tokens:maxTok, system:sys, messages};
        if(useWebSearch){body.tools=[{type:'web_search_20250305',name:'web_search'}];body.max_tokens=Math.max(maxTok,1500);}
        const headers = {'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'};
        if(useWebSearch) headers['anthropic-beta'] = 'web-search-2025-03-05';
        res = await fetch('https://fragrant-brook-c770.jacobcrusinberry.workers.dev/', {method:'POST', headers, body:JSON.stringify(body)});
        if((res.status===429||res.status===529)&&attempt<_retries){await new Promise(r=>setTimeout(r,(attempt+1)*10000));continue;}
        if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||'API error '+res.status);}
        data = await res.json();
        if(data.error) throw new Error(data.error.message||'API error');
        return (data.content||[]).filter(c=>c.type==='text').map(c=>c.text||'').join('') || 'No response.';

      } else if(provider === 'groq'){
        const body = {model, max_tokens:maxTok, messages:[{role:'system',content:sys},...messages]};
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey}, body:JSON.stringify(body)});
        if((res.status===429)&&attempt<_retries){await new Promise(r=>setTimeout(r,(attempt+1)*10000));continue;}
        if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||'API error '+res.status);}
        data = await res.json();
        return data.choices?.[0]?.message?.content || 'No response.';

      } else if(provider === 'openai' || provider === 'grok'){
        const endpoint = provider === 'grok'
          ? 'https://api.x.ai/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
        const body = {model, max_tokens:maxTok, messages:[{role:'system',content:sys},...messages]};
        res = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey}, body:JSON.stringify(body)});
        if((res.status===429)&&attempt<_retries){await new Promise(r=>setTimeout(r,(attempt+1)*10000));continue;}
        if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||'API error '+res.status);}
        data = await res.json();
        return data.choices?.[0]?.message?.content || 'No response.';

      } else if(provider === 'gemini'){
        const body = {model, max_tokens:maxTok, messages:[{role:'system',content:sys},...messages]};
        res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey}, body:JSON.stringify(body)});
        if((res.status===429)&&attempt<_retries){await new Promise(r=>setTimeout(r,(attempt+1)*10000));continue;}
        if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||'API error '+res.status);}
        data = await res.json();
        if(data.error) throw new Error(data.error.message||'Gemini error');
        return data.choices?.[0]?.message?.content || 'No response.';
      }
    } catch(e){
      if(attempt < _retries && (e.message.includes('429')||e.message.includes('rate'))){
        await new Promise(r=>setTimeout(r,(attempt+1)*10000)); continue;
      }
      throw e;
    }
  }
  throw new Error('Rate limit — please wait and try again.');
}

// ── Grok News — real-time X/Twitter intelligence ──────────────
const _newsCache={};
async function callGrokNews(query, maxTok=300){
  const xaiKey=localStorage.getItem('dynastyhq_xai_key')||(S.aiProvider==='grok'?S.apiKey:'');
  if(!xaiKey)return null;
  try{
    const sys=`You are a dynasty fantasy football news reporter. IMPORTANT: ONLY report news about the SPECIFIC player asked about. Do NOT mention any other players. Give 2-3 sentences of the latest news from X/Twitter about this one player. Focus on: trades, injuries, depth chart changes, contract news. If you have no recent news about this specific player, say "No recent news found."`;
    const res=await fetch('https://api.x.ai/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+xaiKey},
      body:JSON.stringify({model:'grok-3-mini',max_tokens:maxTok,messages:[{role:'system',content:sys},{role:'user',content:query}]})
    });
    if(!res.ok)return null;
    const data=await res.json();
    return data.choices?.[0]?.message?.content||null;
  }catch(e){console.warn('Grok news error:',e);return null;}
}

// ── Chat UI helpers ────────────────────────────────────────────
function expandChat(el){
  if(!el)return;
  el.style.maxHeight='300px';
  el.style.overflow='auto';
  el.style.padding='14px';
}

function homeAsk(text){
  const input=$('home-chat-in');
  if(input)input.value=text;
  sendHomeChat();
}
function goAsk(text){
  // Close player modal if open
  const modal=$('player-modal');
  if(modal&&modal.style.display!=='none')closePlayerModal();
  // Switch to home tab
  switchTab('digest',null);
  // Send the message and scroll to chat
  setTimeout(()=>{
    homeAsk(text);
    // Scroll to the chat area so user sees the response
    const chatEl=$('home-chat-msgs');
    if(chatEl)chatEl.scrollIntoView({behavior:'smooth',block:'start'});
  },200);
}

// ── Home Chat ─────────────────────────────────────────────────
async function sendHomeChat(){
  if(!hasAnyAI()){return;}
  const input=$('home-chat-in');const text=(input?.value||'').trim();if(!text)return;
  if(input)input.value='';

  const msgsEl=$('home-chat-msgs');
  expandChat(msgsEl);
  if(msgsEl){
    msgsEl.style.display='flex';
    const um=document.createElement('div');um.className='hc-msg-u';um.textContent=text;
    msgsEl.appendChild(um);
    const lm=document.createElement('div');lm.className='hc-msg-a';
    lm.innerHTML='<span class="ld"><span>.</span><span>.</span><span>.</span></span>';
    msgsEl.appendChild(lm);
    msgsEl.scrollTop=99999;

    try{
      homeChatHistory.push({role:'user',content:text});
      // Keep history short to stay under token limits
      if(homeChatHistory.length>4)homeChatHistory=homeChatHistory.slice(-4);
      // Build compact context — attach to latest message only
      const ctxStr=buildCtxCompact();
      const msgs=homeChatHistory.map((m,i)=>{
        // Attach context to the LAST user message only
        if(m.role==='user'&&i===homeChatHistory.length-1){
          return{role:'user',content:'[Team context]\n'+ctxStr+'\n\n'+m.content};
        }
        // Trim old assistant messages to save tokens
        if(m.role==='assistant'&&m.content.length>400){
          return{role:'assistant',content:m.content.substring(0,400)+'...'};
        }
        return m;
      });
      const needsSearch=/search for|look up|find news|injury report|breaking news|trade rumor|SEARCH FOR CURRENT|Scout Report|current situation|dynasty outlook|2026/i.test(text);
      const reply=await callClaude(msgs,needsSearch,2,500);
      homeChatHistory.push({role:'assistant',content:reply});
      lm.innerHTML=reply.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    }catch(e){lm.innerHTML=`<span style="color:var(--red)">Error: ${e.message}</span>`;}
    msgsEl.scrollTop=99999;
  }
}

// ── Trade Chat ─────────────────────────────────────────────────
function sendTradeChatMsg(text){
  const inp=$('trade-chat-in');if(inp)inp.value=text;
  sendTradeChat();
}

async function sendTradeChat(){
  if(!hasAnyAI()){switchTab('settings');return;}
  const input=$('trade-chat-in');const text=(input&&input.value||'').trim();if(!text)return;
  if(input)input.value='';
  const msgsEl=$('trade-chat-msgs');
  expandChat(msgsEl);
  const um=document.createElement('div');um.className='hc-msg-u';um.style.fontSize='12px';um.textContent=text;
  msgsEl.appendChild(um);
  const lm=document.createElement('div');lm.className='hc-msg-a';lm.style.fontSize='12px';
  lm.innerHTML='<span class="ld"><span>.</span><span>.</span><span>.</span></span>';
  msgsEl.appendChild(lm);msgsEl.scrollTop=99999;
  try{
    tradeChatHistory.push({role:'user',content:text});
    if(tradeChatHistory.length>4)tradeChatHistory=tradeChatHistory.slice(-4);
    const ctx=buildCtxCompact();
    // Build rich owner context — who they are, what they need, how they trade
    let ownerCtx='';
    if(LI_LOADED){
      const pM=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};
      const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
      const rp=league?.roster_positions||[];
      // Calculate league average DHQ to set contending threshold dynamically
      const allTotals=S.rosters.map(r=>(r.players||[]).reduce((sum,pid)=>sum+dynastyValue(pid),0));
      const avgTotal=allTotals.length?allTotals.reduce((a,b)=>a+b,0)/allTotals.length:80000;
      const profiles=S.rosters.filter(r=>r.roster_id!==S.myRosterId).map(r=>{
        const name=S.leagueUsers.find(u=>u.user_id===r.owner_id)?.display_name||'Team';
        const s=r.settings||{};
        const record=(s.wins||0)+'-'+(s.losses||0);
        const totalVal=(r.players||[]).reduce((sum,pid)=>sum+dynastyValue(pid),0);
        // Find their weakest positions
        const posCounts={};
        (r.players||[]).forEach(pid=>{const pos=pM(pPos(pid));if(pos)posCounts[pos]=(posCounts[pos]||0)+1;});
        const weakPositions=['QB','RB','WR','TE'].filter(pos=>{
          const need=rp.filter(s2=>s2===pos||(s2==='FLEX'&&['RB','WR','TE'].includes(pos))||(s2==='SUPER_FLEX'&&pos==='QB')).length;
          return(posCounts[pos]||0)<=need;
        });
        // Top 2 players on this roster (so AI knows what they have to offer)
        const topPlayers=(r.players||[]).map(pid=>({pid,val:dynastyValue(pid)})).sort((a,b)=>b.val-a.val).slice(0,2)
          .map(x=>pNameShort(x.pid)+'('+pPos(x.pid)+',DHQ'+x.val+')').join(', ');
        // Trade DNA — only include if data exists
        const dna=LI.ownerProfiles?.[r.roster_id];
        const dnaStr=dna?.trades>0?' · '+dna.dna:'';
        const contending=totalVal>avgTotal*1.1?'contender':totalVal<avgTotal*0.85?'rebuilder':'mid-tier';
        return`${name}: ${record}, ${contending}, DHQ${Math.round(totalVal/1000)}k, needs ${weakPositions.join('/')||'nothing'}, stars: ${topPlayers}${dnaStr}`;
      }).slice(0,12);
      if(profiles.length)ownerCtx='\nLEAGUE OWNERS (use these specific names and needs in your answer):\n'+profiles.join('\n');
    }
    let tradeStats='';
    if(LI_LOADED&&LI.leagueTradeTendencies?.totalTrades>0){
      const lt=LI.leagueTradeTendencies;
      tradeStats=`\nLEAGUE: ${lt.totalTrades} trades in history, ${lt.pickHeavy} involved picks`;
    }
    const msgs=tradeChatHistory.map(function(m,i){
      if(m.role==='user'&&i===tradeChatHistory.length-1)return{role:'user',content:`Dynasty trade advisor with REAL league data. RULES:
1. Name SPECIFIC owners from the list below — use their actual names
2. MATH MUST WORK: both sides of a trade must be within 15% of equal DHQ value. If Player A is DHQ 3500, the return must total DHQ 3000-4000. Never propose a DHQ 3500 player for a DHQ 7000 player straight up.
3. Show the math: "Your side: Player A (DHQ 3500) + 2026 R2 (~DHQ 2000) = ~5500 total. Their side: Player B (DHQ 5200) = fair deal"
4. Only propose trades where the OTHER owner benefits too — explain what THEY gain
5. Draft a short Sleeper DM message to copy-paste
6. If user wants to win now, propose getting better players. If rebuilding, propose getting picks/youth.
DHQ scale: 0-10000 (7000+=elite, 4000+=starter, 2000+=depth). Picks: 1st≈3000-5000, 2nd≈1500-2500, 3rd≈800-1200. Always say "DHQ" not "FC".
${ctx}${ownerCtx}${tradeStats}\n\n${m.content}`};
      if(m.role==='assistant'&&m.content.length>400)return{role:'assistant',content:m.content.substring(0,400)+'...'};
      return m;
    });
    const tradeNeedsSearch=/search for|look up|find news|breaking/i.test(text);
    const reply=await callClaude(msgs,tradeNeedsSearch,2,500);
    tradeChatHistory.push({role:'assistant',content:reply});
    lm.innerHTML=reply.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    // Auto-save every 3rd message
    if(tradeChatHistory.length%6===0)autoSaveMemory(tradeChatHistory,'Trades');
  }catch(e){lm.innerHTML='<span style="color:var(--red)">Error: '+e.message+'</span>';}
  msgsEl.scrollTop=99999;
}

// ── Waiver Chat ────────────────────────────────────────────────
async function sendWaiverChat(){
  if(!hasAnyAI()){switchTab('settings');return;}
  const input=$('wq-chat-in');const text=input?.value?.trim();if(!text)return;
  input.value='';

  const msgs=$('wq-chat-msgs');
  expandChat(msgs);
  const um=document.createElement('div');
  um.className='msg msg-u';um.style.fontSize='12px';um.textContent=text;
  msgs.appendChild(um);msgs.scrollTop=99999;

  // Loading
  const lm=document.createElement('div');
  lm.className='msg msg-a';lm.style.fontSize='12px';
  lm.innerHTML='<span class="ld"><span>.</span><span>.</span><span>.</span></span>';
  msgs.appendChild(lm);msgs.scrollTop=99999;

  try{
    const faab=getFAAB();const slots=getRosterSlots();
    const avail=getAvailablePlayers();
    const sc8=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
    const availStr=avail.slice(0,30).map(function(d){
      const isI=['DL','LB','DB'].includes(d.p.position||'');
      const raw=S.playerStats?.[d.id]?.prevRawStats;
      const ppg=isI&&raw?+(calcIDPScore(raw,sc8)/Math.max(1,raw.gp||17)).toFixed(1):null;
      const avg=S.playerStats?.[d.id]?.seasonAvg||0;
      const statPart=ppg?(','+ppg+'idpPPG'):avg?(',avg'+avg.toFixed(1)):'';
      const age=d.p.age>0?',age'+d.p.age:',rookie';
      return pName(d.id)+'('+d.p.position+age+',v'+d.val+statPart+')';
    }).join(';');
    const ctx='MY TEAM:\n'+buildCtx()+'\n'+buildMentalityCtx()+'\nFAAB:$'+faab.remaining+' | Open slots:'+slots.openBench+'\n\nAVAILABLE FREE AGENTS (IDP shown with real PPG from your scoring settings):\n'+availStr;
    const reply=await callClaude([{role:'user',content:'Dynasty waiver wire advisor. Answer based ONLY on the actual available players listed.\n\n'+ctx+'\n\nIDP NOTE: In this league sacks='+((S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings?.idp_sack)||4)+'pts, INT='+((S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings?.idp_int)||5)+'pts, PassDef='+((S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings?.idp_pass_def)||3)+'pts. DBs with INT/PD potential are premium. Edge rushers with sack upside too.\n\nQuestion: '+text+'\n\nBe specific — name actual players. 3-5 sentences max.'}]);
    lm.innerHTML=reply.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  }catch(e){lm.innerHTML=`<span style="color:var(--red)">Error: ${e.message}</span>`;}
  msgs.scrollTop=99999;
}

// ── Draft Chat ─────────────────────────────────────────────────
function sendDraftChatMsg(text){const inp=$('draft-chat-in');if(inp)inp.value=text;sendDraftChat();}

async function sendDraftChat(){
  if(!hasAnyAI()){switchTab('settings');return;}
  const input=$('draft-chat-in');const text=input.value.trim();if(!text)return;
  input.value='';
  expandChat($('draft-msgs'));
  addDraftMsg(text,'u');
  const year=$('draft-year-sel')?.value||'2026';
  const loading=document.createElement('div');loading.className='msg msg-a';loading.style.fontSize='12px';
  loading.innerHTML='<span class="ld"><span>.</span><span>.</span><span>.</span></span>';
  $('draft-msgs').appendChild(loading);$('draft-msgs').scrollTop=99999;
  try{
    draftChatHistory.push({role:'user',content:text});
    if(draftChatHistory.length>4)draftChatHistory=draftChatHistory.slice(-4);
    // Build rich draft context
    const myPicks=S.tradedPicks.filter(p=>p.owner_id===S.myRosterId&&String(p.season)===year).map(p=>'R'+p.round).join(',');
    const mentalityCtx=buildMentalityCtx();
    const agingStarters=(myR()?.players||[]).filter(pid=>{
      const pos=pM(pPos(pid));const age=pAge(pid)||26;
      const peakEnd=(LI.peakWindows||{})[pos]?.[1]||29;
      return age>peakEnd&&dynastyValue(pid)>2000&&['QB','RB','WR','TE'].includes(pos);
    }).map(pid=>pNameShort(pid)+'('+pPos(pid)+','+pAge(pid)+')').join(', ');
    const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
    const draftCtx=`${year} ROOKIE DRAFT ADVISOR.
RULES: Never recommend K or IDP in R1-R2. Offense-first in early rounds. IDP is mid-late round value only.
${mentalityCtx}
Team: ${buildCtxCompact()}
My ${year} picks: ${myPicks||'none'}
Aging starters past peak: ${agingStarters||'none'}
Scoring: SF=${(sc.pass_td||4)>4?'premium':'standard'}, PPR=${sc.rec||0}, sack=${sc.idp_sack||4}, INT=${sc.idp_int||5}
DYNASTY DRAFT PRINCIPLES: In SF leagues, QBs are 2-3x more valuable. Draft for ceiling in rebuild, floor if contending. Consider league tendencies — if your league overdrafts a position, target the falling value at other positions.
NOTE: Sleeper's rookie data improves as the NFL draft approaches. Pre-NFL draft rankings are speculative.`;
    const msgs=draftChatHistory.map((m,i)=>
      i===draftChatHistory.length-1&&m.role==='user'?{role:'user',content:draftCtx+'\n\n'+m.content}:m
    );
    const needsSearch=/search|look up|who is|rank|rookie|prospect|mock/i.test(text);
    const reply=await callClaude(msgs,needsSearch,2,500);
    draftChatHistory.push({role:'assistant',content:reply});
    loading.innerHTML=reply.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  }catch(e){loading.innerHTML=`<span style="color:var(--red)">Error: ${e.message}</span>`;}
  $('draft-msgs').scrollTop=99999;
}

function addDraftMsg(text,role){
  const d=document.createElement('div');d.className=`msg msg-${role}`;d.style.fontSize='12px';
  d.innerHTML=text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
  $('draft-msgs').appendChild(d);$('draft-msgs').scrollTop=99999;
}

// ── Expose on window.App ──────────────────────────────────────
Object.assign(window.App, {
  // State
  homeChatHistory,
  tradeChatHistory,
  tradeBuilderAssets,
  draftChatHistory,
  PROVIDERS,
  _newsCache,
  CONV_MEM_KEY,

  // Conversation memory
  loadConvMemory,
  saveConvMemory,
  addConvMemory,
  buildMemoryCtx,
  autoSaveMemory,
  buildMentalityCtx,

  // Context builders
  buildCtx,
  buildCtxCompact,

  // Provider
  updateProviderHint,

  // Core AI
  callClaude,
  callGrokNews,

  // Chat UI helpers
  expandChat,
  homeAsk,
  goAsk,

  // Home chat
  sendHomeChat,

  // Trade chat
  sendTradeChatMsg,
  sendTradeChat,

  // Waiver chat
  sendWaiverChat,

  // Draft chat
  sendDraftChatMsg,
  sendDraftChat,
  addDraftMsg,

  // Waiver AI agent
  runWaiverAgent,

  // Scout AI
  runScoutAI,
});

// ── Waiver AI Agent ────────────────────────────────────────────
async function runWaiverAgent(){
  if(!hasAnyAI()){switchTab('settings');return;}
  const btn=$('wq-btn');btn.textContent='Scanning...';btn.disabled=true;
  $('wq-list').innerHTML='<div class="card"><div class="empty">Computing available players, FAAB context, and roster slots...</div></div>';
  try{
    const avail=getAvailablePlayers();
    const posFilter=$('avail-pos-sel')?.value||'';
    const filtered=posFilter?avail.filter(a=>a.p.position===posFilter):avail;
    const top20=filtered.slice(0,20);
    const faab=getFAAB();
    const slots=getRosterSlots();
    const leagueFaab=(()=>{
      const budgets=S.rosters.map(r=>(r.settings?.waiver_budget||200)-(r.settings?.waiver_budget_used||0));
      const avg=budgets.length?Math.round(budgets.reduce((a,b)=>a+b,0)/budgets.length):100;
      return{avg};
    })();
    const histSpend={};
    const isFAAB=faab.budget>0;
    const spendCtx='';
    const myPlayers=myR()?.players||[];
    const myPosCounts={};
    myPlayers.forEach(pid=>{const pos=pPos(pid);if(pos)myPosCounts[pos]=(myPosCounts[pos]||0)+1;});
    const LI=window.App.LI||{};
    const LI_LOADED=window.App.LI_LOADED;
    const topAvailStr=top20.slice(0,10)
      .filter(({id})=>!(LI.playerMeta?.[id]?.source==='FC_ROOKIE')&&(S.players[id]?.years_exp||0)>0)
      .map(({id,p,val})=>{
      return`${pName(id)}(${p.position},${p.age||'?'},${p.team||'FA'},DHQ${val})`;
    }).join(';');
    const slotsToFill=Math.max(1,Math.min(4,slots.openBench>0?slots.openBench:1));
    const faabFields=isFAAB?'"faab_low":0,"faab_high":0,':'';
    const faabCtxStr=LI_LOADED&&LI.faabByPos?
      Object.entries(LI.faabByPos).slice(0,4).map(([pos,d])=>`${pos}:avg$${d.avg}(${d.count}claims)`).join(';'):'';
    const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
    const prompt=`Waiver agent. ${S.season} offseason. DHQ values 0-10000 scale.
CRITICAL RULES:
1. ONLY recommend players from the AVAILABLE list below. Do NOT recommend any player not on this list — they are rostered by other teams.
2. Rookies (0 years experience) can ONLY be added through the rookie draft, NOT waivers.
3. Only recommend VETERAN free agents who have played at least 1 NFL season.
4. Respond with ONLY a JSON object — no markdown, no backticks, no explanation.
${buildMentalityCtx()}
ROSTER:${slots.openBench}open,${slots.rosterMax}max. POS:${Object.entries(myPosCounts).map(([p,c])=>`${p}:${c}`).join(',')}
${isFAAB?`FAAB:$${faab.remaining}/$${faab.budget}.${faabCtxStr?'History:'+faabCtxStr:''}`:'Waiver priority #'+(myR()?.settings?.waiver_position||'?')}
AVAILABLE FREE AGENTS (ONLY pick from this list):${topAvailStr||'still loading'}
IDP:sack=${sc.idp_sack||4},INT=${sc.idp_int||5},PD=${sc.idp_pass_def||3}
${slots.openBench===0?'ROSTER FULL — must suggest who to drop.':''}
Recommend ${slotsToFill} adds from the AVAILABLE list above. JSON only:
{"recommendations":[{"name":"player","position":"POS","team":"TM","rank":1,"age":0,"dynastyValue":0,"reason":"why",${faabFields}"copyText":"Sleeper msg"}]}`;
    const reply=await callClaude([{role:'user',content:prompt}]);
    let data={recommendations:[]};
    try{
      let clean=reply;
      clean=clean.replace(/```(?:json|JSON|js|javascript)?\s*/g,'').replace(/```\s*/g,'');
      const firstBrace=clean.indexOf('{');
      const lastBrace=clean.lastIndexOf('}');
      if(firstBrace>=0&&lastBrace>firstBrace){
        clean=clean.substring(firstBrace,lastBrace+1);
      }
      data=JSON.parse(clean);
    }catch(err){
      $('wq-list').innerHTML=`<div class="card"><div style="font-size:13px;color:var(--text2);line-height:1.6;padding:4px">${reply.replace(/\n/g,'<br>')}</div></div>`;
      btn.textContent='Generate';btn.disabled=false;return;
    }
    const mentLabel={balanced:'⚖️ Balanced',winnow:'🏆 Win Now',rebuild:'🔄 Rebuild',prime:'⭐ Dynasty Prime'}[loadMentality().mentality]||'';
    if(data.recommendations){
      data.recommendations=data.recommendations.filter(r=>{
        const pid=Object.entries(S.players).find(([,p])=>(p.first_name+' '+p.last_name).toLowerCase()===r.name?.toLowerCase())?.[0];
        if(pid&&LI.playerMeta?.[pid]?.source==='FC_ROOKIE')return false;
        if(pid&&S.players[pid]?.years_exp===0)return false;
        return true;
      });
    }
    $('wq-list').innerHTML=`
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px;padding:6px 10px;background:var(--bg3);border-radius:6px;display:flex;gap:12px;flex-wrap:wrap">
        <span>${mentLabel}</span><span>${avail.length} available</span>
        <span style="color:${slots.openBench>0?'var(--green)':'var(--red)'}">${slots.openBench} open slot${slots.openBench!==1?'s':''}</span>
        ${isFAAB?`<span style="color:var(--green)">$${faab.remaining} FAAB remaining</span>`:''}
      </div>
      ${data.recommendations.length?data.recommendations.map(r=>`
        <div class="action-item priority-${r.rank===1?'high':r.rank<=3?'med':'low'}" style="margin-bottom:10px">
          <div class="action-body" style="width:100%">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:700;color:var(--accent)">#${r.rank}</span>
              <span class="pos ${posClass(r.position)}" style="font-size:12px">${r.position||'?'}</span>
              <span style="font-size:14px;font-weight:500">${r.name}</span>
              ${r.age?`<span style="font-size:12px;color:var(--text3)">age ${r.age}</span>`:''}
              ${r.dynastyValue?`<span style="font-size:12px;color:var(--accent);font-weight:600">${r.dynastyValue.toLocaleString()}</span>`:''}
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:5px">${fullTeam(r.team)||''}${r.drop?` · Drop: <span style="color:var(--red);font-weight:500">${r.drop}</span>${r.drop_reason?' ('+r.drop_reason+')':''}`:''}</div>
            <div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:7px">${r.reason}</div>
            ${isFAAB&&r.faab_low!=null?`<div style="background:var(--bg3);border-radius:6px;padding:7px 10px;margin-bottom:7px;display:inline-flex;align-items:center;gap:10px">
              <span style="font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">FAAB bid</span>
              <span style="font-size:17px;font-weight:700;color:var(--green)">$${r.faab_low}–$${r.faab_high}</span>
              ${r.faab_rationale?`<span style="font-size:12px;color:var(--text2)">${r.faab_rationale}</span>`:''}
            </div>`:''}
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${r.copyText?`<button class="copy-btn" onclick="copyText(${JSON.stringify(r.copyText)},this)">Copy claim</button>`:''}
              <button class="deep-btn" onclick="goAsk('Deep dive: should I add ${(r.name||'').replace(/'/g,'')} to my roster? ${buildMentalityCtx()}')">Ask more ↗</button>
            </div>
          </div>
        </div>`).join('')
      :'<div class="empty">No recommendations. Adjust position filter or strategy.</div>'}`;
  }catch(e){$('wq-list').innerHTML=`<div class="card"><div class="empty" style="color:var(--red)">Error: ${e.message}</div></div>`;}
  btn.textContent='Generate';btn.disabled=false;
}

// ── Scout AI (opponent war room) ───────────────────────────────
async function runScoutAI(){
  if(!hasAnyAI()){switchTab('settings');return;}
  const btn=$('scout-ai-btn');if(!btn)return;
  btn.textContent='Analyzing...';btn.disabled=true;
  const out=$('scout-content');
  const oppSel=$('trade-opp-sel');
  try{
    const rosterId=oppSel?parseInt(oppSel.value):0;
    const r=S.rosters.find(r=>r.roster_id===rosterId);
    if(!r){btn.textContent='Full war room ↗';btn.disabled=false;return;}

    const oppName=getUser(r.owner_id);
    const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
    const rp=league?.roster_positions||[];
    const teams=S.rosters.length||12;
    const sc=league?.scoring_settings||{};

    const starterSlots={QB:0,RB:0,WR:0,TE:0,K:0,DL:0,LB:0,DB:0};
    rp.forEach(slot=>{
      if(slot in starterSlots)starterSlots[slot]++;
      else if(slot==='FLEX'){starterSlots.RB+=0.4;starterSlots.WR+=0.4;starterSlots.TE+=0.2;}
      else if(slot==='SUPER_FLEX'){starterSlots.QB+=0.5;starterSlots.WR+=0.25;starterSlots.RB+=0.25;}
      else if(slot==='IDP_FLEX'){starterSlots.DL+=0.35;starterSlots.LB+=0.35;starterSlots.DB+=0.3;}
    });
    Object.keys(starterSlots).forEach(p=>starterSlots[p]=Math.round(starterSlots[p]));

    const startThresh=window.startThresh||{QB:18,RB:10,WR:10,TE:8,K:5,DL:4,LB:4,DB:3};
    const byPos={};
    (r.players||[]).forEach(pid=>{
      const pos=pPos(pid);if(!(pos in starterSlots))return;
      if(!byPos[pos])byPos[pos]={startable:0,total:0,top:[]};
      byPos[pos].total++;
      const avg=S.playerStats?.[pid]?.seasonAvg||S.playerStats?.[pid]?.prevAvg||0;
      if(avg>=startThresh[pos])byPos[pos].startable++;
      byPos[pos].top.push({name:pName(pid),avg:+avg.toFixed(1),val:dynastyValue(pid),age:pAge(pid)||'?'});
    });
    Object.values(byPos).forEach(d=>d.top.sort((a,b)=>b.val-a.val).splice(4));

    const posGrades=Object.keys(starterSlots).map(pos=>{
      const d=byPos[pos]||{startable:0,total:0,top:[]};
      const need=starterSlots[pos];
      const gap=need-d.startable;
      const grade=gap>=need?'WEAK':gap>0?'NEED':d.total>=(need*2)?'STACKED':'SOLID';
      const topNames=d.top.slice(0,3).map(p=>`${p.name}(${p.avg}avg,v${p.val})`).join(',');
      return `${pos}: ${d.startable}/${need} startable [${grade}] — ${topNames||'none'}`;
    }).join('\n');

    const myR2=myR();
    const myByPos={};
    (myR2?.players||[]).forEach(pid=>{
      const pos=pPos(pid);if(!(pos in starterSlots))return;
      if(!myByPos[pos])myByPos[pos]={startable:0,total:0};
      myByPos[pos].total++;
      const avg=S.playerStats?.[pid]?.seasonAvg||S.playerStats?.[pid]?.prevAvg||0;
      if(avg>=startThresh[pos])myByPos[pos].startable++;
    });
    const myLeverage=Object.keys(starterSlots).filter(pos=>{
      const mine=myByPos[pos]||{startable:0};
      const theirs=byPos[pos]||{startable:0};
      return mine.startable>(starterSlots[pos]+1)&&theirs.startable<starterSlots[pos];
    }).join(', ')||'none obvious';

    const oppPicks=S.tradedPicks.filter(p=>p.owner_id===rosterId)
      .sort((a,b)=>a.season-b.season||a.round-b.round)
      .map(p=>`${p.season}R${p.round}(v${pickValue(p.season,p.round,teams)})`).join(', ');

    const allTrades=Object.values(S.transactions).flatMap(w=>(w||[]).filter(t=>t.type==='trade'));
    const theirTrades=allTrades.filter(t=>t.roster_ids?.includes(rosterId)).slice(0,8).map(t=>{
      const got=Object.entries(t.adds||{}).filter(([,rid])=>rid===rosterId).map(([pid])=>pName(pid)).join(',');
      const gave=Object.entries(t.adds||{}).filter(([,rid])=>rid!==rosterId&&t.roster_ids?.includes(rid)).map(([pid])=>pName(pid)).join(',');
      const picksGot=(t.draft_picks||[]).filter(p=>p.owner_id===rosterId).map(p=>`${p.season}R${p.round}`).join(',');
      const picksGave=(t.draft_picks||[]).filter(p=>p.owner_id!==rosterId).map(p=>`${p.season}R${p.round}`).join(',');
      return`GOT: ${got||'—'}${picksGot?' +picks:'+picksGot:''} | GAVE: ${gave||'—'}${picksGave?' +picks:'+picksGave:''}`;
    }).join('\n');

    const sorted=[...S.rosters].sort((a,b)=>(b.settings?.wins||0)-(a.settings?.wins||0));
    const oppRank=sorted.findIndex(r2=>r2.roster_id===r.roster_id)+1;
    const faab=r.settings?.waiver_budget_used!==undefined?((r.settings?.waiver_budget||200)-(r.settings?.waiver_budget_used||0)):null;

    const prompt=`Dynasty trade war room: scouting ${oppName} for a potential trade.

THEIR TEAM: Rank #${oppRank}/${teams}, ${r.settings?.wins||0}-${r.settings?.losses||0}${faab!==null?', $'+faab+' FAAB remaining':''}
THEIR PICKS: ${oppPicks||'own picks only'}

POSITIONAL BREAKDOWN (startable/needed [grade] — top players):
${posGrades}

MY TRADE LEVERAGE: I'm surplus at ${myLeverage} — positions they need

THEIR TRADE HISTORY (last 8 trades):
${theirTrades||'No recent trades found'}

MY CONTEXT:
${buildCtx()}
${buildMentalityCtx()}

Based on this data give me:
1. TEAM TIER — contender/rebuilding/stuck? Their window?
2. WHAT THEY DESPERATELY NEED — specific positions, grade them on urgency
3. TRADE TENDENCIES — do they sell picks or buy them? Stars or depth? What patterns show?
4. PLAYERS TO TARGET — top 3 specific players I should try to get, with why each is gettable and what to offer
5. HOW TO APPROACH — exact strategy, what to lead with, how to frame my offer given their situation
6. DRAFT A MESSAGE — a ready-to-paste Sleeper DM opening this trade conversation

Be direct and specific. Name real players and real offers. IDP in this league: sack=4pts, INT=5pts, PD=3pts — DBs/edge rushers most valuable. Note any IDP gaps.`;

    const reply=await callClaude([{role:'user',content:prompt}],false,2,900);

    scoutTeam(rosterId);
    const aiCard=document.createElement('div');
    aiCard.className='card';
    aiCard.style.cssText='border-color:rgba(108,99,245,.2);margin-top:10px';
    aiCard.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      +(avatarUrl(S.leagueUsers.find(u=>u.user_id===r.owner_id))?`<img src="${avatarUrl(S.leagueUsers.find(u=>u.user_id===r.owner_id))}" style="width:28px;height:28px;border-radius:50%;object-fit:cover">`:'')
      +`<div style="font-size:14px;font-weight:600">${oppName} — War Room</div>`
      +`<button class="copy-btn" style="margin-left:auto;font-size:11px" onclick="copyText(${JSON.stringify(reply)},this)">Copy</button>`
      +'</div>'
      +`<div style="font-size:13px;color:var(--text2);line-height:1.8">${reply.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--text)">$1</strong>').replace(/#{1,3} /g,'').replace(/\n\n/g,'</p><p style="margin-top:10px">').replace(/\n/g,'<br>')}</div>`;
    if(out)out.appendChild(aiCard);

  }catch(e){if(out)out.innerHTML=`<div class="card"><div class="empty" style="color:var(--red)">Error: ${e.message}</div></div>`;}
  btn.textContent='Full war room ↗';btn.disabled=false;
}

// Bare window globals for inline handlers / cross-module access
window.buildMentalityCtx = buildMentalityCtx;
window.homeAsk = homeAsk;
window.goAsk = goAsk;
window.expandChat = expandChat;
window.sendDraftChatMsg = sendDraftChatMsg;
window.addDraftMsg = addDraftMsg;
