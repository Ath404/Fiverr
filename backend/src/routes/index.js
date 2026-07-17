'use strict';

/**
 * REST API surface for the prototype. Thin controllers: validate input,
 * call the domain modules (provablyFair / engine / commission), mutate the
 * store atomically, return JSON. Auth is stubbed for the demo (x-user-id
 * header) — production uses JWT access tokens + refresh rotation.
 */

const express = require('express');
const pf = require('../provablyFair');
const engine = require('../betting/engine');
const { rollupLedger, DEFAULT_TIER_RATES } = require('../affiliate/commission');
const store = require('../db');

const router = express.Router();

// Demo auth shim — resolves a user from a header, defaults to first player.
function currentUser(req) {
  const uid = req.header('x-user-id');
  if (uid && store.findUser(uid)) return store.findUser(uid);
  return store.demo.players[0];
}

// ---- session / wallet ----
router.get('/me', (req, res) => {
  const u = currentUser(req);
  res.json({ id: u.id, username: u.username, role: u.role, balance: u.balance, seed: store.publicSeed(u) });
});

router.post('/seed/rotate', (req, res) => {
  const u = currentUser(req);
  res.json(store.rotateSeed(u.id, req.body.clientSeed));
});

// ---- casino: dice ----
router.post('/casino/dice', (req, res) => {
  const u = currentUser(req);
  const stake = Number(req.body.stake);
  const target = Number(req.body.target);
  const direction = req.body.direction === 'over' ? 'over' : 'under';
  if (!(stake > 0) || !(target > 0 && target < 100)) {
    return res.status(400).json({ error: 'invalid stake or target' });
  }
  try {
    store.adjustBalance(u.id, -stake);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const nonce = store.nextNonce(u.id);
  const result = engine.settleDice({
    stake, target, direction,
    serverSeed: u.seed.serverSeed,
    clientSeed: u.seed.clientSeed,
    nonce,
  });
  if (result.payout > 0) store.adjustBalance(u.id, result.payout);
  const bet = store.recordBet({ userId: u.id, ...result, nonce, serverSeedHash: u.seed.serverSeedHash, clientSeed: u.seed.clientSeed });
  res.json({ ...result, nonce, balance: u.balance, betId: bet.id });
});

// ---- provably-fair verification (public) ----
router.post('/verify', (req, res) => {
  res.json(pf.verify(req.body));
});

// ---- sports betting ----
router.post('/sports/bet', (req, res) => {
  const u = currentUser(req);
  const { stake, odds, selection, fixtureId } = req.body;
  if (!(stake > 0) || !(odds >= 1.01)) return res.status(400).json({ error: 'invalid bet' });
  try {
    store.adjustBalance(u.id, -Number(stake));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const bet = store.recordBet({ userId: u.id, game: 'sports', fixtureId, selection, odds: Number(odds), stake: Number(stake), status: 'open' });
  res.json({ betId: bet.id, balance: u.balance, potentialPayout: +(stake * odds).toFixed(2) });
});

// ---- admin: agent/affiliate ledger ----
router.get('/admin/affiliate/ledger', (req, res) => {
  const u = currentUser(req);
  if (u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const settled = store.bets.filter((b) => typeof b.payout === 'number');
  const ledger = rollupLedger(settled, store.users, DEFAULT_TIER_RATES);
  res.json({ tierRates: DEFAULT_TIER_RATES, ledger });
});

// ---- admin: RNG oversight ----
router.get('/admin/rng/status', (req, res) => {
  const u = currentUser(req);
  if (u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const users = [...store.users.values()].map((x) => ({
    id: x.id, username: x.username, serverSeedHash: x.seed.serverSeedHash, nonce: x.seed.nonce,
  }));
  res.json({ algorithm: 'HMAC_SHA256(serverSeed, clientSeed:nonce)', users });
});

module.exports = router;
