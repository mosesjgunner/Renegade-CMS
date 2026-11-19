# Podcast Studio test fixtures — provenance

These fixtures are **R&D prototype fixtures**, copied verbatim by POD-00 from the
RC3 Native Podcast Studio prototype evidence package. They are research artefacts
that proved the contract shapes headlessly; they are not recordings, renders, or
output of the production code in this repository.

| Fixture             | Source (in the goal evidence package)                                                                     | Prototype                                                                | What it proves there                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-pt-e.json` | `files/rc3-podcast-studio/RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-E-session-guests/session-fixture.json` | PT-E — rundown/cartwall session + guest lobby state machines             | Session shape (rundown, cartwall banks/clips, mixer snapshot); mid-show save → reload deep-equality in the prototype                              |
| `edl-pt-c.json`     | `files/rc3-podcast-studio/RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-C-edl-render/edl.json`                 | PT-C — EDL render + loudnorm + timed-metadata remap                      | EDL shape (sources, tracks/clips, cut, crossfade, chapters, transcript cues, loudness target) executed by the prototype render                    |
| `drift-pt-f.json`   | `files/rc3-podcast-studio/RC3_NATIVE_PODCAST_PROTOTYPE_EVIDENCE/PT-F-drift/numbers.json`                  | PT-F — drift correction (**simulated** clocks, not a device measurement) | Per-source rate-correction artefact (`edlCorrection.trackB`: nominalRate, measuredRateHz, resampleFactor, rateCorrectionPpm, offsetSamplesAtHead) |

Notes for consumers:

- The PT-E session fixture predates contract versioning: it has no `version` or
  `showId` field. The POD-00 contract tests add the v1 envelope (`version: 1`,
  `showId`) on top of the copied fixture before round-tripping it through
  `parseStudioSession` / `serializeStudioSession`; the fixture file itself is
  kept byte-identical to its prototype source.
- The PT-C EDL fixture already carries `version: 1` and round-trips as-is.
- PT-F is a simulation. Its numbers validate the correction _mathematics_ and
  the EDL representation only; real-device drift remains UNVERIFIED (see the
  PT-F conclusion in the evidence package).
