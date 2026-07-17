'use strict';

/**
 * In-house betting engine.
 *
 * Handles both casino bets (settled instantly against the provably-fair RNG)
 * and sports bets (settled when a fixture result is posted). Prices are held
 * as DECIMAL ODDS internally; the frontend can render decimal / fractional /
 * American. Every stake mutates the wallet atomically and writes a ledger row.
 */

const pf = require('../provablyFair');

/** Convert decimal odds to an American moneyline for display. */
function decimalToAmerican(dec) {
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}

/** Implied probability (%) from decimal odds — includes the book's margin. */
function impliedProbability(dec) {
  return +(100 / dec).toFixed(2);
}

// --------------------------- Casino settlement ----------------------------

/**
 * Settle a DICE bet. Player wins if the roll satisfies the over/under target.
 * Multiplier is derived from the win chance with a configurable house edge.
 */
function settleDice({ stake, target, direction, serverSeed, clientSeed, nonce, houseEdge = 0.01 }) {
  const roll = pf.diceRoll(serverSeed, clientSeed, nonce);
  const winChance = direction === 'over' ? (100 - target) : target; // in %
  const won = direction === 'over' ? roll > target : roll < target;
  const multiplier = +((100 / winChance) * (1 - houseEdge)).toFixed(4);
  const payout = won ? +(stake * multiplier).toFixed(2) : 0;
  return { game: 'dice', roll, won, multiplier, payout, stake };
}

/**
 * Settle a CRASH bet against a cashout target. If the round busts before the
 * player's target, they lose; otherwise they win stake * target.
 */
function settleCrash({ stake, cashoutTarget, serverSeed, clientSeed, nonce }) {
  const bust = pf.crashPoint(serverSeed, clientSeed, nonce);
  const won = bust >= cashoutTarget;
  const payout = won ? +(stake * cashoutTarget).toFixed(2) : 0;
  return { game: 'crash', bust, cashoutTarget, won, payout, stake };
}

// --------------------------- Sports settlement ----------------------------

/**
 * Settle a single-selection sports bet once the fixture result is known.
 * @param {object} bet    { stake, odds (decimal), selection }
 * @param {string} result the winning selection key
 */
function settleSportsSingle(bet, result) {
  const won = bet.selection === result;
  const payout = won ? +(bet.stake * bet.odds).toFixed(2) : 0;
  return { ...bet, won, payout };
}

/**
 * Settle a parlay/accumulator: all legs must win; odds multiply.
 * A single losing (or voided-as-loss) leg busts the whole ticket.
 */
function settleParlay(legs, results) {
  let combinedOdds = 1;
  let allWon = true;
  const settledLegs = legs.map((leg) => {
    const won = results[leg.fixtureId] === leg.selection;
    combinedOdds *= leg.odds;
    if (!won) allWon = false;
    return { ...leg, won };
  });
  const stake = legs[0]?.stake ?? 0;
  const payout = allWon ? +(stake * combinedOdds).toFixed(2) : 0;
  return { legs: settledLegs, combinedOdds: +combinedOdds.toFixed(4), allWon, payout };
}

module.exports = {
  decimalToAmerican,
  impliedProbability,
  settleDice,
  settleCrash,
  settleSportsSingle,
  settleParlay,
};
