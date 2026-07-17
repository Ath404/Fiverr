'use strict';

/**
 * Provably-Fair RNG engine.
 *
 * This is the industry-standard commit/reveal scheme used by reputable
 * crypto casinos (Stake, BC.Game, Roobet, etc.). The casino commits to a
 * secret server seed *before* the bet by publishing its SHA-256 hash. The
 * player supplies their own client seed. Each bet uses an incrementing
 * nonce. The random result is derived deterministically via HMAC-SHA256,
 * so once the server seed is revealed, ANY result can be independently
 * recomputed and verified by the player — the operator cannot have cheated
 * after the fact.
 *
 * Flow:
 *   1. Server generates serverSeed, stores it, and gives the player
 *      serverSeedHash = sha256(serverSeed).           (commit)
 *   2. Player sets a clientSeed (or accepts a random one).
 *   3. For each bet, nonce increments: 0, 1, 2, ...
 *   4. result = f( HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`) )
 *   5. When the player rotates their seed, the old serverSeed is revealed
 *      so they can verify every past bet.                (reveal)
 */

const crypto = require('crypto');

/** Cryptographically-secure random hex string. */
function randomSeed(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** SHA-256 hex digest — the public commitment to a server seed. */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Deterministic keyed hash for a specific bet.
 * Keyed on the SECRET server seed; message is the public clientSeed:nonce.
 */
function hmacDigest(serverSeed, clientSeed, nonce) {
  return crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest('hex');
}

/**
 * Convert an HMAC digest into a uniform float in [0, 1).
 *
 * We consume the first 8 hex chars (32 bits) as an integer and divide by
 * 2^32. Using a byte-cursor lets callers pull multiple independent floats
 * from a single digest (needed for multi-outcome games like Mines).
 */
function floatsFromDigest(digest, count = 1) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const offset = (i * 8) % 56; // stay within the 64-char digest, 4 bytes at a time
    const slice = digest.substring(offset, offset + 8);
    results.push(parseInt(slice, 16) / 0x100000000);
  }
  return results;
}

/** A single uniform float in [0, 1) for a bet. */
function betFloat(serverSeed, clientSeed, nonce) {
  return floatsFromDigest(hmacDigest(serverSeed, clientSeed, nonce), 1)[0];
}

// ---------------------------------------------------------------------------
// Game outcome derivations (pure functions of the provably-fair float).
// Each is independently verifiable by re-running with the revealed seed.
// ---------------------------------------------------------------------------

/**
 * DICE — roll in [0.00, 100.00]. Player bets over/under a target.
 * House edge is applied via the payout multiplier, not by biasing the roll,
 * so the roll itself stays perfectly uniform and verifiable.
 */
function diceRoll(serverSeed, clientSeed, nonce) {
  const f = betFloat(serverSeed, clientSeed, nonce);
  return Math.floor(f * 10001) / 100; // 0.00 .. 100.00
}

/**
 * CRASH — the multiplier at which the round busts.
 * Standard formula with a 1% house edge: 1% of rounds bust instantly at 1.00x.
 */
function crashPoint(serverSeed, clientSeed, nonce, houseEdge = 0.01) {
  const h = hmacDigest(serverSeed, clientSeed, nonce);
  const int = parseInt(h.substring(0, 13), 16); // 52 bits
  const e = Math.pow(2, 52);
  if (int % Math.floor(1 / houseEdge) === 0) return 1.0; // instant bust
  const raw = (100 * e - int) / (e - int);
  return Math.max(1.0, Math.floor(raw) / 100);
}

/**
 * MINES — deterministically place `mineCount` mines on a `size`-tile grid
 * using a Fisher–Yates shuffle seeded by the provably-fair digest.
 * Returns the sorted list of mined tile indices.
 */
function minesLayout(serverSeed, clientSeed, nonce, size = 25, mineCount = 3) {
  const tiles = Array.from({ length: size }, (_, i) => i);
  // Draw a fresh float per swap from an extended digest stream.
  for (let i = size - 1; i > 0; i--) {
    const digest = hmacDigest(serverSeed, `${clientSeed}:${i}`, nonce);
    const f = parseInt(digest.substring(0, 8), 16) / 0x100000000;
    const j = Math.floor(f * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, mineCount).sort((a, b) => a - b);
}

/**
 * Verify any historical bet. Given the (now-revealed) server seed, confirms
 * the published hash matches and recomputes the outcome for the given game.
 * This is exactly what a player runs to audit the casino.
 */
function verify({ serverSeed, serverSeedHash, clientSeed, nonce, game, params = {} }) {
  const hashOk = sha256(serverSeed) === serverSeedHash;
  let outcome;
  switch (game) {
    case 'dice':
      outcome = diceRoll(serverSeed, clientSeed, nonce);
      break;
    case 'crash':
      outcome = crashPoint(serverSeed, clientSeed, nonce);
      break;
    case 'mines':
      outcome = minesLayout(serverSeed, clientSeed, nonce, params.size, params.mineCount);
      break;
    default:
      outcome = betFloat(serverSeed, clientSeed, nonce);
  }
  return { hashOk, outcome };
}

module.exports = {
  randomSeed,
  sha256,
  hmacDigest,
  floatsFromDigest,
  betFloat,
  diceRoll,
  crashPoint,
  minesLayout,
  verify,
};
