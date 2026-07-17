# Scalable Deployment (AWS / GCP)

The platform is designed to scale horizontally: stateless API nodes behind a load
balancer, real-time traffic on a separate WebSocket tier, managed Postgres for the
source of truth, and Redis for hot state. Below is a reference topology on both
clouds — the application code is identical; only the managed services differ.

## Topology

```
                    ┌──────────────┐
   players ───────▶ │  CDN + WAF   │  static SPA, TLS, DDoS/bot protection
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ Load Balancer│
                    └──┬────────┬──┘
              REST/HTTPS│        │WSS (live odds, crash, streams)
             ┌──────────▼─┐   ┌──▼───────────┐
             │ API nodes   │   │ Realtime nodes│   auto-scaling groups
             │ (stateless) │   │ (WebSocket)   │
             └──────┬──────┘   └──────┬────────┘
                    │                 │
        ┌───────────▼──────┐   ┌──────▼───────┐   ┌─────────────┐
        │ PostgreSQL (HA)  │   │ Redis (HA)   │   │ KMS / HSM   │
        │ primary+replicas │   │ balances,    │   │ server seeds│
        │ double-entry     │   │ seed cache,  │   │ encryption  │
        │ ledger           │   │ rate limits  │   └─────────────┘
        └──────────────────┘   └──────────────┘
```

## AWS mapping

| Component | Service |
|---|---|
| Static SPA + edge | S3 + CloudFront, AWS WAF |
| Ingress | Application Load Balancer |
| API / realtime | ECS Fargate (or EKS) auto-scaling services |
| Database | RDS for PostgreSQL, Multi-AZ + read replicas |
| Cache / pubsub | ElastiCache for Redis (cluster mode) |
| RNG secrets | AWS KMS (+ CloudHSM for seed signing) |
| Secrets/config | Secrets Manager, SSM Parameter Store |
| Object storage | S3 (KYC docs, exports) |
| Observability | CloudWatch, X-Ray; logs shipped to OpenSearch |
| CI/CD | CodePipeline / GitHub Actions → ECR → ECS blue-green |

## GCP mapping

| Component | Service |
|---|---|
| Static SPA + edge | Cloud Storage + Cloud CDN, Cloud Armor |
| Ingress | Global External HTTP(S) Load Balancer |
| API / realtime | Cloud Run (or GKE Autopilot) |
| Database | Cloud SQL for PostgreSQL, HA + replicas |
| Cache / pubsub | Memorystore for Redis |
| RNG secrets | Cloud KMS (+ Cloud HSM) |
| Secrets/config | Secret Manager |
| Observability | Cloud Logging, Cloud Trace, Managed Prometheus |
| CI/CD | Cloud Build → Artifact Registry → Cloud Run/GKE |

## Scaling notes

- **API tier is stateless** → scale on CPU/RPS. Sessions live in JWTs; hot
  wallet state in Redis, durable state in Postgres.
- **Realtime tier is separate** so a spike in live viewers (a big match) never
  starves bet-settlement capacity. Fan-out via Redis pub/sub.
- **Money path uses DB transactions on integer minor-units** with a double-entry
  ledger — never floating point, never a lost or duplicated credit.
- **Server seeds** are generated and stored encrypted (KMS/HSM). Rotation and
  reveal are recorded in an append-only audit log for regulator/auditor review.
- **Live streaming** integrates via HLS/WebRTC from the streaming provider's CDN;
  the app embeds the player and overlays in-play markets — no video transcoding
  on the app tier.
- **Zero-downtime deploys** via blue-green / rolling with health checks; database
  migrations are backward-compatible (expand/contract).

## Environments

`dev` → `staging` (production-like, seeded demo data) → `prod`. Infrastructure as
code (Terraform) so both clouds are reproducible; per-environment secrets via the
platform secret manager, never in the repo.
