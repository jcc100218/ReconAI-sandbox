// ══════════════════════════════════════════════════════════════════
// shared/dhq-ai.js — The DHQ AI Brain
// One file, one brain, all apps. Every AI interaction flows through here.
//
// Usage:  const reply = await dhqAI('home-chat', userMessage, context);
//         const reply = await dhqAI('waiver-agent', null, context);
//         const reply = await dhqAI('trade-chat', userMessage, context);
// ══════════════════════════════════════════════════════════════════

window.App = window.App || {};

// ── Master System Prompt ────────────────────────────────────────
// This is the AI's core identity — shared across all features.
const DHQ_IDENTITY = `You are the DHQ AI — the dynasty fantasy football intelligence engine powering Fantasy Wars (ReconAI + War Room).

CORE KNOWLEDGE:
- DHQ values: 0-10,000 scale, derived from 5 years of league-specific scoring data blended with FantasyCalc market consensus (75% engine / 25% market)
- Value tiers: 7000+ = Elite, 4000+ = Starter, 2000+ = Depth, <2000 = Stash
- Pick values: 1st round ≈ 5500-8500, 2nd ≈ 2500-4000, 3rd ≈ 1200-2000, 4th+ ≈ 400-800
- Always say "DHQ value" — never "FC", "KTC", or "FantasyCalc"
- IDP scoring matters: sacks, INTs, pass deflections are premium stats. Edge rushers and ball-hawk DBs are the IDP cornerstones.

PEAK AGE WINDOWS:
- QB: 24-34 (longest window, most valuable in SF)
- RB: 22-27 (shortest window, sell before 27)
- WR: 22-30 (second longest, prime assets)
- TE: 23-30 (late bloomers, patience pays)
- DL: 23-29 (sack production peaks early)
- LB: 23-28 (tackle machines, shorter peak)
- DB: 23-29 (INTs are volatile, PDs more stable)

DYNASTY PRINCIPLES:
- Youth + production = dynasty gold. Under-25 starters are the most valuable assets.
- Age 30+ players in dynasty are depreciating assets — sell before the cliff.
- RBs decline fastest. QBs hold longest. Plan accordingly.
- In Superflex, starting QBs are 2-3x more valuable than 1QB leagues.
- IDP leagues: DL/LB/DB depth matters. Late-round IDP picks hit more often than offensive ones.
- Roster construction > individual talent. A team with 2 elite + 8 starters beats 1 elite + 5 starters + 4 scrubs.

COMMUNICATION STYLE:
- Be direct and specific. Name real players, real DHQ values, real owners.
- Show your math when proposing trades.
- Keep responses concise (3-5 sentences for chat, longer for reports).
- Use Sleeper-ready language when drafting messages.
- Tailor advice to the user's mentality (win-now vs rebuild vs balanced).`;

// ── Feature-Specific Prompts ────────────────────────────────────
// Each feature gets the master identity PLUS feature-specific instructions.

const DHQ_PROMPTS = {

  // ── HOME CHAT ──────────────────────────────────────────────────
  'home-chat': {
    system: DHQ_IDENTITY,
    instructions: `You are answering general dynasty questions about the user's team.
Be helpful, specific, and reference their actual roster data.
If they ask about a specific player, include that player's DHQ value and peak window.
If they ask "what should I do?" — give 2-3 specific, actionable moves with reasoning.`,
    maxTokens: 500,
  },

  // ── TRADE CHAT ─────────────────────────────────────────────────
  'trade-chat': {
    system: DHQ_IDENTITY,
    instructions: `You are a dynasty trade advisor with access to REAL league data.
RULES:
1. Name SPECIFIC owners from the league — use their actual names
2. MATH MUST WORK: both sides of a trade must be within 15% of equal DHQ value
3. Show the math: "Your side: Player A (DHQ 3500) + 2026 R2 (~DHQ 2000) = ~5500. Their side: Player B (DHQ 5200) = fair"
4. Only propose trades where BOTH sides benefit — explain what THEY gain
5. Draft a short Sleeper DM message the user can copy-paste
6. Adjust for team mentality: win-now = get better players, rebuilding = get picks/youth
7. Consider owner DNA/trade tendencies when available`,
    maxTokens: 600,
  },

  // ── WAIVER CHAT ────────────────────────────────────────────────
  'waiver-chat': {
    system: DHQ_IDENTITY,
    instructions: `You are a dynasty waiver wire advisor.
Answer based ONLY on the actual available players listed in the context.
IDP NOTE: Use the league's actual IDP scoring settings (sack/INT/PD values provided).
DBs with INT/PD potential are premium. Edge rushers with sack upside too.
Be specific — name actual players from the available list. 3-5 sentences max.`,
    maxTokens: 400,
  },

  // ── WAIVER AGENT (JSON output) ─────────────────────────────────
  'waiver-agent': {
    system: DHQ_IDENTITY + `\n\nYou MUST respond with ONLY a JSON object. No markdown, no backticks, no explanation text.`,
    instructions: `CRITICAL RULES:
1. ONLY recommend players from the AVAILABLE list. Do NOT invent players.
2. Rookies (0 years experience) can ONLY be added through the rookie draft, NOT waivers.
3. Only recommend VETERAN free agents who have played at least 1 NFL season.
4. Respond with ONLY a JSON object.

Output format:
{"recommendations":[{"name":"player","position":"POS","team":"TM","rank":1,"age":0,"dynastyValue":0,"reason":"why","faab_low":0,"faab_high":0,"copyText":"Sleeper msg"}]}`,
    maxTokens: 600,
  },

  // ── DRAFT CHAT ─────────────────────────────────────────────────
  'draft-chat': {
    system: DHQ_IDENTITY,
    instructions: `You are a rookie draft advisor for dynasty fantasy football.
RULES:
- Never recommend K or IDP in rounds 1-2. Offense-first in early rounds.
- IDP is mid-late round value only.
- In SF leagues, QBs are 2-3x more valuable — adjust board accordingly.
- Draft for ceiling in rebuild, floor if contending.
- Consider league tendencies — if the league overdrafts a position, target falling value elsewhere.
- NOTE: Sleeper's rookie data improves as the NFL draft approaches. Pre-draft rankings are speculative.`,
    maxTokens: 500,
  },

  // ── DRAFT SCOUTING (detailed report) ───────────────────────────
  'draft-scout': {
    system: DHQ_IDENTITY,
    instructions: `Generate a comprehensive rookie draft scouting report.
Include:
1. TOP 3 POSITIONS TO TARGET — ranked by roster need + historical hit rates
2. DRAFT BOARD — 6 specific rookies with name, pos, NFL team, target round, roster fit
3. PICK STRATEGY — trade up/down recommendations based on pick slot value
4. AVOID — positions or rounds with poor historical returns in this league
Search the web for current rookie rankings. Be specific with prospect names.`,
    maxTokens: 1200,
    useWebSearch: true,
  },

  // ── TRADE SCOUT (opponent analysis) ────────────────────────────
  'trade-scout': {
    system: DHQ_IDENTITY,
    instructions: `Generate a comprehensive trade scouting report on the target opponent.
Include:
1. TEAM TIER — contender/rebuilding/stuck? Their championship window?
2. DESPERATE NEEDS — specific positions, graded by urgency
3. TRADE TENDENCIES — do they sell picks or buy them? Stars or depth?
4. PLAYERS TO TARGET — top 3 specific players to acquire, with why each is gettable and what to offer
5. APPROACH STRATEGY — what to lead with, how to frame the offer
6. SLEEPER DM — ready-to-paste message opening the trade conversation
Be direct and specific. Name real players and real offers. Note IDP gaps if applicable.`,
    maxTokens: 900,
  },

  // ── PICK ANALYSIS ──────────────────────────────────────────────
  'pick-analysis': {
    system: DHQ_IDENTITY,
    instructions: `Analyze the user's draft pick portfolio.
Include:
1. SELL NOW — picks to trade while value is high
2. HOLD — picks worth keeping given the user's mentality
3. BUY — picks to acquire from other teams (and who might sell)
4. OVERALL ASSESSMENT — pick-rich or pick-poor vs league? Impact on dynasty timeline?
Be specific with round and year for each recommendation.`,
    maxTokens: 600,
  },

  // ── PLAYER SCOUT REPORT ────────────────────────────────────────
  'player-scout': {
    system: DHQ_IDENTITY,
    instructions: `SEARCH FOR CURRENT INFO FIRST: Look up the player's current situation, depth chart, and dynasty outlook.
Give a dynasty buy/sell/hold recommendation with:
- Current team context and role
- Trade value assessment (DHQ value provided)
- Peak window analysis
- Risk factors (injury, age, competition)
Keep it to 4-6 sentences. Be definitive — give a clear recommendation.`,
    maxTokens: 500,
    useWebSearch: true,
  },

  // ── POWER RANKINGS X POST ──────────────────────────────────────
  'power-posts': {
    system: 'You are @ReconAI_FW, a bold and entertaining dynasty fantasy football analyst on X (Twitter).',
    instructions: `Write one X post (max 280 chars) per team in the power rankings.
Be opinionated, funny, and use fantasy football culture. Reference records and roster situations.
Output as JSON: {"posts":[{"team":"name","rank":N,"post":"text"}]}`,
    maxTokens: 800,
  },

  // ── MEMORY SUMMARIZER ──────────────────────────────────────────
  'memory-summary': {
    system: 'Summarize dynasty fantasy football conversations.',
    instructions: `Summarize this conversation in ONE sentence, max 15 words.
Be specific about players and decisions discussed.`,
    maxTokens: 80,
  },

  // ── STRATEGY WALKTHROUGH ───────────────────────────────────────
  'strategy-analysis': {
    system: DHQ_IDENTITY,
    instructions: `The user just set their team strategy. Give a brief (3-4 sentences) personalized assessment of their roster given their strategy. Be specific about players. End with one actionable recommendation.`,
    maxTokens: 400,
  },

  // ── NEWS (Grok-specific) ───────────────────────────────────────
  'player-news': {
    system: `You are a dynasty fantasy football news reporter. IMPORTANT: ONLY report news about the SPECIFIC player asked about. Do NOT mention any other players. Give 2-3 sentences of the latest news from X/Twitter about this one player. Focus on: trades, injuries, depth chart changes, contract news. If you have no recent news about this specific player, say "No recent news found."`,
    instructions: '',
    maxTokens: 300,
  },
};

// ── Context Builders ────────────────────────────────────────────
// These build the data context that gets injected into prompts.

function dhqBuildRosterContext(compact) {
  const S = window.S || window.App?.S;
  if (!S?.user) return compact ? '' : 'No account connected.';
  const myR = window.myR || window.App?.myR;
  const my = typeof myR === 'function' ? myR() : null;
  if (!my) return '';
  const pName = window.pName || window.App?.pName || (id => id);
  const pPos = window.pPos || window.App?.pPos || (() => '');
  const pAge = window.pAge || window.App?.pAge || (() => '');
  const dynastyValue = window.dynastyValue || window.App?.dynastyValue || (() => 0);
  const s = my.settings || {};
  const league = S.leagues?.find(l => l.league_id === S.currentLeagueId);
  const sorted = [...(S.rosters || [])].sort((a, b) => (b.settings?.wins || 0) - (a.settings?.wins || 0));
  const rank = sorted.findIndex(r => r.roster_id === S.myRosterId) + 1;
  const totalVal = (my.players || []).reduce((sum, p) => sum + dynastyValue(p), 0);

  if (compact) {
    const topStarters = (my.starters || []).filter(p => p && p !== '0')
      .map(pid => ({ pid, val: dynastyValue(pid) })).sort((a, b) => b.val - a.val).slice(0, 5)
      .map(x => pName(x.pid) + '(' + pPos(x.pid) + ',' + dynastyValue(x.pid) + ')').join('; ');
    return [
      S.user.display_name + '|#' + rank + '/' + S.rosters.length + '|' + (s.wins || 0) + '-' + (s.losses || 0) + '|DHQ:' + totalVal.toLocaleString(),
      'TOP5:' + topStarters,
      'DHQ scale 0-10000. 7000+=elite 4000+=starter. ALWAYS refer to values as "DHQ" not "FC" or "FantasyCalc".'
    ].filter(Boolean).join('\n');
  }

  // Full context
  const pStr = pid => {
    const val = dynastyValue(pid); const age = pAge(pid);
    return pName(pid) + '(' + pPos(pid) + (age ? ',' + age : '') + (val > 0 ? ',DHQ' + val : '') + ')';
  };
  const starters = (my.starters || []).filter(p => p && p !== '0').map(pStr);
  const benchPids = (my.players || []).filter(p => !(my.starters || []).includes(p) && !(my.reserve || []).includes(p) && !(my.taxi || []).includes(p));
  const bench = benchPids.map(p => ({ pid: p, val: dynastyValue(p) })).filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 8).map(x => pStr(x.pid));

  return `${S.user.display_name} | #${rank}/${S.rosters.length} | ${s.wins || 0}-${s.losses || 0} | DHQ: ${totalVal.toLocaleString()}
STARTERS: ${starters.join(', ')}
TOP BENCH: ${bench.join(', ')}
League: ${league?.name || '?'} | ${S.rosters.length} teams | ${league?.roster_positions?.includes('SUPER_FLEX') ? 'Superflex' : '1QB'}`;
}

function dhqBuildMentalityContext() {
  const loadMentality = window.loadMentality || window.App?.loadMentality;
  const loadStrategy = window.loadStrategy || window.App?.loadStrategy;
  if (typeof loadMentality !== 'function') return '';
  const m = loadMentality();
  const labels = {
    mentality: { winnow: 'WIN NOW', rebuild: 'REBUILD', balanced: 'BALANCED', prime: '2-3YR WINDOW' },
    window: { now: 'competing now', '1yr': '1yr out', '2yr': '2-3yr out', far: 'full rebuild' },
    tradeStyle: { aggressive: 'aggressive', selective: 'selective', conservative: 'conservative', pick_seller: 'sells picks', pick_hoarder: 'hoards picks' },
    age: { youth: 'youth<25', balanced_age: 'age neutral', vets: 'vet friendly', agnostic: 'age agnostic' },
    risk: { high_risk: 'high risk', moderate_risk: 'moderate risk', low_risk: 'low risk', no_risk: 'zero risk' },
  };
  const parts = [
    labels.mentality[m.mentality] || m.mentality || 'balanced',
    labels.window[m.window] || '',
    labels.tradeStyle[m.tradeStyle] || '',
    labels.age[m.agePreference] || '',
    labels.risk[m.riskTolerance] || '',
  ].filter(Boolean);
  const lines = ['GM:' + parts.join(',')];
  if (m.upgradePositions) lines.push('UPGRADING:' + m.upgradePositions);
  if (m.targetPlayers) lines.push('TARGETS:' + m.targetPlayers);
  if (m.shoppingPlayers) lines.push('SELLING:' + m.shoppingPlayers);
  if (m.tradePrefs) lines.push('TRADE STYLE:' + m.tradePrefs.substring(0, 150));
  if (m.neverDrop) lines.push('UNTOUCHABLE:' + m.neverDrop);
  if (m.notes) lines.push('NOTES:' + m.notes.substring(0, 150));
  if (typeof loadStrategy === 'function') {
    const strat = loadStrategy();
    if (strat) lines.push('STRATEGY:' + strat.mode + ',trades:' + strat.tradeStyle + ',IDP:' + strat.idpApproach + ',draft:' + strat.draftApproach + ',vets:' + strat.veteranApproach);
  }
  return lines.join('\n');
}

function dhqBuildLeagueContext() {
  const S = window.S || window.App?.S;
  const LI = window.App?.LI || {};
  if (!S?.rosters?.length) return '';
  const lines = [];
  if (LI.leagueTradeTendencies?.totalTrades > 0) {
    const lt = LI.leagueTradeTendencies;
    lines.push(`LEAGUE: ${lt.totalTrades} trades in history, ${lt.pickHeavy} involved picks`);
  }
  return lines.join('\n');
}

function dhqBuildOwnerProfiles() {
  const S = window.S || window.App?.S;
  const LI = window.App?.LI || {};
  if (!S?.rosters?.length || !LI.ownerProfiles) return '';
  const pM = window.pM || (p => p);
  const pPos = window.pPos || (() => '');
  const pNameShort = window.pNameShort || (id => id);
  const dynastyValue = window.dynastyValue || (() => 0);
  const league = S.leagues?.find(l => l.league_id === S.currentLeagueId);
  const rp = league?.roster_positions || [];
  const allTotals = S.rosters.map(r => (r.players || []).reduce((sum, pid) => sum + dynastyValue(pid), 0));
  const avgTotal = allTotals.length ? allTotals.reduce((a, b) => a + b, 0) / allTotals.length : 80000;

  return S.rosters.filter(r => r.roster_id !== S.myRosterId).map(r => {
    const name = S.leagueUsers.find(u => u.user_id === r.owner_id)?.display_name || 'Team';
    const s = r.settings || {};
    const record = (s.wins || 0) + '-' + (s.losses || 0);
    const totalVal = (r.players || []).reduce((sum, pid) => sum + dynastyValue(pid), 0);
    const posCounts = {};
    (r.players || []).forEach(pid => { const pos = pM(pPos(pid)); if (pos) posCounts[pos] = (posCounts[pos] || 0) + 1; });
    const weakPositions = ['QB', 'RB', 'WR', 'TE'].filter(pos => {
      const need = rp.filter(s2 => s2 === pos || (s2 === 'FLEX' && ['RB', 'WR', 'TE'].includes(pos)) || (s2 === 'SUPER_FLEX' && pos === 'QB')).length;
      return (posCounts[pos] || 0) <= need;
    });
    const topPlayers = (r.players || []).map(pid => ({ pid, val: dynastyValue(pid) })).sort((a, b) => b.val - a.val).slice(0, 2)
      .map(x => pNameShort(x.pid) + '(' + pPos(x.pid) + ',DHQ' + x.val + ')').join(', ');
    const dna = LI.ownerProfiles?.[r.roster_id];
    const dnaStr = dna?.trades > 0 ? ' · ' + dna.dna : '';
    const contending = totalVal > avgTotal * 1.1 ? 'contender' : totalVal < avgTotal * 0.85 ? 'rebuilder' : 'mid-tier';
    return `${name}: ${record}, ${contending}, DHQ${Math.round(totalVal / 1000)}k, needs ${weakPositions.join('/') || 'nothing'}, stars: ${topPlayers}${dnaStr}`;
  }).slice(0, 12).join('\n');
}

// ── Main Entry Point ────────────────────────────────────────────
// type:    one of the keys in DHQ_PROMPTS
// message: the user's message (optional for agent-type prompts)
// context: additional context string to inject (optional)
// options: { messages: [] } for multi-turn conversations

async function dhqAI(type, message, context, options) {
  const config = DHQ_PROMPTS[type];
  if (!config) throw new Error(`Unknown DHQ AI type: ${type}`);

  const system = config.system;
  const maxTokens = config.maxTokens || 500;
  const useWebSearch = config.useWebSearch || false;

  // Build the full prompt
  let fullContext = '';
  if (config.instructions) fullContext += config.instructions + '\n\n';
  if (context) fullContext += context + '\n\n';

  // Construct messages array
  let messages;
  if (options?.messages) {
    // Multi-turn: inject context into the last user message
    messages = options.messages.map((m, i) => {
      if (m.role === 'user' && i === options.messages.length - 1) {
        return { role: 'user', content: fullContext + m.content };
      }
      if (m.role === 'assistant' && m.content.length > 400) {
        return { role: 'assistant', content: m.content.substring(0, 400) + '...' };
      }
      return m;
    });
  } else {
    messages = [{ role: 'user', content: fullContext + (message || '') }];
  }

  // Route through callClaude (which handles server-side vs client-side)
  const callClaude = window.callClaude || window.App?.callClaude;
  if (typeof callClaude !== 'function') throw new Error('No AI engine available');

  // Temporarily override the system prompt in callClaude
  // callClaude uses its own system prompt, but we want ours
  // We prepend system to the first user message instead
  const systemPrefixed = messages.map((m, i) => {
    if (i === 0 && m.role === 'user') {
      return { role: 'user', content: '[System: ' + system + ']\n\n' + m.content };
    }
    return m;
  });

  return callClaude(systemPrefixed, useWebSearch, 2, maxTokens);
}

// ── Convenience Functions ───────────────────────────────────────

// Quick context builder — assembles standard context for most features
function dhqContext(includeOwners) {
  const parts = [
    dhqBuildRosterContext(false),
    dhqBuildMentalityContext(),
    dhqBuildLeagueContext(),
  ];
  if (includeOwners) parts.push('LEAGUE OWNERS:\n' + dhqBuildOwnerProfiles());
  return parts.filter(Boolean).join('\n');
}

function dhqCompactContext() {
  return [
    dhqBuildRosterContext(true),
    dhqBuildMentalityContext(),
  ].filter(Boolean).join('\n');
}

// ── Exports ─────────────────────────────────────────────────────
Object.assign(window.App, {
  DHQ_IDENTITY,
  DHQ_PROMPTS,
  dhqAI,
  dhqContext,
  dhqCompactContext,
  dhqBuildRosterContext,
  dhqBuildMentalityContext,
  dhqBuildLeagueContext,
  dhqBuildOwnerProfiles,
});

Object.assign(window, {
  dhqAI,
  dhqContext,
  dhqCompactContext,
  dhqBuildRosterContext,
  dhqBuildMentalityContext,
  dhqBuildLeagueContext,
  dhqBuildOwnerProfiles,
});
