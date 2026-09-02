# Phase A — Evidence Index (coordinator-owned)

Bound to base commit `ae0d121652d4e6507a327f68c029c0512588bcdd` (`main`).
A-00 execution: 2026-09-01T01:03:00Z on Linux 6.16.9+ x86_64, Node v22.23.2, npm 10.9.8.

> Only the coordinator updates this file. Implementation cards write `evidence/A-XX.md`.

## Card evidence status

| Card | Evidence file | State | Verdict |
|---|---|---|---|
| A-01 | `evidence/A-01.md` | Not yet authored | — |
| A-02 | `evidence/A-02.md` | Not yet authored | — |
| A-03 | `evidence/A-03.md` | Not yet authored | — |
| A-04 | `evidence/A-04.md` | Not yet authored | — |
| A-05 | `evidence/A-05.md` | Not yet authored | — |
| A-06 | `evidence/A-06.md` | Not yet authored | — |
| A-07 | `evidence/A-07.md` | Not yet authored | — |
| A-08 | `evidence/A-08.md` | Not yet authored | — |
| A-09 | `evidence/A-09.md` | Not yet authored | — |
| A-10 | `evidence/A-10.md` | Not yet authored | — |

---

## A-00 baseline check results (nondestructive, on base commit)

All commands run from a clean `npm ci` at `ae0d121`. Exit codes are exact and recorded
honestly. These results are the **baseline the implementation cards inherit** — several
static gates fail on `main` *before any Phase A work*; cards must not attribute these
pre-existing failures to their own changes, and A-00 did not fix them (test fixes are an
explicit non-goal of A-00).

| # | Command | Exit code | Result | Detail |
|---|---|---|---|---|
| 1 | `npm ci` | 0 | **PASS** | Clean install from `package-lock.json`. (npm audit advisories present; not gating.) |
| 2 | `npm run format:check` | 1 | **FAILED (pre-existing)** | Prettier reports code-style issues in **41 files**. Not fixed by A-00. |
| 3 | `npm run lint` | 1 | **FAILED (pre-existing)** | ESLint: **1 error** — `tests/unit/member-identity.test.ts:31:18` `prefer-rest-params` ("Use the rest parameters instead of 'arguments'"). 0 warnings. |
| 4 | `npm run typecheck` | 2 | **FAILED (pre-existing)** | `tsc --noEmit`: **1 error** — `src/app/(frontend)/api/realtime/drafts/[articleId]/checkpoint/route.ts(14,12): error TS2304: Cannot find name 'RouteContext'`. |
| 5 | `npm test` (`vitest run tests/unit`) | 0 | **PASS** | **58 files / 225 tests passed** (~15.6s). Includes one intentional "deliberate failure" assertion inside `verification-contract.test.ts` that passes. |
| 6 | `npm run build` | 0 | **PASS** | `next build` completed; all routes compiled (public, admin, setup, login, media, search, sitemap, robots, etc.). |

### DB / Docker / browser gates — NOT RUN at A-00

Run only with safely isolated infrastructure (see RESOURCE_MAP.md). At A-00 no isolated
Postgres server was running, and Playwright browser binaries were not installed, so these
were **NOT RUN** (never "passed"):

| Gate | Status | Reason |
|---|---|---|
| `npm run test:integration` (13 Postgres suites) | **NOT RUN** | No isolated Postgres server (`pg_isready` → no response on :5432). |
| `npm run test:browser` (Playwright) | **NOT RUN** | Playwright browser binaries not installed (`~/.cache/ms-playwright` empty); requires isolated web server. |
| `npm run test:migrations:fresh` / `:upgrade` | **NOT RUN** | Requires isolated migration-test database. |
| `npm run test:smoke` | **NOT RUN** | Requires running stack. |
| Production installer / Compose smoke | **NOT RUN** | Requires disposable isolated environment (Docker daemon is available for cards that provision it). |

### Environment facts captured

| Item | Value |
|---|---|
| Docker | 29.1.3, daemon running (available for isolated card infra) |
| PostgreSQL client | 16.14 (server NOT running at A-00) |
| Chrome | Google Chrome 151.0.7922.137 (Playwright browsers not installed) |
| Playwright runner | 1.62.1 (via `npx playwright`) |
| Registered migrations | 41 (files == registrations) |
| Generated types | `src/payload-types.ts` present (11,189 lines), committed baseline |
| Import map | `src/app/(payload)/admin/importMap.js` present, committed baseline |
| `git diff --check` | clean (exit 0) on base and after A-00 doc additions |

> A-00 makes **no capability claim**. Passing static gates (build/unit) and unrun
> DB/browser gates prove only that the pass is executable; they do not certify any Phase A
> product capability. Capability is proven only by the cards' reproduced evidence and A-10.
