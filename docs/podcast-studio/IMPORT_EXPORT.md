# Podcast Studio — Import & Export

Podcast-specific import/export behaviour for Renegade's native Podcast
Studio (POD-02, POD-REQ-06/07). This document sits alongside the
platform-wide `docs/IMPORT_EXPORT.md`, which covers site content
portability generally and is not replaced by this file.

## Importing an existing podcast

A show becomes importable by claiming it: set the show's
`importOwnership` to `claimed-import` and record the source feed in
`externalFeedUrl`. While a show is claimed, `importPodcastFeed`
(`src/modules/media/publishing.ts`) syncs episode metadata from the feed
(deduped by provider identity, so re-imports never duplicate episodes),
and — with media migration enabled — fetches the actual audio.

### Media migration (POD-REQ-06)

Migration is per-episode and resumable. Each imported episode carries a
state machine in `mediaMigrationState`:

```
not-requested → pending → fetching → verifying → done
                                  ↘ failed (reason in mediaMigrationError)
```

- **pending** — set when an import with migration enabled enqueues work.
- **fetching / verifying** — set by the migration worker as it downloads
  the enclosure and checks it.
- **done** — the fetched bytes' byte length matches the feed's declared
  enclosure length and their sha256 is recorded in `mediaChecksum`;
  only then is `episode.audio` re-pointed at a locally stored
  media-asset. The original remote URL stays in `externalUrl` as
  provenance.
- **failed** — the reason is written to `mediaMigrationError`, visibly,
  and the episode keeps pointing wherever it pointed before (never at
  corrupt bytes). One corrupt enclosure fails only its own episode.

Fetching reuses the core external-boundary safe fetch: SSRF discipline
(no private/internal destinations unless explicitly allowed), an
allow-list of audio content types, redirects constrained to the same
origin, and a 512 MiB cap counted while streaming (the fetch aborts the
moment the cap is exceeded).

Execution paths, same core function (`migrateEpisodeEnclosure` in
`src/modules/podcast-studio/import-media.ts`):

- **Queue (production path):** the Payload task `podcast-import-media`
  (queue `media`, retries with exponential backoff, concurrency keyed
  per episode). Transient fetch/network errors rethrow so retries
  engage; deterministic failures (length mismatch, non-audio bytes) are
  recorded on the episode and do not burn retries.
- **Inline (tests, reconciliation, scripts):** call
  `migrateEpisodeEnclosure(payload, episodeId, options)` directly, or
  pass it as the import's `runMediaMigration` driver.

Rerun safety: re-running an import never duplicates episodes (provider
identity), blobs (site + checksum dedupe), or assets (an asset for the
blob is reused), and an episode already `done` whose local asset still
matches its recorded checksum and the feed's declared length is a
no-op. An import interrupted mid-run leaves per-episode states behind;
the next run re-drives exactly the episodes that never reached `done`.

Storage decision: migrated bytes go through the platform media model —
`MediaStorage` (local or S3) + a `media-blobs` row + a `media-assets`
row, the same shape `uploadMedia` produces. Upload sessions
(`finalizeUploadSession`) were not used: they are owner-bound
interactive chunked uploads and require a staff session owner, which a
background migration worker does not have.

### Reconciliation & ownership (POD-REQ-07)

`reconcileClaimedImportShows(payload, siteId)` re-runs the sync for
every claimed-import show on a site (feed fetch + media migration). A
show with no recorded feed URL is reported as skipped; a show whose
feed fails is reported with its error and does not stop the others.

Ownership is honest about who controls the content:

- The importer's and migration worker's own writes are marked with a
  request-context flag and never change ownership.
- A genuine local edit to any episode of a claimed-import show (title,
  description, notes, audio, ordering fields, …) flips the show's
  `importOwnership` to `local`, stamps `ownershipChangedAt`, and logs a
  structured `podcast.import.ownership-taken` event.
- From then on, sync skips the show: `importPodcastFeed` refuses
  non-claimed shows and reconciliation no longer lists it. To resume
  syncing, an operator must deliberately re-claim the show.

## Moving a show to a new feed (export side)

`buildMovedFeedRedirect(show, newFeedUrl)` (in
`src/modules/podcast-studio/import-media.ts`) generates the migration
artifact for a show moving feeds, in or out of Renegade. It returns
text only; nothing is stored:

- `redirectDocument` — an RSS document to serve at the **old** feed URL
  when a true HTTP 301 is unavailable. It carries
  `itunes:new-feed-url` and `podcast:locked` set to **no** — a locked
  feed tells clients not to follow a move, so a feed must be unlocked
  before it can move.
- `checklist` — the per-show human runbook: publish and verify the new
  feed, keep episode GUIDs stable, prefer a 301 at the old URL (the
  document is the fallback), keep the old URL answering for at least 30
  days, update directory listings, announce the move, then retire the
  old host.

## Honest limits

- Real external feeds are **UNVERIFIED**: all POD-02 proof uses a local
  fixture server (fixture RSS + small generated audio bytes). No live
  podcast host has been imported from yet.
- The queue task is proven executed through Payload's job runner
  against the fixture host; against `127.0.0.1` it correctly refuses
  the private destination under production SSRF policy, so byte
  completion through the queue against a public enclosure is
  unverified in this environment (the core function it wraps is proven
  directly, inline).
- Provider-specific analytics, advertisements, and dynamic-insertion
  markers in a source feed are not migrated; the importer reports them
  as unsupported.
