# M02 research notes

Read 2026-08-11 through `docs/research/INDEX.md`; only M02-mapped reports were consulted.

- `Renegade_CMS_Architecture_Report.md` sections 12, 17 and 18: recommends one web image plus worker, PostgreSQL-backed jobs, local persistent media, health, and logical database backups with restore evidence.
- `COMMENT_IDENTITY_SECURITY_ARCHITECTURE_REPORT.md` setup/security matches: owner creation must not remain publicly available; staff identity remains separate from later member identity.
- `Renegade-CMS-Media-Distribution-Command-Center-Architecture.md` worker/retry matches: durable attempts, idempotency, bounded retries and worker isolation are required for later distribution work.

Accepted for M02: PostgreSQL remains the only durable service; use installed Payload Jobs; local media is the base deployment with a persistent-volume warning; an app and worker may run the same image.

Current primary verification, 2026-08-11: Payload 3.88 official Jobs Queue, Tasks, Schedules, Queues and Production Deployment documentation confirms persisted jobs, task retries, cron scheduling, CLI/auto runners, admin collection overrides, standalone Next deployment and production secure-cookie guidance. Local API documentation confirms access is overridden by default, so setup and diagnostics must enforce their own authorization boundaries.

Unresolved/deferred: object storage and SMTP adapters belong to later milestones; Cloudflare is optional and not hard-coded; hosted CI and release authority remain unavailable without Git/remote metadata.
