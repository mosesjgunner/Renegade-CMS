# RC3-05 — Actual RC2 upgrade-safety and off-host restore rehearsal — RESULT

**Verdict: PASS on every leg rehearsed.** No product defect found; no
production code changed. The one failure encountered was a sandbox
transport artifact in the rehearsal harness (tar ownership), fixed in
the harness and named below. The true version-to-version upgrade
rehearsal remains open — it awaits a merged RC3 candidate (see
"Still open").

**Baseline:** branch `rc3-05` from `2d4cb3ddf70db5b5f9570297e6bae0d7ff8774bf`
(the `rc2` tag / current main; fresh fetch from GitHub confirmed main
still resolves to that SHA before the worktree was created).

**Environment:** Node v24.22.1, PostgreSQL 16.15 (local cluster — the
Compose topology targets PG 17; the app and all prior RC passes run on
this cluster), acceptance DBs `rc305_release_acceptance` (source) and
`rc305r_release_acceptance` (restore target), plus a scratch
`rc305x_release_acceptance` for the failure legs and the second restore.
Serving used the repo's `LOCAL_E2E_TEST_MODE` smoke configuration
(production validation intentionally rejects this sandbox's dev
credentials and loopback APP_URL — the same caveat as RC3-04/RC3-03).

## Transport substitution — stated plainly

The shipped operational backup/restore scripts
(`src/scripts/operational-backup.ts`, `operational-restore.ts`) drive
Docker Compose. This sandbox has **no Docker daemon** (dockerd cannot
start: iptables NAT is permission-denied) and **no Compose plugin**, so
the shipped scripts cannot execute here at all. The rehearsal therefore
drove the product's own code wherever the product has code, with host
binaries standing in only for the `docker compose exec/run` transport:

- Bundle layout, manifest construction, checksum verification and the
  restore safety/version gates are the product's unmodified functions
  (`createOperationalBackupManifest`, `verifyOperationalBackup`,
  `assertRestoreVersionCompatibility` in `src/modules/operations/`).
- `pg_dump -Fc`, `pg_restore --no-owner --no-privileges`, `tar` with the
  script's exact excludes, `pg_restore -l` and `tar -tzf` archive proofs
  ran as host binaries (PG 16.15) instead of inside containers.
- Migrations ran through the product command `npm run db:migrate`.
- The rehearsal order mirrors `operational-restore.ts` exactly:
  verify checksums → version compatibility → format proofs → refuse
  non-empty DB/media target → restore → migrate → boot → readiness.

Harness: `tests/rc3-05/` (`seed-instance.ts`, `capture-manifest.ts`,
`backup-bundle.ts`, `restore-bundle.ts`). Logs, manifests and timings
under `~/workspace/gui01b-logs/rc305*`.

## What this replaces

The shipped upgrade verifier (`src/scripts/verify-upgrade-migration.ts`)
builds a **synthetic historical fixture** (fixed UUIDs, a 2026-08-25
timestamp) at `UPGRADE_BASELINE = 20260914_110000_med_05_video_workflow`
in a scratch database. It proves the historical-schema migration path,
but it never touches a real running RC2 instance, a real backup bundle,
or a real restore. This pass rehearsed exactly those three things
against the actual tagged release. The September-fixture verifier's own
leg (historical schema → current) was **not** re-run tonight and is not
claimed here.

## The instance (leg 1 — boot real RC2, seed, record identity) — PASS

Production build of the pinned tree (recipe: `RAYON_NUM_THREADS=4`,
`NODE_OPTIONS=--max-old-space-size=4096`, detached, exit file): **exit
0**; standalone 1,117,797,606 bytes — byte-identical in size to RC3-04's
baseline measurement of the unmodified tree; provenance "Built source
2d4cb3d…; clean source: true". Booted `node server.js`; `/health/ready`
→ ready, database ok, migrations applied.

Seeded on top of the product seed (`src/scripts/seed.ts`): the demo
site plus a second site (`rc305-site-b`) with its own brand, publication
and published article; a public podcast show + published episode whose
enclosure is a real WAV written through the product media storage; a
member + supporter + entitlement (POD-03 grant shape); one pending
`commerce-reconcile-payments` job (worker not running). Full identity
manifest captured from DB + live HTTP (`rc305-manifest-source.json`).

## Backup (leg 2 — product operational backup) — PASS

Web stopped first (the script's maintenance-window quiesce). Backup
run: **exit 0 in 605 ms**; bundle `database.dump` + `media.tar.gz` +
`manifest.json`, totals **1,786,395 bytes**; product checksum
verification, `pg_restore -l` and `tar -tzf` all passed inside the run;
`backup-status.json` written into the media dir as the script does.

## Upgrade-safety on the source instance (leg 3) — PASS

- **3a, migration reruns:** `npm run db:migrate` on the populated RC2
  instance, runs 2 and 3 (run 1 was the initial apply): both **exit 0,
  zero migrations applied** — a clean no-op; `db:status` shows the full
  156-migration ledger applied. Idempotent.
- **3b, artifact swap:** the same DB + media served by the RC3-04
  pruned standalone (283,873,971 bytes, same source SHA): manifest
  re-captured and diffed against the source manifest — **zero diffs**
  across identity, GUIDs, enclosure hash, entitlement, pending job and
  the whole live surface. The job stayed pending throughout (no worker
  ran against the source instance).

## Off-host restore (leg 4) — PASS, zero-diff

The bundle was copied to a separate directory (checksums of all three
components identical after the copy) and restored **from the copy
alone** into the distinct target (fresh DB, fresh media dir, separate
artifact copy, port 3106). Restore run: **exit 0 in 2,820 ms**;
post-restore `npm run db:migrate` exit 0, zero applied. Restored
manifest diffed against the source manifest: **zero diffs** (the feed
enclosure URL's origin follows the serving origin — 3105 → 3106 — as
`docs/OPERATIONAL_BACKUP.md` describes; path, length and type are
identical, and the served enclosure bytes hash-match).

Identity comparison (source = swapped = restored, field for field):

| Item             | Value (identical on all three)                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Site A           | `a70f2c82-02c3-4d7a-9449-0e4588631c83` (`demo-publication`)                                                              |
| Site B           | `ea5ef40d-de3f-4ca1-a9bb-67f274e87860` (`rc305-site-b`)                                                                  |
| Article A        | `50ce6fe9-…`, `/notes/demo-field-report`, published, site A                                                              |
| Article B        | `17b7fed6-…`, `/notes/rc305-harbor-article`, published, site B; live 200 + title                                         |
| Show             | `e72a6f06-…`; `podcast:guid` `150ba8ec-92b8-598f-aec8-50fd44e25f2d` (DB = live feed)                                     |
| Episode          | `ff689719-…`; guid `urn:renegade:podcast:e72a6f06-…:03350817-…` (DB = live feed item)                                    |
| Enclosure        | 8,044 bytes, `sha256:aa421e48…` — four-way match: media-blob row, media-asset row, file on disk, HTTP-served bytes       |
| Entitlement      | `cefe3575-…`, grantKey `rc305-grant-listen-1`, resource `podcast-show:e72a6f06-…`, capability `listen`, `revokedAt` null |
| Pending job      | `0be3a3db-…`, `commerce-reconcile-payments`, processing false, `completedAt` null at backup and after restore            |
| Migration ledger | 156 migrations, ordered-names sha256 `7fc0b2f8…`                                                                         |

Observed baseline behavior, not a defect: the product seed's demo
article returns 404 at its canonical path (the seed fixture carries
`removeFromDiscovery` and exists for canonical-IA/API tests). It
reproduced identically (404 = 404) on all three instances; the positive
public-content proof is carried by the site-B article (200, title in
HTML), the homepage (200) and the feed (200).

## Failure detection (leg 5) — PASS

Against a fresh scratch target, using the product preflight
(`verifyOperationalBackup`) before any mutation:

- **Dropped component** (bundle copy with `media.tar.gz` deleted):
  restore **exit 1** at preflight (missing component).
- **Corrupted component** (one byte flipped mid-`database.dump`):
  restore **exit 1** at preflight — "Operational backup checksum
  mismatch: database.dump", the product verifier's own error.
- After both attempts the target was **untouched**: 0 public tables,
  0 media files. No silent incomplete restore. No fix needed — the
  detection the docs promise is the detection the code performs.

## Rerun-safety (leg 6) — PASS

- The same bundle restored a **second time** into the scratch target:
  exit 0; migrations exit 0; target holds 2 sites / 1 job / 1
  entitlement. (A restore into an already-populated target is refused
  by design — restores go to fresh targets, per the shipped guards.)
- On the restored instance: `db:migrate` rerun exit 0, zero applied.
- The restored pending job was then processed by the product worker
  (`npm run jobs:worker`, log: "Running 1 jobs."): afterwards exactly
  **one** row for the job id, `completedAt` set, `has_error` false —
  processed exactly once after backup, two migration reruns and a
  restore. No duplication, no reset.

## RPO / RTO (fixture-scale measurements, not production promises)

- **Backup:** 605 ms for a 1,786,395-byte bundle. Taken in a maintenance
  window (writers stopped), so the bundle contains everything committed
  up to the backup start (2026-11-21T05:47:57Z) — RPO is the backup
  moment itself; nothing in flight can be half-captured.
- **Restore:** 2,820 ms for the data leg; post-restore migrations were
  a no-op; boot-to-`/health/ready` took seconds. Bundle-copy →
  serving-restored-instance was under a minute end to end at this
  fixture scale. At production scale both numbers grow with database
  and media size; the shape (verify → restore → migrate → boot) is
  what was rehearsed.
- **Rollback boundary** (as documented in `docs/OPERATIONAL_BACKUP.md`
  and consistent with everything observed): migrations are
  forward-only — nothing runs down-migrations. An image/artifact
  rollback is safe only while the migration ledger exactly matches the
  pre-upgrade backup (leg 3b swapped artifacts freely because the
  ledger never changed). Once an upgrade adds a migration, there is no
  in-place rollback: recovery is restoring the pre-upgrade archive into
  the isolated target — the flow rehearsed in legs 4–6.

## Harness failure encountered (not a product defect)

The first restore attempt passed product preflight and `pg_restore`,
then the media untar exited 2: this sandbox runs as root but denies
`chown`, and tar restores ownership by default. Contents had extracted
intact; the target was reset and the timed restore re-run cleanly with
`--no-same-owner` (ownership mapping is a transport concern; in the
shipped container flow tar runs as the image user). Recorded in
`tests/rc3-05/restore-bundle.ts`.

## Gates on the final tree

- `npm run format:check` (repo-wide, as CI runs it): **exit 0**.
- `npm run typecheck`: **exit 0**.
- Product backup unit tests (`tests/unit/operational-backup.test.ts`,
  `tests/unit/med-01-backup-media.test.ts`): **9/9 passed**.
- Full unit/integration suites: not re-run for this pass — the branch
  changes no production code (harness + this evidence only); the
  rehearsal itself exercised the built artifact end to end.

## Still open

- **True version-to-version upgrade rehearsal** (tagged RC2 instance →
  merged RC3 candidate, with a migration delta): awaits the morning
  merge session producing a candidate. Tonight's upgrade legs were
  same-version by necessity: migration idempotency, artifact swap, and
  post-restore migration reruns.
- The September-fixture historical-schema verifier
  (`test:migrations:upgrade`) was not re-run tonight.
- Docker/Compose execution of the shipped operational scripts remains
  unproven in this sandbox (no daemon); the product-code path —
  manifest, verification, guards, restore order — is what this pass
  proved.
