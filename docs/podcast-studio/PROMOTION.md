# Podcast Studio — Promotion through shared systems (POD-18)

POD-18 is **integration only** (POD-REQ-38/39/40). It builds no new
distribution engine: episodes are wired into the platform's existing
social distribution system, the existing newsletter (audience)
system, the POD-13/POD-14 audiogram path, and a new embed surface
that renders the existing public player. All wiring lives in
`src/modules/podcast-studio/promotion.ts` (social + newsletter +
audiogram join) and `src/modules/podcast-studio/embed.ts` (embed /
oEmbed model, pure).

## Episode → social distribution

**What the social system actually allows:** `src/modules/social`
has **no programmatic enqueue service**. Its only creation path is
the inline logic of the admin drafts route
(`POST /api/admin/social/drafts`, action `create-draft`), which
persists a `social-drafts` record plus one
`social-network-variants` record per destination account.
`promotion.ts` is the minimal adapter over that same persistence
shape — it creates exactly those records, in the social system's
own collections, with the route's tenant discipline (every
destination account must belong to the episode's site; a foreign
account is refused with `PODCAST_PROMOTION_ACCOUNT_SITE_MISMATCH`).

- **Content template:** episode title + show-notes excerpt +
  canonical episode URL as the variant text and `linkUrl`; the
  episode's chapter artwork (episode artwork, else show artwork) as
  the variant attachment.
- **Destinations:** every `social-accounts` record connected on the
  episode's site (or an explicitly named subset). Destinations are
  not the canonical store, and no credential material is read or
  copied — credentials stay on the owner's install in
  `social-accounts` (the credential envelope is never touched).
- **Opt-in:** per-episode, **default OFF**. An episode enqueues only
  when its `promotion.socialOptIn` flag is set or the publish call
  passes `promoteSocial: true`. `publishEpisode` (POD-04) performs
  the enqueue after a successful publish; a promotion failure never
  unpublishes the episode — it is recorded as
  `promotion.socialStatus: 'failed'` with the error.
- **Exactly one:** enqueue is idempotent per episode (an existing
  promotion draft for the episode is returned, never duplicated).
- **Status:** visible on the episode's `promotion` json
  (`socialDraftId`, `socialStatus`, `socialEnqueuedAt`) and read
  back live from the social system's own state by
  `episodePromotionStatus` — draft/review/approved/scheduled/queued
  → `queued`, published → `sent`, failed/cancelled → `failed`, plus
  any `social-queue-items` statuses.
- **Named gap:** the social system requires operator review +
  approval + scheduling before anything dispatches (its
  `social-queue-items` are created only by the schedule action,
  which also queues the `social-publish` job). A promotion therefore
  lands as a **draft awaiting the operator's existing review** —
  never auto-approved, auto-scheduled, or auto-posted. That is the
  system's own rule, not a POD-18 shortcut. **Actually posting to a
  live platform is UNVERIFIED** (no live accounts in this
  environment); the proof is enqueue correctness against the
  platform's own collections.
- **Observed drift (not POD-18's):** the acceptance DB's
  `enum_social_accounts_network` predates the collection's
  `mastodon`/`pinterest`/`telegram`/`discord` values, so accounts
  with those networks cannot be created against that DB until its
  schema catches up.

## Episode → newsletter

**What the newsletter system actually allows:** the audience system
has no compose service — a newsletter is an `email-messages` record
(`kind: 'bulk'`) whose `blocks` satisfy the audience EmailBlock
contracts. `composeEpisodeNewsletterDraft` creates exactly that:

- subject = episode title, preheader = excerpt, blocks = heading +
  notes text + a content card + a **"Listen to the episode" button,
  both carrying the episode's canonical URL** (absolute http(s),
  validated by `validateEmailBlocks` before creation), artwork on
  the card when present.
- **Draft only, always:** status `draft`; the function never submits
  for review, schedules, or sends. Review/schedule/send stay with
  the audience system's own flow.
- Idempotent per episode (`idempotencyKey: podcast-newsletter:<id>`);
  the draft id is recorded on the episode's `promotion` json.
- **Sending a newsletter is UNVERIFIED** (no live sending here); the
  proof is draft correctness at the service level.

## Audiograms (promotion of a highlight)

POD-13 delivered the audiogram MP4 profile (artwork/waveform MP4
from a windowed range) and POD-14 delivered the join:
`createAudiogramFromHighlight` renders an accepted highlight through
that profile and records the MP4 as a media asset on a
`podcast-assist-drafts` row linked to the episode (downloadable via
the episode's assist/asset list). POD-18 adds only the
promotion-facing entry point, `createAudiogramForAcceptedHighlight`,
which starts from an **accepted** POD-14 highlight draft (anything
else is refused by name: `PODCAST_HIGHLIGHT_NOT_ACCEPTED`) and
delegates — no render code was rebuilt. The POD-14 integration
suite (audiogram from an accepted highlight → real MP4, ffprobe
h264 + AAC ≈ range duration) is the join's regression proof and is
green with POD-18.

- **Captioned audiograms (POD-21):** the POD-13 audiogram profile
  gained an optional captions variant — when the episode carries a
  reviewed transcript, `createAudiogramForAcceptedHighlight` renders
  with the clip range's transcript segments re-timed to the clip
  start and burned in via ffmpeg's libass `subtitles` filter. With
  no transcript (or no segment overlapping the range) it renders the
  original waveform-over-artwork variant. Either way the variant is
  recorded on the audiogram draft's provenance (`captionsBurnedIn`,
  plus the SRT and segment count when captioned).

## Embeds + oEmbed

- **Embed route:** `/podcasts/episodes/[slug]/embed` in the
  chrome-free `(embed)` route group (its own root layout — no site
  header/nav/footer) rendering the POD-14-upgraded `PodcastPlayer`
  in its new **compact mode** (transport only; chapter/transcript
  panels are full-page surfaces).
- **oEmbed discovery:** the canonical episode page carries an
  `application/json+oembed` link tag; `GET /api/oembed?url=<episode
URL>&format=json` returns the oEmbed 1.0 rich document
  (`version`, `type: 'rich'`, `title`, `html` = the embed iframe,
  `width`/`height`). Non-JSON formats get 501; unpublished episodes
  get 404.
- **Members-only (POD-03):** a members-only episode (flagged, or on
  a members-visibility show) embeds as the player's **locked
  state**. Embeds carry no member credential, so the embed markup
  and the oEmbed document contain **no audio/enclosure URL at all**
  (asserted at markup level in unit + integration tests). Members
  listen via their token feed or the signed-in episode page.

## Schema

Migration `20261118_260000_rc3_pod18_promotion`: `podcast_episodes`
gain one `promotion` jsonb column. No new tables — social drafts
live in the social system's collections and newsletter drafts in
`email-messages`. Rollback drops exactly that column.
