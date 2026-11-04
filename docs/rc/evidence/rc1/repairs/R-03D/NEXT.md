# RC1 REPAIR R-03D — HANDOFF & NEXT

## Current Status
- **Repair**: `R-03D`
- **Result**: **PASS** (2026-11-03, local production processes;
  production build sourceSha `04ce281`, provenance clean — see
  `RESULT.md`). Unlike the evidence-only R-03B/R-03C, this repair
  includes **genuine product fixes** (commits `a5e74ae`, `8fc9184`):
  the supported WXR import failed against the real Payload store in
  four places the in-memory unit store cannot see.
- **Tested baseline**: branch `rc1-repair-03d` from `rc1-repair-05c`
  @ `3b103fd`. Scoped `src/` (legacy migration, portability) was
  byte-identical to the corrected union `604e940` before the repair,
  apart from the accepted R-03A / 17E / R-05C diffs (all listed in
  RESULT.md). The R-05C portable-archive boundary is untouched.
- **Ledger**: there was **no 03D row** in
  `docs/rc/RC1-70-SUBPASS-LEDGER.md` before this repair; a row has
  been inserted after 03C preserving the frozen history (the frozen
  2026-10-20 run stopped in the installer after 1 check and wrote no
  RESULT.md; its evidence remains in
  `docs/rc/evidence/rc1/18-pass/03D/`).
- **Delivered evidence** (this folder): `RESULT.md`, `NEXT.md`,
  `journey-trace.json` (20 checks), `negative-trace.json` (15),
  `restart-trace.json` (5), `import-report.json`, `public-site.png`.

## What was resolved
- Frozen installer blocker: does not reproduce on the production
  build (R-01B sequence; blank-minimal starter as the frozen run
  intended).
- Import defect 1 (media): migration-created sites got no creator
  grant (store created the site with no request user), so the media
  permission layer denied the actor's own imports. `createSite` now
  passes the actor as Payload `user`.
- Import defect 2 (header): the reconstructed header global used
  `publisher.hero`, which the canonical registry forbids in the
  header slot. It now uses `publisher.rich-content`.
- Import defect 3 (pattern): the CTA pattern's plain `{label, href}`
  link is not a valid chooser reference and cannot be minted before
  the target site exists; the pattern no longer carries a link prop.
- Import defect 4 (verification): imported content lost the legacy
  URL plan's canonical path (`/` -> `/home`) because the store did
  not set `pathOverride` and the editorial derivation's
  deliberate-path preservation does not fire on create (empty-object
  `originalDoc`). The store now sets `pathOverride: true`.
  Note for Pass 18: the underlying derivation quirk (empty-object
  `originalDoc` on create defeating `data.canonicalPath && !original`
  in `deriveEditorialPath`) remains in
  `src/modules/editorial/publishing-pass.ts` for any other caller
  that supplies a canonical path without `pathOverride`; it was not
  changed here because the migration-store fix is the narrower,
  in-scope repair and R-03A/R-03B/R-03C evidence stands on the
  current derivation behavior.
- Full suite unchanged: **2059 passed / 5 failed**, the named
  pre-existing set; final-tree `npx tsc --noEmit` exit 0.

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r03d/run-local.mjs` (needs PostgreSQL up, the
  disposable `rc1r03d_main` database owned by the local `renegade`
  role, secrets/TLS under `scratch/rc1r03d/`; the supervisor resets
  and migrates the DB (131), starts web 38781 / proxy 38782, runs
  journey -> negatives -> web+worker restart + `pg_ctlcluster`
  restart -> restart verification, and tears the processes down).
- API calls in the verifiers go through the local HTTPS proxy by
  loopback IP with the browser context's session cookie
  (Playwright's request context resolves `.test` hosts through real
  DNS and fails with EPROTO).
- The staff WebAuthn `page.evaluate` needs a `window.__name` shim
  (tsx/esbuild helper) before the credential-creation evaluate.
- A definitive build must run with **no untracked evidence files**
  present (they flip provenance `clean` to false); move this
  evidence folder aside before rebuilding, and restore
  `next-env.d.ts` after every build.

## Carried items (not R-03D)
- Migrated header global / CTA pattern carry no first navigation
  link (no chooser reference can exist at reconstruction time) —
  recorded in RESULT.md.
- The `deriveEditorialPath` empty-`originalDoc` quirk above, for
  Pass 18 reconciliation.
- Container/Compose proof awaits a Docker-capable host.

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-08-SOCIAL is
  next only on the parent's instruction.
- The local stack has been torn down; the disposable DB
  `rc1r03d_main` remains on the local PostgreSQL 16.15 cluster for
  inspection.
- Prior historical subpass reports and receipts remain intact.
