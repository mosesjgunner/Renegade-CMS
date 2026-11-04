# RC1 REPAIR R-08-SOCIAL — HANDOFF & NEXT

## Current Status
- **Repair**: `R-08-SOCIAL` (crosswalk of legacy "08D" into the
  actual 08A/08B/08C subpasses; no 08D row created or updated, and
  no blended verdict — each subpass carries its own status).
- **Result**: **08A PASS, 08B PASS, 08C PASS** (2026-11-03, local
  production processes; production build sourceSha `c52f211`,
  provenance clean — see `RESULT.md`). Unlike the evidence-only
  R-03B/R-03C, this repair includes a **genuine product fix**
  (commit `c52f211`).
- **Tested baseline**: branch `rc1-repair-08-social` from
  `rc1-repair-03d` @ `d80365c`. Social-scoped `src/` was
  byte-identical to the corrected union `604e940` before the
  repair; the full `src/` diff vs the union was exactly the eight
  accepted R-03A / 17E / R-05C / R-03D files. Four commits after the
  tested build are harness-only (`git diff c52f211..HEAD -- src/`
  is empty).
- **Ledger**: the existing 08A, 08B and 08C rows in
  `docs/rc/RC1-70-SUBPASS-LEDGER.md` were each updated in place,
  preserving their frozen 2026-10-19/20 history, with independent
  repair confirmations. No 08D row exists or was added.
- **Delivered evidence** (this folder): `RESULT.md`, `NEXT.md`,
  `journey-trace.json` (105 checks by section), `restart-trace.json`
  (20 checks), `persistence.json`, `provider-state.json`,
  `social-command-center.png`, `composer-scheduled.png`,
  `partial-destination.png`, `recovered-publication.png`.

## What was resolved
- **Product defect (fixed, `c52f211`)**: production local-harness
  social was unusable — `validateOutboundUrl`
  (`src/modules/social/security.ts`) ANDed the HTTP/loopback
  permission with a dev/test `NODE_ENV` gate, silently defeating
  the operator allowlist `SOCIAL_LOCAL_ADAPTER_ORIGINS` that the
  adapters and the dispatch boundary treat as the authorization
  for local origins. The frozen 08A–08C acceptances ran dev
  servers, and 17B's loopback journey used a `NODE_ENV=development`
  child, so no prior pass saw it. Fix: an explicitly allowlisted
  origin satisfies the gate in any NODE_ENV, only for callers that
  pass `allowHttpInDev`; non-allowlisted loopback stays blocked in
  production and the metadata/RFC1918 blocks still override the
  allowlist. 6 regression tests in
  `tests/unit/rc1-r08-social-local-origins.test.ts`.
- 08A re-proven on production processes: connect/test/disconnect
  lifecycle, encrypted envelope with zero plaintext anywhere,
  truthful invalid-credential failure, not-configured state,
  capability truth (local-harness ≠ remote-sandbox ≠ live ≠
  manual-handoff), integrations scopes, Command Center display.
- 08B re-proven: UI composer from a real published article,
  per-platform variants, pre-flight limits, review/approval gates
  with sha256 approvalHash pinning, scheduling into exactly 2
  queue items, source-bound second draft edited and declined with
  0 queue items (unsent), reload persistence.
- 08C re-proven: partial destination failure + failed-only retry,
  429 timing and early-retry refusal, 3-attempt cap, lost-response
  `unknown` + read-only reconciliation without resend, timeout
  quarantine with unsupported-reconciliation no-replay, revoked
  provider never called, unapproved origin never contacted,
  forgery/foreign/cross-origin denials, and killed-web lease
  recovery by a fresh jobs worker with no duplicate send.
- Full suite **2065 passed / 5 failed** — baseline 2059/5 plus
  exactly the 6 new regression tests; the 5 are the named
  pre-existing set. The shop-08 pair is commerce, not social.
  Final-tree `npx tsc --noEmit` exit 0.

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r08-social/run-local.mjs` (needs PostgreSQL
  up, the disposable `rc1r08s_main` database owned by the local
  `renegade` role, secrets/TLS under `scratch/rc1r08s/`; the
  supervisor resets and migrates the DB (131), starts web 38791 /
  proxy 38792, runs journey -> web+worker restart +
  `pg_ctlcluster` restart -> restart verification, and tears the
  processes down).
- The supervisor generates a disposable `RENEGADE_ENCRYPTION_KEY`
  under scratch — production fails closed without one.
- New members are auto-granted `contributor` on the existing site
  and `(site, member)` is unique: fixture grants must upsert, and a
  foreign fixture must have any auto-join grant on the target site
  removed to be genuinely foreign.
- The composer's validation gate checks **all** configured targets
  on the site: revoked/unconfigured accounts created for 08A would
  block the 08B UI journey, so those checks run after it.
- The crash scenario stops the supervisor's jobs worker so the due
  item can only be claimed by the dedicated web process; that
  process must send the canonical `APP_URL` Origin.
- A definitive build must run with **no untracked evidence files**
  present (they flip provenance `clean` to false); move this
  evidence folder aside before rebuilding, and restore
  `next-env.d.ts` after every build.
- This host's VM was replaced mid-run (PostgreSQL wiped from the
  system, home directory intact): PostgreSQL 16.15 was reinstalled
  via apt and the `renegade` role / `rc1r08s_main` database
  recreated before the definitive run.

## Carried items (not R-08-SOCIAL)
- Federation / inbox / mentions (the legacy planned "08D") remains
  unexecuted and outside the current 70-subpass plan; no status
  recorded.
- Remote-sandbox and real-world provider delivery remain
  unclaimed; all social proof here is local-harness plus
  unconfigured safety.
- Container/Compose proof awaits a Docker-capable host.

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-09A is next
  only on the parent's instruction.
- The local stack has been torn down; the disposable DB
  `rc1r08s_main` remains on the local PostgreSQL 16.15 cluster for
  inspection.
- Prior historical subpass reports and receipts remain intact.
