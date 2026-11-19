# Podcast Studio — Backup Contract (POD-19, POD-REQ-44)

What must be backed up for a Renegade install running Podcast Studio,
in what order it is restored, and what the restore proof actually
demonstrated. The platform operational backup
(`src/modules/operations/backup.ts`) is the backup set: exactly two
components plus a manifest —

| Component       | Contents                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `database.dump` | PostgreSQL custom-format dump (`pg_dump -Fc`) of the whole install database                                               |
| `media.tar.gz`  | The media storage root (all locally stored media bytes)                                                                   |
| `manifest.json` | `renegade-operational-backup` v1 manifest: per-component SHA-256 + sizes, PostgreSQL version, migration state, exclusions |

## The exact set

**Database (all of it — the dump is whole-database).** The
podcast-relevant tables inside it:

- `podcast_shows`, `podcast_seasons`, `podcast_episodes` (incl. GUIDs,
  `podcast_guid_value`, chapters, production states, enclosure
  checksums)
- `transcript_revisions` (episode transcripts)
- `podcast_studio_sessions`, `podcast_recordings`,
  `podcast_edit_projects`, `podcast_renders`, `podcast_assist_drafts`
- `podcast_guests`, `podcast_guest_appearances`,
  `podcast_episode_approvals`
- `podcast_guest_invites`, `podcast_signalling_messages` (outstanding
  invites are hash-only; a restore keeps them valid until expiry)
- `podcast_feed_tokens` (hash-only; members' existing token feeds keep
  working after a restore)
- `media_assets`, `media_blobs`, `media_variants` (+ the shared
  platform tables they hang off: `sites`, `members`, `users`,
  `entitlements`, Payload's own tables)

**Media storage roots** (inside `media.tar.gz`):

- the configured media dir (`MEDIA_DIR`): every blob key
  (`<siteId>/<uuid>.<ext>`) — episode enclosures, artwork, renders,
  recording track assets
- `<mediaDir>/podcast-guest-chunks/` — admitted guests' journalled
  chunk directories not yet finalized into recordings
- OPFS journals live in guests'/hosts' BROWSERS, not on the server:
  they are not part of a server backup and cannot be restored by one.
  Unfinalized browser-side recordings are the one data class a server
  restore does not cover; finalize recordings before relying on a
  backup.

**Session/EDL stores** are database state (`podcast_studio_sessions.
session_data`, `podcast_edit_projects.project_data`) — no separate
file store exists.

**Config/secrets (names only — values never enter the backup set):**

- `DATABASE_URL`, `PAYLOAD_SECRET` (platform)
- per-show stream credential: stored in the DB either as an
  AES-256-GCM envelope (`stream_credential_encrypted`, restored with
  the dump; decryption needs the install's connection cipher key) or
  by env-var NAME (`stream_credential_env_name` → the value lives in
  the target install's environment)
- `PODCAST_STUDIO_TURN_URLS`, `PODCAST_STUDIO_TURN_USERNAME`,
  `PODCAST_STUDIO_TURN_CREDENTIAL`, `PODCAST_STUDIO_TURN_FORCE_RELAY`,
  `PODCAST_STUDIO_STUN_URLS` (environment only)

## Restore order

1. Provision PostgreSQL at the dumped major version; create the
   target database (scratch/isolated — restores never target a live
   database; see `assertRestoreSafety` in operations/backup.ts).
2. Verify the backup manifest + component checksums
   (`verifyOperationalBackup`).
3. `pg_restore` the `database.dump` into the fresh database.
4. Untar `media.tar.gz` into the target install's media dir.
5. Provide the environment (names above) — including the stream
   credential env vars any show references by name.
6. Start the app; run the feed health check
   (`GET /api/podcasts/<slug>/feed-health`) per show before announcing.

## RPO / RTO (targets, not promises)

- **RPO target:** the last completed backup set. Nothing in the studio
  replicates continuously; a backup cadence is an operator choice
  (nightly is the assumed floor; before every upgrade, always).
- **RTO target:** restore is dump-size-bound. On the POD-19 proof rig
  (below) the full cycle — dump, restore, verify — completed in
  minutes for a ~9 MB backup set. Large media libraries scale with
  tar/restore throughput, not with show count.
- Consistency mode is a **maintenance window** (the operational
  manifest records it): take the dump while the app is stopped or
  quiet, so DB rows and media bytes agree.

## Restore proof (POD-19 — the L1 recovery verdict)

`scripts/pod19-restore-proof.sh` executes this contract end to end:
fixture show on the acceptance install → `pg_dump` + media tar +
operational manifest → restore into scratch DB `pod19_restore` +
scratch media dir → verification suite renders the restored show's
feed (POD-01 validator passes) and byte-matches an episode enclosure
against its recorded checksum. It also runs the portability-bundle
import into a second fresh scratch DB (`pod19_scratch`).

**Verdict (2026-11-18, this rig): PASS** — the platform-backup
restore leg left PARTIAL by POD-04 is proven on this rig, and the L1
recovery leg is closed. Proven only for THIS rig (local PostgreSQL
16, local disk media, this repo's tooling): a different host, object
storage instead of the local media driver, or external backup tooling
remains UNVERIFIED.

## Portability bundle ≠ backup

The POD-19 show bundle (`src/modules/podcast-studio/portability.ts`)
moves ONE show between installs; it deliberately excludes credentials,
tokens, invites and platform state. The backup set above restores a
WHOLE install, credentials' envelopes included. Moving a show: use
the bundle. Surviving a dead disk: use the backup.
