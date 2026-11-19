# Podcast Studio — Working Format Policy

Defined by POD-00. This policy is the canonical format contract for every
clip, recording and render the Podcast Studio handles. Later prompts
(capture POD-06, recording POD-09, conform POD-11, render POD-13) build on
it; changing it requires a schema/policy note in
`PODCAST_PROJECT_STATE.md`.

## Canonical clip working format

- **Container/codec:** WAV, linear PCM (uncompressed).
- **Sample rate:** 48 kHz for all studio working audio. Sources recorded or
  ingested at other rates are resampled to 48 kHz when they become studio
  assets (per-source rate correction from the EDL/track manifest is applied
  at conform time, before segment mapping — PT-F rule).
- **Channels:**
  - Program mix and music/clip material: **stereo**.
  - Voice tracks (host, each guest, narration): **mono**.
- **Why WAV PCM:** editing, chunked crash-proof recording (PT-B), drift
  conform (PT-F) and the EDL → ffmpeg render (PT-C) all operate on exact
  sample counts. A lossless, seek-exact working format keeps sample
  arithmetic honest; delivery formats (MP3 etc.) are render outputs, never
  working files.

## Accepted input formats

Clips and finished episodes may be **ingested** in any of:

MP3 · WAV · FLAC · OGG (Vorbis/Opus) · Opus · M4A (AAC) · AIFF · WebM (Opus)

Acceptance means "can be decoded and normalized into the working format",
not "is edited in its delivery codec". Inputs that cannot be decoded, or
whose decoded duration/channel layout cannot be determined, are rejected
with a visible error at ingest — never silently truncated.

## Decode policy

- **Browser (playback, waveform audition, cue setting):** decode with the
  Web Audio `decodeAudioData` API into the session's 48 kHz context. This
  path is for playback and interaction only; it is not the archival decode,
  and browser-resampled audio is never written back as a studio asset.
- **Server (ingest of studio assets):** normalize with **ffmpeg** on ingest —
  decode the accepted input, resample to 48 kHz WAV PCM, stereo for program
  material / mono for voice material, and store the normalized file as the
  studio asset alongside the original upload. All later studio stages
  (recording finalize, conform, edit, render) read only the normalized
  working file.
- Recording capture follows the same rule from the other direction: the
  browser capture engine writes PCM chunks directly (PT-B pattern), so a
  recorded track is born in the working format with no decode step.

## Loudness targets

Publish renders are measured and normalized to:

- **Integrated loudness:** −16 LUFS for stereo program, −19 LUFS for mono.
- **True-peak ceiling:** −1.5 dBTP.

These are exactly the targets of the existing media recipe
`podcast-standard-lufs16` in `src/modules/media/audio.ts`
(`standardAudioRecipes`, "Standard podcast loudness normalization
(-16 LUFS stereo / -19 LUFS mono)"), which the studio render pipeline
(POD-13) extends rather than replaces. The PT-C prototype render landed
−16.1 LUFS against the −16 LUFS target with the same −1.5 dBTP ceiling,
using two-pass `loudnorm` with an independent `ebur128` re-measure; that
measure-then-verify discipline is part of this policy: a render is only
"loudness-correct" when an independent measurement of the output file
confirms it, not when the normalization filter merely ran.
