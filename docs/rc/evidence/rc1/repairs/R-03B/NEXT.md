# RC1 REPAIR R-03B — HANDOFF & NEXT

## Current Status
- **Repair**: `R-03B`
- **Result**: **PASS — evidence-only, zero product changes** (2026-11-03,
  local production processes; production build sourceSha `257b7c6`,
  provenance clean — see `RESULT.md`).
- **Tested baseline**: branch `rc1-repair-03b` from `rc1-repair-03a` @
  `0c2d7b9`. Scoped `src/` verified identical to the corrected union
  `rc1-union` @ `604e940` apart from the accepted R-03A fix
  (`Sites.ts`, `hierarchy.ts`) and the 17E commerce fix (`tasks.ts`),
  both outside this scope, so this result carries over to the union
  unchanged.
- **Delivered evidence** (this folder): `RESULT.md`, `NEXT.md`, journey /
  privacy / restart traces, persistence + state snapshots,
  `console-events.json`, and the journey/privacy/restart screenshots.

## What was resolved (no product repair was needed)
- The frozen 2026-10-20 run's two blockers are closed on this tree without
  code changes: the strict preview **no-store** gate passes against the
  production standalone server (the frozen failures were a Next.js
  development-runtime cache override; privacy cache failures now 0), and
  the **production build succeeds** (the frozen `node:crypto` client
  blocker is gone). The final-tree typecheck also exits 0, closing the
  frozen run's open type item (7 diagnostics in the 03D verifier).
- The full 03B contract was re-executed: two articles + one page authored
  with rich blocks/media/ordered authors, autosave + retry after an
  injected 503, reload integrity, revision restore (UI and API) with
  exact content recovery, document locks (409/423, no partial revisions),
  rollback on restore storage failure, scoped expiring previews, the full
  denial matrix, grant-revocation preview invalidation, and web+worker
  restart persistence — 51/51 supervisor checks.
- Three run failures were harness-era alignments, not product defects
  (documented in `RESULT.md`): installation-canonical fixture grants
  (a grant-less member-linked owner is deliberately unauthorized under
  the operator-grant model), API calls routed through the local HTTPS
  proxy so the preview route's same-origin check sees the real public
  origin, and the privacy phase re-issuing the author's grant (the
  journey had legitimately revoked it) before its mint/revoke sequence.

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r03b/run-local.mjs` (needs PostgreSQL up and the
  disposable `rc1r03b_main` DB owned by the local `renegade` role +
  secrets and TLS cert under `scratch/rc1r03b/`; the supervisor resets
  the DB, migrates (131), starts web+worker+HTTPS proxy, runs
  journey → privacy → web+worker restart → restart, and tears the
  processes down). The evidence directory
  `docs/rc/evidence/rc1/repairs/R-03B/` must exist before the run — the
  verifiers write their traces/snapshots into it.
- Production `APP_URL` validation requires an https, non-loopback origin,
  hence the local TLS proxy on `rc1-03b.test:38760` (web on 38759);
  Chromium launches with `--ignore-certificate-errors` and
  `--no-proxy-server` plus host-resolver rules for the `.test` hosts.
  Media upload uses a raw multipart POST with an explicit Host header
  (`fetch()` cannot set it).
- The supervisor runs journey then privacy against the **same** database
  without a reset between phases — the privacy phase reads the
  journey-created records (and depends on the grant re-issue alignment).
- A VM replacement wipes the PostgreSQL cluster: re-create the `renegade`
  role and `rc1r03b_main` (owner `renegade`) via the postgres superuser
  before running.

## Carried items (not R-03B)
- 6 media site-scope unit failures on the union tree
  (`rc1-05a-media-lifecycle` ×3, `med-01-upload-sessions` ×3) — unchanged
  by this repair (full suite 2053 passed / 11 failed, delta vs the R-03A
  baseline exactly zero); flagged for **R-05C / Pass 18 reconciliation**.
- Container/Compose proof awaits a Docker-capable host.
- Bounded items named in `RESULT.md`: fixture sessions (no passkey claim;
  R-01B covers the ceremony on this tree), web+worker process restart
  only (the 2026-10-20 PostgreSQL-restart proof stands), traces +
  screenshots rather than a browser video file.

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-03C is next only on
  the parent's instruction.
- The local stack has been torn down; disposable DB `rc1r03b_main` remains
  on the local PostgreSQL 16.15 cluster for inspection.
- Prior historical subpass reports and receipts remain intact.
