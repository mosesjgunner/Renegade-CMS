# Beta release proof: Events schema repair

Date: 2026-09-24. Scope: the reported fresh-install `events.required_entitlement` failure and its supported upgrade path. This is not a nine-surface release acceptance.

## Candidate and environment

- Branch `pub-06/operational-resilience-release-gate`, HEAD `91d6108443ecd0dfecfb60ee997b8e7e6ee55d36`; initially clean working tree, branch four commits ahead of its remote. This report and one focused test are the only changes in this run. No local work was discarded.
- Windows PowerShell, Node `v24.19.0`, npm `11.17.0`, `package-lock.json`/`npm.cmd`, Next `16.3.0`, Payload `3.88.0`; PostgreSQL `17.6-alpine` in Docker. The package requires Node >=20.9 and npm >=10. README documents PostgreSQL 17.6; the audience operator guide states PostgreSQL 16+. This run proves PostgreSQL 17.6 only.
- Existing `compose.yaml` PostgreSQL service supplied the server. Disposable databases were `beta_events_20260924_release_acceptance` and `beta_events_20260924_upgrade_acceptance`; neither existed before creation. Runtime settings came from local `.env`, without recording secrets, with `RENEGADE_MODULES=all` and `RENEGADE_ALLOW_UNSAFE_COLLECTION_COUNT=true`. Fixture seed additionally used `ALLOW_FIXTURE_SEED=true`. No external provider was exercised.
- Documented install paths: `docker compose up -d --wait`, production Compose with `.env.production`, and `./install.sh --instance renegadeparty --app-url https://cms.example.com --profile Standard`. Relevant scripts: `db:migrate`, `db:status`, `db:seed`, `test:migrations:fresh`, `test:migrations:upgrade`, `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `test:browser`, and `build`.
- The named `Renegade-Beta-Release-Execution-Pass.md` was not present in this workspace or supplied attachment. This proof follows the explicit request and the earlier final release proof.

## Defect and repair

The 2026-09-23 final proof recorded 98 applied migrations while the physical `events.required_entitlement` column was absent. Seed failed with PostgreSQL `42703`; `/events` returned 500. This was code/schema drift in the migration path: the Events Payload collection declared the field but the then-complete migration sequence did not create its column. A migration ledger count by itself did not validate the runtime schema.

Current HEAD already contains the repository repair, `20260923_090000_events_required_entitlement`, registered after the supported upgrade baseline. It adds the optional `jsonb` column with `ADD COLUMN IF NOT EXISTS`, preserving existing rows. The fresh and upgrade acceptance scripts inspect the physical column, including type, nullability, and default. The upgrade script reproduces the pre-repair state with the migration ledger populated and the column absent before applying the repair; it also checks retained sentinel data and repeat migration behavior. This run added a focused test assertion that the repair remains after the upgrade baseline. The physical-schema acceptance checks would fail on the original defect.

| Defect                                          | State                                          | Evidence                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 98 recorded migrations but absent Events column | Resolved on this candidate                     | Fresh database: 101 migration rows; physical column `jsonb`, nullable, no default.                                                                                                                                                             |
| Seed fails on Events field                      | Resolved on this candidate                     | `db:seed` exit 0; two Events rows.                                                                                                                                                                                                             |
| Production `/events` returns 500                | Resolved on this candidate                     | HTTP 200 before and after standalone process restart.                                                                                                                                                                                          |
| Upgrade data preservation                       | Verified for the documented synthetic baseline | Upgrade rehearsal passed from `20260914_110000_med_05_video_workflow`; 101 migration rows and column present afterward. This fixture is constructed by the checked-in migration verifier and sentinel data, not an archived customer database. |

## Commands and results

The database URLs were derived from the local `.env` URL by replacing only the database name. The fresh verifier resets **only** a name ending `_release_acceptance`; the upgrade verifier resets **only** a name ending `_upgrade_acceptance`. No user database was reset.

1. `docker exec renegade-cms-postgres-1 createdb -U renegade beta_events_20260924_release_acceptance` and the corresponding `beta_events_20260924_upgrade_acceptance`: pass, after checking each name was absent.
2. `npm.cmd run test:migrations:fresh` with the disposable fresh `DATABASE_URL`: pass. It migrated twice and checked all 101 ledger entries and the physical Events field.
3. Physical query against the fresh database: `SELECT count(*) FROM payload_migrations` → `101`; `information_schema.columns` for `events.required_entitlement` → `jsonb:YES:NULL`.
4. `npm.cmd run db:seed` with the same database and `ALLOW_FIXTURE_SEED=true`: pass, “Canonical neutral demo information architecture is ready.” `SELECT count(*) FROM events` → `2`.
5. `npm.cmd run test:migrations:upgrade` with disposable `UPGRADE_MIGRATION_DATABASE_URL`: pass, “Upgrade rehearsal passed: 20260914_110000_med_05_video_workflow -> current.” Post-run ledger → `101`; physical Events column count → `1`.
6. `npm.cmd run typecheck`: pass. `npm.cmd run build`: pass; `/events` is a dynamic production route. `npm.cmd exec -- vitest run tests/integration/upgrade-migration.integration.test.ts tests/unit/pre-05-legacy-migration.test.ts`: 11/11 pass before the new ordering assertion; rerun below records the edited test.
7. Started `npm.cmd run start` on port 3333 with the fresh database: `/events` HTTP `200`, body length `13836`. Stopped it and started `node .next/standalone/server.js` with `NODE_ENV=production`: `/events` HTTP `200`, body length `13836`, Events heading present. The standalone process used the same persisted database and no reseed.

## Remaining limits

The earlier 98-migration database was not modified or reused. The upgrade fixture has verified migration lineage, but it is synthetic and cannot prove every historical customer state. The missing shared beta contract prevents a claim that its additional gates were met. Full integration, browser, provider, restore, and nine-surface gates were outside this focused repair proof. Beta remains blocked on any separate release-gate failures recorded in the final nine-surface proof; this report resolves only the named Events schema/seed/route blocker.
