# PRE-03 controlled visual editor

PRE-03 keeps Puck behind `src/modules/presentation/VisualEditor.tsx` and the versioned `VisualEditor` adapter. Stored `PageLayout`/`PresentationDocument` JSON remains renderer-owned and portable; Puck data is never persisted directly. Canonical Page/Post rich text, revisions, routing, and SEO remain editorial/public-route concerns.

## Editing contract

- The palette is generated from the active theme registry and the selected template slot. Main page layouts and the restricted global header/footer regions expose different allow-lists and categorized controls.
- Puck supplies keyboard-accessible selection, insertion, drag/reorder, duplicate, delete, and session undo/redo. Property controls cover bounded text, internal links, canonical media, bounded content queries, variants, alignment, and approved theme tokens.
- Link and media values come from the authenticated, site-scoped chooser endpoint. The save route resolves those references again and rejects cross-site or non-canonical values.
- Draft changes autosave after 1.2 seconds. Saves use an expected revision; HTTP 409 preserves the local draft in session storage and offers an explicit server-version reload. Publish replaces the immutable `publishedPresentation` snapshot, while later drafts leave it untouched.
- `/builder/:id/preview` renders the stored draft only for authenticated staff through the same registry renderer used by public snapshots.

## Safety and compatibility

The collection hook and HTTP boundary enforce schema version, stable unique component IDs, theme/template/slot allow-lists, 100-component and 256 KB limits, field types, bounded nesting/query sizes, approved enum/token values, and rejection of script/style/iframe/event-handler/JavaScript URL payloads. New unknown components are rejected. Previously stored removed/version-mismatched components move to `unknownBlocks`, remain lossless, render as a safe unavailable section, and produce an editor repair notice.

Article templates allow only `publisher.editorial`; the canonical article body cannot become a canvas. Flexible PageLayouts and explicitly marked global-region layouts are editable.

## Verification

- Focused presentation tests: 4 files / 30 tests passed.
- Full unit suite: 67 files / 285 tests passed.
- PostgreSQL integration: 16 files / 46 tests passed across the full sweep after rerunning the two environment/baseline failures (4/4 on rerun).
- Chrome acceptance: `tests/browser/pre-03-visual-editor.spec.ts` passed against standalone output, covering the six required component types, preview, publish, later draft isolation, reload, compatible theme switch, anonymous output, anonymous preview denial, and stale-save conflict.
- Canonical production build passed with Next.js 16.3.0. `npm run verify:presentation-bundles` proves the canonical public route manifest excludes Puck, `VisualEditor`, and `BuilderShell`, while the builder route owns them.

The additive migration is `20260912_030000_pre_03_visual_editor`.
