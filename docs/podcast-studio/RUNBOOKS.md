# Podcast Studio — Operator Runbooks (POD-19)

Short procedures against the machinery as built. Each names the real
surface to look at; none of them involve editing the database by hand.

## 1. Live show failure (stream down, show in progress)

Truth sources: the STREAM lamp / listener check on the live surface
(`GET /api/podcast-studio/live?showId=` — staff + site grant) and the
relay supervisor's health snapshot + log lines
(`src/modules/podcast-studio/live/relay.ts`).

1. **Keep recording.** The recorder is independent of the relay by
   design — a stream fault is never a reason to stop a good take.
2. Read the supervisor health: it owns one ffmpeg process per live
   session and restarts it with exponential backoff; a process stable
   past the stable window earns its restart budget back. A restart
   storm means the destination is refusing — check the Icecast mount
   (server up? mount free? credential still valid?) rather than the
   studio.
3. If the profile changed mid-incident, re-save it via the live API
   (`POST /api/podcast-studio/live { action: 'set-profile', … }`) —
   credential material is write-only and never displayed back.
4. If the stream cannot be recovered: end the live episode
   (`{ action: 'end-show' }`), finish the recording, then convert the
   recording to a normal episode (`{ action: 'convert', recordingId }`)
   and publish through the normal POD-04 path. The `podcast:liveItem`
   ends; the audience gets the recorded episode in the same feed.

## 2. Guest can't connect

Machinery: POD-10 invites/lobby (`podcast_guest_invites`), the
long-poll signalling log, coturn for hostile NATs (`docs/podcast-studio/COTURN.md`).

1. Confirm the invite state (`GET /api/podcast-studio/guests/invites?sessionRecordId=`):
   `invited` = link never opened; `preflight`/`waiting` = guest is in
   the lobby and needs admission (`POST /guests/admit`); `dropped` /
   expired = issue a fresh invite (revoke the old one first if it may
   have leaked — revocation is instant).
2. Guest stuck before the lobby: the join requires a headphone
   declaration — the no-headphones fallback is a legitimate path
   (echo processing on, disclosed to the guest), not an error.
3. Guest in the lobby but no audio path: this is the NAT/TURN case.
   Check the deployment actually has TURN configured
   (`PODCAST_STUDIO_TURN_URLS` / `_USERNAME` / `_CREDENTIAL` in the
   environment). Without TURN, hostile-NAT guests cannot connect and
   the join response says so. For a forced-relay test, set
   `PODCAST_STUDIO_TURN_FORCE_RELAY=true` and re-join.
4. Guest dropped mid-show: they rejoin with the same link inside the
   reconnect grace; their ISO track is silence-padded with the gap
   RECORDED at finalize — never chase a "lost" guest track in the
   recording; check the manifest's gap records instead.

## 3. Render backlog

Machinery: `podcast_renders` records + the `podcast-render` Payload
task (concurrency-keyed per project), stale-claim recovery
(`recoverStalePodcastRenderJobs`, 30 min stale window).

1. Look at the renders for the show: states queued/running/failed +
   the recorded error. Deterministic failures (bad EDL, missing
   source, loudness gate) are recorded and NOT retried — fix the
   cause; do not expect the queue to heal them.
2. A render stuck in `running` after a worker death is a stale claim:
   the recovery pass resets it when its claim ages past the stale
   window; the re-run is idempotent (same EDL + profile → same
   idempotency key, no duplicate assets).
3. Backlog growing while renders complete slowly: renders are the
   heavy item on the host (ffmpeg + two-pass loudnorm). Check host
   CPU before adding concurrency — the per-project concurrency keys
   exist so parallel renders of DIFFERENT projects cannot stack
   unboundedly on the public-serving path.
4. Loudness-gate failures are content problems: the report carries
   the measured LUFS/true-peak. Fix the mix (POD-12 lane gains /
   processing), re-render; the gate never silently passes a master.

## 4. Restore from backup

The full contract is `docs/podcast-studio/BACKUP.md`. Summary:

1. Verify the backup set first (`verifyOperationalBackup` — manifest
   checksums must match the components on disk).
2. Restore into an ISOLATED database + media dir — never over a live
   install (`assertRestoreSafety` requires an isolated, authorized
   target by design).
3. `pg_restore` → untar media → set the environment (secret NAMES are
   listed in BACKUP.md; values come from your secret store, never
   from the backup).
4. Verify before announcing: feed health per show
   (`GET /api/podcasts/<slug>/feed-health`) + play one enclosure end
   to end. The scripted version of this whole procedure is
   `scripts/pod19-restore-proof.sh`.
5. Moving ONE show to another install instead? Use the portability
   bundle (`npx tsx src/scripts/podcast-studio-bundle.ts export/import`),
   not a backup restore.

## 5. Token / credential rotation

| Secret                         | Rotate by                                                                                                              | Effect                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Icecast stream credential      | Live API `set-profile` with the new credential (or change the env var named by `stream_credential_env_name` + restart) | Relay picks it up on the next session start; the old value is never displayed anywhere                                                      |
| Member feed token (one member) | `POST /api/podcast-studio/member-feeds/rotate` (member self-service or staff with site grant)                          | Old token dies in the same operation; member pastes the new feed URL once                                                                   |
| Member feed token (compromise) | `POST /api/podcast-studio/member-feeds/revoke`, then re-issue                                                          | Feed + enclosure URLs fail immediately; entitlement is re-checked at serve time regardless                                                  |
| Guest invite link              | `POST /api/podcast-studio/guests/invites/revoke`, issue a fresh invite                                                 | Old link/join fails at once; an admitted guest's signalling credential is separate — drop the guest (`/guests/drop`) to kill a live session |
| TURN credential                | Change `PODCAST_STUDIO_TURN_CREDENTIAL` (+ coturn's own config) and restart the app + coturn                           | New joins get the new credential; existing peer connections are unaffected until they rejoin                                                |
| Show ownership / feed move     | Not a rotation: use the POD-02 moved-feed redirect (`buildMovedFeedRedirect`) at the old feed URL                      | GUIDs do not change; podcatchers follow `itunes:new-feed-url`                                                                               |

Platform secrets (`PAYLOAD_SECRET`, `DATABASE_URL`) are platform
operations, not studio surface: rotating them follows the platform's
own procedures and invalidates sessions platform-wide.
