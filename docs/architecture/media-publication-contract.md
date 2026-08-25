# Media publication contract

## Canonical ownership

`content` remains the publication spine. Books, podcast episodes, videos,
interviews and livestreams link to it; they do not copy lifecycle, audience,
taxonomy, sources, SEO, structured-data source, relationships or comment policy.
`media-assets` owns original stored bytes. It is immutable in practice: graphical
work references the source asset and produces a `media-derivatives` record and a
new asset rather than replacing the original.

External synchronization uses the tuple `provider:scopeId:externalId` as the
idempotency identity. An adapter must find-or-create by that key, update only
provider-owned metadata, and leave editorial changes intact. Live YouTube/RSS
verification remains pending until a configured connection is available; fixture
adapters must exercise the same identity path twice.

## Durable media work

Uploads, imports, rendering, transcription and TTS are represented by
`media-jobs` and run as Payload jobs. Request handlers may create a job or issue
a storage upload session, but never proxy large source bytes through memory.
Workers expose queued/running/retrying/failed/cancelled/completed state, progress,
failure data and an idempotency key. They check cancellation before committing
output. Render recipes and editable documents are persisted separately from
rendered bytes so an approved derivative can be regenerated and audited.

## Audio, accessibility and rights

Transcript revisions are append-only and provider, manual and AI-cleanup sources
remain distinguishable. AI cleanup derives a new revision; it never silently
rewrites manual text. TTS and publisher-read audio are distinct output modes:
both bind to a content revision, and publisher-read chunks remain private until a
completed media asset is attached. Provider implementations must retain licensed
output metadata, voice/pronunciation settings and consent/rights evidence. Voice
cloning is prohibited without explicit rights and consent.

Public player work must expose keyboard controls, captions or transcript access,
download policy, artwork/poster alternatives and responsive media. Book,
PodcastEpisode and VideoObject JSON-LD must be generated only from visible public
facts; feed output requires an XML/schema validation fixture before enabling a
public RSS URL.

## Graphics and capture

`graphic-documents` stores a vendor-neutral layered document; `edit-sessions`
stores the working session and `media-derivatives` stores immutable rendered
outputs and usage references. “Update all approved uses” and “fork this use only”
must be explicit operations over those references. Originals and unrelated
approved uses must not change.

Quick Capture uses authenticated normal editorial APIs. Offline client mutation
IDs deduplicate safe queued captures and expose queued/synced/conflict state;
reconnection routes conflicts through normal revisions and requests review rather
than publication or provider permission escalation.

## 2026-08-25 implementation status

The contract layer now includes deterministic fixture/live-adapter identity, released-book navigation, immutable transcript derivation, revision-bound TTS chunking and idempotency, and explicit graphics-use fork/update decisions. The acceptance proof is currently a focused contract test; it is deliberately not represented as a public feed or live-provider validation. Type generation and a database migration must run with `APP_URL`, `DATABASE_URL`, and `PAYLOAD_SECRET` before media records can be deployed. Until then, large source bytes remain outside request handlers by contract and any provider verification is pending.
