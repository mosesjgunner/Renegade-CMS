# RC1 17F — Fresh/upgrade migrations and rollback boundaries

## Status

**PASS** (2026-11-02), bounded exactly as stated below. Deployment,
schema-change and upgrade/rollback claims for RC1 are now factual and
narrow: full fresh migrations, the supported synthetic fixture upgrade,
schema convergence, and the supported rollback boundary were all executed
against disposable PostgreSQL databases on this tree. **No historical
customer upgrade is claimed** — no qualifying predecessor artifact exists
(see Claim boundaries), and the synthetic fixture upgrade is never
described as one. The Compose-bound operational CLIs were not executed
(Docker is unavailable on this VM — 17C's definitive finding); their
data-plane product functions were exercised directly, per the 17C/17D
precedent, and the literal container invocations join the Docker-host
track already open for 17C/17D.

## Base and containment

- Base: `f0f4e7f` (17E PASS) on local branch `rc1-17f`. **No product code
  changed.** 17F adds only the disposable acceptance harness
  `tests/rc1-17f/` (commit `78bbc3c`) and this evidence — a valid
  no-change verification: every behavior the prompt requires already
  ships and now has current-tree proof.
- Source containment: 1,636 files, SHA-256
  `bdce4ecee20f76750adbcab2aec97e27f84665a5eb08f8835de487a8d54f69d0`
  (`source-tree.json`, frozen before the final run and `--check`
  verified after it).
- Full-project `npx tsc --noEmit`: exit 0 on the final tree (see
  Verification).
- Environment: PostgreSQL **16.15** local (CI uses 17.6 — recorded
  verbatim, never upgraded). App version `0.1.0`. Node v24.22.1.
  Disposable databases: `rc117f_release_acceptance`,
  `rc117f_upgrade_acceptance`, `rc117f_commerce_release_acceptance`,
  `rc117f_rollback_source`, `rc117f_rollback_restored`; web on
  `127.0.0.1:39175`. No live charge, message, payout or external post
  occurred.

## Acceptance run (harness `tests/rc1-17f/run.sh`, 33/33 checks)

### Fresh migrations (3/3 — `trace-fresh.json`)

The shipped verifier (`npm run test:migrations:fresh`) ran against an
empty dedicated database: all **131 migrations** applied, applied again
(idempotent), `payload_migrations` holds every migration exactly once,
and the built-in runtime schema assertions (publishing + UUID) pass.
The additive shape the prompt calls out is asserted by the verifier
itself: `events.required_entitlement` exists as a nullable `jsonb`
column with no default. The operator command `npm run db:status` runs
clean against the fresh database (last ledger rows show batch 1 / Yes).

### Synthetic fixture upgrade (3/3 — `trace-upgrade.json`)

The shipped verifier (`npm run test:migrations:upgrade`) ran the
supported baseline `20260914_110000_med_05_video_workflow` (56 of 131
migrations) → current: a 12-record sentinel fixture created against the
baseline-only schema survives all 75 subsequent migrations with
identity, slugs, canonical paths, timestamps and relationships intact;
the safe rights default is backfilled onto existing media; the Payload
Jobs and media-purpose enums gain their post-baseline values; the
Events entitlement column arrives with the exact additive shape; and
that migration's own `down()` removes the column, double `up()` replays
it idempotently, and the sentinel content survives the round trip.
Post-upgrade Payload boot/read/write is proven inside the verifier.
The upgraded ledger holds all 131 migrations exactly once, and the
sentinel article row is directly confirmed in the upgraded database.

### Commerce migrations (1/1 — `trace-commerce.json`)

The shipped commerce verifier rehearsed the commerce migration subset
from its own baseline (applied twice) and confirmed every commerce
table/column it gates on.

### Schema drift (4/4 — `trace-drift.json`)

The two supported paths to the current schema were compared in full —
public table set, column set (type, nullability, default), enum label
set, and index definitions — between the fresh-install database and
the fixture-upgraded database. **All four inventories are identical:
zero drift.** A schema produced by upgrading is the schema a fresh
install gets.

### Additive inspection (3/3 — `trace-additive.json`)

The migration index exports exactly the 131 files on disk. All 75
post-baseline migrations were scanned (up-region only) for destructive
operations. One hit, dispositioned here on the record:
`20260920_080000_aud_08_audience_pass_gate` contains a **conditional**
`DROP TABLE IF EXISTS "email_delivery_events" CASCADE` + recreate,
guarded by an information-schema check that fires only when that
table's `delivery_id` column still has the legacy `integer` type (a
corrective rebuild of a pre-release table shape whose key type was
incompatible with the UUID identity model). The rest of that migration
is strictly additive (`ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT
EXISTS`, `CREATE INDEX IF NOT EXISTS`). No other post-baseline
migration drops or truncates anything in its up path. Generated types
cover the post-baseline collections (`form-definitions`, `experiments`,
`network-relationships` all present in `src/payload-types.ts`); the
admin import map is populated (52 imports). Convention note: only 11
of 131 migrations carry drizzle JSON snapshots — the remainder are
hand-authored SQL migrations, which is this codebase's norm, not a gap.

### Rollback boundaries (15/15 — `trace-rollback.json`)

The supported rollback story was rehearsed end-to-end natively:

1. A fixture database was migrated to the synthetic baseline only (56
   migrations) and seeded with sentinel site/member/profile/space/
   publication/media/content rows (introspection-driven seeding against
   the baseline schema) plus two sentinel media files.
2. A **pre-upgrade operational backup** was captured with the product's
   own machinery — `pg_dump -Fc` + media tar with the shipped
   exclusions, manifest built by `createOperationalBackupManifest`
   (recording app version `0.1.0`, source HEAD, PostgreSQL 16.15 and
   the 56-name migration ledger) — and `verifyOperationalBackup`
   passes on it.
3. The product lifecycle guards were exercised on the real states:
   image rollback is permitted when the ledger is unchanged; it is
   **refused** when the ledger moves, with the error directing the
   operator to restore the pre-upgrade backup; restore version
   compatibility accepts same-version and same-major-forward restores
   and refuses cross-major and newer-into-older; destructive
   operations require an explicitly confirmed maintenance window; the
   upgrade plan is the documented seven steps with backup verified
   before migrations.
4. A byte-corrupted copy of the archive is **rejected by checksum
   verification** before any restore touches a target.
5. The database was then upgraded in place (56 → 131 migrations); the
   sentinel content survives with identity and canonical data intact.
6. On the real post-upgrade ledger, image rollback is refused — and
   the supported recovery, restoring the pre-upgrade archive into an
   isolated database + media directory, was executed: the restored
   ledger equals the 56-name baseline ledger exactly, the restored
   sentinel rows are **byte-identical** (row-hash equality) to the
   pre-upgrade rows, and both media files are byte-identical.

### Operator commands (3/3 — `trace-operators.json`)

Reproducibility review of install/restore/disaster-recovery/
multi-instance operation: all 19 distinct `npm run …` commands
referenced by `docs/OPERATIONAL_BACKUP.md`,
`docs/PRODUCTION_DEPLOYMENT.md`, `docs/RELEASE_CHECKLIST.md` and
`README.md` exist in `package.json`. `docs/OPERATIONAL_BACKUP.md`
states the rollback boundary factually and matches the code ("The
migration ledger is the rollback boundary… it never runs down
migrations. If the upgrade added a migration, restore the
pre-upgrade archive"). The production Compose file defines the
one-shot `migrate` service and gates web/worker on it (the
multi-instance migration discipline: migrations run once, before
normal operation; `docs/PRODUCTION_DEPLOYMENT.md` forbids running it
concurrently with an upgrade), and the operations execution-lock
module ships. One documentation staleness note, non-blocking: the
backup doc's embedded test-count line ("38 test files, 147 tests")
predates the current 278-file suite; the commands it documents are
all real.

### Web proof on the upgraded database (1/1 + observations — `trace-web.json`)

`next dev` booted against the **fixture-upgraded** database:
`/health/ready` 200, homepage 200, and the sentinel article created
at the baseline schema renders publicly at its canonical path
(`/blogs/upgrade-sentinel/upgrade-sentinel-article`, 200, title in the
served HTML) — real pre-upgrade data, observed through the ordinary
public path after 75 migrations.

## Claim boundaries (what RC1 may and may not say)

- **Supported:** fresh install migrates cleanly to the current schema;
  an installation at the synthetic baseline `20260914_110000_med_05_video_workflow`
  upgrades to current with data intact (fixture evidence); image
  rollback when an upgrade changed no migrations; recovery from a
  schema-changing upgrade by restoring the pre-upgrade operational
  backup (17D + this subpass).
- **Explicitly unavailable:** historical customer-upgrade proof. Per
  `docs/rc/RC1-SCOPE.md`, an advertised customer upgrade requires an
  immutable predecessor commit/image digest plus a secret-excluded
  DB/media backup created through that predecessor's supported
  workflows. No qualifying artifact exists in the inspected receipts;
  none was manufactured here. Universal customer upgrades remain
  outside the RC1 claim.
- **No future-version guarantees** are made anywhere in this evidence:
  nothing here promises that a future release's migrations will be
  additive or that rollback will remain ledger-only.
- **Unexecuted (Docker-host track, with 17C):** the literal
  `upgrade:operational` / `rollback:operational` Compose invocations
  and `restore:rehearsal` CLI run. Their guards, manifest, plan and
  data-plane functions are the exact code those CLIs call, and all of
  them were executed above; the container orchestration layer is what
  remains, reproducible from 17C's NEXT.md on Matthew's Windows host.

## Verification

- Harness: 33/33 checks across 8 traces (fresh 3, upgrade 3, commerce
  1, drift 4, additive 3, rollback 15, operators 3, web 1).
- Focused units: `operational-lifecycle`, `operational-backup`,
  `operational-compose` — 10/10.
- Full unit suite (`npm test`): **2041 passed / 5 failed** — the five
  failures are exactly the named pre-existing set (flow-04-acceptance,
  payload-domains, rc1-04d-campaign-commerce, shop-08 ×2). Baseline
  held; 17F changed no product code.
- Full-project `npx tsc --noEmit`: exit 0 on the final tree.
- Process note: in the unified `run.sh all` run, the rollback journey
  process wrote its complete 15/15 trace and then hung on exit (a
  dangling handle in the harness process, not product code); the run
  was terminated and the operators/web phases were completed as
  separate invocations against the same frozen tree, after which
  provenance `--check` passed. All 33 checks above are from the frozen
  tree `bdce4ece…`.

## Open blockers

None inside 17F's scope. Carried to Pass 18 (see NEXT.md): 17C's
production-image proof (Matthew's Windows run, deferred to Nov 3),
the 15C record gap, CI run #174, the 5 named unit failures, older NOT
READY rows 05C/09D/14A, 17B's advisory follow-ups, and the Pass 18
independence question.
