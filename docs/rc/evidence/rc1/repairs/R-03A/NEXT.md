# RC1 REPAIR R-03A — HANDOFF & NEXT

## Current Status
- **Repair**: `R-03A`
- **Result**: **PASS** (2026-11-03, local production processes; production
  build sourceSha `eda6881`, provenance clean — see `RESULT.md`).
- **Tested baseline**: branch `rc1-repair-03a` from `rc1-repair-01b` @
  `59fdc3e`. Scoped `src/` verified byte-identical to the corrected union
  `rc1-union` @ `604e940` (the only `src/` delta between those bases is the
  17E commerce stale-lease fix, outside this scope), so this result carries
  over to the union unchanged.
- **Delivered evidence** (this folder): `RESULT.md`, `NEXT.md`,
  `persistence.json`, `restart-persistence.json`, `public-content.html`,
  `hierarchy-browser.png`.

## What was repaired (one genuine product defect)
- **Site deletion was impossible for a member-linked owner.** The protected
  delete counted operator grants (`member-site-roles`) as protected content
  references, while removing the grants first revoked the grant scope that
  authorized the delete — 403 in both orders. Fix: grants no longer count
  as protected references (`src/modules/editorial/hierarchy.ts`), and the
  site's grants are revoked through the Payload API inside the delete
  transaction by a `Sites` `beforeDelete` hook, preserving the
  `site-role.revoked` audit events (`src/collections/Sites.ts`). Regression
  test added in `tests/unit/content-hierarchy.test.tsx`.
- Everything else in the 03A contract (hierarchy CRUD, moves, guards,
  breadcrumbs, archives, public routes) was verified already-working on the
  union tree — evidence-only for those parts. Two harness-era assumptions
  were corrected instead of product code: the fixture now bootstraps the
  first site exactly as product installation does (local API + canonical
  grant), and the controls phase uses the supported deletion sequence.

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r03a/run-local.mjs` (needs PostgreSQL up and the
  disposable `rc1r03a_main` DB owned by the local `renegade` role + secrets
  and TLS cert under `scratch/rc1r03a/`; the supervisor resets the DB,
  migrates, starts web+worker+HTTPS proxy, runs the four phases, and tears
  the processes down). The evidence directory
  `docs/rc/evidence/rc1/repairs/R-03A/` must exist before the run — the
  verifier writes `persistence.json` into it.
- Production `APP_URL` validation on the union tree requires an https,
  non-loopback origin, hence the local TLS proxy on `rc1-03a.test:38758`;
  verifier REST/public calls go to the web port with explicit Host headers.
- Chromium needs `--ignore-certificate-errors` (browser level) in this
  sandbox for cross-host `.test` navigation; context `ignoreHTTPSErrors`
  alone was not sufficient for the second host.
- A VM replacement wipes the PostgreSQL cluster: re-create the `renegade`
  role and `rc1r03a_main` (owner `renegade`) via the postgres superuser
  before running.

## Carried items (not R-03A)
- 6 media site-scope unit failures on the union tree
  (`rc1-05a-media-lifecycle` ×3, `med-01-upload-sessions` ×3) — unchanged by
  this repair; flagged for **R-05C / Pass 18 reconciliation**.
- Full-suite baseline is now 2053 passed / 11 failed (2064) — the R-03A
  regression test is the only delta from the R-01B measurement.
- Container/Compose proof awaits a Docker-capable host.

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-03B is next only on the
  parent's instruction.
- The local stack has been torn down; disposable DB `rc1r03a_main` remains
  on the local PostgreSQL 16.15 cluster for inspection.
- Prior historical subpass reports and receipts remain intact.
