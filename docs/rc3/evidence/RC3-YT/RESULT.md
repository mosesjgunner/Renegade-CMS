# RC3-YT — YouTube publish-out: result

**Verdict: built-and-proven-locally / live leg NOT RUN.**

Base: GitHub main `551bd0e` (post-RC3-CE). Branch: `rc3-youtube`
(local only — delivery is Harbor's step). No new collection, no new
migration (180 total, unchanged): the existing schema sufficed, as the
audit predicted.

## What was built

1. **Upload-scope self-serve connect.** A creator/operator connects a
   YouTube channel for publishing from the social admin surface:
   `POST /api/admin/social/youtube-connect` (operator-grant authorized)
   starts an OAuth flow requesting `youtube.readonly` + `youtube.upload`
   using the CRE-06 encrypted-state-cookie pattern, and the callback
   rides the single registered redirect URI
   (`/api/creator-studio/external-video/callback`), routed to the
   publish branch by its own cookie so the read-only creator flow is
   untouched. On completion the channel claim is verified against the
   operator allowlist and the refresh token is stored on the site's
   YouTube social account in the existing `enc:` envelope — the same
   credential slot the adapter already reads. Disconnect clears the
   local credential first, then revokes at Google when a token exists,
   and reports the provider outcome honestly (`true` / `false` /
   `null` for no-token). The connect UI states plainly that the Google
   Cloud consent screen must be in **production** status — a
   testing-status screen kills refresh tokens after 7 days — and that
   OAuth client configuration is operator-supplied env; no credentials
   are embedded or committed.
2. **Processing-confirmed receipt.** The adapter no longer reports
   success when the byte transfer ends. After transfer it polls
   `videos.list` uploadStatus (bounded: 5 polls × 2s): `processed` →
   published receipt carrying the video ID, watch URL, and the
   processing status in the stored receipt; `failed` / `rejected` →
   an honest failed result with the provider's reason; still
   processing past the bound → `unknown` with the video ID attached,
   never fake-published. The executor persists that ID on the publish
   attempt, and a new read-only `reconcile()` settles it later from
   provider truth — by stored ID first, else by an exact
   title + description match over the channel's recent uploads
   (publishedAt ≥ scheduledFor − 24h guard). Reconcile never sends.
3. **Quota honesty.** Daily-quota provider reasons (`quotaExceeded`,
   `dailyLimitExceeded`, `uploadLimitExceeded`) now produce
   plain-language failures — the upload-limit message names the
   **100 uploads per day** bucket — with the retry set to the next
   UTC-midnight reset. Hourly rate limits keep the existing
   retry-after / +1h behavior. The two are never conflated.
4. **Publish action.** "Post to YouTube" creates a social draft +
   YouTube variant for a finished Studio video (title/description from
   Studio metadata, privacy and audience chosen at post time,
   compliance confirmation required) and stops at `draft` — the
   existing review → approve → schedule flow remains the only dispatch
   path. No parallel posting path. The Studio external-video workspace
   links a finished video into the panel pre-filled; the social
   command center's truth matrix now lists YouTube as a native adapter
   (flag-gated, live acceptance unverified).

## Proof (stand-in, not live)

All proof is against a faithful YouTube stand-in (token endpoint,
channels, resumable session, chunk PUTs, `videos.list` status
transitions) stubbed at `fetch` — the same technique as CRE-06. No
real network, no real channel, no live receipt is claimed.

- **Unit** (`tests/unit/rc3yt-youtube-publish.test.ts`, 12 new):
  processing poll outcomes (processed after still-processing polls,
  failed with reason, rejected, still-processing → unknown + video
  ID, transient poll error tolerated), quota classification
  (100/day message + midnight retry, shared daily quota → midnight,
  hourly stays hourly, `nextUtcMidnight`), reconcile (stored ID
  settles, stored ID still-processing stays unknown, title/description
  scan match, scan no-match stays unknown).
- **Integration** (`tests/integration/rc3yt-youtube-publish.integration.test.ts`,
  5 journeys through `executeSocialQueueItem`):
  A. connect → post draft → approve → dispatch → external-posts
  receipt with video ID/URL and `processingStatus: 'processed'` in the
  stored attempt receipt; the plaintext refresh token appears nowhere
  in the stored rows.
  B. quota-exhausted dispatch → failed `rate-limit`, dead-letter
  message names the 100/day bucket, `nextAttemptAt` is the next UTC
  midnight (±5 min), no external post created.
  C. revoked refresh token → failed `reconnect-required`, zero upload
  calls made.
  D. disconnect: revoke-success path (`providerRevoked: true`, local
  envelope cleared), no-token path (`null`), revoke-refused path
  (`false`, local still cleared).
  E. still-processing dispatch → `unknown`, video ID persisted on the
  attempt, no external post; read-only reconcile later settles it to
  published + receipt, having begun exactly one upload session total.
- **Existing tests updated deliberately** for the receipt-contract
  change (publication now requires processing confirmation):
  `tests/unit/cre06-video-providers.test.ts` and
  `tests/integration/cre06-external-video.integration.test.ts`
  stand-ins now answer `videos.list` with `processed`, publish
  expectations carry `processingStatus`, and call counts grew by the
  one status poll. The `dist-05` route-registration sweep passes
  unchanged.

## Gauntlet (CI order, final tree; full logs `rc3yt-gauntlet-*`)

| Step                     | Result                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migrations         | PASS — 180 migrations                                                                                                                                                                                                                                                   |
| Seed                     | PASS                                                                                                                                                                                                                                                                    |
| Upgrade migrations       | PASS — rehearsal to current                                                                                                                                                                                                                                             |
| format:check (repo-wide) | PASS                                                                                                                                                                                                                                                                    |
| lint                     | PASS — 0 warnings                                                                                                                                                                                                                                                       |
| typecheck                | PASS                                                                                                                                                                                                                                                                    |
| Unit                     | **3,023 passed / 0 failed** (RC3-CE baseline 3,011 → **+12**, exactly the new unit file)                                                                                                                                                                                |
| Integration              | **739 passed / 10 skipped / 0 failed** (baseline 733 / 11 / 0 → +6 passed, −1 skipped; total tests +5 = exactly the new journey file — the extra pass is one ffmpeg-gated podcast test that ran on this rig and was skipped in the baseline environment)                |
| Production build         | RIG-BLOCKED — the build process was OOM-killed during "Creating an optimized production build" (the documented ~6 GB VM limit that has killed local production builds in earlier passes); per this pass's rules it was not retried — CI arbitrates the production build |

Rig note: the rebuilt VM's Postgres cluster had lost the RC3-CE lock
tuning; `max_locks_per_transaction` was restored 64 → 512 (ALTER
SYSTEM + restart, the same fix recorded in RC3-CE's progress note)
before the fresh-migration verify would pass. Not a product issue.

## TikTok inbox-draft: DROPPED from this pass

Per the brief's own criterion it does not ride free, so it was not
built. The existing TikTok adapter is a Direct-Post implementation
whose receipt carries a fabricated profile URL
(`https://www.tiktok.com/@creator/video/${publishId}` — a literal
`@creator` placeholder, and the publish ID is a task ID, not a video
ID). An inbox-draft path would need a separate `video/upload/init`
flow, its own TikTok Login Kit connect, and draft-status semantics —
none of which rides on the YouTube machinery. TikTok Direct Post
remains RC4 work (audit-gated). The fabricated-URL defect in the
existing adapter is a known issue tracked separately from this pass.

## Live leg: NOT RUN

No real upload to a real channel was attempted, and no receipt in this
pass is live. The live leg requires, supplied by Matthew as operator
env: his own YouTube channel; a Google Cloud OAuth client ID/secret
whose consent screen is in **production** status; the channel listed
in `CREATOR_YOUTUBE_ALLOWED_CHANNELS`; and the upload authorization
flags (`CREATOR_YOUTUBE_UPLOAD_AUTHORIZED`,
`CREATOR_YOUTUBE_PUBLIC_UPLOADS_AUTHORIZED`) set. No channel or
credentials exist in this environment and none were created or faked.
Per-creator OAuth only — no master/shared account, no API-key path,
no password ever requested.
