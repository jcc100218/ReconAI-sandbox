#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// DHQ Engine Sanity Tests
// Run: node tests/dhq-sanity.js
// These protect the core IP from regressions. Run before every push.
// ═══════════════════════════════════════════════════════════════

const snap = require('./snapshot.js');

let passed = 0;
let failed = 0;
let warnings = 0;

function assert(condition, name, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}`);
    if (detail) console.log(`     → ${detail}`);
    failed++;
  }
}

function warn(condition, name, detail) {
  if (!condition) {
    console.log(`  ⚠️  WARN: ${name}`);
    if (detail) console.log(`     → ${detail}`);
    warnings++;
  }
}

// ─── TEST 1: Elite Player Rankings ────────────────────────────
console.log('\n🏈 TEST 1: Elite Player Rankings');
const p = snap.players;

assert(p['Josh Allen'].dhq > 8000,
  'Josh Allen should be elite (DHQ > 8000)',
  `Got ${p['Josh Allen'].dhq}`);

assert(p['Patrick Mahomes'].dhq > 5000,
  'Mahomes should be star-tier (DHQ > 5000)',
  `Got ${p['Patrick Mahomes'].dhq}`);

assert(p['Bijan Robinson'].dhq > 6000,
  'Bijan Robinson should be elite RB (DHQ > 6000)',
  `Got ${p['Bijan Robinson'].dhq}`);

assert(p['Puka Nacua'].dhq > 5000,
  'Puka Nacua should be star WR (DHQ > 5000)',
  `Got ${p['Puka Nacua'].dhq}`);

// ─── TEST 2: QB Superflex Premium ─────────────────────────────
console.log('\n🏈 TEST 2: QB Superflex Premium');

assert(p['Josh Allen'].dhq > p['Bijan Robinson'].dhq,
  'In SF, QB1 (Allen) should be worth more than RB1 (Bijan)',
  `Allen=${p['Josh Allen'].dhq} vs Bijan=${p['Bijan Robinson'].dhq}`);

assert(p['Patrick Mahomes'].dhq > p['CeeDee Lamb'].dhq,
  'Mahomes should be worth more than CeeDee Lamb',
  `Mahomes=${p['Patrick Mahomes'].dhq} vs Lamb=${p['CeeDee Lamb'].dhq}`);
