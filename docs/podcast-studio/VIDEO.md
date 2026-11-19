# Podcast Studio — Video (POD-17, bounded)

Video episodes in Renegade are an **explicitly bounded** variant of the
audio podcast, not a video production suite. This document states what
v1 does, what it does not do, and what is unverified — plainly, so no
operator or listener is ever promised more than the system delivers.

## The bounds (v1)

**In v1:**

- A participant (host or guest) may record a **camera track** alongside
  the session's audio tracks — only with that participant's explicit
  opt-in. Consent is a flag on the track, **default OFF**, fail-closed:
  no consent on record means the camera never records, and the flag is
  carried into the session's track manifest so the grant is auditable.
- An episode's video is **rendered after the fact** from the finished
  program audio (the POD-13 master) in one of two modes:
  - **Camera mode** — the single recorded camera track, full frame,
    scaled/padded to 1280×720, muxed with the program audio. A camera
    shorter than the program is extended by freezing its last frame; a
    longer one is trimmed. The camera file's own audio is never used.
  - **Slideshow mode** — the floor every show gets, no camera needed:
    the episode artwork plus per-chapter images (artwork where a
    chapter has none) shown as a slideshow timed to the episode's
    chapters, muxed with the program audio.
- Every video render is **ffprobe-verified before it exists as far as
  the system is concerned**: video stream present, exactly 1280×720,
  audio stream present, duration matching the program audio within
  0.5 s. A render that fails the probe is not registered, not
  attached, and never published.
- The feed publishes a video version **only** for an episode with a
  probe-verified render attached: a Podcasting 2.0
  `podcast:alternateEnclosure` (video/mp4) alongside the unchanged
  audio enclosure. Audio-only episodes' feeds are byte-for-byte what
  they were before POD-17. Member (token) feeds carry no video
  enclosure in v1 — the token enclosure route serves audio bytes, so
  pointing it at video would serve the wrong payload.

**Not in v1 (future scope, stated so nobody has to guess):**

- No real-time video mixing, camera switching, overlays, scenes,
  lower-thirds, or picture-in-picture. One camera, full frame.
- No video editing. Edits are the POD-12 audio edits; the video is
  rendered from the result.
- No multi-camera layouts or guest grids.
- No in-Studio live video (see the live path below).

## Live video: the external RTMP path (documented, not built)

Live video is the operator's own external path, by design in v1:

1. The operator streams video from OBS (or equivalent) over **RTMP to
   their own external target** — their Restreamer instance, YouTube
   Live, or any RTMP service they control. Renegade is not in that
   video path and never touches the video stream.
2. Renegade handles **the show side**: the POD-16 live audio show (the
   Icecast relay, the `podcast:liveItem` lifecycle — scheduled → live →
   ended), the local multitrack recording, and the conversion of the
   ended live episode into a normal episode under the same GUID.
3. After the show, the recorded camera track (if the participant
   consented and recorded one) or the slideshow floor renders the
   on-demand video episode through the normal POD-17 render, and the
   feed gains its verified video enclosure.

In-Studio video mixing/switching for live shows is future scope.

## Consent, precisely

- Consent is per participant and per track: the host's consent never
  covers a guest's camera, and one session's consent is not stored as
  a standing grant for the next.
- The recording core refuses — with the named
  `CAMERA_CONSENT_REQUIRED` error — to open a camera track whose
  consent flag is not explicitly `true`. There is no default-on path,
  no "camera present therefore recording" inference.
- Camera tracks are **video-only by construction**: the browser
  adapter requests `{ video, audio: false }`. A participant's voice is
  their raw audio track (POD-06/POD-09), never a second copy embedded
  in the WebM.

## Sync

Camera chunks are booked against the shared session clock (head/tail
sync events in the track manifest, the POD-09 convention), which is
the input a sync check needs. **Lip-sync on real devices is
UNVERIFIED** — no real camera, browser, or device pair has been
exercised. The v1 claim is only that video episodes render and
publish correctly from recorded/poster material.

## Unverified

- Browser camera capture (getUserMedia + MediaRecorder WebM) — the
  adapter is typechecked wiring over the headless-proven core; no
  real browser or camera ran.
- Lip-sync / A/V drift on real devices over long recordings.
- Real RTMP/Restreamer/YouTube live operation — documented path only.
