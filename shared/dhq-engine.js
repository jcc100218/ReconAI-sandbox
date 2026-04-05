// shared/dhq-engine.js — DHQ Dynasty Valuation Engine
// Extracted from War Room Scout — shared by War Room Scout + War Room
window.App = window.App || {};

// ══════════════════════════════════════════════════════════════════
// LEAGUEINTEL — Your league's actual value system
// Builds IDP value from real scoring data + draft history + FAAB market
// ══════════════════════════════════════════════════════════════════

const LI_CACHE_KEY='dhq_leagueintel_v11';
const LI_TTL=8*60*60*1000; // 8 hours
let LI={}; // LeagueIntel data object — populated async after connect
let LI_LOADED=false;

function loadLICache(){
  const d=DhqStorage.get(LI_CACHE_KEY,null);
  if(!d)return false;
  if(Date.now()-d.ts>LI_TTL)return false;
  const S=window.App.S||window.S;
  if(!S||d.leagueId!==S.currentLeagueId)return false;
  LI=d.data;LI_LOADED=true;
  console.log('LeagueIntel loaded from cache');
  // Emit after current call stack clears — ensures UI listeners are registered first
  setTimeout(()=>{if(window.DhqEvents)window.DhqEvents.emit('li:loaded',{source:'cache'});},0);
  return true;
}

function saveLICache(){
  const S=window.App.S||window.S;
  // Strip non-serializable functions before caching
  const cacheable={...LI};
  delete cacheable.dhqPickValueFn;
  DhqStorage.set(LI_CACHE_KEY,{ts:Date.now(),leagueId:S.currentLeagueId,data:cacheable});
}

// Get LeagueIntel value for a player (replaces dynastyValue for IDP)
function livScore(pid){
  if(!LI_LOADED)return null;
  return LI.playerScores?.[pid]||null;
}

// Get FAAB recommendation for a player based on league history
function livFAABRange(pos){
  if(!LI_LOADED||!pos)return null;
  const market=LI.faabByPos?.[pos];
  if(!market||market.count<3||!market.avg)return null;
  return{low:Math.round(market.avg*0.7),high:Math.round(market.avg*1.3),avg:Math.round(market.avg),count:market.count};
}

// Get draft ADP for a position in this league
function livDraftADP(pos){
  if(!LI_LOADED||!pos)return null;
  return LI.adpByPos?.[pos]||null;
}

// Main LeagueIntel loader — THE valuation engine
// Caches historical data permanently (past drafts/stats never change)
// Only refreshes current season on each load
async function loadLeagueIntel(){
  if(LI_LOADED)return; // already loaded
  if(window._liLoading)return; // already in progress
  window._liLoading=true;
  const S=window.App.S||window.S;
  if(!S){console.warn('[Scout] No state object found (window.App.S or window.S)');window._liLoading=false;return;}
  const posMap=window.App.posMap||window.posMap;
  const pName=window.App.pName||window.pName||(id=>{const p=S.players?.[id];return p?(p.full_name||((p.first_name||'')+' '+(p.last_name||'')).trim()||id):id;});
  const pPos=window.App.pPos||window.pPos||(id=>S.players?.[id]?.position||'');
  const pAge=window.App.pAge||window.pAge||(id=>S.players?.[id]?.age||'');
  const sf=window.App.sf||window.sf||window.Sleeper?.sleeperFetch||(path=>fetch('https://api.sleeper.app/v1'+path).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}));
  const SLEEPER=window.App.SLEEPER||window.SLEEPER||'https://api.sleeper.app/v1';
  try{
  if(loadLICache()){window._liLoading=false;return;}
  if(!S.currentLeagueId){window._liLoading=false;return;}

  const league=S.leagues.find(l=>l.league_id===S.currentLeagueId);
  const sc=league?.scoring_settings||{};
  const rp=league?.roster_positions||[];
  const totalTeams=S.rosters?.length||16;
  const positions=['QB','RB','WR','TE','DL','LB','DB'];
  const posMapLocal=p=>{if(['DE','DT'].includes(p))return'DL';if(['CB','S'].includes(p))return'DB';return p;};

  // Starter counts per position (with flex weighting)
  const starterCounts={QB:0,RB:0,WR:0,TE:0,DL:0,LB:0,DB:0};
  rp.forEach(slot=>{
    if(slot==='DE'||slot==='DT')starterCounts.DL++;
    else if(slot==='CB'||slot==='S')starterCounts.DB++;
    else if(slot in starterCounts)starterCounts[slot]++;
    else if(slot==='FLEX'){starterCounts.RB+=0.4;starterCounts.WR+=0.4;starterCounts.TE+=0.2;}
    else if(slot==='SUPER_FLEX'){starterCounts.QB+=0.5;starterCounts.WR+=0.25;starterCounts.RB+=0.25;}
    else if(slot==='IDP_FLEX'){starterCounts.DL+=0.35;starterCounts.LB+=0.35;starterCounts.DB+=0.3;}
    else if(slot==='REC_FLEX'){starterCounts.WR+=0.5;starterCounts.TE+=0.5;}
  });
  Object.keys(starterCounts).forEach(p=>starterCounts[p]=Math.max(1,Math.round(starterCounts[p])));

  // Unified scoring function
  function scorePts(s){
    if(!s)return 0;
    let pts=0;
    const add=(stat,mult)=>{pts+=(s[stat]||0)*(mult||0);};
    add('pass_yd',sc.pass_yd??0);add('pass_td',sc.pass_td??4);add('pass_int',sc.pass_int??-1);
    add('pass_2pt',sc.pass_2pt??0);add('pass_sack',sc.pass_sack??0);
    add('rush_yd',sc.rush_yd??0.1);add('rush_td',sc.rush_td??6);add('rush_2pt',sc.rush_2pt??0);add('rush_fd',sc.rush_fd??0);
    add('rec',sc.rec??0.5);add('rec_yd',sc.rec_yd??0.1);add('rec_td',sc.rec_td??6);add('rec_2pt',sc.rec_2pt??0);add('rec_fd',sc.rec_fd??0);
    add('fum_lost',sc.fum_lost??-0.5);add('fum_rec_td',sc.fum_rec_td??0);
    add('xpm',sc.xpm??0);add('xpmiss',sc.xpmiss??0);add('fgm_yds',sc.fgm_yds??0);
    add('fgmiss',sc.fgmiss??0);add('fgmiss_0_19',sc.fgmiss_0_19??0);add('fgmiss_20_29',sc.fgmiss_20_29??0);
    const idpF=[['idp_tkl_solo','tkl_solo'],['idp_tkl_ast','tkl_ast'],['idp_tkl_loss','tkl_loss'],
      ['idp_sack','sack'],['idp_qb_hit','qb_hit'],['idp_int','int'],['idp_ff','ff'],
      ['idp_fum_rec'],['idp_pass_def','pass_def'],['idp_pass_def_3p'],
      ['idp_def_td','def_td'],['idp_blk_kick'],['idp_safe'],['idp_sack_yd'],['idp_int_ret_yd'],['idp_fum_ret_yd']];
    idpF.forEach(names=>{const mult=sc[names[0]]??0;if(!mult)return;let v=0;for(const n of names){if(s[n]){v=s[n];break;}}pts+=v*mult;});
    add('st_td',sc.st_td??0);add('st_ff',sc.st_ff??0);add('st_fum_rec',sc.st_fum_rec??0);
    add('st_tkl_solo',sc.st_tkl_solo??0);add('kr_yd',sc.kr_yd??0);add('pr_yd',sc.pr_yd??0);
    return +pts.toFixed(1);
  }

  try{
    const t0=performance.now();

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Platform-agnostic data loading via DhqProviders
    // Supports Sleeper, MFL, ESPN, Yahoo through unified interface
    // ═══════════════════════════════════════════════════════════════
    const HIST_KEY=STORAGE_KEYS.HIST_KEY(S.currentLeagueId);
    const histCache=DhqStorage.get(HIST_KEY, null);
    const platform=S.platform||'sleeper';
    const provider=window.DhqProviders?window.DhqProviders.getProvider(platform):null;

    let chain, allDraftPicks, draftMeta, seasonStatsRaw, faabTxns, tradeTxns, bracketData, leagueUsersHistory;
    const curSeason = parseInt(S.season) || new Date().getFullYear();
    const uniqueYears = Array.from({length:5}, (_,i) => curSeason - 4 + i);

    if(histCache&&histCache.chain?.length>=1&&histCache.draftPicks?.length>0){
      // ── FAST PATH: Use permanent cache for historical data ──
      chain=histCache.chain;
      allDraftPicks=histCache.draftPicks;
      draftMeta=histCache.draftMeta;
      faabTxns=histCache.faabTxns||[];
      tradeTxns=histCache.tradeTxns||[];
      bracketData=histCache.bracketData||{};
      leagueUsersHistory=histCache.leagueUsersHistory||{};
      // Re-fetch current-season trades if cache is stale (> 6h)
      const TRADE_REFRESH_TTL=6*60*60*1000;
      if(provider&&(!histCache.ts||Date.now()-histCache.ts>TRADE_REFRESH_TTL)){
        const curChain=chain.find(c=>parseInt(c.season)===curSeason);
        if(curChain){
          try{
            const freshTrades=await provider.refreshTrades(curChain);
            tradeTxns=[...tradeTxns.filter(t=>parseInt(t.season)<curSeason),...freshTrades];
            DhqStorage.set(HIST_KEY,{...histCache,tradeTxns,ts:Date.now()});
            console.log(`[DHQ] Fast-path trade refresh (${platform}): ${freshTrades.length} current-season trades`);
          }catch(e){console.warn('[DHQ] fast-path trade refresh failed:',e?.message||e);}
        }
      }
      // Stats always fresh (universal — Sleeper stats API works for all platforms)
      seasonStatsRaw={};
      await Promise.all(uniqueYears.map(async yr=>{
        seasonStatsRaw[yr]=await sf(`/stats/nfl/regular/${yr}`).catch(()=>({}));
      }));
      console.log(`DHQ FAST PATH (${platform}): cached chain(${chain.length}), drafts(${allDraftPicks.length}), faab(${faabTxns.length}), trades(${tradeTxns.length}) | fresh stats in ${((performance.now()-t0)/1000).toFixed(1)}s`);

    }else{
      // ── COLD PATH: Discover everything via provider ──
      console.log(`DHQ COLD PATH (${platform}): building from scratch...`);

      if(!provider){
        console.warn('[DHQ] No provider available — falling back to empty data');
        chain=[{id:S.currentLeagueId,season:S.season}];
        allDraftPicks=[];draftMeta=[];faabTxns=[];tradeTxns=[];bracketData={};leagueUsersHistory={};
        seasonStatsRaw={};
        await Promise.all(uniqueYears.map(async yr=>{seasonStatsRaw[yr]=await sf(`/stats/nfl/regular/${yr}`).catch(()=>({}));}));
      }else{
        // Step 1: League chain
        chain=await provider.getLeagueChain(S.currentLeagueId,curSeason);
        if(!chain.length)chain=[{id:S.currentLeagueId,season:String(curSeason)}];

        // Step 2: All parallel — drafts + stats + transactions + brackets + users
        allDraftPicks=[];
        draftMeta=[];
        seasonStatsRaw={};
        faabTxns=[];
        tradeTxns=[];
        bracketData={};
        leagueUsersHistory={};

        const fetchPromises=[];

        // Drafts (per season via provider)
        fetchPromises.push((async()=>{
          const results=await Promise.all(chain.map(c=>provider.getDraftPicks(c).catch(()=>[])));
          results.forEach((picks,i)=>{
            if(picks.length){
              const rounds=picks.reduce((m,p)=>Math.max(m,p.round),0);
              draftMeta.push({season:chain[i].season,rounds,picks:picks.length});
              allDraftPicks.push(...picks);
            }
          });
        })());

        // Stats (universal — Sleeper stats API)
        fetchPromises.push(Promise.all(uniqueYears.map(async yr=>{
          seasonStatsRaw[yr]=await sf(`/stats/nfl/regular/${yr}`).catch(()=>({}));
        })));

        // Transactions (trades + FAAB via provider)
        fetchPromises.push((async()=>{
          const results=await Promise.all(chain.map(c=>provider.getTransactions(c,curSeason).catch(()=>({trades:[],faab:[]}))));
          results.forEach(r=>{
            tradeTxns.push(...(r.trades||[]));
            faabTxns.push(...(r.faab||[]));
          });
        })());

        // Brackets (via provider — may return null)
        fetchPromises.push((async()=>{
          await Promise.all(chain.map(async c=>{
            const b=await provider.getBracket(c).catch(()=>null);
            if(b)bracketData[c.season]=b;
          }));
        })());

        // League users (via provider)
        fetchPromises.push((async()=>{
          await Promise.all(chain.map(async c=>{
            const users=await provider.getLeagueUsers(c).catch(()=>[]);
            if(users.length)leagueUsersHistory[c.season]=users;
          }));
        })());

        await Promise.all(fetchPromises);
      }

      // Cache historical data
      DhqStorage.set(HIST_KEY,{chain,draftPicks:allDraftPicks,draftMeta,faabTxns,tradeTxns,bracketData,leagueUsersHistory,ts:Date.now()});
      console.log(`DHQ COLD PATH (${platform}) complete in ${((performance.now()-t0)/1000).toFixed(1)}s: chain(${chain.length}), drafts(${allDraftPicks.length}), faab(${faabTxns.length}), trades(${tradeTxns.length}), brackets(${Object.keys(bracketData).length}), users(${Object.keys(leagueUsersHistory).length})`);
    }

    console.log('Stats:',Object.entries(seasonStatsRaw).map(([y,s])=>y+':'+Object.keys(s).length+'p').join(' '));

    // ═══════════════════════════════════════════════════════════════
    // STEP: Extract championship results from brackets
    // ═══════════════════════════════════════════════════════════════
    const championships={}; // { season: { champion: rosterId, runnerUp: rosterId, semiFinals: [rid, rid] } }
    Object.entries(bracketData||{}).forEach(([season,{winners,losers}])=>{
      if(!winners?.length)return;
      // Championship game = matchup with highest round number
      const maxRound=Math.max(...winners.map(m=>m.r||0));
      const champMatch=winners.find(m=>m.r===maxRound);
      if(champMatch){
        championships[season]={
          champion:champMatch.w||null,
          runnerUp:champMatch.l||null,
          // Semi-finalists (second-to-last round losers)
          semiFinals:winners.filter(m=>m.r===maxRound-1).map(m=>m.l).filter(Boolean),
        };
      }
    });
    console.log('Championships:',Object.keys(championships).length,'seasons with bracket data');

    // ═══════════════════════════════════════════════════════════════
    // From here on: pure computation, no API calls
    // ═══════════════════════════════════════════════════════════════
    const playerSeasons={}; // pid -> {seasons:{[year]:{total,avg,gp},...}, pos, name}
    uniqueYears.forEach(yr=>{
      const stats=seasonStatsRaw[yr];if(!stats)return;
      Object.entries(stats).forEach(([pid,s])=>{
        const gp=s.gp||s.games_played||0;
        if(gp<3)return;
        const rawPos=S.players[pid]?.position;
        if(!rawPos)return;
        const pos=posMapLocal(rawPos);
        if(!positions.includes(pos)&&pos!=='K')return;
        const total=scorePts(s);
        if(total<=0)return;
        if(!playerSeasons[pid])playerSeasons[pid]={seasons:{},pos,name:pName(pid)||pid};
        playerSeasons[pid].seasons[yr]={total,avg:+(total/gp).toFixed(1),gp};
      });
    });
    console.log('Scored players:',Object.keys(playerSeasons).length);

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Positional scoring distributions per year
    //   → defines "quality starter" as top 15% of starter pool
    // ═══════════════════════════════════════════════════════════════
    const posYearDist={}; // pos -> year -> sorted [{pid,total,avg,gp}]
    uniqueYears.forEach(yr=>{
      Object.entries(playerSeasons).forEach(([pid,ps])=>{
        const s=ps.seasons[yr];if(!s)return;
        const pos=ps.pos;
        if(!positions.includes(pos))return;
        if(!posYearDist[pos])posYearDist[pos]={};
        if(!posYearDist[pos][yr])posYearDist[pos][yr]=[];
        posYearDist[pos][yr].push({pid,total:s.total,avg:s.avg,gp:s.gp});
      });
    });
    Object.values(posYearDist).forEach(years=>Object.values(years).forEach(arr=>arr.sort((a,b)=>b.total-a.total)));

    // Quality thresholds per position per year
    const qualThresh={}; // pos -> year -> {starterLine, eliteLine, avgStarter, pool}
    positions.forEach(pos=>{
      if(!posYearDist[pos])return;
      qualThresh[pos]={};
      Object.entries(posYearDist[pos]).forEach(([yr,players])=>{
        const pool=(starterCounts[pos]||2)*totalTeams;
        const top15=Math.max(1,Math.floor(pool*0.15));
        qualThresh[pos][yr]={
          starterLine:players[Math.min(pool-1,players.length-1)]?.total||0,
          eliteLine:players[Math.min(top15-1,players.length-1)]?.total||0,
          avgStarter:pool<=players.length?+(players.slice(0,pool).reduce((a,b)=>a+b.total,0)/pool).toFixed(1):0,
          pool, count:players.length
        };
      });
    });

    // Average thresholds across years (for stable hit determination)
    const avgThresh={}; // pos -> {starterLine, eliteLine}
    positions.forEach(pos=>{
      const yrs=Object.values(qualThresh[pos]||{});
      if(!yrs.length)return;
      avgThresh[pos]={
        starterLine:+(yrs.reduce((a,t)=>a+t.starterLine,0)/yrs.length).toFixed(1),
        eliteLine:+(yrs.reduce((a,t)=>a+t.eliteLine,0)/yrs.length).toFixed(1),
        avgStarter:+(yrs.reduce((a,t)=>a+t.avgStarter,0)/yrs.length).toFixed(1),
      };
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 6: Draft outcome analysis — was each pick a HIT?
    //   Hit = produced a quality starter season (top 15% at position)
    //   Starter = produced starter-level season
    // ═══════════════════════════════════════════════════════════════
    const draftOutcomes=[];
    const hitByRoundPos={};
    const pickSlotHistory={};

    allDraftPicks.forEach(dp=>{
      const ps=playerSeasons[dp.pid];
      const draftYr=parseInt(dp.season);
      const pos=dp.pos;
      const thresh=avgThresh[pos];

      // Find best post-draft season
      let bestTotal=0,bestAvg=0,bestYr=null,isHit=false,isStarter=false;
      if(ps){
        Object.entries(ps.seasons).forEach(([yr,s])=>{
          if(parseInt(yr)<draftYr)return; // only post-draft seasons count
          if(s.total>bestTotal){bestTotal=s.total;bestAvg=s.avg;bestYr=yr;}
          if(thresh&&s.total>=thresh.eliteLine)isHit=true;
          if(thresh&&s.total>=thresh.starterLine)isStarter=true;
        });
      }

      // For recent drafts (current season), give benefit of doubt to high-ceiling rookies
      // They haven't had time to prove themselves yet
      const seasonsAvailable=curSeason-draftYr;

      const outcome={
        ...dp,bestTotal,bestAvg,bestYr,isHit,isStarter,
        seasonsAvailable,
        // Normalized value: best season as % of avg starter threshold
        normValue:thresh?+(bestTotal/thresh.starterLine*100).toFixed(1):0
      };
      draftOutcomes.push(outcome);

      // Aggregate by round+position
      const key='R'+dp.round+'_'+pos;
      if(!hitByRoundPos[key])hitByRoundPos[key]={hits:0,starters:0,total:0,players:[]};
      const h=hitByRoundPos[key];
      h.total++;if(isHit)h.hits++;if(isStarter)h.starters++;
      h.players.push({name:dp.name,season:dp.season,hit:isHit,starter:isStarter,bestTotal,bestAvg});

      // Pick slot history
      if(!pickSlotHistory[dp.pick_no])pickSlotHistory[dp.pick_no]=[];
      pickSlotHistory[dp.pick_no].push({pos,name:dp.name,hit:isHit,starter:isStarter,season:dp.season,bestTotal});
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 7: DHQ_PICK_VALUE — value of every draft slot (1-112+)
    //   MUST decrease monotonically by pick number (earlier = better)
    //   Late round picks (R4-R7) are lottery tickets, not assets
    // ═══════════════════════════════════════════════════════════════
    const maxPicks=allDraftPicks.reduce((m,p)=>Math.max(m,p.pick_no),0);
    const dhqPickValues={}; // pick_no -> {value, hitRate, starterRate, avgNorm, samples}
    const hitRateByRound={};

    // First: calculate raw expected value per pick slot from actual outcomes
    for(let pick=1;pick<=maxPicks;pick++){
      const data=pickSlotHistory[pick]||[];
      const withTime=data.filter(d=>parseInt(d.season)<=curSeason-1);
      if(!withTime.length)continue;
      const starters=withTime.filter(d=>d.starter).length;
      const hits=withTime.filter(d=>d.hit).length;
      const avgNorm=+(withTime.reduce((a,d)=>{
        const pos=d.pos;const thresh=avgThresh[pos]?.starterLine||100;
        return a+(d.bestTotal/thresh*100);
      },0)/withTime.length).toFixed(1);
      dhqPickValues[pick]={
        value:0, // will be set below
        hitRate:+(hits/withTime.length*100).toFixed(0),
        starterRate:+(starters/withTime.length*100).toFixed(0),
        avgNorm,samples:withTime.length,allSamples:data.length
      };
    }

    // ── BLENDED PICK VALUES ──
    // League-specific hit rates blended with industry consensus (FantasyCalc).
    // Uses CONVEX DECAY (exponential) instead of linear — matches real market
    // where value drops steeply from 1.01→1.04, then flattens through 1.12+.
    //
    // League Age Weighting:
    //   1-3 seasons:  80% industry / 20% league
    //   4-5 seasons:  60% industry / 40% league
    //   6-8 seasons:  40% industry / 60% league
    //   9+ seasons:   20% industry / 80% league
    //
    const leagueSeasons = chain.length || 1;
    const leagueWeight = leagueSeasons >= 9 ? 0.80 :
                         leagueSeasons >= 6 ? 0.60 :
                         leagueSeasons >= 4 ? 0.40 : 0.20;
    const industryWeight = 1 - leagueWeight;
    console.log(`DHQ Pick Blend: ${leagueSeasons} seasons → ${Math.round(leagueWeight*100)}% league / ${Math.round(industryWeight*100)}% industry`);

    // Industry pick values now come from the universal pick value model
    // (shared/pick-value-model.js — calibrated to KTC April 2026 market data)

    for(let pick=1;pick<=maxPicks;pick++){
      if(!dhqPickValues[pick])continue;
      const rd=Math.ceil(pick/totalTeams);
      const posInRound=((pick-1)%totalTeams)+1;

      // League-derived value (from actual draft outcomes in THIS league)
      const roundBase={1:7200,2:2000,3:1200,4:850,5:400,6:200,7:100};
      const roundEnd={1:2100,2:1200,3:850,4:400,5:200,6:100,7:50};
      const lBase=roundBase[rd]||50;
      const lEnd=roundEnd[rd]||25;
      const lDecay=2.5; // Matches the new model's decay constant
      const pickPct=(posInRound-1)/Math.max(1,totalTeams-1);
      const rawPct=1-Math.exp(-lDecay*pickPct);
      const maxPct=1-Math.exp(-lDecay*1.0);
      const normPct=rawPct/maxPct;
      const leagueVal=lEnd+(lBase-lEnd)*(1-normPct);
      const hitBonus=dhqPickValues[pick].starterRate>0?
        Math.min(0.15,Math.max(-0.15,(dhqPickValues[pick].starterRate-50)/333)):0;
      const leagueFinal=leagueVal*(1+hitBonus);

      // Industry consensus value from universal model
      const industryVal = typeof getIndustryPickValue === 'function'
        ? getIndustryPickValue(rd, posInRound, totalTeams)
        : (lEnd+(lBase-lEnd)*(1-normPct)); // fallback if model not loaded

      // Blend: weighted average
      const blended = (leagueFinal * leagueWeight) + (industryVal * industryWeight);
      dhqPickValues[pick].value=Math.round(blended);
      dhqPickValues[pick].leagueRaw=Math.round(leagueFinal);
      dhqPickValues[pick].industryVal=Math.round(industryVal);
      dhqPickValues[pick].blendWeights={league:Math.round(leagueWeight*100),industry:Math.round(industryWeight*100)};
    }

    // ── Enforce monotonic ordering within each round ──
    // Hit bonus + rounding can cause later picks to exceed earlier picks.
    // Clamp so each pick is <= the one before it (within same round).
    for(let rd=1;rd<=7;rd++){
      const start=(rd-1)*totalTeams+1;
      const end=Math.min(rd*totalTeams,maxPicks);
      let prevVal=Infinity;
      for(let pick=start;pick<=end;pick++){
        if(!dhqPickValues[pick])continue;
        if(dhqPickValues[pick].value>prevVal){
          dhqPickValues[pick].value=prevVal;
        }
        prevVal=dhqPickValues[pick].value;
      }
    }

    // Cross-round monotonic: last pick of round N must be >= first pick of round N+1
    for(let pick=2;pick<=maxPicks;pick++){
      if(!dhqPickValues[pick]||!dhqPickValues[pick-1])continue;
      if(dhqPickValues[pick].value>dhqPickValues[pick-1].value){
        dhqPickValues[pick].value=dhqPickValues[pick-1].value;
      }
    }

    // Round-level summary
    const draftRounds=draftMeta[0]?.rounds||7;
    for(let rd=1;rd<=draftRounds;rd++){
      const rdPicks=draftOutcomes.filter(d=>d.round===rd&&d.seasonsAvailable>=1);
      const hits=rdPicks.filter(d=>d.isHit).length;
      const starters=rdPicks.filter(d=>d.isStarter).length;
      hitRateByRound[rd]={
        total:rdPicks.length,hits,starters,
        rate:rdPicks.length?+((starters/rdPicks.length*100).toFixed(0)):0,
        eliteRate:rdPicks.length?+((hits/rdPicks.length*100).toFixed(0)):0,
      };
      // Best positions per round
      const posByRound={};
      rdPicks.forEach(d=>{
        if(!posByRound[d.pos])posByRound[d.pos]={hits:0,starters:0,total:0};
        posByRound[d.pos].total++;if(d.isHit)posByRound[d.pos].hits++;if(d.isStarter)posByRound[d.pos].starters++;
      });
      hitRateByRound[rd].bestPos=Object.entries(posByRound)
        .map(([pos,d])=>({pos,rate:d.total>=2?+((d.starters/d.total*100).toFixed(0)):0,total:d.total,starters:d.starters,hits:d.hits}))
        .filter(p=>p.total>=2).sort((a,b)=>b.rate-a.rate);
    }

    // Future year discount for picks
    const curYear=curSeason;
    const dhqPickValueFn=(season,round,pickInRound)=>{
      const yr=parseInt(season)||curYear;
      const pick=(round-1)*totalTeams+Math.min(pickInRound||Math.ceil(totalTeams/2),totalTeams);
      const base=dhqPickValues[pick]?.value||dhqPickValues[pick-1]?.value||dhqPickValues[pick+1]?.value||0;
      const yearDiscount=Math.pow(0.88,Math.max(0,yr-curYear)); // 12% per year discount
      return Math.round(base*yearDiscount);
    };

    // ═══════════════════════════════════════════════════════════════
    // STEP 8: DHQ_PLAYER_VALUE — every player, 0-10000 scale
    //
    // WEIGHT ALLOCATION:
    //   Production Base:      40% (weighted PPG from league scoring)
    //   Age / Peak Curve:     25% (remaining productive years)
    //   Situation Multiplier: 20% (team, role, trajectory)
    //   Positional Scarcity:  10% (supply vs demand at position)
    //   Peak Years Bonus:      5% (additive per remaining peak year)
    // ═══════════════════════════════════════════════════════════════

    // ── Age curves: position-specific peak windows ──
    const peakWindows=window.App.peakWindows||{QB:[23,39],RB:[21,31],WR:[21,33],TE:[21,34],DL:[26,33],LB:[26,32],DB:[21,34]};

    // ── Position-specific decay rates (per year past peak end) ──
    const decayRates=window.App.decayRates||{QB:0.06,RB:0.25,WR:0.14,TE:0.12,DL:0.15,LB:0.15,DB:0.14};

    // ── Positional scarcity multipliers ──
    // In 16-team SF IDP: QB premium, IDP discount, TE unicorn
    const scarcityMult={};
    const isSF=rp.includes('SUPER_FLEX');
    positions.forEach(pos=>{
      const needed=(starterCounts[pos]||1)*totalTeams;
      const available=Object.values(playerSeasons).filter(p=>p.pos===pos&&Object.keys(p.seasons).length>=1).length;
      const ratio=needed/Math.max(1,available);
      // Base from supply/demand
      let mult=Math.min(1.3,0.8+ratio*0.5);
      // Manual overrides based on dynasty market reality
      if(pos==='QB'&&isSF)mult=Math.max(mult,1.25); // SF QB premium
      else if(pos==='TE')mult=Math.max(mult,1.15); // TE scarcity
      else if(pos==='WR')mult=Math.min(mult,1.0); // deepest position
      else if(['DL','LB','DB'].includes(pos)){
        // IDP scarcity cap depends on how many IDP starters the league requires
        const idpStarters=(starterCounts.DL||0)+(starterCounts.LB||0)+(starterCounts.DB||0);
        const idpCap=idpStarters>=6?1.05:idpStarters>=3?1.0:0.92;
        mult=Math.min(mult,idpCap);
      }
      scarcityMult[pos]=+mult.toFixed(3);
    });

    const playerScores={};
    const playerMeta={};

    // Build set of all rostered players across the league
    const rosteredSet=new Set(S.rosters.flatMap(r=>r.players||[]));
    // Detect offseason: if most players have null/missing team, Sleeper hasn't updated
    const samplePids=Object.keys(S.players).slice(0,500);
    const nullTeamPct=samplePids.filter(id=>{const t=S.players[id]?.team;return!t||t==='null'||t===null;}).length/samplePids.length;
    const isOffseasonTeams=nullTeamPct>0.3;

    // Score all players with recent production
    const recentPlayers=Object.entries(playerSeasons)
      .filter(([pid,ps])=>{
        if(!(ps.seasons[curSeason]||ps.seasons[curSeason-1]||ps.seasons[curSeason-2]))return false;
        // Skip players Sleeper explicitly marks as retired/inactive
        const p=S.players[pid];
        if(p&&(p.status==='Inactive'||p.status==='Retired'))return false;
        return true;
      })
      .map(([pid,ps])=>{
        const pos=ps.pos;
        const p=S.players[pid];

        // ─── COMPONENT 1: Production Base (40%) ───
        let weightedTotal=0,weightSum=0;
        const weights={}; uniqueYears.forEach((yr,i)=>weights[yr]=[0.5,1,2,3,4][i]||4);
        Object.entries(ps.seasons).forEach(([yr,s])=>{
          const w=weights[yr]||0.5;
          weightedTotal+=s.avg*w;
          weightSum+=w;
        });
        const wPPG=weightSum>0?+(weightedTotal/weightSum).toFixed(2):0;
        const bestSeason=Object.values(ps.seasons).reduce((m,s)=>s.total>m.total?s:m,{total:0,avg:0});

        // Elite pedigree floor: protects PROVEN ELITE dynasty assets from one bad year.
        // Requirements: 4+ starter seasons AND an elite best season avg (QB>22, RB/WR>16, TE>13)
        // REDUCED for aging vets: 30+ get weaker protection, 33+ get none
        const eliteThresh={QB:22,RB:16,WR:16,TE:13,DL:8,LB:8,DB:8};
        const age=pAge(pid)||26;
        // Compute starter seasons early so pedigree check can use it
        const realStarterLineEarly=(avgThresh[pos]?.avgStarter||100)*0.70;
        const starterSeasonsEarly=Object.values(ps.seasons).filter(s=>s.total>=realStarterLineEarly).length;
        const isElitePedigree=starterSeasonsEarly>=4&&bestSeason.avg>=(eliteThresh[pos]||15);
        let pedigreeFloor=0;
        if(isElitePedigree){
          // QB market value drops faster — start reducing pedigree at 28 instead of 30
          const pedigreeAgeStart=pos==='QB'?28:30;
          const pedigreeAgeEnd=pos==='QB'?32:33;
          if(age>=pedigreeAgeEnd) pedigreeFloor=0;
          else if(age>=pedigreeAgeStart) pedigreeFloor=bestSeason.avg*(0.30-0.10*((age-pedigreeAgeStart)/(pedigreeAgeEnd-pedigreeAgeStart)));
          else pedigreeFloor=bestSeason.avg*0.50;
        }
        const adjustedWPPG=Math.max(wPPG, pedigreeFloor);

        // ─── COMPONENT 2: Age / Peak Curve (25%) ───
        const [peakStart,peakEnd]=peakWindows[pos]||[23,29];
        const peakYrsLeft=Math.max(0,peakEnd-age);
        let ageFactor=1.0;

        if(age<peakStart){
          const yearsToStart=peakStart-age;
          ageFactor=0.80+0.20*(1-yearsToStart/Math.max(1,peakStart-18));
        }else if(age<=peakEnd){
          ageFactor=1.0;
        }else{
          const yearsPost=age-peakEnd;
          const rate=decayRates[pos]||0.13;
          ageFactor=Math.max(0.03,1.0-yearsPost*rate);
          if(yearsPost>=5)ageFactor*=0.70;
          if(yearsPost>=8)ageFactor*=0.50;
          ageFactor=Math.max(0.02,ageFactor);
        }

        // ─── COMPONENT 3: Situation Multiplier (20%) ───
        let sitMult=1.0;
        const isRostered=rosteredSet.has(pid);
        const hasRealTeam=p?.team&&p.team!=='null'&&p.team!==null&&p.team!=='FA'&&p.team!=='';

        // A) Team / roster status — smart offseason handling
        // During offseason, Sleeper nulls out team fields for many active players.
        // Use recent production as a proxy: if they played recently, they're not retired.
        const hasRecentProduction=!!(ps.seasons[curSeason]||ps.seasons[curSeason-1]);
        if(!isRostered&&!hasRealTeam&&!isOffseasonTeams){
          // Mid-season: not rostered, no NFL team = effectively retired/worthless
          sitMult*=0.30;
        }else if(!isRostered&&!hasRealTeam&&isOffseasonTeams&&hasRecentProduction){
          // Offseason: team data stale but player produced recently = likely unsigned FA, not retired
          sitMult*=0.50;
        }else if(!isRostered&&!hasRealTeam&&isOffseasonTeams&&!hasRecentProduction){
          // Offseason: no team, no recent production = likely retired
          sitMult*=0.30;
        }else if(!isRostered&&hasRealTeam){
          // Has an NFL team but no one in the league rosters them = available FA
          sitMult*=0.55;
        }else if(isRostered&&!hasRealTeam&&isOffseasonTeams){
          // Rostered but team shows null — Sleeper offseason lag, don't penalize
          sitMult*=1.0;
        }else if(isRostered&&!hasRealTeam&&!isOffseasonTeams){
          // Rostered but no team mid-season = cut/released
          sitMult*=0.65;
        }

        // B) Role detection: starter vs backup vs replacement
        const recentPPG=ps.seasons[curSeason]?.avg||ps.seasons[curSeason-1]?.avg||0;
        const posStarterPPG=(avgThresh[pos]?.avgStarter||100)/17;

        if(recentPPG>0){
          const pctOfStarter=recentPPG/posStarterPPG;
          if(pctOfStarter<0.30){
            sitMult*=0.65; // Deep backup: barely relevant
          }else if(pctOfStarter<0.50){
            sitMult*=0.75; // Low-end backup
          }else if(pctOfStarter<0.70){
            sitMult*=0.85; // Fringe starter / high backup
          }else if(pctOfStarter>=1.30){
            sitMult*=1.10; // Premium starter
          }
          // 0.70-1.30 = starter level, no adjustment
        }

        // C) Career trajectory — TIGHTENED starter definition
        // "Starter season" = must hit 70% of avg starter production (not just clearing the floor)
        const realStarterLine=(avgThresh[pos]?.avgStarter||100)*0.70;
        const starterSeasons=Object.values(ps.seasons).filter(s=>s.total>=realStarterLine).length;
        const totalSeasons=Object.keys(ps.seasons).length;

        if(starterSeasons>=4){
          sitMult*=1.18; // Proven franchise player
        }else if(starterSeasons>=3){
          sitMult*=1.12; // Established starter
        }else if(starterSeasons>=2){
          sitMult*=1.05; // Two-year starter
        }else if(starterSeasons===1){
          sitMult*=0.88; // One-year wonder: haven't proven anything yet
        }else{
          sitMult*=0.80; // Zero real starter seasons: all hype
        }

        // D) Youth premium: dynasty's crown jewels
        if(age<=22&&wPPG>=posStarterPPG*0.5){
          sitMult*=1.25;
        }else if(age<=23&&wPPG>=posStarterPPG*0.5){
          sitMult*=1.20;
        }else if(age<=25&&wPPG>=posStarterPPG*0.7){
          sitMult*=1.10;
        }

        // D2) Upside multiplier: under-25 with starter-level production
        // These are breakout candidates — dynasty's most valuable assets
        if(age<=24&&wPPG>=posStarterPPG*0.85&&starterSeasons>=1){
          sitMult*=1.15; // Strong upside: young + producing at starter level
        }else if(age<=24&&wPPG>=posStarterPPG*0.65&&starterSeasons>=1){
          sitMult*=1.08; // Moderate upside: young + approaching starter level
        }

        // E) Durability: games played penalty
        const recentGP=ps.seasons[curSeason]?.gp||ps.seasons[curSeason-1]?.gp||17;
        const prevGP=ps.seasons[curSeason-1]?.gp||ps.seasons[curSeason-2]?.gp||17;
        if(recentGP<=10&&prevGP<=10&&totalSeasons>=2){
          sitMult*=0.82; // Injury-prone: missed time in multiple seasons
        }else if(recentGP<=10&&totalSeasons>=1){
          sitMult*=0.90; // Missed time recently
        }

        // F) Elite production premium — BIGGER gaps between tiers
        const allPosPPG=Object.entries(playerSeasons)
          .filter(([,pps])=>pps.pos===pos&&(pps.seasons[curSeason]||pps.seasons[curSeason-1]))
          .map(([pid2,pps])=>({pid:pid2,ppg:pps.seasons[curSeason]?.avg||pps.seasons[curSeason-1]?.avg||0}))
          .sort((a,b)=>b.ppg-a.ppg);
        const posRank=allPosPPG.findIndex(p=>p.pid===pid)+1;
        const posTotal=allPosPPG.length;

        if(posRank>0&&posRank<=3)sitMult*=1.20; // Top 3: elite tier
        else if(posRank>0&&posRank<=5)sitMult*=1.12; // Top 5: star
        else if(posRank>0&&posRank<=10)sitMult*=1.05; // Top 10: solid starter
        // G) Replacement-level penalty — bottom quartile of starters
        else if(posRank>0&&posRank>posTotal*0.75)sitMult*=0.88; // Bottom 25%: replacement level
        else if(posRank>0&&posRank>posTotal*0.90)sitMult*=0.78; // Bottom 10%: roster filler

        // ── CLAMP situation multiplier to reasonable range ──
        sitMult=Math.min(1.60,Math.max(0.40,sitMult));

        // Trend: compare most recent season to prior
        const ppgCur=ps.seasons[curSeason]?.avg||0;
        const ppgPrev=ps.seasons[curSeason-1]?.avg||0;
        const trend=ppgCur&&ppgPrev?+(((ppgCur-ppgPrev)/ppgPrev)*100).toFixed(0):0; // % change

        return{pid,pos,name:ps.name,wPPG:adjustedWPPG,rawPPG:wPPG,bestTotal:bestSeason.total,bestAvg:bestSeason.avg,
          age,ageFactor:+ageFactor.toFixed(4),sitMult:+sitMult.toFixed(4),
          peakYrsLeft,seasons:totalSeasons,starterSeasons,recentGP,posRank,posTotal,trend};
      })
      .filter(p=>p.wPPG>0)
      .sort((a,b)=>(b.wPPG*b.ageFactor*b.sitMult)-(a.wPPG*a.ageFactor*a.sitMult));

    // ─── FINAL VALUE ASSEMBLY ───
    // Combine all components into 0-10000 scale
    const topComposite=recentPlayers[0]?(recentPlayers[0].wPPG*recentPlayers[0].ageFactor*recentPlayers[0].sitMult):1;
    recentPlayers.forEach((p)=>{
      const composite=p.wPPG*p.ageFactor*p.sitMult;

      // Production + Age + Situation (75% of value)
      const coreScore=(composite/topComposite)*7500;

      // Positional scarcity (10%) — TIERED for QB in superflex
      let scarcityScore=(scarcityMult[p.pos]||1.0)*1000-500;
      if(p.pos==='QB'&&isSF){
        // In superflex, only GOOD QBs deserve the scarcity premium
        if(p.posRank>0&&p.posRank<=12)scarcityScore=750; // Top 12: full premium
        else if(p.posRank>0&&p.posRank<=24)scarcityScore=400; // QB13-24: moderate
        else scarcityScore=100; // QB25+: backup, minimal scarcity value
      }

      // Peak years remaining bonus (5%): ~120 per year, capped at 1000
      // GATED: only players with starter-level production get the full bonus
      // Backups get a reduced bonus — youth alone isn't enough
      const productionPct = p.wPPG / Math.max(1, (avgThresh[p.pos]?.avgStarter || 100) / 17);
      const peakMult = productionPct >= 0.70 ? 1.0 :   // Starter-level: full peak bonus
                       productionPct >= 0.40 ? 0.40 :  // Fringe: reduced bonus
                       productionPct >= 0.20 ? 0.15 :  // Backup: minimal bonus
                       0.0;                             // Deep backup: no peak bonus
      const peakBonus = Math.min(1000, p.peakYrsLeft * 120 * peakMult);

      // Consistency bonus — but NOT for unrostered players (nobody wants them)
      const isUnrostered=!rosteredSet.has(p.pid);
      const consistencyBonus=isUnrostered?0:(p.starterSeasons>=4?400:p.starterSeasons>=3?300:p.starterSeasons>=2?150:0);

      // Durability micro-bonus (not for unrostered)
      const durabilityBonus=isUnrostered?0:(p.recentGP>=16?100:p.recentGP>=13?50:0);

      // Scarcity doesn't apply to unrostered players
      // ALSO reduced for players below starter threshold — backups don't create scarcity
      const scarcityFinal = isUnrostered ? 0 : 
                           productionPct >= 0.50 ? scarcityScore :
                           productionPct >= 0.30 ? Math.round(scarcityScore * 0.25) :
                           0; // Deep backups get zero scarcity premium

      // Trend modifier — in-season only, capped at ±8%
      // A +30% trending player gets ~+5% DHQ boost; -30% gets ~-5% penalty
      const nflSt=S.nflState?.season_type;
      const inSeason=nflSt==='regular'||nflSt==='post';
      const trendMod=inSeason&&p.trend?Math.max(-0.08,Math.min(0.08,p.trend/100*0.25)):0;

      const raw=(coreScore+scarcityFinal+peakBonus+consistencyBonus+durabilityBonus)*(1+trendMod);
      const val=Math.round(Math.min(10000,Math.max(0,raw)));
      playerScores[p.pid]=val;
      playerMeta[p.pid]={
        pos:p.pos,ppg:p.wPPG,age:p.age,
        ageFactor:p.ageFactor,sitMult:p.sitMult,
        peakYrsLeft:p.peakYrsLeft,starterSeasons:p.starterSeasons,
        recentGP:p.recentGP,
        // Trend: compare most recent season PPG to prior
        trend:(()=>{
          const ps=playerSeasons[p.pid];if(!ps)return 0;
          const cur=ps.seasons[curSeason]?.avg||0;
          const prev=ps.seasons[curSeason-1]?.avg||ps.seasons[curSeason-2]?.avg||0;
          if(!cur||!prev)return 0;
          const pctChange=((cur-prev)/prev)*100;
          return +pctChange.toFixed(0); // e.g., +15 means 15% improvement, -20 means 20% decline
        })()
      };
    });
    console.log('DHQ player values: '+Object.keys(playerScores).length+' players scored');

    // ═══════════════════════════════════════════════════════════════
    // STEP 9: Aggregate FAAB data (already fetched/cached above)
    // ═══════════════════════════════════════════════════════════════
    const faabByPos={};
    (faabTxns||[]).forEach(({pos,bid})=>{
      if(!faabByPos[pos])faabByPos[pos]={total:0,count:0,bids:[]};
      faabByPos[pos].total+=bid;faabByPos[pos].count++;faabByPos[pos].bids.push(bid);
    });
    Object.entries(faabByPos).forEach(([pos,d])=>{
      d.avg=+(d.total/d.count).toFixed(1);
      d.median=d.bids.sort((a,b)=>a-b)[Math.floor(d.bids.length/2)]||0;
      d.p75=d.bids[Math.floor(d.bids.length*0.75)]||0;
      delete d.bids;
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 9b: Trade history analysis — owner profiles + league tendencies
    // ═══════════════════════════════════════════════════════════════
    const ownerProfiles={};
    const playerTradeHistory={};
    const leagueTradeTendencies={totalTrades:0,byPos:{},avgAssetsPerSide:0,pickHeavy:0,playerHeavy:0};

    (tradeTxns||[]).forEach(t=>{
      leagueTradeTendencies.totalTrades++;
      const rids=t.roster_ids||[];

      rids.forEach(rid=>{
        if(!ownerProfiles[rid])ownerProfiles[rid]={trades:0,playersAcquired:[],playersSold:[],picksAcquired:0,picksSold:0,posAcquired:{},posSold:{}};
        const profile=ownerProfiles[rid];
        profile.trades++;

        const got=t.sides[rid]||{players:[],picks:[]};
        const otherRid=rids.find(r=>r!==rid);
        const gave=otherRid&&t.sides[otherRid]?t.sides[otherRid]:{players:[],picks:[]};

        // Players acquired
        got.players.forEach(pid=>{
          profile.playersAcquired.push(pid);
          const pos=posMapLocal(pPos(pid)||S.players?.[pid]?.position||'');
          if(pos)profile.posAcquired[pos]=(profile.posAcquired[pos]||0)+1;
        });

        // Players sold (what the OTHER side got = what this owner gave)
        gave.players.forEach(pid=>{
          profile.playersSold.push(pid);
          const pos=posMapLocal(pPos(pid)||S.players?.[pid]?.position||'');
          if(pos)profile.posSold[pos]=(profile.posSold[pos]||0)+1;
        });

        // Picks
        got.picks.forEach(()=>profile.picksAcquired++);
        gave.picks.forEach(()=>profile.picksSold++);
      });

      // Track which players have been traded and how often
      rids.forEach(rid=>{
        const side=t.sides[rid]||{players:[]};
        side.players.forEach(pid=>{
          if(!playerTradeHistory[pid])playerTradeHistory[pid]=[];
          playerTradeHistory[pid].push({season:t.season,week:t.week});
        });
      });

      // League tendencies
      const totalAssets=rids.reduce((s,rid)=>{
        const side=t.sides[rid]||{players:[],picks:[]};
        return s+side.players.length+side.picks.length;
      },0);
      leagueTradeTendencies.avgAssetsPerSide+=totalAssets/(rids.length||1);
      const hasPicks=rids.some(rid=>(t.sides[rid]?.picks||[]).length>0);
      if(hasPicks)leagueTradeTendencies.pickHeavy++;
      else leagueTradeTendencies.playerHeavy++;
    });

    // Compute owner DNA labels
    if(leagueTradeTendencies.totalTrades>0){
      leagueTradeTendencies.avgAssetsPerSide=+(leagueTradeTendencies.avgAssetsPerSide/leagueTradeTendencies.totalTrades).toFixed(1);
    }
    Object.entries(ownerProfiles).forEach(([rid,p])=>{
      // Classify owner trade style
      const pickBuyer=p.picksAcquired>p.picksSold*1.5;
      const pickSeller=p.picksSold>p.picksAcquired*1.5;
      const highVolume=p.trades>=leagueTradeTendencies.totalTrades/totalTeams*1.5;
      const lowVolume=p.trades<=1;
      p.dna=pickBuyer?'Rebuilder (pick collector)':pickSeller?'Win-now (pick seller)':highVolume?'Active trader':lowVolume?'Holds firm':'Balanced';
      // Most targeted position
      const topPos=Object.entries(p.posAcquired).sort((a,b)=>b[1]-a[1])[0];
      p.targetPos=topPos?topPos[0]:null;
    });

    console.log(`Trade analysis: ${leagueTradeTendencies.totalTrades} trades across ${Object.keys(ownerProfiles).length} owners`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 9c: Trade value analysis — per-trade fairness + enriched owner profiles
    // ═══════════════════════════════════════════════════════════════
    const PICK_VALUE_FALLBACK={1:7000,2:3500,3:1800,4:800};
    const getPickVal=(season,round)=>{
      if(typeof dhqPickValueFn==='function'){
        const v=dhqPickValueFn(season,round,Math.ceil(totalTeams/2));
        if(v>0)return v;
      }
      return PICK_VALUE_FALLBACK[round]||400;
    };

    const tradeHistory=(tradeTxns||[]).map(t=>{
      const rids=t.roster_ids||[];
      const sides={};
      rids.forEach(rid=>{
        const s=t.sides[rid]||{players:[],picks:[]};
        const playerVal=s.players.reduce((sum,pid)=>sum+(playerScores[pid]||0),0);
        const pickVal=s.picks.reduce((sum,pk)=>sum+getPickVal(pk.season,pk.round),0);
        sides[rid]={players:s.players,picks:s.picks,totalValue:playerVal+pickVal};
      });
      const vals=rids.map(rid=>sides[rid]?.totalValue||0);
      const maxVal=Math.max(...vals,1);
      const diff=rids.length===2?Math.abs(vals[0]-vals[1]):0;
      const diffPct=+(diff/maxVal*100).toFixed(1);
      const fairness=Math.round(100-Math.min(100,diffPct));
      let winner=null;
      if(rids.length===2&&vals[0]!==vals[1])winner=vals[0]>vals[1]?rids[0]:rids[1];
      return {
        season:t.season,week:t.week,ts:t.ts,
        roster_ids:rids,sides,
        fairness,winner,valueDiff:diff,valueDiffPct:diffPct
      };
    });

    // Enrich ownerProfiles with value-based trade metrics
    Object.values(ownerProfiles).forEach(p=>{
      p.tradesWon=0;p.tradesLost=0;p.tradesFair=0;
      p.avgValueDiff=0;p.partners={};
      p.biggestWin=null;p.biggestLoss=null;
      p.seasonActivity={};p.weekTiming={early:0,mid:0,late:0};
    });
    tradeHistory.forEach(t=>{
      const rids=t.roster_ids||[];
      rids.forEach(rid=>{
        const p=ownerProfiles[rid];if(!p)return;
        const otherRid=rids.find(r=>r!==rid);
        const myVal=t.sides[rid]?.totalValue||0;
        const theirVal=otherRid?t.sides[otherRid]?.totalValue||0:0;
        const net=myVal-theirVal;

        // Win/loss/fair
        if(t.valueDiffPct<=15)p.tradesFair++;
        else if(t.winner===rid)p.tradesWon++;
        else if(t.winner!==null)p.tradesLost++;

        p.avgValueDiff+=net;

        // Partners
        if(otherRid!=null)p.partners[otherRid]=(p.partners[otherRid]||0)+1;

        // Biggest win/loss
        if(net>0&&(!p.biggestWin||net>(p.biggestWin._net||0)))p.biggestWin={...t,_net:net};
        if(net<0&&(!p.biggestLoss||net<(p.biggestLoss._net||0)))p.biggestLoss={...t,_net:net};

        // Season activity
        p.seasonActivity[t.season]=(p.seasonActivity[t.season]||0)+1;

        // Week timing
        const w=t.week;
        if(w>=1&&w<=6)p.weekTiming.early++;
        else if(w>=7&&w<=12)p.weekTiming.mid++;
        else p.weekTiming.late++;
      });
    });
    // Finalize averages and clean up temp fields
    Object.values(ownerProfiles).forEach(p=>{
      if(p.trades>0)p.avgValueDiff=Math.round(p.avgValueDiff/p.trades);
      if(p.biggestWin)delete p.biggestWin._net;
      if(p.biggestLoss)delete p.biggestLoss._net;
    });

    console.log(`Trade value analysis: ${tradeHistory.length} trades enriched with fairness scores`);

    // ═══════════════════════════════════════════════════════════════
    // STEP 10: ADP by position in this league's drafts
    // ═══════════════════════════════════════════════════════════════
    const adpByPos={};
    positions.forEach(pos=>{
      const posPicksData=allDraftPicks.filter(p=>p.pos===pos);
      if(!posPicksData.length)return;
      const avgPick=posPicksData.reduce((a,p)=>a+p.pick_no,0)/posPicksData.length;
      const byRound={};
      posPicksData.forEach(p=>{if(!byRound[p.round])byRound[p.round]=0;byRound[p.round]++;});
      adpByPos[pos]={avgPick:+avgPick.toFixed(1),count:posPicksData.length,
        topRound:Object.keys(byRound).sort((a,b)=>byRound[b]-byRound[a])[0],byRound};
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 11: Positional tier analysis (for AI context)
    // ═══════════════════════════════════════════════════════════════
    const posTiers={};
    positions.forEach(pos=>{
      const posPlayers=recentPlayers.filter(p=>p.pos===pos).sort((a,b)=>b.wPPG-a.wPPG);
      if(!posPlayers.length)return;
      const need=(starterCounts[pos]||1)*totalTeams;
      const starter=posPlayers[Math.min(need-1,posPlayers.length-1)];
      const elite=posPlayers[Math.min(2,posPlayers.length-1)];
      posTiers[pos]={
        count:posPlayers.length,
        starterThreshold:+(starter?.wPPG||0).toFixed(2),
        eliteThreshold:+(elite?.wPPG||0).toFixed(2),
        startableCount:posPlayers.filter(p=>p.wPPG>=(starter?.wPPG||0)*0.85).length,
        scarcity:+(need/Math.max(1,posPlayers.length)).toFixed(3),
        scarcityMult:+(scarcityMult[pos]||1).toFixed(2),
      };
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 12: FantasyCalc market consensus blend
    //   Rookies (no DHQ score): 100% FC value (scaled to DHQ range)
    //   Veterans (have DHQ score): 75% DHQ + 25% FC market consensus
    //   This anchors league-derived values against the broader market
    // ═══════════════════════════════════════════════════════════════
    let rookieCount=0;
    let vetBlendCount=0;
    try{
      const pprVal = (sc.rec != null && sc.rec >= 0.9) ? 1 : (sc.rec != null && sc.rec >= 0.4) ? 0.5 : 0;
      const fcUrl=`https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${isSF?2:1}&numTeams=${totalTeams}&ppr=${pprVal}`;
      const fcData=await fetch(fcUrl).then(r=>r.ok?r.json():[]).catch(()=>[]);
      if(fcData.length){
        // ── SCALE FACTOR: use median ratio of top-20 matched players ──
        // More robust than single max-player ratio (avoids outlier skew)
        const fcMatched=fcData.filter(d=>d.player?.sleeperId&&d.player.position!=='PICK'&&d.value>0&&playerScores[d.player.sleeperId])
          .map(d=>({sid:d.player.sleeperId,fcVal:d.value,dhqVal:playerScores[d.player.sleeperId]}))
          .sort((a,b)=>b.fcVal-a.fcVal);
        let scaleFactor;
        if(fcMatched.length>=10){
          const ratios=fcMatched.slice(0,20).map(m=>m.dhqVal/m.fcVal).sort((a,b)=>a-b);
          scaleFactor=ratios[Math.floor(ratios.length/2)]; // median
        }else{
          const fcTop=Math.max(...fcData.filter(d=>d.player?.sleeperId).map(d=>d.value||0),1);
          const dhqTop=Math.max(...Object.values(playerScores),1);
          scaleFactor=dhqTop/fcTop;
        }

        fcData.forEach(d=>{
          const sid=d.player?.sleeperId;
          const pos=d.player?.position;
          const val=d.value||0;
          if(!sid||!pos||pos==='PICK'||val<=0)return;
          const mappedPos=posMapLocal(pos);
          if(!positions.includes(mappedPos)&&pos!=='K')return;
          const fcScaled=Math.round(val*scaleFactor);

          if(playerScores[sid]){
            // ── VETERAN BLEND: deviation-aware FC weight ──
            // Base: 75% DHQ / 25% FC. When DHQ deviates >50% from FC,
            // increase FC weight to 40% to prevent extreme outliers.
            const dhqVal=playerScores[sid];
            const deviation=Math.abs(dhqVal-fcScaled)/Math.max(dhqVal,fcScaled,1);
            const fcWt=deviation>0.5?0.40:deviation>0.3?0.35:0.25;
            const blended=Math.round(dhqVal*(1-fcWt)+fcScaled*fcWt);
            playerScores[sid]=Math.min(10000,Math.max(0,blended));
            if(playerMeta[sid]){
              playerMeta[sid].fcValue=val;
              playerMeta[sid].fcScaled=fcScaled;
              playerMeta[sid].dhqRaw=dhqVal;
              playerMeta[sid].fcWeight=Math.round(fcWt*100);
              playerMeta[sid].source='DHQ_FC_BLEND';
            }
            vetBlendCount++;
          }else{
            // ── ROOKIE: veteran-anchored DHQ mapping ──
            // Skip IDP rookies if league has no IDP slots
            const isIDPPos=['DL','LB','DB'].includes(mappedPos);
            const hasIDP=(starterCounts.DL||0)>1||(starterCounts.LB||0)>1||(starterCounts.DB||0)>1;
            if(isIDPPos&&!hasIDP)return;

            // Find nearest veteran by FC value to anchor the DHQ mapping
            let anchorDHQ=null;
            if(fcMatched.length>=5){
              // Binary search for closest FC value among matched veterans
              let bestDist=Infinity;
              for(const m of fcMatched){
                const dist=Math.abs(m.fcVal-val);
                if(dist<bestDist){bestDist=dist;anchorDHQ=m.dhqVal;}
              }
            }
            const fcScaledVal=Math.round(val*scaleFactor);
            const fcRank=d.overallRank||999;
            let baseDHQ;
            if(fcRank<=10&&anchorDHQ!==null){
              // Top-10 prospects: use the anchor (market-equivalent veteran DHQ)
              // but floor at 80% of the #1 DHQ player to prevent compression
              const topDHQ=Math.max(...Object.values(playerScores),1);
              const fcTopVal=Math.max(...fcData.filter(d2=>d2.player?.sleeperId&&d2.value>0).map(d2=>d2.value),1);
              const directMap=Math.round((val/fcTopVal)*topDHQ);
              baseDHQ=Math.max(anchorDHQ,directMap);
            }else if(fcRank<=30){
              baseDHQ=Math.max(anchorDHQ||0,fcScaledVal);
            }else{
              baseDHQ=anchorDHQ!==null?anchorDHQ:fcScaledVal;
            }
            // Tiered discount: elite picks get minimal discount, late picks more
            const discount=fcRank<=5?0.97:fcRank<=15?0.93:fcRank<=30?0.90:fcRank<=60?0.87:0.82;
            let rookieDHQ=Math.round(baseDHQ*discount);

            // SF QB premium: rookie QBs in superflex get scarcity bonus
            if(mappedPos==='QB'&&isSF){
              const sfBoost=rookieDHQ>=5000?1.15:rookieDHQ>=3000?1.10:1.05;
              rookieDHQ=Math.round(rookieDHQ*sfBoost);
            }

            if(rookieDHQ<100)return;
            playerScores[sid]=Math.min(10000,rookieDHQ);
            playerMeta[sid]={
              pos:mappedPos,ppg:0,age:S.players[sid]?.age||21,
              ageFactor:1.0,sitMult:1.0,
              peakYrsLeft:(peakWindows[mappedPos]||[23,29])[1]-(S.players[sid]?.age||21),
              starterSeasons:0,recentGP:0,
              source:'FC_ROOKIE',fcValue:val,fcRank:fcRank,
              anchorDHQ:anchorDHQ,unprovenDiscount:discount
            };
            rookieCount++;
          }
        });

        // Log top 10 rookies for verification
        const topRookies=Object.entries(playerMeta).filter(([,m])=>m.source==='FC_ROOKIE')
          .map(([sid,m])=>({name:S.players[sid]?.full_name||sid,dhq:playerScores[sid],fc:m.fcValue,rank:m.fcRank}))
          .sort((a,b)=>b.dhq-a.dhq).slice(0,10);
        console.log('Top rookies:',topRookies.map(r=>r.name+' '+r.dhq+' (FC:'+r.fc+')').join(', '));
        console.log(`FC blend: ${vetBlendCount} veterans (deviation-aware), ${rookieCount} rookies (scale: ${scaleFactor.toFixed(3)}, matched: ${fcMatched.length})`);
      }
    }catch(e){console.warn('FC blend failed:',e);}

    // ═══════════════════════════════════════════════════════════════
    // STORE EVERYTHING
    // ═══════════════════════════════════════════════════════════════
    LI={
      // Player values (DHQ engine — league-derived)
      playerScores,     // pid -> 0-10000 DHQ value
      playerMeta,       // pid -> {pos, ppg, age, ageFactor, peakYrsLeft}
      // Pick values
      dhqPickValues,    // pick_no -> {value, hitRate, starterRate, avgNorm}
      dhqPickValueFn,   // (season,round,pickInRound) -> value 0-10000
      // Positional analysis
      posTiers,         // pos -> {starterThreshold, eliteThreshold, scarcity, ...}
      qualThresh,       // pos -> year -> {starterLine, eliteLine, avgStarter}
      avgThresh,        // pos -> {starterLine, eliteLine} averaged across years
      starterCounts,    // pos -> starters needed
      scarcityMult,     // pos -> multiplier
      peakWindows,      // pos -> [start, end] ages
      // Draft intelligence
      draftOutcomes,    // full pick outcomes with hit/starter status
      hitByRoundPos,    // R1_QB -> {hits,starters,total,players}
      hitRateByRound,   // round -> {total,hits,starters,rate,eliteRate,bestPos}
      pickSlotHistory,  // pick_no -> [{pos,name,hit,starter}]
      draftMeta,        // [{season,rounds,picks}]
      adpByPos,         // pos -> {avgPick,count,byRound}
      // FAAB
      faabByPos,        // pos -> {avg,median,p75,count}
      // Meta
      totalPicks:allDraftPicks.length,
      totalFAABTxns:faabTxns.length,
      // Trade intelligence
      ownerProfiles,        // roster_id -> {trades,dna,targetPos,picksAcquired,tradesWon,tradesLost,...}
      playerTradeHistory,   // pid -> [{season,week}]
      leagueTradeTendencies, // {totalTrades,avgAssetsPerSide,pickHeavy,playerHeavy}
      tradeHistory,         // [{season,week,ts,roster_ids,sides,fairness,winner,valueDiff,valueDiffPct}]
      rookieCount,
      // Championships & brackets (NEW)
      championships,        // { season: { champion, runnerUp, semiFinals } }
      bracketData,          // { season: { winners: [], losers: [] } }
      leagueUsersHistory,   // { season: [{ user_id, display_name }] }
      leagueYears:uniqueYears,
      builtAt:new Date().toISOString(),
    };
    LI_LOADED=true;
    saveLICache();

    const topPlayer=recentPlayers[0];
    console.log(`LeagueIntel COMPLETE:
  ${Object.keys(playerScores).length} players valued (${rookieCount} rookies from FC)
  ${allDraftPicks.length} draft picks analyzed (${draftMeta.length} drafts)
  ${faabTxns.length} FAAB transactions
  ${(tradeTxns||[]).length} trade transactions across ${Object.keys(ownerProfiles).length} owners
  ${uniqueYears.length} seasons scored (${uniqueYears.join(',')})
  Top player: ${topPlayer?.name} (${topPlayer?.pos}) wPPG=${topPlayer?.wPPG} DHQ=${playerScores[topPlayer?.pid]}
  Pick 1.01 value: ${dhqPickValues[1]?.value}, R7 last pick: ${dhqPickValues[maxPicks]?.value}`);

    // Notify subscribers that LeagueIntel is ready (replaces direct render calls)
    if(window.DhqEvents)window.DhqEvents.emit('li:loaded',{source:'fresh'});

  }catch(e){
    console.warn('LeagueIntel error:',e);
  }
  }finally{window._liLoading=false;}
}

// Get display value — DHQ (LI) score
function bestValue(pid){
  const liv=livScore(pid);
  if(liv!=null)return liv;
  return dynastyValue(pid);
}

// Get FAAB bid recommendation string for display
function faabBidStr(pos,budget){
  const range=livFAABRange(pos);
  if(!range||range.count<3)return null;
  const pct=budget>0?Math.min(1,(range.p75||range.avg)/200):0;
  const myBid=Math.round(budget*pct*1.1); // bid 10% above market to win
  return`$${range.low}-$${range.p75} (league avg $${range.avg}, ${range.count} claims)`;
}

function dynastyValue(playerId){
  const S=window.App.S||window.S||{};
  const p=S.players?.[playerId];if(!p)return 0;
  if(p.status==='Inactive'||p.status==='Retired')return 0;
  // DHQ value (league-derived) is the sole value source
  if(LI_LOADED&&LI.playerScores?.[playerId]>0)return LI.playerScores[playerId];
  // If DHQ is loaded but player has no score, they're worthless
  if(LI_LOADED)return 0;
  return 0;
}

function getPlayerRank(playerId){
  const S=window.App.S||window.S||{};
  if(LI_LOADED&&LI.playerScores?.[playerId]>0){
    // Rank among ALL rostered players in the league (not all 2240 DHQ players)
    const rosteredPids=new Set();
    S.rosters.forEach(r=>(r.players||[]).forEach(pid=>rosteredPids.add(pid)));
    const allScores=Object.entries(LI.playerScores)
      .filter(([pid])=>rosteredPids.has(pid))
      .sort((a,b)=>b[1]-a[1]);
    const overall=allScores.findIndex(([pid])=>pid===String(playerId))+1;
    const pos=LI.playerMeta?.[playerId]?.pos;
    const posScores=allScores.filter(([pid])=>LI.playerMeta?.[pid]?.pos===pos);
    const posRank=posScores.findIndex(([pid])=>pid===String(playerId))+1;
    return{overall:overall||999,pos:posRank||99,trend:0};
  }
  return null;
}

function isNoValue(playerId){
  return LI_LOADED && dynastyValue(playerId)===0;
}

// ══════════════════════════════════════════════════════════════════
// Expose everything on window.App namespace
// ══════════════════════════════════════════════════════════════════
Object.defineProperty(window.App, 'LI', {
  get(){ return LI; },
  set(v){ LI = v; },
  configurable: true, enumerable: true
});
Object.defineProperty(window.App, 'LI_LOADED', {
  get(){ return LI_LOADED; },
  set(v){ LI_LOADED = v; },
  configurable: true, enumerable: true
});
window.App.loadLICache = loadLICache;
window.App.saveLICache = saveLICache;
window.App.loadLeagueIntel = loadLeagueIntel;
window.App.dynastyValue = dynastyValue;
window.App.getPlayerRank = getPlayerRank;
window.App.isNoValue = isNoValue;
window.App.bestValue = bestValue;
window.App.livScore = livScore;
window.App.livFAABRange = livFAABRange;
window.App.livDraftADP = livDraftADP;

// Bare window globals for inline handlers / cross-module access
window.dynastyValue = dynastyValue;
window.getPlayerRank = getPlayerRank;
window.isNoValue = isNoValue;
window.App.faabBidStr = faabBidStr;

