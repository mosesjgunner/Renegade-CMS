# Podcast Studio — Remote Guests (POD-10)

See [Interactive Podcast Studio](INTERACTIVE_STAGE.md) for the current browser stage, mixed program outputs, and verification scope. This document records the original guest service and ISO capture work.

Guests join a live studio session from a link. They have **no account**
and never create one: the invite link is the credential, the guest
types a display name, and everything after that runs on server-side
state that is integration-tested against Postgres.

## What is proven (and what is not)

**Proven** (unit + integration tests against real Postgres):

- Invite tokens: single-use, purpose-bound (`guest-invite`),
  session-bound, expiring, revocable; rotation revokes the previous
  invite instantly. Only SHA-256 hashes are stored (the POD-03
  pattern) — raw tokens exist only in the issue/join responses.
- The lobby state machine: `invited → preflight → waiting → admitted →
dropped/left`, with the mesh bound **host + at most 3 remote guests**
  enforced at admission.
- The consent gate: admission calls POD-04's
  `assertGuestAdmissionReady`. Under a show's `block` policy an
  unconsented guest is refused at the admission/signalling layer;
  `warn` admits with the warning surfaced to the host.
- Signalling authorization: media negotiation (offer/answer/ICE) is
  refused for any guest who is not `admitted` — enforced in the
  signalling service, not just the UI. Cross-session tokens are
  refused at the signalling and clip-upload boundaries; a guest token
  presented to staff routes gets 401.
- Guest clip slots: an admitted guest's clip (≤ 60 MB) lands in the
  session's `guest-slots` cart bank, bound to (session, guest); the
  host can revoke it; nothing leaks into other sessions.
- Guest local recording + conform (POD-11): the guest journal,
  credential-scoped chunk upload (kill/resume, no duplicates,
  checksum-verified completion), the conform core + ffmpeg job, and
  all three fallback-ladder rungs are proven headlessly and against
  real Postgres — see the POD-11 section below. Real-browser
  recording and real-device drift stay UNVERIFIED (below).
- The peer-session core: connection state machine, reconnect backoff
  with a hard budget inside the 120 s grace window (exhaustion drops
  the session with the reason logged), the ICE config builder, the
  telemetry thresholds, and the POD-07 mix-minus bus assignment
  (a guest's receive stream is the program minus their own return,
  plus talkback; their own-return energy is exactly 0 by inclusion).

**UNVERIFIED**: real WebRTC media in a browser, NAT traversal, TURN
relay, and real getStats telemetry. `peer-browser.ts` is a thin,
typechecked adapter over the proven cores; no two-browser session has
run on a rig. Rig tests that would close this: (a) two headless
browsers on different NAT profiles completing a mesh session with
per-guest energy assertions on the mix-minus receive; (b) the same
with a real coturn in forced-relay mode; (c) Safari + Firefox guest
joins.

## Signalling transport — the choice and why

Signalling runs as **authenticated HTTP long-poll over a durable
Postgres message log** (`podcast-signalling-messages`), under
`src/app/(frontend)/api/podcast-studio/guests/…`.

Why not something else:

- The repo has **no WebSocket server** and no such dependency; adding
  one for SDP/ICE exchange alone is not justified.
- The repo's one realtime layer (SSE over the `realtime-events`
  collection, `/api/realtime/stream`) requires an authenticated
  **team member**. Guests hold no account by design, so that layer
  cannot carry guest signalling.
- WebRTC SDP/ICE exchange is request/response shaped. Long-poll
  carries it with no new service: a poll returns the moment a message
  row lands, with a 25 s cap. The honest cost is push latency bounded
  by the poll window in the worst case — acceptable for call setup,
  and the log doubles as the session's signalling audit trail.

## Invite lifecycle

1. Host issues an invite from the studio lobby panel (staff API:
   `POST /api/podcast-studio/guests/invites`) for a session, optionally
   linked to a guest-book guest. The response carries the raw token
   **once**; the join link is `/studio/guest/<token>`.
2. The guest opens the link: preflight = display name, device check
   (POD-06 cores; saved devices resolve **fail-closed** — a missing
   saved mic blocks the join and names the device), and a headphone
   declaration (`headphones` or `no-headphones-fallback`).
3. Join consumes the token (it can never join twice) and returns a
   separate **signalling credential**, also hash-only at rest, which
   authenticates the guest's signalling polls/posts and clip uploads.
4. The guest waits. **Nothing is transmitted pre-admission** — the
   signalling service refuses media messages until the host admits.
5. Host admits (consent gate + bound checked server-side) or drops.
   Admission mirrors the guest into the POD-05 session doc (guest
   entry + a mixer strip), which is what the POD-07 mix-minus buses
   and the POD-09 guest ISO recording slots key off.
6. Revocation works at any point: an un-joined invite dies; an
   admitted guest is dropped. A dropped connection may reconnect
   inside the **120 s grace window**; outside it, the place is gone.

Per-guest controls: the guest's mixer strip (fader/mute) lives in the
studio mixer section; talkback (host → admitted guests) rides the
POD-07 talkback send, which has **no route** to program/record/stream
by construction. Telemetry warnings (delay > 300 ms, loss > 5%)
surface from the peer-session core's aggregation of adapter stats.

## Guest clip slots

An admitted guest can send one audio clip (≤ 60 MB) into the show:
bytes go through the existing media upload path, and
`POST /api/podcast-studio/guests/clips` binds the resulting media
asset to the (session, guest) slot in the session's `guest-slots`
cart bank (POD-08 players can play it; the host can stop it there,
replace it by registering a new clip, or revoke it via
`DELETE /api/podcast-studio/guests/clips`). The guest credential only
ever resolves its own invite, so a clip can never land in — or be
read from — another session.

## Guest local recording + conform (POD-11)

The received WebRTC stream is a **safety net, not the master**. From
admission, the guest's browser records their own mic locally on the
POD-06 chunk journal (250 ms timeslices, SHA-256 + running chain,
OPFS storage), bound to (session, guest, invite) with track id
`guest-<inviteId>` — the same slot POD-09 assembly uses for that
guest's ISO track. Recording state (phase, frames, chunks, gaps)
rides the POD-10 signalling channel as `guest-recording` telemetry,
so the host sees whether the local master is healthy while the show
is running.

**Sync.** The journal carries head/tail **sync pairs**
`{guestTrackSamples, hostTimelineSamples}`: where the guest's track
samples sit on the host's session timeline. The head pair comes from
the lobby/admission timestamps plus the POD-09 head-sync pattern;
both pairs are corresponded through signalling. Two points, not one,
because device clocks drift — head-only alignment is off by the full
drift at the tail (288 ms over an hour at +80 ppm; the PT-F F4
control, reproduced in the POD-11 suite).

**Upload.** After the session (or whenever the network allows), the
journal chunks upload to `/api/podcast-studio/guests/chunks` under
the guest's signalling credential — same cross-session discipline as
clip slots: a credential aimed at another session is refused before
any byte lands, and a guest who was never admitted has no track to
upload. Uploads stay open after the guest leaves or is dropped, so a
finished session can still deliver its master. The server keeps the
journal layout (bytes before the manifest line); a byte-identical
re-send is an idempotent ack, changed bytes for a received chunk are
refused (`chunk-conflict`), and completion is verified against the
journal — chunk count, frames, and the running checksum must match
the guest's footer — before the track is conform-eligible. An upload
killed at ~50% resumes from the server's received list with **no
duplicates** (proven in the unit + integration suites).

**Conform.** The `podcast-conform-track` job aligns the guest track
to the session timeline: the sync pairs yield the POD-00 EDL
**rateCorrection** artefact (measured rate = nominal × guestSpan /
hostSpan, computed by POD-09's drift estimator — reused, not
reimplemented), ffmpeg applies it as a pure rate correction
(`asetrate` + `aresample`, never `atempo`), the head offset is placed
sample-accurately, and the result registers as the guest's ISO media
asset. The session's POD-09 track manifest is updated and the full
conform report (offset, measured rate, residual estimate, gap list)
is stored on the recording record for POD-12's EDL. Measured on
synthetic fixtures: +80 ppm recovered as 80.000 ppm over a simulated
hour (residual < 0.05 ms); a +800 ppm / 24,000-sample-offset fixture
aligns with max impulse error 1 sample; real ffmpeg conform of a
2 s WAV with +800 ppm injected lands duration within 1 frame and the
impulse within 0 samples.

**Gaps are data, not silence-by-stealth.** A network disconnect does
not by itself create a gap — the local recorder kept capturing. Only
when capture itself stopped does the missing range get journalled as
silence **plus a named gap record**, which the conform report maps
onto the timeline. Nothing is ever time-stretched to hide a hole.

**The fallback ladder — a guest is never silently lost:**

1. Local recording present and complete → conform it (best).
2. Local missing or failed → the POD-09 guest ISO slot recorded from
   the received stream is stored and marked
   `degraded: live-capture` on the manifest; the recording record
   goes `degraded`.
3. Neither → the guest's manifest entry carries a full-range gap and
   an explicit `guest track missing` error, with a stored
   `missing-gap` conform report.

**UNVERIFIED**: real guest-browser recording (the page wiring is
typechecked; getUserMedia/OPFS in a real browser have not run), the
host-clock correspondence of sync pairs in a real two-browser
session (the page currently posts a local placeholder pair), and
real-device clock drift. The rig test that closes all three: host +
guest on separate devices for 30+ minutes with acoustic sync events
at head/mid/tail, asserting conform residual < 5 ms/hr against the
real devices' clocks, plus a mid-record/mid-upload tab kill proving
journal recovery and duplicate-free resume.

## TURN / coturn

Sessions work without any TURN server: STUN defaults are built in,
the host side is unaffected, and guests on friendly NATs connect
directly. Guests behind hostile NATs may fail without TURN — that
limitation is surfaced in the ICE config and the guest's diagnostics,
never hidden. Operators who want relay coverage run their own coturn;
see [COTURN.md](COTURN.md) for the runbook. There is deliberately
**no hardcoded public TURN server** in the codebase.

## The mesh bound and the SFU trigger

v1 is a mesh: host + ≤ 3 guests, each guest receiving their POD-07
mix-minus. **Revisit trigger**: when a show needs 8 simultaneous
guests, the mesh must be replaced by an SFU — that is a new prompt,
not a config flag, and the bound is stated here and in
PODCAST_PROJECT_STATE.md rather than discovered in production.
