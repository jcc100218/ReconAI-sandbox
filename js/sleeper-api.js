// ── Sleeper API layer ───────────────────────────────────────────
// Extracted from index.html.bak — all Sleeper fetch helpers and stat loaders.
// Plan B: functions defined at module level; S, LI, etc. live on window
// (set by app.js before any of these are called).

window.App = window.App || {};

const SLEEPER='https://api.sleeper.app/v1';

const sf=path=>fetch(SLEEPER+path).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});

async function fetchTrending(){
  try{
    const [adds,drops]=await Promise.all([
      fetch('https://api.sleeper.app/v1/players/trending/nfl/add?lookback_hours=24&limit=20').then(r=>r.ok?r.json():[]).catch(()=>[]),
      fetch('https://api.sleeper.app/v1/players/trending/nfl/drop?lookback_hours=24&limit=20').then(r=>r.ok?r.json():[]).catch(()=>[]),
    ]);
    S.trending={adds:adds||[],drops:drops||[],fetchedAt:Date.now()};
    console.log('Trending loaded: '+adds.length+' adds, '+drops.length+' drops');
  }catch(e){S.trending={adds:[],drops:[],fetchedAt:0};}
}

async function loadLeague(leagueId,userId){
  const week=S.currentWeek||1;
  const[rosters,users,tradedPicks,drafts,bracketW,bracketL,matchups,txns]=await Promise.all([
    sf(`/league/${leagueId}/rosters`),
    sf(`/league/${leagueId}/users`),
    sf(`/league/${leagueId}/traded_picks`),
    sf(`/league/${leagueId}/drafts`),
    sf(`/league/${leagueId}/winners_bracket`),
    sf(`/league/${leagueId}/losers_bracket`).catch(()=>[]),
    sf(`/league/${leagueId}/matchups/${week}`).catch(()=>[]),
    sf(`/league/${leagueId}/transactions/${week}`).catch(()=>[]),
  ]);
  S.rosters=rosters||[];S.leagueUsers=users||[];S.tradedPicks=tradedPicks||[];
  S.drafts=drafts||[];S.bracket={w:bracketW||[],l:bracketL||[]};
  S.matchups['w'+week]=matchups||[];
  S.transactions['w'+week]=txns||[];
  const uid=userId||S.user?.user_id;
  S.myRosterId=S.rosters.find(r=>r.owner_id===uid||(r.co_owners||[]).includes(uid))?.roster_id;
  renderRoster();renderWaivers();renderTrades();renderPicks();
}

async function loadOwnership(){
  // /players/nfl/research/regular/{season}/{week} returns ownership% and rostering%
  // keyed by player_id: {owned_by: N, rostered_by: N, started_by: N, ...}
  try{
    const data=await fetch(`https://api.sleeper.com/players/nfl/research/regular/${S.season}/${S.currentWeek}`)
      .then(r=>r.ok?r.json():{}).catch(()=>({}));
    S.ownership=data;
  }catch(e){S.ownership={};}
}

async function loadRosterStats(){
  if(!S.myRosterId)return;
  const my=myR();if(!my||!(my.players||[]).length)return;
  if(!S.playerStats)S.playerStats={};
  if(!S.playerProj)S.playerProj={};

  const sc=S.leagues.find(l=>l.league_id===S.currentLeagueId)?.scoring_settings||{};
  const curSeason=S.season||String(new Date().getFullYear());
  const prevSeason=String(parseInt(curSeason)-1);
  const isOffseason=!S.nflState?.season_has_scores||S.currentWeek<=1;

  // All players across all rosters — needed for league-wide elite ranks
  const allLeaguePlayers=[...new Set(S.rosters.flatMap(r=>r.players||[]))];

  try{
    // ── TWO API CALLS replace 36 ────────────────────────────────────────────
    // Sleeper aggregate endpoint: full season totals per player, one call each
    const [curAgg, prevAgg] = await Promise.all([
      isOffseason ? Promise.resolve({}) :
        sf(`/stats/nfl/regular/${curSeason}`).catch(()=>({})),
      sf(`/stats/nfl/regular/${prevSeason}`).catch(()=>({})),
    ]);

    // If prev season is empty, try one more year back (e.g. 2025 may not be finalized yet, fallback to 2024)
    let effectivePrev=prevAgg;
    let effectivePrevSeason=prevSeason;
    if(!Object.keys(prevAgg).length){
      const fallbackSeason=String(parseInt(prevSeason)-1);
      console.log('Previous season stats empty for '+prevSeason+', trying '+fallbackSeason);
      effectivePrev=await sf(`/stats/nfl/regular/${fallbackSeason}`).catch(()=>({}));
      effectivePrevSeason=fallbackSeason;
    }

    // Process ALL players from the aggregate response (not just rostered)
    // This ensures free agent IDP players also get stats for waiver recommendations
    const allStatPids=new Set([...allLeaguePlayers,...Object.keys(effectivePrev),...Object.keys(curAgg||{})]);
    allStatPids.forEach(pid=>{
      if(!S.players[pid])return;
      const pos=S.players[pid]?.position;
      if(!pos||['K','DEF','P'].includes(pos))return;
      if(!S.playerStats[pid])S.playerStats[pid]={};

      // Previous season — always available
      const prev=effectivePrev[pid];
      if(prev){
        const pts=calcFantasyPts(prev,sc);
        const gp=prev.gp||prev.games_played||17;
        S.playerStats[pid].prevTotal=+pts.toFixed(1);
        S.playerStats[pid].prevAvg=gp>0?+(pts/gp).toFixed(1):+(pts/17).toFixed(1);
        S.playerStats[pid].prevSeason=effectivePrevSeason;
        S.playerStats[pid].prevRawStats=prev;
      }

      // Current season (if in-season)
      const cur=curAgg[pid];
      if(cur){
        const pts=calcFantasyPts(cur,sc);
        const gp=cur.gp||cur.games_played||17;
        S.playerStats[pid].seasonTotal=+pts.toFixed(1);
        S.playerStats[pid].seasonAvg=+(pts/gp).toFixed(1);
        S.playerStats[pid].curRawStats=cur;
      }

      // In offseason: promote prev season avg as primary
      if(isOffseason&&S.playerStats[pid].prevAvg){
        S.playerStats[pid].seasonAvg=S.playerStats[pid].prevAvg;
      }
    });

    // Update column header with prev season year
    const thPrev=$('th-prev');const thPrevTot=$('th-prevtot');
    if(thPrev)thPrev.textContent=`'${effectivePrevSeason.slice(2)}avg`;
    if(thPrevTot)thPrevTot.textContent=`'${effectivePrevSeason.slice(2)}tot`;

    // Positional ranks — all rostered players sorted by pts
    const posPts={};
    allLeaguePlayers.forEach(pid=>{
      const pos=pPos(pid);if(!pos)return;
      const pts=S.playerStats[pid]?.seasonTotal||0;
      if(!posPts[pos])posPts[pos]=[];
      posPts[pos].push({pid,pts});
    });
    Object.entries(posPts).forEach(([pos,arr])=>{
      arr.sort((a,b)=>b.pts-a.pts).forEach(({pid},i)=>{S.posRanks[pid]=i+1;});
    });

    buildRosterTable();
    renderDraftNeeds();
    updateSyncStatus();
  }catch(e){console.warn('Stats load error:',e);updateSyncStatus();}
}


function calcFantasyPts(stats,sc){
  if(!stats)return 0;
  let pts=0;
  const add=(stat,mult)=>{pts+=(stats[stat]||0)*(mult||0);};
  // Offense
  add('pass_yd',sc.pass_yd??0);add('pass_td',sc.pass_td??4);add('pass_int',sc.pass_int??-1);
  add('pass_2pt',sc.pass_2pt??0);add('pass_sack',sc.pass_sack??0);
  add('rush_yd',sc.rush_yd??0.1);add('rush_td',sc.rush_td??6);add('rush_2pt',sc.rush_2pt??0);add('rush_fd',sc.rush_fd??0);
  add('rec',sc.rec??0.5);add('rec_yd',sc.rec_yd??0.1);add('rec_td',sc.rec_td??6);add('rec_2pt',sc.rec_2pt??0);add('rec_fd',sc.rec_fd??0);
  add('fum_lost',sc.fum_lost??-0.5);add('fum_rec_td',sc.fum_rec_td??0);
  // Kicking
  add('xpm',sc.xpm??0);add('xpmiss',sc.xpmiss??0);add('fgm_yds',sc.fgm_yds??0);
  add('fgmiss',sc.fgmiss??0);add('fgmiss_0_19',sc.fgmiss_0_19??0);add('fgmiss_20_29',sc.fgmiss_20_29??0);
  // IDP — try both prefixed and non-prefixed field names (Sleeper uses both)
  const idpFields=[['idp_tkl_solo','tkl_solo'],['idp_tkl_ast','tkl_ast'],['idp_tkl_loss','tkl_loss'],
    ['idp_sack','sack'],['idp_qb_hit','qb_hit'],['idp_int','int'],['idp_ff','ff'],
    ['idp_fum_rec'],['idp_pass_def','pass_def'],['idp_pass_def_3p'],
    ['idp_def_td','def_td'],['idp_blk_kick'],['idp_safe'],['idp_sack_yd'],['idp_int_ret_yd'],['idp_fum_ret_yd']];
  idpFields.forEach(names=>{
    const scKey=names[0]; // scoring setting key is always idp_ prefixed
    const mult=sc[scKey]??0;
    if(!mult)return;
    // Try each field name variant, use first non-zero
    let val=0;
    for(const n of names){if(stats[n]){val=stats[n];break;}}
    pts+=val*mult;
  });
  // Special teams
  add('st_td',sc.st_td??0);add('st_ff',sc.st_ff??0);add('st_fum_rec',sc.st_fum_rec??0);
  add('st_tkl_solo',sc.st_tkl_solo??0);add('kr_yd',sc.kr_yd??0);add('pr_yd',sc.pr_yd??0);
  return Math.round(pts*10)/10;
}

// ── Expose on window.App ────────────────────────────────────────
Object.assign(window.App, {
  SLEEPER,
  sf,
  fetchTrending,
  loadLeague,
  loadOwnership,
  loadRosterStats,
  calcFantasyPts,
});
