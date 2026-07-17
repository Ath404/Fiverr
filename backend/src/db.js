'use strict';

/**
 * Lightweight in-memory data store used for the prototype/demo.
 *
 * The interface (findUser, createBet, etc.) is deliberately repository-shaped
 * so that swapping this for PostgreSQL + Redis in production is a drop-in
 * change — see docs/ARCHITECTURE.md. Nothing above this layer touches raw
 * data structures directly.
 */

const crypto = require('crypto');
const pf = require('./provablyFair');

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

class Store {
  constructor() {
    this.users = new Map();
    this.bets = [];
    this.seed(); // demo fixtures
  }

  // ---- users & wallets ----
  createUser({ username, role = 'player', referrerId = null, balance = 10000 }) {
    const serverSeed = pf.randomSeed();
    const user = {
      id: id('usr'),
      username,
      role, // player | agent | admin
      referrerId,
      balance, // virtual currency
      seed: {
        serverSeed,
        serverSeedHash: pf.sha256(serverSeed),
        clientSeed: pf.randomSeed(8),
        nonce: 0,
      },
      createdAt: Date.now(),
    };
    this.users.set(user.id, user);
    return user;
  }

  findUser(userId) {
    return this.users.get(userId);
  }

  adjustBalance(userId, delta) {
    const u = this.users.get(userId);
    if (!u) throw new Error('user not found');
    if (u.balance + delta < 0) throw new Error('insufficient balance');
    u.balance = +(u.balance + delta).toFixed(2);
    return u.balance;
  }

  /** Rotate a user's server seed, revealing the previous one for verification. */
  rotateSeed(userId, newClientSeed) {
    const u = this.users.get(userId);
    if (!u) throw new Error('user not found');
    const revealed = { ...u.seed };
    const serverSeed = pf.randomSeed();
    u.seed = {
      serverSeed,
      serverSeedHash: pf.sha256(serverSeed),
      clientSeed: newClientSeed || pf.randomSeed(8),
      nonce: 0,
    };
    return { revealed, current: this.publicSeed(u) };
  }

  /** Seed info safe to expose to the client (never the live serverSeed). */
  publicSeed(user) {
    return {
      serverSeedHash: user.seed.serverSeedHash,
      clientSeed: user.seed.clientSeed,
      nonce: user.seed.nonce,
    };
  }

  nextNonce(userId) {
    const u = this.users.get(userId);
    const nonce = u.seed.nonce;
    u.seed.nonce += 1;
    return nonce;
  }

  // ---- bets ----
  recordBet(bet) {
    const row = { id: id('bet'), createdAt: Date.now(), ...bet };
    this.bets.push(row);
    return row;
  }

  // ---- demo seed data ----
  seed() {
    const admin = this.createUser({ username: 'admin', role: 'admin', balance: 0 });
    const superAgent = this.createUser({ username: 'super_agent', role: 'agent', balance: 0 });
    const agent = this.createUser({ username: 'agent_smith', role: 'agent', referrerId: superAgent.id, balance: 0 });
    const p1 = this.createUser({ username: 'lucky_luke', role: 'player', referrerId: agent.id });
    const p2 = this.createUser({ username: 'high_roller', role: 'player', referrerId: agent.id, balance: 50000 });
    this.demo = { admin, superAgent, agent, players: [p1, p2] };
  }
}

module.exports = new Store();
