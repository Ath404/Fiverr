'use strict';

/**
 * Multi-tier agent / affiliate commission engine.
 *
 * Real casino affiliate programs pay UPLINE agents a share of the revenue
 * their downline generates, across several tiers. This module computes the
 * commission split for a single settled bet and walks the referral chain.
 *
 * Revenue model: commissions are paid on GGR (Gross Gaming Revenue = the
 * house's net win on a bet). Negative GGR (player won) can optionally carry
 * forward against future positive GGR per agent — modelled here per call.
 *
 * Tier rates are configurable per program (set in the admin panel). Example:
 *   tier 1 (direct referrer): 8% of GGR
 *   tier 2:                    3% of GGR
 *   tier 3:                    1% of GGR
 */

const DEFAULT_TIER_RATES = [0.08, 0.03, 0.01];

/**
 * @param {object}   bet         { stake, payout }  payout = amount returned to player (0 on loss)
 * @param {object[]} uplineChain ordered agents nearest-first: [directReferrer, grandparent, ...]
 * @param {number[]} tierRates   commission fraction per tier, index 0 = tier 1
 * @returns {{ ggr:number, payouts: {agentId:string, tier:number, rate:number, amount:number}[] }}
 */
function computeCommissions(bet, uplineChain, tierRates = DEFAULT_TIER_RATES) {
  const ggr = bet.stake - bet.payout; // house win on this bet
  const payouts = [];

  if (ggr <= 0) return { ggr, payouts }; // no positive revenue to share

  uplineChain.forEach((agent, idx) => {
    const rate = tierRates[idx];
    if (rate == null || rate <= 0) return; // beyond configured tiers
    const amount = round2(ggr * rate);
    if (amount > 0) {
      payouts.push({ agentId: agent.id, tier: idx + 1, rate, amount });
    }
  });

  return { ggr, payouts };
}

/**
 * Build the upline chain for a user by walking `referrerId` pointers.
 * @param {string} userId
 * @param {Map<string, {id:string, referrerId?:string}>} usersById
 * @param {number} maxTiers
 */
function buildUplineChain(userId, usersById, maxTiers = DEFAULT_TIER_RATES.length) {
  const chain = [];
  let current = usersById.get(userId);
  const seen = new Set([userId]); // guard against referral cycles
  while (current && current.referrerId && chain.length < maxTiers) {
    if (seen.has(current.referrerId)) break;
    const parent = usersById.get(current.referrerId);
    if (!parent) break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}

/**
 * Aggregate a batch of settled bets into a per-agent commission ledger —
 * this drives the admin panel's agent earnings dashboard.
 */
function rollupLedger(settledBets, usersById, tierRates = DEFAULT_TIER_RATES) {
  const ledger = new Map(); // agentId -> { total, byTier }
  for (const bet of settledBets) {
    const chain = buildUplineChain(bet.userId, usersById, tierRates.length);
    const { payouts } = computeCommissions(bet, chain, tierRates);
    for (const p of payouts) {
      const entry = ledger.get(p.agentId) || { agentId: p.agentId, total: 0, byTier: {} };
      entry.total = round2(entry.total + p.amount);
      entry.byTier[p.tier] = round2((entry.byTier[p.tier] || 0) + p.amount);
      ledger.set(p.agentId, entry);
    }
  }
  return [...ledger.values()].sort((a, b) => b.total - a.total);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

module.exports = {
  DEFAULT_TIER_RATES,
  computeCommissions,
  buildUplineChain,
  rollupLedger,
};
