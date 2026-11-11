# GUI-06D — Builder end-to-end (Puck) — PASS on the core journey (live-proven)

**Result: PASS** for the creative-tools core journey on the page builder;
scoped NOT VERIFIED items listed below. This closes exit-report condition 2
(GUI-06D fixtures) for the page-layout path.

## What was driven, live (cycle-16 server, fixture site, layout 6307f4b9)

1. Seeded a page-layout fixture (`tests/beta-gui01b-v2/seed-layout.mts`,
   surface `page`, slot `main`, theme neutral-starter, empty blocks).
2. Opened `/builder/<id>`: BuilderShell + Puck mount, preview iframe present,
   zero page errors. The block picker offers **42 blocks**; the palette rail
   shows 13 categories. (Finding recorded earlier this session: the builder is
   NOT palette-locked — `VisualEditor.documentFor()` opens every layout as
   surface `layout`, whose template allows all starter components; the
   registry's page/article single-block rule sits on a path the builder does
   not take.)
3. Added a **Hero** block through the shell controls ("Block to add" select +
   Add block) → block appeared on the canvas.
4. **Save Draft** → saved (revision advanced); full builder reload → the
   block persisted in the draft ("1. Hero" in the block list, canvas intact).
5. **Publish Live** → status flipped to PUBLISHED, "🎉 Published
   successfully! Live for all visitors", revision advanced again.
6. Anonymous request (cookies cleared) to the public path `/builder-fixture`
   → HTTP 200, and the published Hero renders as a large serif headline in
   the public theme. Public rendering chain works end to end.

## NOT VERIFIED / not covered here

- Editing a block's fields (hero title/body/link) in the properties panel —
  the fixture used default props (default title "Hero").
- Media path: hero image → picker → alt/rights → preview (needs a media
  fixture on this lean install).
- A second block type's public render depth (most legacy blocks share one
  generic renderer; only a few have bespoke renders).
- Header/footer/announcement slots (3–4 allowed blocks each) and the
  menu-route checks from the original 06D text.
- Dark/light/mobile/keyboard/permission matrix for the builder.
- The registry template rule for documents opened AS page/article surfaces
  (allowedComponents = editorial only) — no live surface was found that
  opens documents that way; recorded as a latent inconsistency, not a defect
  claim.

Probes: `probe-builder.mjs` (mount + palette), `probe-builder3.mjs`
(add + save + reload), `probe-builder4.mjs` (publish + anonymous public
view). Captures: `builder-v1.png`, `builder-added.png`,
`builder-published.png`, `builder-public.png` (working copies in the run
logs; text evidence committed here).
