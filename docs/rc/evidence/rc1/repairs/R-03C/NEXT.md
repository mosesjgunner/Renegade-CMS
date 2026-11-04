# RC1 REPAIR R-03C — HANDOFF & NEXT

## Current Status
- **Repair**: `R-03C`
- **Result**: **PASS — evidence-only, zero product changes** (2026-11-03,
  local production processes; production build sourceSha `c6e3ae5`,
  provenance clean — see `RESULT.md`).
- **Tested baseline**: branch `rc1-repair-03c` from `rc1-repair-03b` @
  `12b2086`. Scoped `src/` verified identical to the corrected union
  `rc1-union` @ `604e940` apart from the accepted R-03A fix
  (`Sites.ts`, `hierarchy.ts`) and the 17E commerce fix (`tasks.ts`),
  both outside this scope, so this result carries over to the union
  unchanged.
- **Delivered evidence** (this folder): `RESULT.md`, `NEXT.md`,
  `journey.json` (93 checks + HTTP trace), `restart.json` (19 checks),
  `state.json`, `public-script-urls.json`, `author-archive.png`.

## What was resolved (no product repair was needed)
- The frozen 2026-10-18 run's only blocker is closed on this tree: its
  full typecheck failed with 7 diagnostics in the then-concurrent 03D
  verifier (`tests/rc1-03d/verify-import-and-build.ts:31`); that work has
  settled and `npm run typecheck` exits 0 on the pristine candidate, with
  the harness present, and on the final tree. The production build —
  unexecuted in the frozen run — now exits 0 with clean provenance.
- The complete frozen acceptance was re-executed against the production
  standalone server: publish → anonymous render → archives/feed/search/
  sitemap inclusion → slug rename (308, stored navigation follows) →
  unpublish (404 everywhere, archives empty) → protected trash
  (tombstone, history intact) and genuine hard delete → homepage
  selection with cross-site isolation → denial matrix with the persisted
  row byte-identical → production bundle boundary (9 downloaded scripts
  + both public standalone client-reference manifests free of the visual
  editor) — 93 journey checks — followed by a web+worker process restart
  **and a PostgreSQL cluster restart** with 19/19 re-verification checks.
- Two run failures were harness-era alignments, not product defects
  (documented in `RESULT.md`): installation-canonical fixture grants (a
  grant-less member-linked owner is deliberately unauthorized under the
  operator-grant model; the frozen fixture predates it) and the script
  content fetch routed through the local HTTPS proxy by loopback IP (the
  `.test` hosts exist only in Chromium's host-resolver rules, so
  Playwright's request context cannot resolve them).

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r03c/run-local.mjs` (needs PostgreSQL up and the
  disposable `rc1r03c_main` DB owned by the local `renegade` role +
  secrets and TLS cert under `scratch/rc1r03c/`; the supervisor resets
  the DB, migrates (131), starts web+worker+HTTPS proxy, runs journey →
  web+worker restart + `pg_ctlcluster` restart → restart phase, and
  tears the processes down; it creates the evidence directory
  `docs/rc/evidence/rc1/repairs/R-03C/` if missing).
- Verifier HTTP goes to the web port (38761) with explicit Host headers
  (`rc1-03c.test` / `beta.rc1-03c.test`); the anonymous browser goes
  through the HTTPS proxy (38762) with `--ignore-certificate-errors`,
  `--no-proxy-server` and host-resolver rules. Production `APP_URL`
  validation requires the https, non-loopback proxy origin.
- **A VM replacement wiped the PostgreSQL cluster before this run.** It
  was re-established with the 17C azure-only apt recipe (the stock
  mirror hangs): sources restricted to `azure.archive.ubuntu.com` via
  `/tmp/azure.list` (note: a `.list` file — a `.sources` name is parsed
  as deb822 and rejected), `postgresql-16` installed,
  `pg_ctlcluster 16 main start`, `postgres` password set, `renegade`
  role + `rc1r03c_main` created. Other repairs' databases
  (`rc1r01b_main`, `rc1r03a_main`, `rc1r03b_main`) were wiped with the
  cluster and would need re-creating before any re-run of those
  harnesses.
- `next-env.d.ts` is rewritten by every production build (its committed
  content references a Pass-16 dev dist directory): restore it
  (`git checkout -- next-env.d.ts`) before judging tree cleanliness or
  starting a definitive build, per the R-03B precedent.

## Carried items (not R-03C)
- 6 media site-scope unit failures on the union tree
  (`rc1-05a-media-lifecycle` ×3, `med-01-upload-sessions` ×3) — unchanged
  by this repair (full suite 2053 passed / 11 failed, delta vs the
  standing baseline exactly zero); **R-05C is the next repair in the
  running order and owns this territory** (Pass 18 reconciliation also
  flagged).
- Container/Compose proof awaits a Docker-capable host.
- Bounded items named in `RESULT.md`: operator Local-API mutations as
  persisted identities (no admin-browser Trash click; that was
  unexecuted in the frozen run too; no passkey claim — R-01B covers the
  ceremony on this tree), traces + screenshot rather than a browser
  video file.

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-05C is next only on
  the parent's instruction.
- The local stack has been torn down; disposable DB `rc1r03c_main`
  remains on the local PostgreSQL 16.15 cluster for inspection.
- Prior historical subpass reports and receipts remain intact.
