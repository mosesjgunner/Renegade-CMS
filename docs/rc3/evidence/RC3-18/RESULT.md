# RC3-18 — Media desk: Media Studio, DAM, Graphics Studio, video & livestreaming, interviews, events

**Verdict: DONE at the per-leg levels below** on branch `rc3-18`,
based on `ef90e0a` (GitHub main at pass start). Local commits only;
nothing pushed. GitHub main moved during the build (PR #138 merged;
the owner's Creator Studio baseline landed on top) — this branch was
not rebased, per the standing delivery rule; stacking is a delivery
concern, not a build one.

This pass re-evidences the media family (#12–#18) on current HEAD and
builds the two missing middles it found: a graphics render/approve
path (#14) and an interview capture/export surface (#17). It also
fixes a latent defect in the graphics service and proves the
livestream leg against a **real Icecast server** for the first time —
every prior live proof ran against the in-repo protocol fixture.
Boundary honored: member self-serve uploads (the
`assertMediaPermission` staff-only gate in the media workflow) belong
to the owner's Creator Studio program and were **not** built here;
posting / member-standing enforcement was never touched. #15 Podcast
Studio is owned by RC3-10/11 and is not claimed by this pass.

## What was built

- **Graphics render + approval** (`src/modules/graphics/render.ts`).
  `createGraphicDerivative` produced the design side of a graphic — a
  graphic-document plus a `media-derivatives` row in `pending` — but
  nothing in the codebase ever turned that recipe into bytes, so a
  graphic could never actually be published. `renderGraphicDerivative`
  is the missing middle: it composites the source asset with the
  recipe's text treatment via sharp (resize-cover to the template
  canvas, SVG lower-third overlay), persists the result as a
  first-class media asset (kind `graphic`, site-scoped blob dedup
  mirroring the upload path), and links it as the derivative's
  `asset`. The source asset is never modified. Rights are re-checked
  at render time — an asset whose rights lapsed since the derivative
  was created cannot be rendered. `approveGraphicDerivative` is the
  approval boundary: only a rendered derivative can be approved,
  rights are re-checked again, and the output usage row flips to
  `approvedForPublic`. Both operations are idempotent.
- **Graphics usage-write fix** (`src/modules/graphics/service.ts`).
  `createGraphicDerivative`'s closing `recordMediaUsage` call used
  fields that do not exist on the `media-usages` collection
  (`usageType` / `targetCollection` / `approved`) and omitted its
  required `site` / `usedBy` / `purpose`, so **every call threw a
  ValidationError after the derivative had been created**. No test had
  ever exercised the function end-to-end. The write now uses the
  collection's real shape (the source asset used by the graphic
  document, purpose `cover`, unapproved until the derivative is).
- **Interviews surface** (`src/modules/media/interviews.ts`). The
  `interviews` collection existed as a data shell with no service
  behind it. `createInterviewCapture` creates a draft with
  referential integrity enforced (attached media must belong to the
  same site; an attached transcript revision must be a transcript OF
  that media). `extractInterviewQuotes` deterministically selects
  substantive transcript segments (≥80 chars, order preserved, cap 8)
  and persists them as quotes carrying segment id + time range.
  `exportInterview` is the approved export: publication is the
  approval boundary (a draft cannot be exported), and the export is a
  real artifact — a JSON document persisted as a media asset holding
  the interview, guest/host names, the quotes, and the transcript
  with its revision checksum of record. `getInterviewReadback`
  resolves the interview with its export asset when one exists.

## Per-leg levels (real Postgres; journeys in `tests/integration/rc318-media-desk.integration.test.ts`, 5 tests, and `tests/integration/rc318-video-live.integration.test.ts`, 2 tests)

- **#12 Media Studio — E2 (held).** Library journey re-evidenced on
  current HEAD through the scoped library API: upload → search →
  metadata edit → scoped detail readback. The deep library proof
  (resumable uploads, variants, command center) stands from the
  med-01/03/06 suites, re-run green in this pass's gauntlet. The
  ledger's E3 gap — module-off (floor-only) live behavior of the full
  library surface — was not exercised; see Named gaps.
- **#13 DAM — E1 → E2.** Rights lifecycle with the denied-use
  negative case, end to end: approved asset attaches to published
  content and every gate passes; an all-usages replacement creates
  the history chain (versions + usages read back through the scoped
  detail API); expiring the replacement's rights closes public
  delivery for the replacement **and** the original (delivery
  resolves the chain and checks every hop); expiring the chain
  head's rights makes the release gate refuse the target
  (`assertUsageTargetsPublishable` throws) and the governance sweep
  opens an incident for the publicly used asset, visible on the
  dashboard. One seam named in Named gaps.
- **#14 Graphics Studio — E1 → E2.** Asset → derivative → **render**
  → approve → attach to published content → public readback, with
  the original's checksum/size provably unchanged, a re-render
  idempotence check, and two rights negatives (unapproved source
  refuses creation; rights expiring between create and render
  refuses the render). Includes the usage-write fix above — without
  it this journey cannot complete at all.
- **#16 Video — E1 → E2.** Upload → process → captioned public
  playback, end to end: a real MP4 generated with ffmpeg is uploaded
  through the media workflow, processed by the product's own worker
  function (`processVideoAsset`, the media job handler's core) with
  the local ffmpeg recipe (baseline MP4 + poster verified in
  storage, ffprobe-checked h264), published as a native video, and
  read back through the exact query the public `/videos/[slug]`
  page runs — baseline, poster and caption track present. The real
  `/video-captions/[id]` route handler serves the WebVTT bytes
  (200) and 404s after the video is unpublished.
- **#16 Livestreaming — E0 → E2 (local real-server proof).** The
  product's `RelaySupervisor` + ffmpeg spawner streamed a looping
  tone file to a **real Icecast 2.4.4 server** spawned by the test
  on an isolated port (not the POD-16 protocol fixture): a listener
  received MP3 bytes that ffprobe decodes; the mount and a
  now-playing update sent through the product's metadata builder
  both appear in Icecast's own `status-json`; the relay was
  SIGKILLed mid-stream and the supervisor reconnected to the real
  server; stopping the relay unpublished the mount. The source
  password never appears in supervisor log lines. The test skips
  visibly on a rig without an `icecast2` binary. Device/browser
  guest-recording and TURN/NAT legs remain unproven — see Named
  gaps.
- **#17 Interviews — E0 → E2.** Bounded capture with referential
  integrity (a transcript of different media is refused), quote
  extraction with readback (exactly the qualifying segments, with
  time ranges), and the approved export: draft export refused,
  published export persists a JSON document asset whose quotes and
  transcript checksum match the source revision, and readback
  resolves the export asset. The surface is a service + readback
  (the API seam); no React page is mounted — see Owner open calls.
- **#18 Events & timelines — E2 (held).** Re-evidenced on current
  HEAD: a weekly recurring event (count 5) with one excluded
  occurrence and one override expands through the product's own
  public timeline functions to exactly 4 occurrences on the right
  dates, the override title applied; `canReadEvent` admits the
  public event. The RC3-15B calendar suites re-ran green in this
  pass's gauntlet. E3 operational proof remains RC4 scope, per the
  ledger.

## Gauntlet (CI order, final tree)

Baseline on clean `ef90e0a` first (after a VM replacement killed the
first baseline run mid-integration; Postgres and Icecast were
restored and the baseline re-run in full): migrations fresh ✓,
seed ✓, format ✓, lint ✓, typecheck ✓, unit 354 files / 2,860
tests ✓, integration 105 files / 632 tests (6 skipped) ✓, build ✓,
smoke ✓.

Final tree (branch `rc3-18`, commits `c671bf0` + `899900e`):
migrations fresh ✓, seed ✓, format ✓, lint ✓, typecheck ✓, unit
355 files / 2,867 tests ✓ (baseline +1 file / +7 tests), integration
107 files passed | 2 skipped, 639 tests passed | 6 skipped ✓
(baseline +2 files / +7 tests, zero failures), build ✓, smoke ✓ —
full log `gauntlet-318-final2.log`, exit 0. (A first final run was
killed by a second VM replacement mid-integration after unit and
both new suites had passed inside it; its lint failure is explained
in the commit history — the video suite's HLS outputs, since fixed —
and the clean re-run above is the verdict of record.)

Focused suites before the full run: unit `rc318-media-desk` 7/7;
integration `rc318-media-desk` 5/5; integration `rc318-video-live`
2/2 (video journey 2.0s; real-Icecast leg 4.9s — ran, not skipped).

No migration was added by this pass.

## Named gaps

- **#12 module-off behavior unproven.** The full library surface's
  live behavior with the media module off (floor-only profile) was
  not exercised. The ledger names it as part of #12's E3 gap; it
  stays open for RC4.
- **#13 replacement-only rights lapse vs the release gate.** Usage
  rows and `assertUsageTargetsPublishable` key on the asset a usage
  points at (the chain head). A rights lapse recorded **only** on a
  replacement asset closes public delivery (proven) and appears on
  the governance dashboard's expiring-rights list, but does not trip
  the usage-target gate or the incident sweep, which key on the
  head's usage rows. Whether the gate should resolve replacement
  chains is a product decision — named, not silently changed.
- **`media_usages_purpose` enum drift.** The `media-usages`
  collection declares 13 purposes; the Postgres enum carries only 7
  (hero, inline, cover, attachment, avatar, thumbnail, newsletter).
  Any write with purpose `layout`, `theme`, `seo`, `podcast`,
  `video` or `distribution` is rejected by the database despite the
  collection declaring it. (The reconcile candidate type itself uses
  `layout` / `theme` / `seo` / `distribution`.) Widening the enum is
  migration work; this pass used `cover` for graphic usages and
  flags the drift for the pass that owns the next media migration —
  the podcast/video purposes matter to RC3-10/11 planning.
- **#16 device/browser matrix unproven.** Guest recording from real
  browsers/devices, device-permission outcomes, TURN/guest NAT
  traversal, and interrupted-ingest recovery on real devices were
  not exercised; the live proof is server-side (product relay →
  real Icecast → listener bytes). The public listener path was shown
  only against the isolated local Icecast instance, which is the
  bounded claim the pass definition allows.
- **#17 export provenance seam.** Export provenance lives on the
  export asset's `customMetadata` because `media-usages.usedBy` has
  no `interviews` target; adding one is a schema migration this pass
  deliberately did not take on.
- **Marketing-claims gating.** No in-tree public copy was found
  claiming media/studio capabilities beyond what is now proven at
  the levels above; the livestream claim in particular should not
  be marketed beyond "streams to a real Icecast server through the
  built-in relay" until the device/browser matrix lands.

## Owner open calls (named, not silently decided)

- **Interview surface shape.** RC3-18 built the service + readback
  seam. Whether interviews get a mounted public page, an admin
  screen, or stay API-only until the podcaster/Creator Studio
  surface decisions land is the owner's call.
- **Graphics render roadmap.** The render built here is the bounded
  recipe (source image + text overlay at the template canvas).
  Brand-kit application, layered template editing, and additional
  export formats are design-surface decisions for the owner; the
  derivative model (`recipe`, `layers` on the graphic document)
  already carries the inputs such a renderer would consume.
- **Member-upload dependency.** The interview capture and graphics
  journeys run on staff uploads, like the rest of the media desk.
  Member self-serve upload remains the Creator Studio program's
  work; when it lands, these services need no changes (they key on
  assets, not on who uploaded them).
