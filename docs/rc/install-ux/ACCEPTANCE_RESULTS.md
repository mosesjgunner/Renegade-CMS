# RC3-UX-INSTALL-01 — Acceptance results

Candidate: branch `rc3-ux-install-01`, head `fe1d296` (docs) on top of code
head `3d630f7`; baseline main `0e7a0d5138b3c504ec17ad0e3911a7efb8b69be8`
verified by fetch. Build manifest: "Built source
fe1d2966d3bfc154c7663affa0a5b9c0b3d34a1e; clean source: true."
Full transcripts live in the RC goal folder:
`files/rc3-ux-install-01-evidence/`.

## Engineering checks on the final tree

| Check                                                                       | Result                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format (prettier, touched files)                                            | PASS                                                                                                                                                                                                                                                                                      |
| Lint (eslint, touched files)                                                | PASS                                                                                                                                                                                                                                                                                      |
| Typecheck (`tsc --noEmit`, whole project)                                   | PASS (clean after the ResourceProfile fix)                                                                                                                                                                                                                                                |
| Unit gate (`vitest run tests/unit --no-file-parallelism`)                   | **PASS — 2,126/2,126 tests, 288 files** (matches baseline count; no regressions)                                                                                                                                                                                                          |
| Installer harness (`tests/installer/install-sh.test.sh`, stubbed docker/ss) | **PASS — 12/12**                                                                                                                                                                                                                                                                          |
| Installation integration (existing + new resume/rotation suites)            | **PASS — 8/8**                                                                                                                                                                                                                                                                            |
| Full integration suite (`scripts/run-integration.mjs`, acceptance DB)       | **PASS — 389/389 tests, 68 files** (first attempt failed environmentally: the acceptance DB had been wiped by a VM replacement and was re-created empty mid-run; after re-migrating it, the suite passed in full — transcript preserved)                                                  |
| Production build (`npm run build`, Turbopack)                               | **PASS** — compiled in 3.7 min, standalone produced. Six earlier attempts died silently in the compile phase under multi-pass contention (two other passes' builds died the same night); the identical tree built cleanly in a quiet window, and the build log records the candidate SHA. |
| Stack smoke (canonical order: migrate → seed → smoke)                       | **PASS** — "Next.js public/admin routes and Payload PostgreSQL persistence are operational." Two earlier attempts failed on fixture order (seed skipped); recorded, not hidden.                                                                                                           |

## Fresh-install proof (production standalone server, fresh database)

Environment: this VM, PostgreSQL 16, standalone server on
`http://localhost:3110`, database created empty and migrated cold
(137 migrations applied, rc=0).

- Readiness before setup: `ready=true`, database connected, **137/137**
  migrations — the live numbers, replacing the old hardcoded "108/108".
- Browser journey (real Chromium, virtual WebAuthn authenticator, driven
  over HTTP against the production server): **15/15 checks PASS** —
  setup renders; token minted to the operator log; slug auto-derives;
  provider card shows the live 137/137 count; no "Deployment profile"
  mislabel; completion renders 10 recovery codes exactly once; copy and
  download controls present; "Open Admin Studio" gated until the
  saved-codes acknowledgment, ungated after; owner session cookie set;
  logged-out visitor loads the public site (200) and sees the site name;
  /setup permanently locked after completion.
- Resume contract over HTTP: begin with token → 200 + enrollment cookie;
  second options call with cookie only → **200** (rotation works);
  forged cookie → 400; `/setup` with cookie renders resume mode
  ("already started for …"); `/setup` without cookie stays locked.
- Restart persistence: server restarted after completion — public site
  200 with the site name, `/setup` reports "Setup Complete", readiness
  shows `installationState: complete`, 137/137.

## Blocked / not verified (unchanged honesty list)

- **Docker-path install proof: BLOCKED** — no Docker daemon in this
  environment. Installer behavior is proven by the stubbed harness only.
- **Public HTTPS / claim over a real domain: BLOCKED** — no domain or
  public host authority in this environment.
- **UXI-14 human validation: BLOCKED** — no participants recruited
  (external action). The test kit is prepared; no participant numbers
  exist and none are claimed.
- **Playwright spec `tests/browser/first-run-setup.spec.ts`: NOT RUN** —
  in this environment the spec's in-process Payload import fails module
  resolution (`next/link` under the Playwright ESM loader) before any
  test executes. The equivalent journey was proven with a standalone
  Playwright-library script against the same production server
  (15/15 above), which is browser evidence of the same path, obtained a
  different way. The spec itself remains unverified here.
- Release-image signing: does not exist upstream; digest pinning is the
  documented verification. NOT VERIFIED as signatures — because there
  are none.
