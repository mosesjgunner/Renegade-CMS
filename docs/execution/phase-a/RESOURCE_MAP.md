# Phase A — Resource Map (isolation contract)

Every card is assigned **unique** runtime resources so concurrent cards never share a
mutable runtime resource. Concurrent cards MUST NOT:

- share a PostgreSQL database, media directory/volume, Playwright/web port, migration ledger
  test database, generated Payload type file, import map, or evidence artifact; or
- edit the shared checklist (`CHECKLIST.md`) or another card's `evidence/A-XX.md`.

Each card writes only its assigned evidence file; the coordinator updates shared indexes
during reconciliation. The Phase A default Playwright base URL is `http://127.0.0.1:3110`
(`playwright.config.ts`) and the default dev DB port is `5432` — **all per-card resources
below deliberately avoid `3110` and `5432`.**

## Per-card resource allocation

| Card | Compose project name | Web app port | Playwright server port | App database | Migration-test database | Postgres host port | Media path | Media volume | Evidence file |
|---|---|---|---|---|---|---|---|---|---|
| A-01 | `renegade_a01` | 3101 | 3201 | `renegade_a01` | `renegade_mig_a01` | 5433 | `.phase-a/a01/media` | `renegade_a01_media` | `evidence/A-01.md` |
| A-02 | `renegade_a02` | 3102 | 3202 | `renegade_a02` | `renegade_mig_a02` | 5434 | `.phase-a/a02/media` | `renegade_a02_media` | `evidence/A-02.md` |
| A-03 | `renegade_a03` | 3103 | 3203 | `renegade_a03` | `renegade_mig_a03` | 5435 | `.phase-a/a03/media` | `renegade_a03_media` | `evidence/A-03.md` |
| A-04 | `renegade_a04` | 3104 | 3204 | `renegade_a04` | `renegade_mig_a04` | 5436 | `.phase-a/a04/media` | `renegade_a04_media` | `evidence/A-04.md` |
| A-05 | `renegade_a05` | 3105 | 3205 | `renegade_a05` | `renegade_mig_a05` | 5437 | `.phase-a/a05/media` | `renegade_a05_media` | `evidence/A-05.md` |
| A-06 | `renegade_a06` | 3106 | 3206 | `renegade_a06` | `renegade_mig_a06` | 5438 | `.phase-a/a06/media` | `renegade_a06_media` | `evidence/A-06.md` |
| A-07 | `renegade_a07` | 3107 | 3207 | `renegade_a07` | `renegade_mig_a07` | 5439 | `.phase-a/a07/media` | `renegade_a07_media` | `evidence/A-07.md` |
| A-08 | `renegade_a08` | 3108 | 3208 | `renegade_a08` | `renegade_mig_a08` | 5440 | `.phase-a/a08/media` | `renegade_a08_media` | `evidence/A-08.md` |
| A-09 | `renegade_a09` | 3109 | 3209 | `renegade_a09` | `renegade_mig_a09` | 5441 | `.phase-a/a09/media` | `renegade_a09_media` | `evidence/A-09.md` |
| A-10 | `renegade_a10` | 3120 | 3220 | `renegade_a10` | `renegade_mig_a10` | 5450 | `.phase-a/a10/media` | `renegade_a10_media` | `evidence/A-10.md` |

> A-08 (backup/restore) additionally needs a **disposable restore target** distinct from its
> source. Use Compose project `renegade_a08_restore`, database `renegade_a08_restore`,
> Postgres host port `5442`, media volume `renegade_a08_restore_media`, web port `3118`. The
> restore target MUST be a genuinely fresh isolated instance — never the source DB or source
> media volume.
>
> A-10 (final gate) runs from a **clean clone** with no reused `node_modules`, env file, DB
> volume, media volume, cookies, or saved browser state, using only its own resources above.

## How each card wires its isolation

- **Database URL:** `DATABASE_URL=postgresql://renegade:renegade_dev_only@localhost:<host port>/<app database>`
  (dev credentials only; never a production DB). Bring up an isolated Postgres via Docker,
  e.g. `docker run --rm -e POSTGRES_USER=renegade -e POSTGRES_PASSWORD=renegade_dev_only -e POSTGRES_DB=<app database> -p <host port>:5432 --name <compose project>_db postgres:16`.
- **Media:** set `MEDIA_DIR=<media path>` (repo default is `./media`; override per card so no
  two cards write the same directory). For Compose, use the named volume `<media volume>`.
- **Migration-test DB:** the fresh/upgrade migration scripts
  (`test:migrations:fresh` / `test:migrations:upgrade`) must target `<migration-test
  database>`, never the app database.
- **Web/Playwright ports:** run the app under test on `<web app port>`; point Playwright's
  `webServer`/`baseURL` at `<playwright server port>` (override `playwright.config.ts`'s
  default `3110` for the card run). Never bind `3110` or `5432` during a concurrent card.
- **Docker isolation:** always pass `-p <compose project>` (COMPOSE_PROJECT_NAME) so
  networks/volumes/containers are namespaced per card and teardown is clean.

## Evidence filename ownership (unique, one writer)

| Card | Sole writable evidence file | Remediation namespace |
|---|---|---|
| A-01…A-10 | `evidence/A-01.md` … `evidence/A-10.md` | `remediation/A-01-*.md` … `remediation/A-10-*.md` |
| Coordinator only | `CHECKLIST.md`, `EVIDENCE_INDEX.md`, `evidence/BASELINE.md` (if used) | — |

A card writing outside its assigned evidence/remediation namespace, or editing the checklist
or another card's evidence, is a **coordination violation** and its run is invalid.

## Isolation checklist (per card, before running gates)

1. Confirm no other card is using your ports/databases/volumes right now.
2. Export `COMPOSE_PROJECT_NAME`, `DATABASE_URL`, `MEDIA_DIR`, and Playwright port for your
   card only.
3. Never point at `5432`, `3110`, the repo default `./media`, or a production database.
4. Tear down your Docker project (`docker compose -p <project> down -v`) after the run.
