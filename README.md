# AURUM — Provably-Fair Virtual Casino & Sportsbook

> **Demo prototype for halkeb — designed & built by atharvskills.**

A working prototype of a virtual-currency casino platform with an **in-house,
provably-fair RNG**, an **in-house betting engine** for casino and sports, a
**multi-tier agent/affiliate system**, and an **admin fairness console**.

Built to demonstrate the exact scope in the brief:

| Requirement | Where it lives |
|---|---|
| Provably-fair RNG with admin control | `backend/src/provablyFair.js` + Admin → *Independent Bet Verifier* |
| In-house betting engine (sports + casino) | `backend/src/betting/engine.js` |
| Multi-tier agent / affiliate system | `backend/src/affiliate/commission.js` + Affiliate view |
| Live sports streaming & live-casino demo | Live view + Sportsbook (live odds ticker) |
| Scalable cloud deployment (AWS / GCP) | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Security, databases, performance | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

---

## The headline feature: provably fair, and you can prove it

Every casino result is derived from `HMAC-SHA256(serverSeed, "clientSeed:nonce")`.
The operator **commits** to a secret server seed by publishing its SHA-256 hash
*before* any bet is placed. The player supplies their own client seed. Because the
result is a deterministic function of `(serverSeed, clientSeed, nonce)`, once the
server seed is revealed **any** past result can be recomputed and audited — the
house cannot alter an outcome after the fact.

The demo's **Admin → Independent Bet Verifier** runs this check live: paste a
bet's seeds and nonce, and it confirms `sha256(serverSeed) == committedHash` and
recomputes the outcome. The same algorithm runs identically in the browser
(`frontend`, via Web Crypto) and on the server (`backend/src/provablyFair.js`),
so there is a single source of truth.

```
result float   = parseInt( HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)[0..8], 16) / 2^32
dice roll      = floor(float * 10001) / 100          # 0.00 .. 100.00, uniform
crash point    = provably-fair formula, 1% house edge
mines layout   = Fisher–Yates shuffle seeded by the digest
```

---

## Playable games

Four provably-fair originals are fully playable in the demo — **Dice**, **Crash**,
**Mines**, and **Plinko** (12-row canvas drop with Low/Medium/High risk tables).
Every result is derived from the seed/nonce and can be recomputed in the admin
verifier.

## Run it

### 1. The demo (no build step)
Open `index.html` (repo root) or `frontend/index.html` in any browser — it is
fully self-contained and demonstrates every screen (Casino, Live, Sportsbook,
Affiliate, Admin).

### Deploy a live link
The repo root contains a static `index.html`, so it deploys with zero config:

- **Vercel** — import this repo at [vercel.com/new](https://vercel.com/new); name
  the project `atharvskills` to get `https://atharvskills.vercel.app`.
- **GitHub Pages** — Settings → Pages → deploy from `main` / root → served at
  `https://ath404.github.io/<repo>/`.

### 2. The backend + API
```bash
cd backend
npm install
npm start          # serves the API and the frontend on http://localhost:3000
npm test           # runs the provably-fair & commission test suites
```

Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/me` | session, wallet balance, public seed (hash + client seed + nonce) |
| `POST` | `/api/casino/dice` | place a provably-fair dice bet, settle atomically |
| `POST` | `/api/verify` | recompute & verify any historical outcome |
| `POST` | `/api/seed/rotate` | rotate the server seed, revealing the previous one |
| `POST` | `/api/sports/bet` | place a single/parlay sports bet |
| `GET`  | `/api/admin/affiliate/ledger` | per-agent multi-tier commission rollup |
| `GET`  | `/api/admin/rng/status` | operator view of committed seeds & nonces |

---

## Tests

`npm test` exercises the fairness and money-path logic that an auditor cares
about most:

- deterministic outcomes for identical inputs (reproducibility)
- tampered server seed fails hash verification
- 20,000-sample uniformity check on dice rolls (no bias)
- crash points always `>= 1.00`; mines place exactly *N* unique mines
- multi-tier commission split, GGR carry rules, cycle-safe upline walking

All 13+ assertions pass on a clean `node --test`.

---

## What this prototype is (and isn't)

It is a **faithful, runnable proof** of the hard parts — the fairness engine,
the settlement math, the commission tree, the admin oversight — with production
architecture documented in `docs/`. It deliberately uses an in-memory store and
a stubbed auth shim so it runs anywhere in seconds; the repository interface is
shaped so the swap to PostgreSQL + Redis + JWT is mechanical, not a rewrite.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the production design and
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the scalable AWS/GCP topology.
