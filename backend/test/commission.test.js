'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCommissions, buildUplineChain, rollupLedger } = require('../src/affiliate/commission');

test('commissions split GGR across configured tiers', () => {
  const chain = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
  const { ggr, payouts } = computeCommissions({ stake: 100, payout: 0 }, chain, [0.08, 0.03, 0.01]);
  assert.equal(ggr, 100);
  assert.deepEqual(payouts.map((p) => p.amount), [8, 3, 1]);
  assert.deepEqual(payouts.map((p) => p.tier), [1, 2, 3]);
});

test('no commission is paid when the player wins (GGR <= 0)', () => {
  const chain = [{ id: 'a1' }];
  const { ggr, payouts } = computeCommissions({ stake: 100, payout: 250 }, chain, [0.08]);
  assert.equal(ggr, -150);
  assert.equal(payouts.length, 0);
});

test('upline chain walks referrer pointers and stops at max tiers', () => {
  const users = new Map([
    ['p', { id: 'p', referrerId: 'a' }],
    ['a', { id: 'a', referrerId: 'b' }],
    ['b', { id: 'b', referrerId: 'c' }],
    ['c', { id: 'c', referrerId: null }],
  ]);
  const chain = buildUplineChain('p', users, 2);
  assert.deepEqual(chain.map((x) => x.id), ['a', 'b']);
});

test('upline chain is cycle-safe', () => {
  const users = new Map([
    ['p', { id: 'p', referrerId: 'a' }],
    ['a', { id: 'a', referrerId: 'p' }], // cycle
  ]);
  const chain = buildUplineChain('p', users, 5);
  assert.deepEqual(chain.map((x) => x.id), ['a']);
});

test('ledger rolls up commissions per agent across many bets', () => {
  const users = new Map([
    ['p1', { id: 'p1', referrerId: 'a1' }],
    ['a1', { id: 'a1', referrerId: 'sa' }],
    ['sa', { id: 'sa', referrerId: null }],
  ]);
  const bets = [
    { userId: 'p1', stake: 100, payout: 0 },
    { userId: 'p1', stake: 50, payout: 0 },
  ];
  const ledger = rollupLedger(bets, users, [0.08, 0.03]);
  const a1 = ledger.find((l) => l.agentId === 'a1');
  const sa = ledger.find((l) => l.agentId === 'sa');
  assert.equal(a1.total, 12); // 8% of 150
  assert.equal(sa.total, 4.5); // 3% of 150
});
