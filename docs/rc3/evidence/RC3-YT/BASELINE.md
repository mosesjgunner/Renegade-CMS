# RC3-YT — YouTube publish-out: baseline audit

Base: GitHub main `551bd0e07167bea8deba129a0acae3f5c655cb47` (post-RC3-CE,
PR #151). Audit completed read-only by the first coordinator on
2026-11-26; build resumed the same day after Matthew's plain-words
go-ahead. This pass integrates with existing machinery — it does not
rebuild it.

## What already exists on main

1. **The social queue is the publish path** (RC3-16): social-drafts →
   social-network-variants (approval hash, review/approve) →
   social-queue-items → Payload job `social-publish`
   (`src/modules/social/tasks.ts` `executeSocialQueueItem`) → adapter →
   social-publish-attempts audit + external-posts receipt
   (remoteId/remoteUrl/remoteState/publishedAt). Bounded retries
   (MAX_PROVIDER_ATTEMPTS=3), dead-letter reasons, manual-handoff
   parking, read-only reconcile for unknown outcomes.
2. **A real YouTube adapter exists**
   (`src/modules/social/adapters/youtube.ts`): resumable
   `videos.insert` (8 MiB chunks, 308 range-probe recovery, session URL
   validation), scope re-check via token refresh requiring
   `youtube.readonly` + `youtube.upload`, channel claim check, quota
   errors mapped to rate-limit with retry-after. It is gated OFF unless
   BOTH operator env flags are set:
   `CREATOR_YOUTUBE_UPLOAD_AUTHORIZED=true` and (for public/unlisted)
   `CREATOR_YOUTUBE_PUBLIC_UPLOADS_AUTHORIZED=true`. Otherwise
   `socialProviderFor('youtube')` returns a manual-handoff stub.
3. **Per-creator connect exists but is READ-ONLY.** Creator Studio
   external video (`src/modules/creator-studio/external-video.ts`,
   routes `/api/creator-studio/external-video` + `/callback`) runs
   Google OAuth (PKCE, encrypted state cookie) requesting ONLY
   `youtube.readonly`; the grant is stored per site+member in
   `youtube-channel-claims` as an AES-256-GCM envelope
   (`encryptSecret`, `RENEGADE_ENCRYPTION_KEY`). Disconnect purges
   locally first, then calls Google's revoke endpoint and reports
   `providerRevoked` honestly. CRE-06's own result doc states: "The
   creator import grant is read-only."
4. **Publishing credentials today are operator-pasted**: an operator
   manually enters the channel ID + an encrypted refresh token (minted
   outside Renegade with both scopes) into the social account's
   `connectionReference` (`enc:` envelope; read access disabled on the
   field; redacted views in `account-view.ts`; plaintext JSON refused
   since SOC-SEC-1).
5. **Channel allowlist**: `youtubeConfiguration()`
   (creator-studio/youtube-metadata.ts) requires
   `CREATOR_YOUTUBE_ALLOWED_CHANNELS`; both the claim check
   (`YouTubeMetadata.channel`) and the adapter enforce it.
6. **Platform facts** (scoping doc, verified against YouTube's own
   changelog/quota pages 2026-11-24): uploads via `videos.insert` from
   unverified API projects are no longer forced private (Nov 2, 2026
   repeal); default quota is 100 `videos.insert`/day in its own bucket
   plus 10,000 shared units/day; uploads require OAuth 2.0 with the
   `youtube.upload` scope from the channel owner (per-creator connect,
   no master key); an OAuth consent screen left in "Testing" status
   issues refresh tokens that die in 7 days — the app must be in
   production status for durable connects.

## Gaps this pass closes

- **No self-serve publishing connect.** No in-product flow grants
  `youtube.upload` to a site's social account; a creator/operator
  cannot connect a channel for publishing without an out-of-band
  minted token pasted by hand.
- **No processing-status confirmation.** The adapter returns
  `published` the moment the byte transfer completes; nothing polls
  `videos.list` `uploadStatus` (processed/failed/rejected). The
  receipt stores no processing status, and the adapter has no
  `reconcile()` — YouTube unknowns cannot settle from provider truth.
- **No quota honesty.** Quota errors collapse to a generic rate-limit
  retry (+1h default); the 100-uploads/day bucket is never surfaced in
  plain language, and `uploadLimitExceeded` is lumped with hourly rate
  limits.

## Out of scope / decided

- **TikTok inbox-draft: DROPPED.** The existing TikTok adapter
  (`adapters/tiktok.ts`) is a Direct-Post implementation that returns
  `published` with a fabricated profile URL; it is not the inbox-draft
  path and is not registered for dispatch. Inbox-draft would need a
  separate `video/upload/init` flow, its own TikTok OAuth connect
  (Login Kit, different client config), and draft status semantics
  that do not ride on the YouTube machinery. Per the brief's own rule
  ("only if it rides free"), it drops out of this pass. TikTok Direct
  Post stays RC4 (platform audit).
- No master/shared YouTube account or API-key path; no scheduled or
  queued mass posting beyond platform quota; no analytics, comments,
  or channel management — posting only.
- The live leg (a real upload to a real channel) requires Matthew's
  own YouTube channel and a Google Cloud OAuth client whose consent
  screen is in production status, supplied as operator env. No such
  credentials exist in this environment; none are created or faked.
  The live leg is **NOT RUN** in this pass.
