# Architecture

This prototype is built as a thin, testable domain core with clearly separated
concerns, so the path from demo to production is additive rather than a rewrite.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Client (SPA)   provably-fair verifier runs here too         │
│  frontend/index.html — Web Crypto HMAC-SHA256                │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS / WSS
┌───────────────▼─────────────────────────────────────────────┐
│  API layer      backend/src/routes — validation, authz,      │
│                 atomic wallet mutation, JSON contracts        │
├──────────────────────────────────────────────────────────────┤
│  Domain core    provablyFair · betting/engine ·              │
│  (pure, tested) affiliate/commission                          │
├──────────────────────────────────────────────────────────────┤
│  Data access    db.js (repository interface)                  │
│                 → prototype: in-memory                        │
│                 → production: PostgreSQL + Redis              │
└──────────────────────────────────────────────────────────────┘
```

The **domain core is pure**: `provablyFair`, `engine`, and `commission` are
side-effect-free functions of their inputs. That is what makes them unit-testable
and independently auditable — the property the client's "expert code audit" will
look for first.

## Provably-fair engine (`src/provablyFair.js`)

Commit/reveal with `HMAC-SHA256(serverSeed, "clientSeed:nonce")`, the scheme used
by Stake, BC.Game and other reputable operators.

- **Commit:** server generates a 256-bit `serverSeed`, stores it, publishes
  `sha256(serverSeed)`.
- **Play:** each bet increments a `nonce`; the outcome is a deterministic
  function of the digest, so the roll itself is unbiased — the house edge lives
  only in the *payout multiplier*, never in the RNG.
- **Reveal:** rotating the client seed reveals the old server seed, letting the
  player verify every historical bet.

Because the identical algorithm ships to the browser, players never have to trust
the server — they recompute results themselves.

## Betting engine (`src/betting/engine.js`)

- Casino bets settle **synchronously** against the RNG (`settleDice`,
  `settleCrash`).
- Sports bets are priced in **decimal odds** internally (with helpers for
  American/implied), settle on fixture result (`settleSportsSingle`), and support
  **parlays** where legs multiply and a single loss busts the ticket.

## Multi-tier affiliate (`src/affiliate/commission.js`)

Commissions are paid on **GGR** (stake − payout) up a referral chain. Tier rates
are operator-configurable (default 8% / 3% / 1%). `buildUplineChain` is
**cycle-safe** and depth-capped; `rollupLedger` aggregates a batch of settled
bets into the per-agent earnings shown in the admin panel.

## Production hardening (documented, not in the prototype)

| Concern | Prototype | Production |
|---|---|---|
| Persistence | in-memory `Map` | PostgreSQL (source of truth) + Redis (hot balances, seed cache) |
| Money integrity | JS number | integer minor-units + DB transactions; double-entry ledger, no floats |
| Auth | `x-user-id` shim | JWT access + rotating refresh tokens, argon2id password hashing, 2FA |
| Real-time | polling | WebSocket for live odds, crash rounds, dealer streams |
| RNG secrets | in process | server seeds in a KMS/HSM; seed rotation & reveal audited |
| Abuse | none | rate limiting, velocity checks, KYC/AML hooks, responsible-gaming limits |
| Observability | console | structured logs, metrics, per-bet audit trail |

## Data model (production sketch)

```
users(id, username, role, referrer_id, created_at)
wallets(user_id, currency, balance_minor)          -- integer minor units
seeds(user_id, server_seed_enc, server_seed_hash, client_seed, nonce, revealed_at)
bets(id, user_id, game, stake_minor, payout_minor, nonce, server_seed_hash, created_at)
fixtures(id, league, starts_at, status, result)
sports_bets(id, user_id, fixture_id, selection, odds, stake_minor, status)
commissions(id, agent_id, source_bet_id, tier, rate, amount_minor)
```

Every bet stores the `server_seed_hash` and `nonce` it was settled against, so
the full history is verifiable long after the seed is rotated and revealed.
