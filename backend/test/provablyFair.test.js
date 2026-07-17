'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pf = require('../src/provablyFair');

test('server seed hash is a valid commitment', () => {
  const seed = pf.randomSeed();
  assert.equal(pf.sha256(seed).length, 64);
  assert.equal(pf.verify({ serverSeed: seed, serverSeedHash: pf.sha256(seed), clientSeed: 'c', nonce: 0, game: 'dice' }).hashOk, true);
});

test('outcomes are deterministic for the same inputs', () => {
  const s = 'a'.repeat(64), c = 'client-1';
  assert.equal(pf.diceRoll(s, c, 5), pf.diceRoll(s, c, 5));
  assert.equal(pf.crashPoint(s, c, 5), pf.crashPoint(s, c, 5));
  assert.deepEqual(pf.minesLayout(s, c, 5), pf.minesLayout(s, c, 5));
});

test('changing the nonce changes the outcome', () => {
  const s = 'b'.repeat(64), c = 'client-2';
  assert.notEqual(pf.diceRoll(s, c, 1), pf.diceRoll(s, c, 2));
});

test('a tampered server seed fails hash verification', () => {
  const seed = pf.randomSeed();
  const hash = pf.sha256(seed);
  const res = pf.verify({ serverSeed: pf.randomSeed(), serverSeedHash: hash, clientSeed: 'c', nonce: 0, game: 'dice' });
  assert.equal(res.hashOk, false);
});

test('dice rolls stay within [0, 100] and look uniform', () => {
  const s = pf.randomSeed(), c = 'uniformity';
  const buckets = new Array(10).fill(0);
  const N = 20000;
  for (let n = 0; n < N; n++) {
    const roll = pf.diceRoll(s, c, n);
    assert.ok(roll >= 0 && roll <= 100);
    buckets[Math.min(9, Math.floor(roll / 10))]++;
  }
  // every decile should be within ~15% of the expected count
  const expected = N / 10;
  for (const b of buckets) {
    assert.ok(Math.abs(b - expected) < expected * 0.15, `bucket skew: ${b} vs ${expected}`);
  }
});

test('crash points are always >= 1.00', () => {
  const s = pf.randomSeed(), c = 'crash';
  for (let n = 0; n < 5000; n++) {
    assert.ok(pf.crashPoint(s, c, n) >= 1.0);
  }
});

test('mines layout places the exact number of unique mines', () => {
  const s = pf.randomSeed(), c = 'mines';
  const layout = pf.minesLayout(s, c, 0, 25, 5);
  assert.equal(layout.length, 5);
  assert.equal(new Set(layout).size, 5);
  assert.ok(layout.every((i) => i >= 0 && i < 25));
});

test('verify() recomputes a historical dice bet exactly', () => {
  const serverSeed = pf.randomSeed();
  const clientSeed = 'player-chosen';
  const nonce = 42;
  const original = pf.diceRoll(serverSeed, clientSeed, nonce);
  const { hashOk, outcome } = pf.verify({
    serverSeed, serverSeedHash: pf.sha256(serverSeed), clientSeed, nonce, game: 'dice',
  });
  assert.equal(hashOk, true);
  assert.equal(outcome, original);
});
