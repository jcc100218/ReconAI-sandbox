# DHQ Engine Sanity Tests

## Setup

1. Open ReconAI in Chrome, connect to your league, wait for the green "DHQ ✓" indicator
2. Open DevTools console (Cmd+Option+J)
3. Copy/paste the contents of `export-snapshot.js` and press Enter
4. A JSON file downloads — move it to `tests/fixtures/psycho-league-snapshot.json`

## Run Tests

```bash
node tests/dhq-sanity-tests.js
```

## What's Tested

| Section | Tests | What it validates |
|---------|-------|-------------------|
| Scale & Range | 5 | All values 0-10000, reasonable median, no max-out |
| Elite Ordering | 5 | Consensus top players rank correctly |
| Positional Hierarchy | 4 | QB > RB ≈ WR > TE > IDP (in SF) |
| Age Curves | 4 | Young > old at same production, aging cliffs |
| FC Market Correlation | 3 | DHQ within 50% of FC, rank correlation > 0.7 |
| Draft Pick Values | 8 | Monotonic, correct ranges, FC market alignment |
| Scarcity & Settings | 4 | SF QB premium, WR deep, TE scarce, IDP capped |
| Rookie Handling | 3 | Enough rookies, reasonable values |
| Trade Acceptance | 7 | DNA profiles produce correct likelihood ranges |
| Metadata Integrity | 5 | All players have valid pos, age, ageFactor, sitMult |

Total: **48 tests**

## Re-exporting After Engine Changes

After changing `dhq-engine.js`, clear your browser's localStorage (`dhq_leagueintel_v*` keys), reload the app, wait for DHQ to rebuild, then re-export the snapshot.
