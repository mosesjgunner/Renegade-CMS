# Phase A — Execution Control Plane (Card A-00)

This directory is the single, commit-bound coordination and evidence system for the
Renegade CMS **Phase A WordPress-Replacement Pass** (cards A-01 through A-10). It exists
so that multiple implementation agents can execute the approved Phase A cards **in
parallel without duplicating architecture or sharing mutable runtime resources**, and so
that every capability claim is backed by reproducible, commit-bound evidence.

> **A-00 is coordination and baseline work only.** No feature was implemented or repaired,
> no roadmap was generated, and no source, schema, migration, generated-type, or production
> configuration file was changed. The only files created by A-00 live under
> `docs/execution/phase-a/**`.

---

## 1. Baseline binding (recorded at A-00 execution)

| Item                           | Value                                                  |
| ------------------------------ | ------------------------------------------------------ |
| Repository                     | `https://github.com/mosesjgunner/Renegade-CMS`         |
| Base branch                    | `main`                                                 |
| **Base commit (SHA)**          | `ae0d121652d4e6507a327f68c029c0512588bcdd` (`ae0d121`) |
| Base commit subject            | `WEB CMS FINISH PASS START`                            |
| Base commit date               | 2026-09-01 (author date 2026-08-31 -05:00)             |
| A-00 branch                    | `phase-a/a00-control-plane`                            |
| A-00 execution timestamp (UTC) | 2026-09-01T01:03:00Z                                   |
| Host OS (A-00 run)             | Linux 6.16.9+ x86_64 (Ubuntu 24.04 userland)           |

> Every implementation card MUST branch from the commit at which **A-00 is merged into
> `main`** (or a later reconciled checkpoint commit), and MUST record its own base SHA and
> final SHA in its evidence file. Do not branch from an unmerged A-00.

### Runtime / dependency versions

| Component              | Version (observed at A-00)       | Source                                                       |
| ---------------------- | -------------------------------- | ------------------------------------------------------------ |
| Node.js                | v22.23.2                         | `node --version` (repo `engines` requires `>=20.9.0`)        |
| npm                    | 10.9.8                           | `npm --version` (repo `engines` requires `>=10`)             |
| Payload CMS            | 3.88.0                           | `package.json` (`payload`, `@payloadcms/*`)                  |
| Next.js                | 16.3.0                           | `package.json`                                               |
| React / React-DOM      | 19.2.8                           | `package.json`                                               |
| TypeScript             | 5.9.2                            | `package.json` (devDependencies)                             |
| Vitest                 | 3.2.4                            | `package.json`                                               |
| Playwright test runner | 1.62.1                           | `@playwright/test`, confirmed via `npx playwright --version` |
| Prettier               | 3.6.2                            | `package.json`                                               |
| ESLint                 | 9.35.0                           | `package.json`                                               |
| Postgres adapter       | `@payloadcms/db-postgres` 3.88.0 | `package.json`                                               |

### Tooling / infrastructure availability

| Capability                  | Status at A-00                 | Notes                                                                                                                                                                              |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker engine               | **AVAILABLE** — daemon running | Docker 29.1.3; daemon reachable (`docker info` OK).                                                                                                                                |
| PostgreSQL **client**       | **AVAILABLE**                  | `psql` (PostgreSQL) 16.14.                                                                                                                                                         |
| PostgreSQL **server**       | **NOT RUNNING**                | `pg_isready` → no response on `/var/run/postgresql:5432`. Integration/migration/DB gates require an isolated disposable server (see RESOURCE_MAP.md) and were **NOT RUN** by A-00. |
| Chromium / Chrome browser   | **AVAILABLE**                  | Google Chrome 151.0.7922.137 (`chromium` shim also present).                                                                                                                       |
| Playwright browser binaries | **NOT INSTALLED**              | `~/.cache/ms-playwright` empty. Cards that run the browser suite must `npx playwright install chromium` (or use the system Chrome channel) inside their isolated environment.      |
| Playwright browser gate     | **NOT RUN** at A-00            | Requires isolated web server + browser install per card.                                                                                                                           |

### Registered migrations

- Migration files present under `src/migrations/*.ts` (excluding `index.ts`): **41**
- Migrations registered in `src/migrations/index.ts`: **41** (files and registrations match)
- Latest registered migration: `20260831_200000_member_identity_foundation`
- **Ordering note:** the final registered entries are not in strict lexical order —
  `20260831_200000_member_identity_foundation` is imported/registered _after_
  the `20260831_09xxxx…20260831_19xxxx` Phase B entries. This is not a defect for A-00
  (no migrations changed), but **new Phase A migrations MUST be globally ordered and
  collision-free** relative to the whole ledger (see SHARED_CONTRACTS.md §Generated-file
  and migration ownership).

### Generated Payload artifacts (committed baseline state)

| Artifact                 | Path                                   | State at A-00                                                         |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------- |
| Payload generated types  | `src/payload-types.ts`                 | Present and committed (11,189 lines). Treated as reconciled baseline. |
| Payload admin import map | `src/app/(payload)/admin/importMap.js` | Present and committed (single `CollectionCards` entry).               |

A-00 did **not** run `generate:types` / `generate:importmap` and did **not** modify these
files. They are **reconciled only at merge checkpoints** (see SHARED_CONTRACTS.md).

### Available verification commands (from `package.json`)

Static / non-DB (run by A-00 as baseline — results in `EVIDENCE_INDEX.md`):
`npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
(=`vitest run tests/unit`), `npm run build`.

DB / infrastructure / browser (per-card, isolated infra only):
`npm run test:integration`, `npm run test:browser` (=`playwright test`),
`npm run test:migrations:fresh`, `npm run test:migrations:upgrade`, `npm run test:smoke`,
`npm run db:migrate`, `npm run db:status`, `npm run backup:operational`,
`npm run restore:operational`, `npm run portability`, `npm run verify:release`.

### Relevant existing tests (baseline inventory)

- `tests/unit/**` — 58 files / **225 tests passing** at baseline (see EVIDENCE_INDEX.md).
- `tests/integration/**` — 13 PostgreSQL-backed acceptance suites (e.g.
  `installation.integration.test.ts`, `media-acceptance.integration.test.ts`,
  `editorial-acceptance.integration.test.ts`, `discoverability-acceptance.integration.test.ts`,
  `page-builder-acceptance.integration.test.ts`, `payload-postgres.integration.test.ts`).
  **NOT RUN at A-00** (no isolated Postgres server).
- `tests/browser/**` — `analytics-consent.spec.ts`, `events-workflow.spec.ts`,
  `global-setup.ts`. **NOT RUN at A-00**.
- `tests/smoke/stack.smoke.ts`, `tests/helpers/**`.

> The Phase A card prompts reference additional spec files (e.g.
> `tests/browser/phase-a-*.spec.ts`, `tests/unit/phase-a-*.test.ts`,
> `tests/integration/phase-a-*.integration.test.ts`). These **do not yet exist** at the
> baseline and are to be authored by the owning implementation card.

---

## 2. How to use this control plane

Each implementation agent, before writing any code, MUST:

1. Read this `README.md`, `SHARED_CONTRACTS.md`, and `RESOURCE_MAP.md` in full.
2. Confirm the **merge checkpoint / dependency** for its card in `CHECKLIST.md` is satisfied.
   A dependency is satisfied only by an ancestor commit that contains its implementation and
   recorded focused proof—not by a branch name, a checklist row, or a documentation-only commit.
   For A-09, require `evidence/A-09.md` plus a passing
   `tests/unit/phase-a-access.test.ts` at the ancestor commit before A-02/A-03/A-04 begin.
3. Use **only** the runtime resources assigned to its card in `RESOURCE_MAP.md` (Compose
   project name, ports, database names, media paths/volumes, migration-test database).
4. Write evidence **only** to its own assigned file `evidence/A-XX.md` (copied from
   `evidence/_TEMPLATE.md`). Create a bounded `remediation/A-XX-*.md` for unfinished work,
   unless the task explicitly restricts documentation writes to the evidence file; in that case,
   record the bounded remediation in that evidence file instead.
5. **Never** edit `CHECKLIST.md`, `EVIDENCE_INDEX.md`, or another card's evidence file. The
   coordinator updates the shared indexes during reconciliation.
6. If code contradicts a frozen shared contract, **stop and record it** — do not create a
   competing architecture.

## 3. Documents in this directory

| File                    | Purpose                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`             | This file — baseline binding, tooling, and operating rules.                                                                                |
| `CHECKLIST.md`          | The single status board for A-01…A-10 (status, dependency, branch, parallel group, merge state, evidence, remediation). Coordinator-owned. |
| `SHARED_CONTRACTS.md`   | Frozen repository-supported contracts + generated-file/migration ownership.                                                                |
| `RESOURCE_MAP.md`       | Unique isolated runtime resources per concurrent card.                                                                                     |
| `EVIDENCE_INDEX.md`     | Index of card evidence + A-00 baseline check results. Coordinator-owned.                                                                   |
| `evidence/_TEMPLATE.md` | Mandatory evidence template every card copies.                                                                                             |
| `evidence/A-XX.md`      | Per-card evidence (authored by owning card).                                                                                               |
| `remediation/A-XX-*.md` | Bounded remediation items for unfinished work.                                                                                             |

## 4. Explicit non-goals of A-00

Implementation; schema/migration changes; test fixes; external services; a second
architecture; Phase B work; or declaring capability readiness from documentation. A-00
proves nothing about product capability — it only makes the pass **executable**.

## Operating rules

- Each card begins from the base SHA named above, uses its Resource Map row, and writes only its assigned evidence file.
- Cards do not edit `CHECKLIST.md`, `EVIDENCE_INDEX.md`, `RESOURCE_MAP.md`, or `SHARED_CONTRACTS.md`; A-00 reconciles those shared files at checkpoints.
- Schema cards report whether regeneration is required. The checkpoint coordinator runs `npm run generate:types` and `npm run generate:importmap`, reviews the resulting tracked files, and records the result.
- New migrations are append-only, globally time-ordered names in `src/migrations/`, registered once in `src/migrations/index.ts`, and may never reuse a registered name. Reserve a final name with the coordinator before creating it.
- A card is not ready merely because its documentation says so. Its evidence must contain an explicit definition-of-done verdict.

## Existing executable surface

| Purpose                | Command                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| Formatting             | `npm run format:check`                                             |
| Lint / types / unit    | `npm run lint`; `npm run typecheck`; `npm test`                    |
| Build                  | `npm run build`                                                    |
| PostgreSQL integration | `npm run test:integration`                                         |
| Browser                | `npm run build`; `npm run test:browser`                            |
| Migrations             | `npm run test:migrations:fresh`; `npm run test:migrations:upgrade` |
| Generated files        | `npm run generate:types`; `npm run generate:importmap`             |
| Release clean clone    | `npm run verify:release`                                           |

`playwright.config.ts` currently fixes Chromium/Chrome and web server port `3110`; a concurrent card must use its allocated private browser configuration or defer browser proof to a checkpoint. The checked-in `compose.yaml` exposes PostgreSQL on `5432`; use an untracked, card-specific Compose override as specified in the Resource Map. Never attach to a shared database or `media` directory.

Relevant existing test entry points include `tests/unit/config.test.ts`, `execution-foundation.test.ts`, `operations-diagnostics.test.ts`, `operational-lifecycle.test.ts`, `operational-backup.test.ts`, `public-contracts.test.ts`, `public-navigation.test.ts`, `media-contracts.test.ts`, `media-storage.test.ts`, `portability-contracts.test.ts`, and the isolated integration suites `payload-postgres`, `installation`, `operations-jobs`, `canonical-information-architecture`, `editorial-acceptance`, `media-acceptance`, `page-builder-acceptance`, and `upgrade-migration`.

See [CHECKLIST.md](CHECKLIST.md), [SHARED_CONTRACTS.md](SHARED_CONTRACTS.md), [RESOURCE_MAP.md](RESOURCE_MAP.md), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
