# RC2-H-08 — Install, backup/restore, upgrade and portability smoke

**Verdict: PASS with two bounded findings.** On the exact RC2 candidate
(main `ca445a1b1c14c23b7f0acfe1fa68f9c09b4da3cd`, CI badge: passing) the
connected workflows survive a full lifecycle: fresh install → publish →
backup → restore into a fresh instance → verify → supported upgrade →
export/import round trip. Two things did not fully pass and are reported
as themselves: the Docker/Compose provisioning path cannot be exercised
in this sandbox (no Docker daemon), and the portable import of a
member-space-post chain fails (RC2-DEBT-26). Nothing was restored into
or backed up from a working database; every leg ran in disposable
environments created for this pass.

## Environment identity

Sandbox VM replaced once before the run began (boot 11:53 CT,
2026-11-14); all legs ran after that on the same boot. Host: this VM
(~8 GB), PostgreSQL 16 native cluster. Source candidate: git
`ca445a1b1c14c23b7f0acfe1fa68f9c09b4da3cd` (main after PR #76). The
served instances used the production standalone build whose content was
verified tree-identical to that commit's merged branch during H-07.
Docker client 29.1.3 is present; no daemon socket exists in this
sandbox, which bounds legs 1–2 below.

## Leg 1 — Supported install path (Compose): precondition verified, run blocked by environment

`install.sh --non-interactive --instance rc2h08 --app-url
http://rc2h08.test --profile Lean` refuses cleanly with `Install failed:
Docker is installed but unavailable to this user.` (exit 1, no files
written). The installer's guard works exactly as designed on a
Docker-less host. The full one-command Compose provisioning proof
(ledger #77) still does not exist on current HEAD — it needs a Docker
host (fresh VPS or the owner's PC); that is an environment limit, not a
product failure, and #77 stays E2 with the gap now precisely bounded.
The operational CLIs (`backup:operational`, `restore:operational`,
`upgrade:operational`) are Compose-orchestrated and are blocked by the
same wall; legs 3–5 therefore execute the same documented artifacts and
formats natively, which is how the RC1 receipts were produced.

## Leg 2 — Fresh install (native): PASS

- New empty database `h08_source_release_acceptance`: all 132
  migrations applied cleanly to HEAD (`db:migrate`, exit 0).
- Seeded the RC2-A-04 standard world (2 sites, 6 content, 10 members,
  6 staff, 2 media records) under the **Lean** profile; the published
  article serves (200) at `/articles/site-a-published-24fe7a50`.
- A real media upload through `POST /api/media/upload` landed a
  physical file under the instance media dir.
- Lean note: planting a social account on this instance correctly
  failed — in Lean the social module's collections are not registered
  at all (module gating is structural, not route-deep).

## Leg 3 — Backup (documented v1 format): PASS

Produced `database.dump` (pg_dump custom format, 1,695,301 bytes) and
`media.tar.gz` with the same component layout and exclusions as
`backup:operational`, then built the manifest with the product's own
`createOperationalBackupManifest` and validated the whole archive with
`verifyOperationalBackup` — **OK** (sha256 for both files, migration
state: all 132 migrations recorded, build SHA recorded).
Secrets scan of the manifest: PAYLOAD_SECRET absent, encryption key
absent, database password absent. (The dump itself is a full-fidelity
database copy by design; secrets live in env, never in the manifest —
the exclusions list in the format says so and the scan confirms it.)

## Leg 4 — Restore into a fresh instance + live verification: PASS

- `pg_restore` into the empty `h08_restored_release_acceptance`
  (exit 0); media archive extracted to the instance's own media dir.
- `db:migrate` on the restored instance applied **0 migrations** — the
  restored state is already at HEAD, as a restore should be.
- **Table digests: 311 tables compared between source and restored
  instances, 0 mismatches, 228 rows each** (order-independent per-table
  row-hash aggregate; RC1's receipt was 309 tables — HEAD has grown).
- Live on the restored instance (Lean, own port): public article
  **200** at the identical canonical path; a pre-backup admin session
  cookie authenticates (schedule-health 200) — identity and sessions
  survived; grants resolve (10 member-site-roles intact); the jobs
  table carried over; the Standard-only social queue route returns
  **404** — Lean module gating intact after restore.
- Media route parity: `GET /api/media/<uploaded-id>` returns the same
  403 site-scope response on source and restored instances (identical
  behavior; the physical bytes are present and digest-verified).

## Leg 5 — Supported previous-version upgrade: PASS

The supported baseline is named in code (`UPGRADE_BASELINE =
20260914_110000_med_05_video_workflow`, `verify-upgrade-migration.ts`).
`npm run test:migrations:upgrade` built the historical fixture at that
baseline with sentinel data, applied every later migration, and
asserted the data and the runtime schema at HEAD: **"Upgrade rehearsal
passed: 20260914_110000_med_05_video_workflow -> current."** No old
migration was rewritten.

## Leg 6 — Portable export/import round trip: PARTIAL (finding filed)

On a Standard instance (the freshly seeded acceptance world):

- Planted a dummy provider credential: it is stored only as an
  `enc:` AES-256-GCM ciphertext (`connectionReference`); no plaintext
  at rest.
- `exportPortableSite` produced 19 records across 13 collections.
  **The export contains neither the dummy plaintext nor the encrypted
  reference — social accounts do not travel in the portable format at
  all.** The CLI archive (encrypted, mode 0600) likewise contains zero
  occurrences of the secret and zero `enc:` strings.
- Import into a fresh Standard instance with an empty target site:
  **14 of 19 records imported** (the 19th is the source-site anchor,
  mapped to the target). The imported published article **serves live**
  on the target instance at its original canonical path (200, content
  verified), the draft article and the uploaded media asset — bytes
  included — arrived intact, and **zero social accounts exist on the
  target: credentials are never silently restored as usable.**
- **Failure (RC2-DEBT-26):** 4 records failed, all one object graph —
  the member's Space and its space post (content, article-family
  companion, revision record). Their references point outside the
  portable set (member profile; the creating user) and the import
  writes them as empty strings into UUID columns, so the inserts fail.
  The failure is loud, checkpointed and resumable; nothing was
  corrupted. Publication content round-trips; Space/community content
  does not yet. Filed as RC2-DEBT-26 (P2) with the smallest-fix
  directions; not silently built out in this pass.

Fixture note: the A-04 world's media records are hollow (no physical
bytes by design), and `exportPortableSite` correctly refuses to export
a site whose media bytes are missing — the hollow fixture record was
removed from the disposable source world and replaced with a real
upload before exporting. Loud refusal over a silently broken archive
is the right behavior; recorded here so the step is not mistaken for
product damage.

## Regression and gates

- No production code changed in this pass (docs + evidence + three
  harness scripts under `tests/rc2-h08/`).
- Typecheck: 0 errors (harness scripts included).
- Main CI badge at the candidate commit: **passing**.

## Scope honesty

Not proven here: the Docker/Compose stack run itself (environment),
a fresh-VPS non-author install (#77's remaining gap), managed hosting
(#78, E0, untouched by design), commerce/audience history depth inside
portable exports. The H batch (H-01…H-08) is complete with this pass.
