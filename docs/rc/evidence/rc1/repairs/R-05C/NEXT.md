# RC1 REPAIR R-05C — HANDOFF & NEXT

## Current Status
- **Repair**: `R-05C`
- **Result**: **PASS** (2026-11-03, local production processes in two
  isolated environments; production build sourceSha `3ad57a3`,
  provenance clean — see `RESULT.md`). Unlike the evidence-only
  R-03B/R-03C, this repair includes a **genuine product fix** (commit
  `3ad57a3`) and a **test-fixture repair** (commit `f9bd50e`).
- **Tested baseline**: branch `rc1-repair-05c` from `rc1-repair-03c` @
  `3e4e2c0`. Scoped `src/` (media/miniPaint/upload/portability) was
  byte-identical to the corrected union `rc1-union` @ `604e940` before
  the repair; the only product delta this repair adds is the three
  portability files in `3ad57a3`.
- **Delivered evidence** (this folder): `RESULT.md`, `NEXT.md`,
  `journey.json` (42 checks), `restart.json` (8), `restore.json` and
  `restore-restart.json` (11 each), `state.json`, `restore-target.json`,
  `network.json`, `restart-network.json`, `editor-controls.json`,
  `editor.png`, `bad-source.png`, `article-390.png`,
  `article-1440.png`, `browser-trace.zip`.

## What was resolved
- The frozen export blocker (`site` QueryError) was already repaired
  on this tree; the supported export now completes (11 records).
- The genuine restore defect is fixed: the archive could not be
  restored into a fresh installation at all (only the publication
  landed). Owners are exported by reference, non-carried references
  are severed at the import boundary, and import retries run to a
  no-progress fixpoint. Definitive import: created 8 / updated 2 /
  mediaReconciled 5 / relationshipRepairs 8 / failedRows [].
- The 6 media site-scope unit failures flagged for R-05C since R-01B
  are closed (canonical-grant fixture alignment; no assertion
  changed). **New full-suite baseline: 2059 passed / 5 failed** — the
  remaining 5 are the named pre-existing set (flow-04-acceptance,
  payload-domains, rc1-04d-campaign-commerce, shop-08 x2).

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r05c/run-local.mjs` (needs PostgreSQL up, the
  disposable `rc1r05c_main` + `rc1r05c_restore` databases owned by the
  local `renegade` role, secrets/TLS under `scratch/rc1r05c/`; the
  supervisor resets and migrates both DBs (131), starts env A
  (web 38771 / proxy 38772) and env B (web 38773 / proxy 38774) stacks,
  runs journey -> export -> import -> refetch -> web+worker restart +
  `pg_ctlcluster` restart -> restart + refetch-restart, and tears the
  processes down — including on failure paths).
- Harness phases exit explicitly (`process.exit`) after their evidence
  writes: the in-process Payload jobs run and browser leave handles
  that otherwise hang the phase on this host.
- A definitive build must run with **no untracked evidence files**
  present (they flip provenance `clean` to false); clear this evidence
  folder before rebuilding, and restore `next-env.d.ts`
  (`git checkout -- next-env.d.ts`) after every build, per the
  R-03B/R-03C precedent.
- The disposable databases, media dirs and the export archive remain
  under `scratch/rc1r05c/` and the two databases for inspection;
  intermediate run artifacts are in `scratch/rc1r05c/run{1,2,3}-evidence/`
  and `scratch/rc1r05c/*{2,3,4}*.log`.

## Carried items (not R-05C)
- Restored assets have no derivative variants (0 rows): derivatives
  are excluded from the portable archive by design and import enqueues
  no regeneration — a named product gap for a later pass (Pass 18
  reconciliation), recorded in `RESULT.md`.
- Container/Compose proof awaits a Docker-capable host.

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-03D is next only
  on the parent's instruction.
- The local stacks have been torn down; disposable DBs `rc1r05c_main`
  and `rc1r05c_restore` remain on the local PostgreSQL 16.15 cluster
  for inspection.
- Prior historical subpass reports and receipts remain intact.
