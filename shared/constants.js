// ══════════════════════════════════════════════════════════════════
// shared/constants.js — Fantasy Wars shared constants
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

window.App.posMap={QB:'QB',RB:'RB',WR:'WR',TE:'TE',FLEX:'FLEX',SUPER_FLEX:'SF',K:'K',DEF:'DEF',BN:'BN',IDP_FLEX:'IDP',DL:'DL',LB:'LB',DB:'DB',REC_FLEX:'FLEX',WR_RB_FLEX:'FLEX',WR_TE:'FLEX'};

window.App.posClass=s=>{const p=window.App.posMap[s]||s||'FLEX';return{QB:'pQB',RB:'pRB',WR:'pWR',TE:'pTE',K:'pK',DEF:'pDEF',FLEX:'pFLEX',SF:'pSF',BN:'pBN',DL:'pDL',LB:'pLB',DB:'pDB',IDP:'pIDP'}[p]||'pFLEX'};

// Expose as bare globals for modules that reference them without namespace
window.posMap = window.App.posMap;
window.posClass = window.App.posClass;

window.App.NFL_TEAMS={
  ARI:'Arizona Cardinals',ATL:'Atlanta Falcons',BAL:'Baltimore Ravens',BUF:'Buffalo Bills',
  CAR:'Carolina Panthers',CHI:'Chicago Bears',CIN:'Cincinnati Bengals',CLE:'Cleveland Browns',
  DAL:'Dallas Cowboys',DEN:'Denver Broncos',DET:'Detroit Lions',GB:'Green Bay Packers',
  HOU:'Houston Texans',IND:'Indianapolis Colts',JAX:'Jacksonville Jaguars',KC:'Kansas City Chiefs',
  LAC:'Los Angeles Chargers',LAR:'Los Angeles Rams',LV:'Las Vegas Raiders',MIA:'Miami Dolphins',
  MIN:'Minnesota Vikings',NE:'New England Patriots',NO:'New Orleans Saints',NYG:'New York Giants',
  NYJ:'New York Jets',PHI:'Philadelphia Eagles',PIT:'Pittsburgh Steelers',SEA:'Seattle Seahawks',
  SF:'San Francisco 49ers',TB:'Tampa Bay Buccaneers',TEN:'Tennessee Titans',WAS:'Washington Commanders',
  FA:'Free Agent'
};

window.App.fullTeam=abbr=>window.App.NFL_TEAMS[abbr]||abbr||'FA';
window.NFL_TEAMS = window.App.NFL_TEAMS;
window.fullTeam = window.App.fullTeam;

// AI-sourced peak age curves — loaded async, with research-backed defaults
window.App.PEAK_CURVES={
  QB:{lo:27,hi:32,src:'default'},RB:{lo:22,hi:26,src:'default'},
  WR:{lo:24,hi:29,src:'default'},TE:{lo:25,hi:30,src:'default'},
  EDGE:{lo:24,hi:29,src:'default'},DT:{lo:24,hi:29,src:'default'},
  LB:{lo:23,hi:28,src:'default'},CB:{lo:24,hi:29,src:'default'},
  S:{lo:25,hi:30,src:'default'},K:{lo:26,hi:36,src:'default'},
};

// ── Age curves: position-specific peak windows (DHQ engine) ──
window.App.peakWindows={QB:[24,34],RB:[22,27],WR:[22,30],TE:[23,30],DL:[23,29],LB:[23,28],DB:[23,29]};

// ── Position-specific decay rates (per year past peak end) ──
window.App.decayRates={QB:0.06,RB:0.25,WR:0.14,TE:0.12,DL:0.15,LB:0.15,DB:0.14};

// ── Draft pick values ──────────────────────────────────────────
// Standard dynasty pick values (approximate DLF/KTC scale)
window.App.BASE_PICK_VALUES={
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

// ── Player Value — DHQ Primary ───────────────────────────────
window.App.tradeValueTier=function(val){
  if(val>=7000)return{tier:'Elite',col:'var(--green)'};
  if(val>=4000)return{tier:'Starter',col:'var(--accent)'};
  if(val>=2000)return{tier:'Depth',col:'var(--text2)'};
  if(val>0)return{tier:'Stash',col:'var(--text3)'};
  return{tier:'—',col:'var(--text3)'};
};
window.tradeValueTier = window.App.tradeValueTier;
