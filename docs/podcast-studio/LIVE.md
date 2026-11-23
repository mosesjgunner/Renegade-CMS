# Podcast Studio — Live Output (Icecast Relay)

POD-16 (POD-REQ-34, POD-REQ-35). A show can stream live to its own
Icecast server while the studio records locally, and the recording
never depends on the stream. This document is the operator surface:
how to set up Icecast, how to configure a show, what happens when
things fail, and — stated plainly — what is NOT proven yet.

Code: `src/modules/podcast-studio/live/` (stream profile +
credentials, relay supervisor core, ffmpeg process adapter, session
surfacing, episode lifecycle service, audience room binding, and the
test fixture). Staff API: `/api/podcast-studio/live`.

## 1. Operator Icecast setup

Renegade does not run an Icecast server for you; live output is
sovereign-first like everything else — you point a show at an
Icecast **you** control (your VPS, a venue box, a home server).

Minimal `icecast.xml` for one or more shows:

```xml
<icecast>
  <listen-socket><port>8000</port></listen-socket>
  <authentication>
    <!-- the "source password": shows authenticate as user "source" -->
    <source-password>CHOOSE-A-STRONG-PASSWORD</source-password>
    <admin-user>admin</admin-user>
    <admin-password>CHOOSE-A-DIFFERENT-STRONG-PASSWORD</admin-password>
  </authentication>
  <hostname>icecast.example.org</hostname>
</icecast>
```

Notes:

- Each show gets its own **mount** (e.g. `/renegade-party-live`,
  `/fubar-live`). One mount per show keeps listener URLs, stats and
  now-playing separate.
- The relay connects as user `source` with the show's source
  password and pushes MP3 at the profile's bitrate. Listeners open
  the mount URL (`https://icecast.example.org:8000/<mount>`) — the
  same URL stored as the profile's `sourceUrl`.
- Now-playing updates use Icecast's admin API
  (`/admin/metadata?mount=…&mode=updinfo&song=…`) with the admin
  credentials. The relay currently authenticates that call with the
  show's configured credential as the admin password — so for
  now-playing to work against a stock Icecast, set the show's stream
  credential to the password Icecast accepts for admin metadata
  updates on that mount, or run one Icecast per show with matching
  source/admin passwords. This coupling is a known v1 simplification
  (see §6).
- Put Icecast behind your normal TLS/reverse-proxy setup for public
  listeners; the relay itself can push to a private address.

## 2. Stream profile (per show)

On the podcast-show record:

| Field                       | What it is                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `streamProfile` (JSON)      | `{ sourceUrl, bitrateKbps, title, enabled, nowPlayingEnabled }` — mount URL, MP3 bitrate (16–320), stream title listeners see first, master on/off, and the now-playing toggle. |
| `streamCredentialEnvName`   | Name of an environment variable holding the source password (recommended for self-hosters: the secret never enters the database).                                               |
| `streamCredentialEncrypted` | AES-256-GCM envelope of the source password, written only by the live service when you save a password through the API. The API never returns this field (read access is off).  |

Rules that are enforced, not just documented:

- The profile JSON **refuses credential-shaped keys** — a password
  pasted into the JSON is rejected at save time, and a `sourceUrl`
  with credentials embedded in it is rejected too.
- The credential is resolved server-side only, at relay start. It
  never appears in API responses (only `hasCredential: true/false`),
  in the feed, or in relay log lines — supervisor logs pass through
  a redactor that scrubs the raw, URL-encoded, and Basic-base64
  forms. The POD-16 integration suite scans logs + profile + feed
  after a full live session and asserts absence.
- Set the profile via `POST /api/podcast-studio/live`
  `{ action: 'set-profile', showId, profile, credential }` (staff +
  operator site grant), or the service functions in
  `live/live-service.ts`.

## 3. Running a live show

1. **Schedule**: create the episode and
   `POST { action: 'schedule', episodeId, startAt }`. The episode
   enters the feed as a `podcast:liveItem` with status `pending`,
   pointing at the mount URL.
2. **Go live**: start the relay for the studio session (the
   supervisor, §4) and `POST { action: 'go-live', episodeId }` —
   the liveItem flips to status `live`.
3. **During the show**: the studio records locally exactly as in a
   non-live session (POD-09). Now-playing follows the played-clip
   log (POD-08) when the show's toggle is on: fire a cart/player
   clip and the stream title becomes the clip's title.
4. **End show**: `POST { action: 'end-show', episodeId }`, then stop
   the relay. The episode stays in the feed as an `ended` liveItem
   until it is converted.
5. **Convert**: finalize the recording (POD-09), then
   `POST { action: 'convert', episodeId, recordingId }` — the
   recording's program track becomes the episode's audio.
   Conversion is idempotent: repeating it (or a reconnect replaying
   it) changes nothing and never mints a duplicate episode or GUID.
   Becoming a **public feed item** is then the show's normal POD-04
   editorial step (editing → review → approval → publish): POD-16
   deliberately does not bypass the publish guards. Once published,
   the feed carries a normal item with the recording enclosure under
   the same GUID the liveItem had.

## 4. The relay supervisor

One ffmpeg process per live session (`live/relay.ts` core +
`live/relay-process.ts` adapter):

- **Input**: the session's program audio. Proven transports are a
  local **pipe** (raw s16le stereo 48 kHz PCM on ffmpeg's stdin), a
  **file/URL** source, and — since POD-21 — the **browser ingest
  buffer**: the studio browser uploads sequential PCM chunks to the
  per-session ingest endpoint, and a FIFO pump feeds the buffer's
  contiguous program file to ffmpeg's `ingest` input. See §6 for
  what remains unproven on that path.
- **State machine**: `idle → connecting → live`, on process exit
  `→ reconnecting` with bounded exponential backoff (1 s → 30 s cap,
  5 restarts by default), then `→ failed` until an operator restarts
  it. `stop()` is terminal. A process that stays live 30 s earns its
  restart budget back.
- **Observability**: every health change is folded into the POD-05
  session document (`liveStream` extension + `live-relay-state`
  entries in the session log), which is what the on-air bar renders.
  The on-air model shows stream health and recording health side by
  side — from two independent state machines.

## 5. Failure behaviour (POD-REQ-35)

Stream and recording are independent state machines sharing only
the session clock. Concretely, and proven in the POD-16 suites:

- **Relay killed mid-record** → the recording state is untouched
  (asserted deep-equal), the recording journal receives no writes
  from the stream side (asserted byte-identical), chunks stay
  sample-continuous across the kill, and the stream reconnects on
  its backoff.
- **Network cut** (every connection attempt fails) → restarts stay
  bounded; after the budget the relay is `failed` and stays there —
  no restart storm, no partial writes anywhere near the recording.
  A simulated 60 s cut is in the unit suite.
- **Stream failure never stops, pauses, or corrupts a recording.**
  The supervisor has no reference to the recorder or the journal;
  the separation is structural, not a flag.
- **Reconnects create no duplicate episode artifacts** — conversion
  is keyed to the recording's program asset and is a no-op when
  repeated.

## 6. What is NOT proven / known gaps

- **Browser→ingest byte path: server side BUILT in POD-21; the
  browser leg is still UNVERIFIED.** The ingest endpoint
  (`/api/podcast-studio/live/ingest`, staff + operator site grant,
  session-scoped) accepts sequential s16le PCM chunks with sequence
  discipline (idempotent re-sends, gaps recorded, conflicting bytes
  refused) into a per-session file-backed buffer under the media
  storage area; the FIFO pump (`live/ingest-pump.ts`) tails the
  buffer's program file into the relay's `ingest` input, and an
  ingest stall surfaces in the session log. Proven end-to-end at the
  server level: synthetic PCM chunks pushed through the real HTTP
  handler → buffer → pump → relay → fixture → a listener received
  ffprobe-verified decodable audio, including after a mid-show relay
  kill/reconnect. What is NOT proven: a real browser sending the
  bytes — the workspace adapter (`live/ingest-browser.ts` +
  `LiveIngestPanel`) is typechecked wiring only, no browser ran it,
  and the POD-07 mixer graph is not mounted in the workspace surface
  yet. Opus chunks are refused by name (the relay consumes raw PCM;
  no decode stage exists). Do not claim a browser can stream live
  through Renegade today.
- **The test server is a protocol fixture, not Icecast.** icecast2
  is not installed on the development rig, so the suites run against
  `live/icecast-fixture.ts` — a minimal server implementing the
  Icecast source/listener/admin protocol shape (it exists because
  ffmpeg's close-delimited PUT body defeats Node's HTTP parser).
  Listener proof is real (a client received MP3 that ffmpeg decoded
  back to the fixture tone, duration and level measured), but real
  Icecast behaviour — mount fallbacks, listener scale, long-haul
  network behaviour, a venue/home audience — is UNVERIFIED.
- **Now-playing credential coupling**: metadata updates authenticate
  with the show's stream credential as the Icecast admin password
  (§1). A future stage should split source and admin credentials.
- **Audience room.** Create a Community Room under `/rooms` and pass
  its conversation ID in `liveRoom: { roomId, access }` via
  `POST /api/podcast-studio/live` with `action: 'bind-room'`. The episode
  page links to the room. A member binding applies the show's current
  podcast entitlement to room reads and playback in addition to the
  room's audience policy. Missing rooms, rooms from another site, and
  incompatible policies return an error when binding.
- **Live event layer**: scheduling a live episode uses the
  episode's live-state fields; promotion/ticketing through the
  events + commerce machinery (per the LIVE-SHOWS addendum) is not
  wired in this stage.
