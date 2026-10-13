# Stage 03 Gemini Verification Log

## Execution Environment

- **Date**: 2026-10-12
- **Host**: Windows Local Environment (Node v24.19.0, npm 11.1.0)
- **Database**: PostgreSQL (Container `renegade-cms-postgres-1`, port 5432)
- **Acceptance DB**: `renegade_rc02_1791848788612_release_acceptance` (disposable acceptance DB ending in `_release_acceptance`)
- **Media Dir**: `scratch/renegade_rc02_1791848788612_release_acceptance-media`
- **Configuration**: `.env.rc02` with `LOCAL_E2E_TEST_MODE=false`, `APP_URL=https://dispatch.rc02.test:3129`
- **TLS Certificate**: Self-signed 365-day certificate for `dispatch.rc02.test` in `scratch/rc02-tls/`

---

## Quality Gates Summary

| Gate / Command                            | Exit Code | Result | Details                                                                                 |
| ----------------------------------------- | --------- | ------ | --------------------------------------------------------------------------------------- |
| `npm.cmd run typecheck`                   | 0         | PASS   | `tsc --noEmit` completed with zero TypeScript errors                                    |
| `npm.cmd run lint`                        | 0         | PASS   | `eslint . --max-warnings=0` passed cleanly                                              |
| `npm.cmd run format:check`                | 0         | PASS   | `prettier --check .` passed cleanly on all repository files                             |
| `npm.cmd test`                            | 0         | PASS   | 189 test files passed, 1,241 unit tests passed, 0 failed                                |
| `npm.cmd run build`                       | 0         | PASS   | Next.js 16.3.8 production standalone build compiled in 28.6s, 144 static/dynamic routes |
| `npm.cmd run verify:presentation-bundles` | 0         | PASS   | Public bundle isolation verified (excludes Puck and editor code)                        |

---

## Stage 03 Acceptance Suites

### 1. Browser Acceptance Suite (`tests/rc02/site-build.spec.ts` & `tests/rc02/staff-invitation.spec.ts`)

- **Command**: `npx.cmd playwright test tests/rc02/site-build.spec.ts tests/rc02/staff-invitation.spec.ts --config=playwright.rc02.config.ts`
- **Environment**: Chromium headless with virtual WebAuthn authenticator, production standalone server (`https://dispatch.rc02.test:3129`)
- **Outcome**: **7 passed**, 0 failed, 0 skipped (duration: 2.2m)
- **Test Cases**:
  1. `tests/rc02/site-build.spec.ts`: Ordinary operator builds Renegade Party Dispatch from an empty install (1.3m) — **PASS**
  2. `tests/rc02/staff-invitation.spec.ts`: Owner invites staff through Security, staff enrolls and logs in with WebAuthn (15.3s) — **PASS**
  3. `tests/rc02/staff-invitation.spec.ts`: Administrator invitation, passkey enrollment and privilege bounds (4.8s) — **PASS**
  4. `tests/rc02/staff-invitation.spec.ts`: Identity negatives: expired invitations, wrong WebAuthn origin/challenge (26ms) — **PASS**
  5. `tests/rc02/staff-invitation.spec.ts`: Session revocation and role protection (2.5s) — **PASS**
  6. `tests/rc02/staff-invitation.spec.ts`: Supported offline owner recovery CLI rotates credentials and revokes sessions (10.9s) — **PASS**
  7. `tests/rc02/staff-invitation.spec.ts`: Real browser document lock acquisition, conflict, and release (5.6s) — **PASS**

### 2. Two-Site Five-Actor Runtime Authorization & Tenant Boundary Matrix (`tests/integration/tenant-authorization-matrix.integration.test.ts`)

- **Command**: `node --env-file=.env.rc02 scripts/run-integration.mjs tests/integration/tenant-authorization-matrix.integration.test.ts`
- **Environment**: Real Payload instance against acceptance database, no mock objects
- **Outcome**: **21 passed**, 0 failed (duration: 4.56s)
- **Verified Capabilities**:
  - Grant context resolution across Owner, Administrator, Staff, Member, and Anonymous.
  - Permitted reads and mutations for Owner (global) and Administrator/Staff (Site A).
  - Cross-tenant ID substitution attacks denied: Admin A cannot read/mutate Site B organizations or merchant connections; Staff A cannot read/mutate Site B articles or private media; Staff A cannot access Site B carts.
  - Unprivileged/anonymous boundaries: Member A and Anonymous denied access to operator collections and drafts.
  - Persistence assertion: denied mutations leave protected state unchanged.
  - Feature profiles & module registration: Lean, Standard, and Enabled-all runtime evaluations verified.

### 3. Core Integration Regression Suite

- **Command**: `node --env-file=.env.rc02 scripts/run-integration.mjs tests/integration/disc-06-discovery-pass-gate.integration.test.ts tests/integration/setup-first-run.integration.test.ts tests/integration/pre-06-presentation-pass-gate.integration.test.ts tests/integration/pub-04-publishing-floor.integration.test.ts tests/integration/rc08d-lock-projection.integration.test.ts`
- **Outcome**: **5 files passed, 33 tests passed**, 0 failed (duration: 29.75s)
- **Verified Capabilities**:
  - `disc-06-discovery-pass-gate.integration.test.ts` (9 tests passed): canonical URLs, OpenGraph/Twitter cards, Schema.org graph, sitemaps, robots.txt, feeds, full-text search.
  - `setup-first-run.integration.test.ts` (6 tests passed): first-run onboarding provisioning, handle uniqueness, Lean & Standard lifecycle.
  - `pre-06-presentation-pass-gate.integration.test.ts` (4 tests passed): theme lifecycle, reusable layouts, global announcements, legacy migration preflight & rollback.
  - `pub-04-publishing-floor.integration.test.ts` (6 tests passed): draft isolation from public body index, immediate indexing on publish, navigation menus, byte uploads.
  - `rc08d-lock-projection.integration.test.ts` (8 tests passed): document lock acquisition, conflict prevention, heartbeat renewal, and release API.
