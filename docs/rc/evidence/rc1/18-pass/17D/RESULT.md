# RC1 17D — Complete database and media backup/restore

## Status

**PASS** (2026-11-02), bounded exactly as stated below. A fully populated
site was created through supported product paths, quiesced, captured with
the shipped operational backup tooling, and restored into an independent
empty second environment running under different secrets. The restored
database is byte-equivalent at the row level (311 tables compared, 0
differences), the restored media tree is byte-identical (42 files, 0
differences), and the restored environment is functionally alive: the
owner logs in with the passkey enrolled before backup (genuine WebAuthn
protocol), pre-backup member sessions still authenticate, paid commerce
state refetches identically, public pages render restored content, a
live worker behaves safely, and everything survives a full PostgreSQL
cluster restart.

17C's production-image blocker is a separate, already-recorded track
(NEXT.md of 17C); nothing in this subpass depends on the Docker image
proof, and the web processes here are local `next dev` processes — the
same bound 17C recorded for its runtime proof.

## Base and containment

- Base: `92954d7b3fad85b50528b0eb596e6c4ef7152d5d` (17C NOT READY) on
  local branch `rc1-17d`.
- No product-code changes were required: the shipped backup/restore
  tooling (`src/modules/operations/backup.ts`, `lifecycle.ts`,
  `scripts/backup-operational.ts`, `scripts/restore-operational.ts`)
  already met the prompt. This subpass adds only the disposable
  acceptance harness `tests/rc1-17d/` and this evidence.
- Source containment: 1,624 files, SHA-256
  `097a8aa5f08e26918e6771cb2a692b753a4917bbf7246043ed6b0eeb7a79afc7`
  (`source-tree.json`, frozen before the final runs and `--check`
  verified after them).
- Full-project `npx tsc --noEmit`: exit 0 on the final tree (see
  Verification).

## How the shipped tooling was executed (17C precedent)

The shipped CLIs are Compose-bound: `backup:operational` runs
`pg_dump`/tar inside containers and `restore:operational` refuses to
run outside the Compose project. With Docker unavailable on this VM
(17C's definitive finding), the harness executes the tooling's exact
data-plane steps natively, in the shipped order, using the product's
own code wherever the product exposes it:

1. Quiesce: web stopped; the capture is taken in the tooling's
   `maintenance-window` consistency mode (the manifest records it).
2. `pg_dump -Fc` of the source database (the shipped format/flags).
3. Media tar with the shipped exclusion set
   (`.renegade/backup-status.json`, `.env*`, `backups/`, `logs/`,
   `tmp/`, `*.log`).
4. Manifest creation, verification, restore-safety and
   version-compatibility checks by importing the product functions
   themselves: `createOperationalBackupManifest`,
   `verifyOperationalBackup`, `assertRestoreSafety`
   (`src/modules/operations/backup.ts`) and
   `assertRestoreVersionCompatibility`
   (`src/modules/operations/lifecycle.ts`).
5. Format proof: `pg_restore -l` and `tar -tzf` read the archive.
6. Restore only into an empty, independent target: a second database
   and media directory, booted with a **different `PAYLOAD_SECRET`**
   and restore-only credentials; then the product's forward migration
   entrypoint (`npm run db:migrate`, exit 0).

One disclosed native adaptation: media extraction uses
`tar --no-same-owner` (the shipped flow extracts as root inside its
container; the native operator is unprivileged). File bytes are
unaffected and are compared exhaustively.

The Compose orchestration layer itself (the literal
`backup:operational`/`restore:operational` CLI invocations inside
containers) is **not** executed here; it is the same Docker-host track
as 17C's image proof and is named in NEXT.md. The harness
(`tests/rc1-17d/run.sh`) is environment-portable: on a Docker-capable
host the same phases run unchanged, because they drive local
processes and product functions, not the sandbox.

## The populated source site

Created in `rc117d_source` (PostgreSQL 16.15) through ordinary or
supported operator paths, then frozen as a depth-0 projection
(`source-projection.json`):

- Site, owner and staff users (creation auto-provisions the product's
  member-site-role grants); a member with profile and author records.
- Owner WebAuthn credential enrolled as a stored credential row (17A
  pattern); all logins afterwards are genuine protocol assertions.
- A member session minted with the identity module's own `digest()`;
  a source-phase baseline check proves the token authenticates in the
  source environment before any restore claim is made.
- Media uploaded over HTTP (`POST /api/media/upload`), then an edited
  replacement over HTTP creating a media-asset-version (42 media
  files at capture, including generated variants).
- A published article with SEO fields, hero media and a categorized
  taxonomy; public render at `/articles/17d-launch` uses the SEO
  title as the page `<title>`.
- Newsletter: verified subscriber, confirmed audience membership and
  contact.
- Community: forum section/forum/discussion and a member message;
  the discussion renders publicly with the message visible.
- Commerce (deterministic test provider; no live charge): merchant
  connection, a product published through the catalog workflow API
  (request-review → approve → publish), cart, checkout session, paid
  payment intent with a succeeded attempt, fulfilled order
  `17D-1001` (4200 minor), a succeeded partial refund (500), a shipped
  manual-fulfillment package, supporter + plan revision + active
  subscription + entitlement, and a donation campaign/intent/donation/
  event chain (1500 minor, succeeded).
- A webhook subscription created through the operator API and one
  `content.created` delivery executed once against a local capture
  receiver with a valid HMAC signature (delivered).
- One future-dated (+2h) `operations-heartbeat` job left pending.

Where the product exposes no ordinary write path (some commerce and
community internals), population used the Payload local API — the
same collections, hooks and validation as the REST paths.

## Proof (45/45 checks on the final tree; traces in this directory)

- **Source (16/16, `source-trace.json`)**: migration (131
  `payload_migrations` rows), population persisted across every area
  above, source web boots, edited media serves byte-identical to the
  edited upload, the source-issued member session authenticates.
- **Backup (5/5, `backup-trace.json`)**: at capture the archive held
  311 tables and 42 media files; `pg_dump -Fc` + media tar written;
  product manifest created and `verifyOperationalBackup` passes
  (checksums + totals); `pg_restore -l`/`tar -tzf` read the archive;
  secret-exclusion sweep clean — no environment secret appears in the
  manifest or the dump bytes, and the media tar lists no `.env` or
  backup-status entries. Final archive: `database.dump` 1,709,747
  bytes (SHA-256 `04344518968f…`), `media.tar.gz` 7,731 bytes
  (SHA-256 `be4e0e39e690…`), manifest in `backup-manifest.json`
  (buildSha = base commit, PostgreSQL 16.15 recorded verbatim).
- **Restore (21/21, `restore-trace.json`)**:
  - Negatives first: a byte-corrupted media component and a manifest
    with a removed entry are both rejected by the product verifier,
    and the rejected attempts mutated nothing (target still 0 tables,
    media dir still empty). The product restore-safety guard refuses
    non-isolated restores and non-restore targets and accepts the
    isolated target; a non-empty database or media target is refused.
  - Archive verifies and is version-compatible; `pg_restore` and
    media extraction complete into the empty target.
  - **Restored database projections identical to the quiesced source:
    311 tables compared (per-table row count + content hash),
    0 differences** (`projection-compare.json`; the one legitimate
    housekeeping note: the source's `.renegade/backup-status.json`
    is excluded from the archive by the shipped tooling and is
    excluded from both checksum maps).
  - **Restored media bytes identical: 42 files, 0 differences.**
  - Forward migrations exit 0; restored web boots and reports ready.
  - Owner logs in to the restored environment with the
    source-enrolled passkey — genuine WebAuthn protocol, session
    cookie issued. Anonymous operator API access denied (403). A
    staff fixture session under the restore secret reads the
    operator API (200), including the restored webhook subscription.
  - The member session token issued **before** backup still
    authenticates after restore.
  - Refetch parity against the source projection: order, refund,
    subscription, donation, entitlement, audience membership, forum
    message body, webhook delivery state — all match. (Content and
    discussion REST reads are operator-scoped in this build; public
    proof is the rendered pages, below.)
  - The restored discussion renders publicly with the member message
    visible; the article renders publicly with its SEO title as the
    page title and its body text present; the edited media serves
    over HTTP byte-identical to the edited source bytes.
  - The future-dated job is still pending after restore, and a live
    worker run in the restored environment (heartbeat observed)
    leaves it untouched — not executed, not lost, no error.
- **Restart (3/3, `restart-trace.json`)**: after a full PostgreSQL
  cluster restart, the restored web reboots ready; owner WebAuthn
  login works again (credential and sign-counter state persist);
  article, member session and edited media bytes all survive.

Harness robustness note: an early full run exposed orphaned worker
processes (killing the `npx` wrapper left the `tsx` child holding its
database pool, blocking a later phase reset). The harness now spawns
web/worker children detached and kills the whole process group, and
phase resets terminate lingering sessions on the harness's own
disposable databases first. The final full sequence ran clean with
zero lingering sessions.

## Verification

- Journey: **45/45** on the final tree (source 16, backup 5,
  restore 21, restart 3), exit 0; traces in this directory are from
  that run.
- Full unit suite (`npm test`): **2040 passed / 5 failed** — exactly
  the named pre-existing baseline set at base `92954d7` (no new
  failures, none fixed): `flow-04-acceptance` (1),
  `payload-domains` (1), `rc1-04d-campaign-commerce` (1),
  `shop-08` (2).
- Focused `tests/unit/operational-backup.test.ts`: 4/4.
- Full-project `npx tsc --noEmit`: exit 0 on the final tree.
- ESLint on `tests/rc1-17d/`: clean. Prettier applied to the harness.
- Databases `rc117d_source` and `rc117d_restored` are retained as
  disposable evidence; no other pass's database was touched.
  PostgreSQL here is local 16.15; CI uses 17.6 — recorded verbatim,
  per standing rule.

## Bounds (named honestly)

- Compose orchestration layer not executed (see above): the literal
  containerized CLI invocations belong to the Docker-capable-host
  track that also closes 17C.
- Web proof uses local `next dev` processes, not the production
  image (17C's track). The production build itself was proved in 17C.
- Staff verification in the restored environment uses a fixture
  passkey session (the 15E–17C convention, disclosed); the owner's
  restored-environment login is genuine WebAuthn protocol, and the
  member session is the product's real session validation.
- Commerce/audience/community population used the Payload local API
  where no ordinary write path exists (disclosed above); all reads,
  logins, uploads, edits, public renders and the webhook delivery are
  real HTTP against the running environments.
- No live charges, payouts, messages, POD orders or external posts:
  commerce ran on the deterministic in-product test provider, email
  and telecom were disabled, and the only webhook receiver was a
  local capture server.
