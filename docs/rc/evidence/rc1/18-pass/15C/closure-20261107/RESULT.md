# RC1 15C closure — PASS

2026-11-07 (America/Chicago). Scope: close the 15C proof gap. The
original run's automated half is recorded in `../commands.json`
(unit, lint, format, typecheck, fresh-migration — all green on
Matthew's Windows machine), but the two mandatory runtime traces,
`journey-trace.json` and `restart-trace.json`, were never pushed, so
no PASS could be recorded. This closure produces those traces by
genuinely executing the unchanged harness
(`tests/rc1-15c/journey.ts`) on the current tree. No product code
changed and no harness file changed: no failing case was encountered.
Aggregate RC1 status is decided outside this closure.

## Verdict

**15C closure: PASS.** All three harness steps ran end to end with
exit 0: fresh migration on a dropped schema, the full experiment
journey (22 checks passed / 0 failed / 0 skipped), and the restart
run against the persisted state (9 checks passed / 0 failed /
0 skipped). The traces are the harness's own output files at
`../journey-trace.json` and `../restart-trace.json`.

## Tested tree

- Branch `rc1-closures`, HEAD `b4d8c9cac77f27ca0d06d765fdb289ee08c41a11`
  before this closure's own evidence commit.
- The only files this closure adds are the two traces and this
  evidence directory. `journey.ts`, `run.ps1`, and the pre-existing
  evidence (`commands.json`, `containment.json`, `source-tree.json`)
  are untouched.

## Containment substitution (stated plainly)

The original run's containment was a Docker container
(`rc115c-20261101`, label `rc1.scope=15c`) that only ever hosted
PostgreSQL on `127.0.0.1:5477`; the app and the Playwright browser
ran on the Windows host, launched by PowerShell. This VM has neither
Docker nor PowerShell, so:

- The PostgreSQL side was provided by a disposable local cluster
  created for this closure (`pg_createcluster 16 rc115c
  --port 5477`), superuser `postgres` with the password `postgres`,
  database `rc115c_release_acceptance` — the exact connection string
  `journey.ts` asserts. App and Playwright Chromium ran on this
  host, as in the original.
- **PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)** on
  x86_64-pc-linux-gnu, recorded verbatim. This does not relabel the
  original run's environment or its evidence.
- `run.ps1`'s environment block was reproduced value-for-value in
  bash, including the test-only secret constants taken from
  `run.ps1` itself, `APP_URL=http://localhost:39063`,
  `EMAIL_MODE`/`TELECOM_MODE` disabled,
  `MEDIA_DIR=scratch/rc115c/media`, `RENEGADE_MODULES=all`,
  `ENABLE_TEST_ROUTES=false`, `SEED_ON_INIT=false`,
  `NODE_ENV=test`, and `RENEGADE_NEXT_DIST_DIR=.next-rc115c`.
- One further environment adaptation: `journey.ts` teardown invokes
  the Windows `taskkill /PID <pid> /T /F`, which does not exist on
  Linux (verified beforehand: the spawn fails ENOENT and the
  teardown's `exit` listener never fires). A functionally equivalent
  `taskkill` executable — kill the target process tree, children
  first, SIGKILL, i.e. the `/T /F` semantics — was placed on `PATH`
  from the gitignored scratch directory. The harness files were not
  modified, and the spawned `next dev` server was genuinely
  terminated by it: both runs exited 0 through the harness's own
  teardown, including its assertion that no database client held an
  active query.
- `next dev` touched the generated configuration paths
  (`next-env.d.ts`, `tsconfig.json`) exactly as the original
  containment record anticipates; both were restored afterward.
- The harness also wrote `web.log` / `restart-web.log` into the
  evidence directory; the repository's `.gitignore` excludes `*.log`,
  so they remain in the working tree uncommitted.

## What ran

1. Cluster setup: `pg_createcluster 16 rc115c --port 5477`, start,
   `ALTER USER postgres PASSWORD ...`, `CREATE DATABASE
   rc115c_release_acceptance` (admin only via `sudo -u postgres
   psql -p 5477`); TCP login with the harness credentials verified.
2. Migrate: `npm run test:migrations:fresh` under the reproduced
   `run.ps1` environment — exit 0, "Fresh migration acceptance
   passed." The verifier drops schema `public`, applies every
   migration, applies them again (adds none), and asserts each is
   recorded exactly once: `payload_migrations` count **132**. The
   original 2026-11-01 run recorded 130; the tree has gained two
   migrations since (including
   `20261107_120000_rc1_execution_events_site_detach`), and the
   verifier checks the count against the tree's own migration list.
3. Journey: `node --import tsx tests/rc1-15c/journey.ts journey` —
   exit 0, **22/22 checks passed**. Highlights: product API boots
   with test routes and test auth disabled; operator creates the
   experiment, variants and conversion form through the admin
   collection API; winner approval without a measured outcome is
   refused (409) and anonymous / wrong-site / foreign-origin /
   native-forgery decision attempts are denied (403); with consent
   off, the public renderer shows the persisted control and the form
   persists with zero experiment events; both variants are then
   observed in real headless-Chromium sessions with exactly one
   persisted exposure and one attributed conversion each, stable
   across reload, with duplicate and forged variant/site claims
   rejected; measured allocation and assignment salt are immutable;
   conversion without prior exposure is rejected; the operator
   dashboard reconciles the two exposures and two outcomes; a human
   approves the winner and rolls it back through the actual admin
   UI, the rollback removes the enforced winner from public output,
   and the decision audit retains the human actor and reasons for
   all three decisions.
4. Restart: `node --import tsx tests/rc1-15c/journey.ts restart` —
   exit 0, **9/9 checks passed**. A fresh harness process and a
   fresh `next dev` server run against the same database and the
   state carried in `scratch/rc115c/state.json`: the approved winner
   and public output survive, the measured event count is exact, a
   fresh anonymous browser renders the persisted winner, winner
   state stops further event collection, a supported rollback works
   after restart while a wrong-site rollback stays denied, resuming
   the experiment retains the original visitor assignment, and a
   post-restart exposure retry preserves the exact event count.

## Cleanup

All spawned processes (dev servers, browsers, harness) were
terminated, and the disposable `16/rc115c` cluster was stopped and
dropped after the traces were secured. Scratch state remains under
the gitignored `scratch/rc115c/` in the working tree only.
