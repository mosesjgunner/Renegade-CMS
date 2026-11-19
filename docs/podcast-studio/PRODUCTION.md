# Podcast Production Management (POD-04)

Production states, recording sessions, approvals, the guest book, and
the publish path for podcast episodes — POD-REQ-09, POD-REQ-10,
POD-REQ-37. All behaviour lives in
`src/modules/podcast-studio/production.ts`; the staff API under
`/api/podcast-studio/production/…` is a thin authenticated shell over
it. There is no board UI yet — the API + this document are the
surface (a board page can ride the POD-05 studio shell when it
lands).

## Production states

`podcast-episodes.productionState`:
`idea → scripted → scheduled-record → recorded → editing → review →
scheduled → published`, with `withdrawn` reachable from every state
and restoring to `published`. Transitions are guarded by the state
machine in `production.ts` (`transitionProductionState`); illegal
jumps (e.g. `idea → published`) are refused with
`PODCAST_PRODUCTION_TRANSITION_INVALID`.

The machine keeps the existing public `status` in sync on every
transition:

| productionState | public status | feed effect                              |
| --------------- | ------------- | ---------------------------------------- |
| published       | `published`   | in the feed                              |
| withdrawn       | `unavailable` | absent from the feed on the next request |
| scheduled       | `scheduled`   | not yet in the feed                      |
| everything else | `draft`       | not in the feed                          |

## Approvals

An episode in `review` (or `scheduled`) needs a recorded approval
before it can publish. Decisions are rows in
`podcast-episode-approvals` (episode, approver, decision, decidedAt);
the **latest decision wins** — a later `changes-requested` re-blocks
a previously approved episode. Publishing without a latest decision
of `approved` fails with the named error
`PODCAST_APPROVAL_REQUIRED` (`PodcastApprovalRequiredError`).

Why a new record: Workflow #19's approval machinery
(`EditorialWorkflow.decideReview`, driven through
`src/modules/editorial/persistence.ts`) is bound to article/content
bundles loaded by article id — it hydrates a workflow from a content
record and offers no primitive that records an approval against an
arbitrary record such as a podcast episode. POD-04 implements the
minimal approval record instead of faking a content bundle per
episode. If Workflow #19 later grows a record-level approval
primitive, this collection is the migration source.

## Recording sessions & the production board

`scheduleRecordingSession` creates an entry in the **existing**
calendar module's `calendar-entries` collection (no parallel
calendar), titled `Recording: <episode title>`, linked back to the
episode via the entry's `structuredData`
(`{ source: 'podcast-studio', kind: 'recording-session', episodeId,
showId }` — the collection's `references` relation does not include
podcast-episodes). Scheduling a session for an episode still in
`idea`/`scripted` moves it to `scheduled-record`.
`listRecordingSessions(episodeId)` reads the entries back;
`productionBoard(showId)` groups a show's episodes by production
state with counts.

## Guest book & consent

`podcast-guests` is the site's guest book (name, email, contact/links
JSON, bio, optional link to an `authors` record). It is production
data only: the feed's `podcast:person` path still reads
`episode.guests → authors` exactly as POD-01 built it, and nothing
reads the guest→author link automatically.

`podcast-guest-appearances` links a guest to an episode with prep
notes, planned questions, and a **per-appearance** consent record
(`consentAt`, `consentBy`, `consentScope`, `releaseUrl`). Consent is
never assumed from a past appearance.

The show-level `guestConsentPolicy` (`off` / `warn` / `block`,
default `warn`) governs admission through
`assertGuestAdmissionReady(payload, show, guestId)` — the hook
POD-10 consumes when admitting guests to sessions:

- `off` — never flagged.
- `warn` — admitted; the result carries a warning naming the
  appearances missing consent.
- `block` — admission throws `PODCAST_GUEST_CONSENT_REQUIRED` until
  consent is recorded.

A guest with no appearance on the show counts as missing (nothing on
file).

## Publish path (POD-REQ-37)

- `publishEpisode(payload, episodeId, { by })` — validates the state
  machine, the approval gate, and audio presence; sets
  `productionState`/`status` to published and stamps `publishedAt`.
- `replaceEpisodeAudio(payload, episodeId, mediaAssetId)` — swaps
  the audio asset and refreshes `enclosureBytes`/`enclosureMimeType`
  from it. The episode GUID never changes (asserted in the L1
  journey test; the feed advertises the new enclosure length on the
  next build).
- `withdrawEpisode` / `restoreEpisode` — withdraw/restore preserving
  the GUID and the original `publishedAt`, so subscribers see
  continuity rather than a new item.

## Staff API

All routes require a Payload staff session (owner/administrator/
staff role) plus an operator grant on the relevant site; responses
are `private, no-store`. Guard failures answer 409 with the error
`code`.

| Route                                                                  | Body / query                                             | Effect                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| `GET /api/podcast-studio/production?showId=`                           | —                                                        | production board       |
| `POST /api/podcast-studio/production`                                  | `{ episodeId, to }`                                      | one guarded transition |
| `POST /api/podcast-studio/production/publish`                          | `{ episodeId }`                                          | publish (full guards)  |
| `POST /api/podcast-studio/production/replace-audio`                    | `{ episodeId, mediaAssetId }`                            | swap audio             |
| `POST /api/podcast-studio/production/withdraw`                         | `{ episodeId }`                                          | withdraw               |
| `POST /api/podcast-studio/production/restore`                          | `{ episodeId }`                                          | restore                |
| `GET /api/podcast-studio/production/sessions?episodeId=`               | —                                                        | list sessions          |
| `POST /api/podcast-studio/production/sessions`                         | `{ episodeId, startsAt, endsAt?, timeZone?, title? }`    | create calendar entry  |
| `GET /api/podcast-studio/production/approvals?episodeId=`              | —                                                        | latest decision        |
| `POST /api/podcast-studio/production/approvals`                        | `{ episodeId, decision, note? }`                         | record decision        |
| `GET /api/podcast-studio/production/guests?siteId=`                    | —                                                        | guest book list        |
| `POST /api/podcast-studio/production/guests`                           | `{ siteId, name, … }`                                    | add guest              |
| `POST /api/podcast-studio/production/guests/appearances`               | `{ guestId, episodeId, … }`                              | link guest ↔ episode  |
| `POST /api/podcast-studio/production/guests/consent`                   | `{ appearanceId, consentBy, consentScope, releaseUrl? }` | record consent         |
| `GET /api/podcast-studio/production/guests/admission?showId=&guestId=` | —                                                        | admission evaluation   |

## L1 evidence

`tests/integration/podcast-studio-l1.integration.test.ts` executes
the acceptance journeys JP-1 (management-only import → publish →
POD-01-validated feed), JP-2 (POD-03 revocation spot-check), JP-3
(full production walk with every gate), and a record-level
episode+asset recovery. Platform-level backup restore
(`src/modules/operations/backup.ts`, pg_dump + media tarball) was
**not** executed — it stays UNVERIFIED and L1 is PARTIAL on the
recovery leg. See the POD-04 handoff for per-journey verdicts.
