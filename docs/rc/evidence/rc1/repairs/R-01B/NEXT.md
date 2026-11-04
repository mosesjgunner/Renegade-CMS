# RC1 REPAIR R-01B — HANDOFF & NEXT

## Current Status
- **Repair**: `R-01B`
- **Result**: **PASS** (2026-11-03, union-tree re-verification on local production
  processes; the 2026-11-02 container PASS stands as the container proof — see
  `RESULT-2026-11-02-container.md`, preserved alongside this file as
  `NEXT-2026-11-02-container.md`).
- **Tested baseline**: union base `rc1-repairs` @ `8cd1993`; production build
  sourceSha `903c117` (provenance clean); harness commits `903c117` + `e9a3f38` on
  branch `rc1-repair-01b`. Scoped identity/setup/recovery code verified
  byte-identical to the corrected union `rc1-union` @ `604e940`, so this result
  carries over (see RESULT.md, "Base caveat").
- **Delivered evidence** (this run): `RESULT.md`, `db-assertions-local.json`,
  `setup-local.png`, `login-local.png`, `recovery-local.png`,
  `post-restart-local.png`, `trace-local.zip`, `web-local.log`, `worker-local.log`.

## What was verified (no product-code changes required)
- The 2026-11-02 product repair (starter-content Lexical `body` in
  `src/modules/operations/onboarding.ts` via exported `toLexicalDocument` in
  `src/modules/starters/service.ts`) is present in the union tree and exercised
  green end-to-end: ordinary no-test-mode owner setup, passkey enrollment,
  clean-context login, recovery-code lifecycle (issue/use/replay-denial), token
  denials (400/410), interrupted-setup CLI recovery, web-process restart
  persistence, post-restart login, revoked-session denial.

## Harness notes for future local runs (Docker-less hosts)
- Run: `node tests/rc1-r01b/run-local.mjs` (needs PostgreSQL up and the disposable
  `rc1r01b_*` role/DB + secrets under `scratch/rc1r01b/`; the supervisor resets
  the DB, migrates, starts web+worker+TLS proxy, warms `/setup`, runs Playwright,
  and tears everything down — including on failure paths).
- The supervisor must never block its own event loop (`spawnSync`) while the
  journey runs: the proxy and restart watcher live in that process. Both the
  warm-up and the Playwright invocation are async for this reason.
- The browser child must not inherit the sandbox egress proxy (`--no-proxy-server`
  + stripped env), or `.test` navigation dies with `ERR_TUNNEL_CONNECTION_FAILED`.
- Playwright browsers live in `/home/hatch/.cache/ms-playwright/` (chromium-1234 +
  headless shell, Chrome for Testing 151.0.7922.34); if a VM replacement wipes
  them, re-download via curl (Playwright's own installer times out through the
  egress proxy) and keep the zips out of the 512M `/tmp` tmpfs.

## Carried items (not R-01B)
- 6 media site-scope unit failures on the union tree
  (`rc1-05a-media-lifecycle` ×3, `med-01-upload-sessions` ×3, "Site scope access
  denied") — flagged for **R-05C / Pass 18 reconciliation**; see RESULT.md.
- Container/Compose proof of the R-01B journey on the union tree awaits a
  Docker-capable host; the container variant already exists
  (`tests/rc1-r01b/owner.spec.ts`, `playwright.r01b.config.ts`).

## Instructions for Next Subpass / Operator
- Do not execute subsequent repairs automatically. R-03A is next only on the
  parent's instruction.
- The local stack has been torn down; disposable DB `rc1r01b_main` remains on the
  local PostgreSQL 16.15 cluster for inspection.
- Prior historical subpass reports and receipts remain intact.
