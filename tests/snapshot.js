// DHQ Engine Snapshot — The Psycho League: Year VI
// Captured: March 30, 2026
// Used for sanity testing — if values drift significantly, something broke
module.exports = {
  league: {
    id: '1312100327931019264',
    season: '2026',
    teamCount: 16,
    isSF: true,
    format: 'Half-PPR, Superflex, IDP'
  },
  totalScored: 1969,

  // Key player DHQ values — if these shift more than 15%, investigate
  players: {
    'Josh Allen':      { dhq: 8958, pos: 'QB', age: 29, ageFactor: 1.000 },
    'Drake Maye':      { dhq: 7521, pos: 'QB', age: 23, ageFactor: 0.967 },
    'Bijan Robinson':  { dhq: 7250, pos: 'RB', age: 24, ageFactor: 1.000 },
    'Patrick Mahomes': { dhq: 6251, pos: 'QB', age: 30, ageFactor: 1.000 },
    'Ja\'Marr Chase':  { dhq: 6667, pos: 'WR', age: 26, ageFactor: 1.000 },
    'Puka Nacua':      { dhq: 6887, pos: 'WR', age: 24, ageFactor: 1.000 },
    'CeeDee Lamb':     { dhq: 4673, pos: 'WR', age: 26, ageFactor: 1.000 },
    'Breece Hall':     { dhq: 4333, pos: 'RB', age: 24, ageFactor: 1.000 },
    'Garrett Wilson':  { dhq: 3447, pos: 'WR', age: 25, ageFactor: 1.000 },
    'Daniel Jones':    { dhq: 3732, pos: 'QB', age: 28, ageFactor: 1.000 },
    'Davante Adams':   { dhq: 2529, pos: 'WR', age: 33, ageFactor: 0.580 },
    'Travis Kelce':    { dhq: 1499, pos: 'TE', age: 36, ageFactor: 0.196 },
    'Derrick Henry':   { dhq: 1308, pos: 'RB', age: 32, ageFactor: 0.021 },
    'Aaron Rodgers':   { dhq: 885,  pos: 'QB', age: 42, ageFactor: 0.182 },
  },

  // Key pick slot DHQ values
  picks: {
    1:  { value: 7848, round: 1, pick: 1  },  // 1.01
    4:  { value: 5192, round: 1, pick: 4  },  // 1.04
    8:  { value: 3510, round: 1, pick: 8  },  // 1.08
    12: { value: 2803, round: 1, pick: 12 },  // 1.12
    16: { value: 2505, round: 1, pick: 16 },  // 1.16
    17: { value: 1980, round: 2, pick: 1  },  // 2.01
    24: { value: 1494, round: 2, pick: 8  },  // 2.08
    32: { value: 1297, round: 2, pick: 16 },  // 2.16
    33: { value: 1146, round: 3, pick: 1  },  // 3.01
    48: { value: 911,  round: 3, pick: 16 },  // 3.16
  }
};
