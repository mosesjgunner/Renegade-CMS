# RC3-SOC — Social adapter receipt-honesty fixes — RESULT

Date: 2026-11-26. Branch `rc3-social-receipts` on main `a9c0b9c`
(post PR #152 YouTube + PR #153 TikTok).
Authorized by Matthew, 2026-11-26: "Go — fix all five."
Spec: `files/social-adapter-receipt-audit-2026-11-26.md` (goal workspace) —
read-only audit of the ten adapters not covered by RC3-YT / RC3-TT:
5 CLEAN (Bluesky, Mastodon, Pinterest, Telegram, X — untouched),
2 DEFECT (Discord, Facebook), 3 SUSPECT (Instagram, LinkedIn, Threads).

The rule applied, matching the established YouTube/TikTok receipt
discipline: `published` only on identifiers the platform actually
returned; a receipt URL only from a real platform ID / permalink, never
constructed or invented; an outcome that cannot be confirmed is
`unknown`, never `published`. No contract change was needed — the
existing `AdapterResult` union (`published` with optional `remoteUrl` /
`receipt`, `failed`, `unknown` with `remote-unknown`) covers every case.

## 1. Discord — DEFECT (`src/modules/social/adapters/discord.ts`)

Before: when Discord's response body lacked a message ID, `publish()`
invented one from the local clock —

```ts
const remotePostId = body?.id || `msg-${Date.now()}`
const channelId = body?.channel_id || destination.channelId || '0'
const guildId = body?.guild_id || '@me'
const remoteUrl = `https://discord.com/channels/${guildId}/${channelId}/${remotePostId}`
```

— and returned `published` with a receipt URL built from the invented
ID plus fallback `'0'` / `'@me'` segments, pointing at nothing.
`fetchPost()` never contacted Discord at all: it returned a fabricated
`https://discord.com/channels/@me/0/{id}` URL, empty text, and
`publishedAt = now`. `editPost()` returned the same fabricated
`@me/0` URL in its receipt.

After:

- `publish()`: no message ID in Discord's response → **`unknown`**
  (kind `remote-unknown`, `remoteOutcome: 'unknown'`), never
  `published` with a fabricated ID. With a real ID, the URL is built
  only from the response's real `channel_id` / `guild_id` (or the bot
  destination's configured channel). A message object without
  `guild_id` is a DM, which Discord itself addresses with the literal
  `'@me'` segment — that is the platform's own addressing, not a
  fallback. If no channel ID is known, the result is `published` with
  the real ID and **no URL and no receipt** (the TikTok pattern).
- `fetchPost()`: performs a real GET of the message (webhook
  `/messages/{id}` or bot `/channels/{channelId}/messages/{id}`, routed
  through the shared dispatch boundary like this adapter's other
  calls) and builds the result from the returned message object. It
  throws an honest error when no destination is configured, the GET
  fails, or the response lacks the message ID, channel ID or
  timestamp — no invented URL, text or timestamp.
- `editPost()` (same adapter, same receipt surface): the receipt URL
  is built from the edit response's real `channel_id` / `guild_id`
  (or the bot destination's channel); if no channel ID can be
  confirmed it throws instead of returning a fabricated URL.

## 2. Facebook — DEFECT (`src/modules/social/adapters/facebook.ts`)

Before: when `scheduledPublishTime` was set (or `published: false`),
Graph was told to create an **unpublished / scheduled** post, yet the
adapter unconditionally returned `status: 'published'` with
`publishedAt = now` — a receipt asserting a publication the platform
had explicitly not performed. The photo paths ignored the settings
entirely and published immediately.

### The scheduling decision

**The adapter refuses the native-schedule / unpublished path; the
Renegade queue owns scheduling.** Reasoning, from the code:

- Queue items wait in `scheduled` status until their `scheduledFor`
  time is due; only then does the executor call `adapter.publish()`
  (`src/modules/social/tasks.ts` — `recoverSocialOutbox` /
  `executeSocialQueueItem`). The adapter is therefore invoked _at_
  publish time, and its contract is "publish now".
- Nothing anywhere in `src/` or `tests/` ever sets Facebook's
  `scheduledPublishTime` / `published` settings — the dishonest path
  was reachable only by hand-writing them into a variant's
  `platformSettings`.

So `publish()` now returns `failed` with kind **`unsupported`** —
before any Graph call, ahead of every publish path (feed, single
photo, album) — whenever `scheduledPublishTime` is set or
`published === false`, with a message explaining that Renegade
schedules in its own queue and dispatches when due. The dead
`published` / `scheduled_publish_time` payload construction was
removed; every post this adapter creates is published immediately by
Graph, and the synchronous Graph response (real post/photo ID) remains
the receipt, unchanged. The settings fields stay on the public
`FacebookPlatformSettings` type, documented as refused. No contract
change.

## 3. Instagram — SUSPECT (`src/modules/social/adapters/instagram.ts`)

Before: publication was genuinely confirmed (container polled to
FINISHED, `media_publish` returns the media ID), but the receipt URL
was `https://www.instagram.com/p/${publishedData.id}/` — the numeric
media ID stuffed into the `/p/` shortcode slot, a link Instagram never
issued (the adapter's own `fetchPost()` treats the platform
`permalink` field as authoritative).

After: `publish()` fetches the permalink for the published media ID
(`GET /{media-id}?fields=permalink`, the same read-back `fetchPost()`
performs) and stores it verbatim as the receipt URL. If the permalink
cannot be obtained, the result is `published` with the real media ID
and **no URL and no receipt** — publication itself is confirmed, so it
is not `unknown`; a missing link never becomes a constructed one.
Also added the Mastodon-pattern guard: a 2xx `media_publish` response
without a media ID returns `unknown` instead of a receipt identifying
nothing.

## 4. Threads — SUSPECT (`src/modules/social/adapters/threads.ts`)

Same shape as Instagram: publication was confirmed (container polled
to FINISHED, `threads_publish` returns the post ID) but the receipt
URL was constructed as `https://www.threads.net/t/${published.id}`
from the numeric ID. After: the platform `permalink`
(`GET /{post-id}?fields=permalink`, as in `fetchPost()`) is stored
verbatim; unobtainable → `published` with the real ID, no URL, no
receipt. A 2xx publish response without a post ID returns `unknown`.

## 5. LinkedIn — SUSPECT (`src/modules/social/adapters/linkedin.ts`)

Before: creation is confirmed by HTTP 201 and the post URN normally
arrives in the `x-restli-id` header, but the fallback was `|| ''` with
no presence check — a header-less 201 returned `published` with
`remoteId: ''` and the stub URL `https://www.linkedin.com/feed/update/`.

After: a missing URN returns **`unknown`** (kind `remote-unknown`,
`remoteOutcome: 'unknown'`) — the Mastodon/Bluesky guard pattern.
With the header present, behavior is unchanged (real URN, real URL).

## Tests

New suite: `tests/unit/social-adapter-receipts.test.ts` (15 tests),
mocking platform responses per fixed path:

- Discord: ID-less 2xx → `unknown`, and the serialized result contains
  no `msg-` invention and no channels URL; real ID without channel ID
  → `published` with no URL/receipt; `fetchPost` returns the real
  message (URL/text/timestamp from the response, GET endpoint
  asserted) and throws with no destination; `editPost` with an
  ID-only edit response rejects instead of fabricating a URL.
- Facebook: scheduled and `published: false` variants → `failed` /
  `unsupported` with **fetch never called** (including the photo path);
  an immediate feed post still publishes and its Graph payload is
  asserted to contain no `scheduled_publish_time` / `published` keys.
- Instagram / Threads: permalink present → stored verbatim (asserted
  not to contain the numeric ID in a constructed slot); permalink
  request fails → `published` with the real ID, no URL, no receipt.
- LinkedIn: header-less 201 → `unknown` with no `feed/update/` stub in
  the serialized result; 201 with `x-restli-id` → `published` with the
  real URN URL.

### Existing test updated deliberately (1)

`tests/unit/dist-06-telegram-discord-adapters.test.ts` — the Discord
edit/delete test mocked the edit response as `{ id: 'msg-999' }` only,
which matched the old fabricated `@me/0` receipt URL. The mock now
returns a realistic Discord message object
(`{ id, channel_id: 'chan-555', guild_id: 'guild-777' }`) and the test
additionally asserts the receipt URL is the real
`https://discord.com/channels/guild-777/chan-555/msg-999`. Stricter,
not weaker: the old mock encoded the fabrication; Discord's real edit
response always carries the message's channel and guild IDs.

A pre-fix grep confirmed no other existing test pinned any of the five
old behaviors (no test referenced `scheduledPublishTime`,
`published: false`, the IG/Threads constructed URLs, or a header-less
LinkedIn 201).

## Gauntlet

CI order, final tree, full logs in `~/workspace/rc3-wave3-logs/rc3soc-gauntlet-*`:

- Fresh migrations: **PASS** — 180 migrations applied to an empty
  database (baseline 180, unchanged; this pass adds no migration).
- Fixture seed: **PASS**.
- Upgrade migrations: **PASS** — rehearsal from
  `20260914_110000_med_05_video_workflow` to current.
- format:check: **PASS** (repo-wide, pinned Prettier).
- lint: **PASS** (`eslint . --max-warnings=0`).
- typecheck: **PASS**.
- Unit: **3,043 passed / 0 failed** (376 files). Baseline on base
  `a9c0b9c` was 3,028 — Δ **+15, exactly the new receipt-honesty
  tests**; zero regressions.
- Integration: **738 passed / 11 skipped / 0 failed**. Baseline was
  739 passed / 10 skipped — Δ −1 passed / +1 skipped is a single
  environment-gated test in `rc318-video-live.integration.test.ts`
  (`it.skipIf(!icecastPresentSync || !hasFfmpegBinaries)`): it ran on
  the baseline rig and skips on this one, which lacks the gated
  binaries. Unrelated to this pass; no integration test was added or
  changed.
- Production build + smoke: **rig-blocked**. One solo build attempt
  was OOM-killed at "Creating an optimized production build …" (the
  documented ~6 GB VM limit, same disposition as the RC3-CE / RC3-YT /
  RC3-TT passes); not retried — GitHub CI is the build arbiter. Smoke
  depends on the build and was therefore not run locally.

## Named plainly / unproven

- All proof is against mocked platform responses matching the
  platforms' documented response shapes; no live Discord / Facebook /
  Instagram / Threads / LinkedIn account has posted through these
  adapters in this pass. This pass changes what the adapters _claim_,
  and the claim discipline is what the tests prove.
- Discord `fetchPost` for a webhook destination uses the webhook
  message-read endpoint (`GET /webhooks/{id}/{token}/messages/{id}`),
  Discord's documented way to read a webhook's own message.
- Lesser honesty gaps noted by the audit in these same adapters were
  left as-is by design (out of this pass's scope): post-send network
  exceptions in Facebook/Instagram/Threads/LinkedIn map to
  `failed`/`transient` rather than `unknown` (Discord publish's
  exception path likewise). The five audited receipt defects are the
  scope; exception-path semantics are a separate question.
