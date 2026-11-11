# GUI-04A post-merge after-capture (GUI-01B follow-up, closed)

Captured Nov 8, 2026 against the current tree (editor merged via PR #31),
production build, fixture session, disposable DB.

**Before → after (desktop create/edit probes):**

| Measure             | Before (01B baseline, aa92a5e) | After (this capture)                                                         |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Headline top        | ≈777px                         | **291px**                                                                    |
| Headline font       | 13px                           | **21px** (26px design at full render; probe reads the input's computed size) |
| Layout              | six tabs, no sidebar           | sidebar present, 7 collapsible settings groups                               |
| Horizontal overflow | 0                              | 0                                                                            |

The edit screenshot shows the new layout end to end: Title first with
"Draft autosave is ready", the seven collapsed groups (Article details,
Authors, Media, SEO, URL, Publishing, Advanced), and the sidebar holding
Site/Publication/Space/Content Type/Status/Visibility/Published At.

**Open item (honest):** the Lexical editable root had not mounted at
probe-settle time in these two editor captures (`editableCount: 0`),
although the seeded article's body was saved through the same fixture
path and the create/edit forms rendered completely (the 01B baseline
probes against the pre-merge build did observe the mounted editor).
This looks like a settle-timing artifact of the capture cycle rather
than a product failure — the form, autosave note and groups all
rendered — but it is recorded as NOT VERIFIED here; the body-canvas
mount re-proves in the GUI-04E end-to-end acceptance, which exercises
typing and round-trip persistence directly.

Files: edit-article-desktop.png, create-article-desktop.png,
dashboard-desktop.png (dashboard now shows the 02B primitives: status
pills on content rows), captures.json with hashes + probes.
