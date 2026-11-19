# Podcast Studio — seller notes

What this package is, in plain language, with only the claims the
acceptance evidence supports. The full audit is the POD-20 parity map
(`PARITY-MAP.md` in the podcaster-product evidence folder); the journey
evidence is `tests/integration/podcast-studio-journeys.integration.test.ts`
plus each stage's own suites, all green at acceptance.

## What it is

A complete podcast desk inside Renegade CMS, on the podcaster's own
install, domain and storage: show management and publishing, a
production desk, a studio session with rundown/carts/players/mixer,
multitrack recording, a non-destructive editor, loudness-gated renders,
remote guests, live output to the operator's own Icecast, bounded video
episodes, and promotion through Renegade's own social/newsletter
systems. No external studio service, no third-party accounts required
for the core workflows, and no CurryCaster anywhere (it was a
behavioural reference only; see `THIRD_PARTY_NOTICES`).

## The levels

Levels are cumulative. "Proven" below means proven at acceptance on the
test rig (real database, real ffmpeg, synthetic audio fixtures);
anything needing a real browser, real device or real network is listed
under **Not yet**, even when the underlying engine is proven.

### L1 — Podcast management (PROVEN)

- Import an existing podcast **with its audio** (per-episode migration
  states, checksum-verified, resumable), tidy metadata, publish through
  a production desk: states from idea to published, a calendar for
  recording sessions, a guest book with consent policies, and an
  approval gate that actually blocks publishing until approved.
- Full Podcasting 2.0 feeds (guid, locked, medium, funding, value,
  persons, transcripts in three serialisations, liveItem) with a
  structural validator and per-show feed health.
- Private shows and members-only episodes with per-member token feeds;
  revoking a member's entitlement or rotating their token cuts access
  immediately, checked at serve time.
- Replace audio, withdraw and restore without ever changing an
  episode's GUID.
- Show bundles export/import with checksums verified before writing;
  platform backup/restore proven end-to-end on the test rig.

### L2 — Post-production (PROVEN at the draft/review level; see Not yet for ASR)

Everything in L1, plus:

- Transcription behind a replaceable provider seam (including a
  sovereign local command provider — your own ASR binary on your own
  machine). Results land as **draft** revisions; nothing public changes
  until a human reviews, edits and accepts.
- Chapter suggestions from markers and the played-clip log, extractive
  show-note/summary drafts, highlight extraction — all drafts, all
  accepted explicitly, never auto-published.
- Audiograms rendered from accepted highlights (waveform over artwork).
- An upgraded public player: chapter navigation, transcript-synced
  highlight, playback speed, sleep timer, share-at-timestamp links,
  keyboard control, and a locked state for members-only episodes that
  leaks no audio URL.

### L3 — The studio (engine PROVEN; browser desk NOT YET rig-tested)

Everything above, plus:

- A savable studio session per show: rundown with OPML round-trip and
  an external-change conflict guard, cartwall banks/decks (share,
  reset-with-backup, restore), mixer snapshot. Save mid-show, reopen,
  and the state is deep-equal — with nothing auto-playing and unarmed
  cue-fire impossible.
- Eight clip players (LRU loading, 0.1 s cues, PFL to the cue bus only,
  played-clip log), a mixer with program / per-guest mix-minus / cue /
  talkback buses (a guest's own return is exactly zero in the routing
  core), per-strip gate/EQ/compression, ONE MIC and MIXER device modes.
- Dual-path capture (raw master, verified settings), crash-proof
  recording journalled in 250 ms checksummed chunks — a crash loses at
  most one timeslice — and multitrack recording (program + raw ISO
  tracks) that finalizes to checksum-verified assets.
- A non-destructive multitrack editor: cut/trim/split/move/gain/fades/
  stretch, single-lane delete = silence, all-lane delete = gap-close
  with chapters and transcript remapped by proven rules.
- Renders gated on loudness: −16 LUFS ± 0.5 and true peak ≤ −1.5 dBTP,
  ebur128-verified, or the render fails by name and nothing is
  promoted. MP3/Opus/WAV + chapters that agree across ID3, the Podcast
  JSON sidecar and the feed. GUID stable end to end.
- Automatic per-speaker leveling: every lane is loudness-measured
  before the render and gained toward the loudest speaker, so a quiet
  guest meets the host before the bus. The render report shows each
  lane's measured loudness and applied gain — and the loudness gate
  above still has the final word.
- Broadband denoise for steady room noise (fan, HVAC, room tone) —
  the noise that sits UNDER speech, which a gate cannot touch. Local
  spectral reduction (ffmpeg afftdn), conservative by design: on the
  synthetic bad-session fixture the fan segment drops ≈ 4.4 dB while
  speech segments move ≈ 0.4 dB. Strength is adjustable and the stage
  can be switched off per lane. All processing is local — no cloud
  "enhance" uploads, no per-minute fees.
- A sound check before anyone records: a few seconds of mic, then a
  plain-language verdict — background noise, clipping, mic level —
  with the specific fix ("turn off fans…", "lower the input level").
  It warns; it never blocks a session. And when a source IS clipped,
  the render report flags the exact seconds — clipped audio is
  flagged, never silently "repaired".
- Full keyboard operation through one action registry, and MIDI learn
  on any action with per-machine persisted maps.

### L4 — Guests, live, video (cores PROVEN; real-world legs NOT YET rig-tested)

Everything above, plus:

- Remote guests (host + up to 3, mesh): purpose-bound invite links,
  preflight, a lobby where nothing is transmitted before admission
  (enforced by the signalling server), per-guest mix-minus and
  talkback, guest clip slots that land on the host desk, reconnect
  inside a 120 s grace window, and guest local recordings conformed
  into the timeline (drift correction proven on synthetic clocks).
- Live shows: a supervised ffmpeg relay to the operator's own Icecast
  mount (bounded-backoff restart; a killed relay recovers while the
  recording continues untouched), now-playing titles from the
  played-clip log, and the live episode lifecycle — scheduled → live →
  ended → converted to a normal episode with the same GUID.
- Bounded video episodes: consent-gated camera tracks, camera or
  artwork/chapter-slideshow renders behind an ffprobe gate, published
  as a `podcast:alternateEnclosure`. No video mixing or editing in v1.

## Operator prerequisites

- **Renegade CMS** with the media-studio module enabled (PostgreSQL;
  the studio needs no community or social modules and no third-party
  accounts).
- **ffmpeg** — bundled by the installer and readiness-verified (renders,
  peaks, relay, video): the installer downloads the pinned build and setup
  checks it is ready; a manual `FFMPEG_PATH` override is still supported
  for operators who prefer their own ffmpeg.
- **coturn** — only for remote guests on hostile NATs. Without it,
  guests on friendly networks work via STUN; the limitation is surfaced
  in the guest's diagnostics, never silent. See COTURN.md for realm,
  bandwidth (~50–100 kbps per guest leg) and the forced-relay test.
- **Icecast** — only for live shows: the operator's own server (or a
  rented mount), one supervised relay per concurrent live show.
- **Storage**: ISO recording ≈ 0.35 GB/hr per mono track, ≈ 0.7 GB/hr
  stereo (WAV masters). The studio shows hours-remaining against the
  actual volume; raw tracks are retained until the episode is published
  plus a per-show grace window (30 days default).
- **An ASR binary** (whisper.cpp / faster-whisper class) on the host if
  you want real transcription — configured via
  `PODCAST_TRANSCRIPTION_COMMAND`. Without one, transcription requests
  fail with a named error, never a silent gap.
- **A browser** for the desk: current Chrome/Edge for the full surface
  (output routing, Web MIDI); Firefox and Safari degrade as documented
  in the acceptance runbook §5 — see Not yet.

## Not yet — the plain-language list

These are open gates and unbuilt pieces. Do not sell past them.

- **No real browser has run the studio.** Every browser surface
  (capture, mixer, players, editor, guest page, workspace) is proven at
  its headless core and typechecked at its adapter; the browser/device
  rig tests (Chrome/Edge/Firefox/Safari, USB devices, kill-tab
  recovery, MIDI hardware) have not run.
- **No real guest call has happened.** WebRTC mesh, NAT traversal,
  TURN relaying, per-guest tone in the live engine, conversational
  delay and two-device drift are unmeasured. coturn is documented, not
  deployed.
- **Live is proven against an Icecast protocol fixture, not a real
  Icecast server**, and the **browser→ingest byte path is not built**:
  today the relay's proven inputs are a local pipe and files, so a host
  cannot yet push their live browser mix to the stream.
- **The live audience room is a data binding only** — there is no
  rooms/chat machinery for live shows in this version.
- **Now-playing metadata** authenticates to Icecast with the stream
  credential as the admin password (v1 simplification).
- **Real transcription has not run** — no ASR binary exists on the test
  rig; the provider seam, draft/review flow and named failures are
  proven, the speech recognition itself is not.
- **Audiograms do not burn in captions** (waveform over artwork only);
  captions live in the transcript/SRT path.
- **Video sync is duration-gated (≤ 0.5 s), not lip-sync proven** —
  the ≤ 40 ms head/tail A/V sync check needs real devices.
- **Promotion stops at drafts**: social posts and newsletters are
  created as drafts in Renegade's own review flows; no live platform
  post or newsletter send has been executed.
- **No directory has ingested a Renegade feed**, and no real podcast
  client has been tested against public or member feeds. Submission is
  a manual checklist.
- **Guests are capped at host + 3** by design; 8-guest shows need an
  SFU, which is a named future revisit, not a setting.
- **Human listening quality is unmeasured** — every audio claim above
  rests on measurements (loudness, energies, checksums), not ears.
- **De-reverb is not included.** No local, open-source engine removes
  room echo at a quality bar we would ship, so the feature is named
  here as absent rather than faked with a gate trick. A de-click
  repair for damaged sources exists but ships OFF by default.
- **The sound check's browser leg is untested** — its verdicts are
  proven on synthetic audio files through the same measurement core;
  no real microphone or real room has been recorded through it on the
  test rig. Denoise and leveling numbers likewise come from a
  synthetic fixture, not a real session.
