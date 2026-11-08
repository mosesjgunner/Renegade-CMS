# GUI-04A (early) + GUI-04C (partial) — Publishing Editor Reconstruction

**Result: PARTIAL** (per the 8-pass pack output contract)
**Executed as:** standalone prompt "BETA GUI-01B / Pass 1 — Publishing Editor
Reconstruction", which the delivered pack (`Renegade_CMS_Beta_GUI_8_Pass_Prompt_Pack.md`,
2026-11-08) renumbers to **GUI-04A**; the collapsible settings groups are the
settings half of **GUI-04C**. Pack numbering is authoritative from 2026-11-08.
**Sequencing:** owner decision 2026-11-08 — finish this PR first as an early
GUI-04A, then run the pack in order from GUI-01B. Tracker:
`docs/beta/gui-overhaul/progress.md`.
**Base:** implemented on `fcf046a`; delivered onto current main `aa92a5e`
(the delta touches no file changed by the RC1 addendum PR #30, and the one
shared generated file, the admin import map, was regenerated on the new base —
see "Changed files").
**Environment:** Harbor VM, PostgreSQL 16.15 (CI/production use PG 17; version
recorded verbatim, claim not upgraded), Node 24, Playwright Chromium headless.

## What was built

The article/page editor (`content` collection) is no longer a tabbed database
form. The tab groups are replaced by a writing-first layout built entirely from
Payload's supported field-layout mechanisms — no schema, field-name,
persistence, or API changes:

- Main column flow: content-type entry → **headline** → subtitle → **Lexical
  body** → draft-autosave status.
- Sidebar (`admin.position: 'sidebar'`): site, publication, space, content
  type, status, visibility, published-at.
- Seven collapsible settings groups, all collapsed by default: Article details
  and classification; Authors and attribution; Media and featured image; SEO
  and discovery; URL and page configuration; Publishing and visibility;
  Advanced settings and technical metadata. A defensive fallback appends any
  schema field the layout did not place into Advanced, so a future field can
  never be silently dropped from the form.
- Headline and body get presentation wrappers (headline-scale type; a taller
  canvas with reading typography) around the stock Payload fields — values,
  validation and persistence are the stock components' own.

## Baseline (Phase 1)

The prompt directed the executor to read `docs/beta/GUI-01A-UX-AUDIT.md`; that
file was NOT in the repo at execution time, so the baseline was re-established
from source: `src/collections/Publishing.ts` carried 6 tabs via
`publisherFieldGroups` (Writing 20 / Presentation 13 / Media 1 / Publish 7 /
SEO 9 / Advanced 26 fields), with site/publication/space/owner/content-type
all preceding the headline. (The audit file has since landed on main in the
owner's commit `93bb8aa`.) Before-captures of the old layout:
`before/captures.json` (desktop create, desktop edit, mobile 375 create).

## Changed files and why

- `src/collections/Publishing.ts` — tab layout replaced by the writing-first
  layout above (layout metadata only; zero field definitions changed).
- `src/modules/admin/HeadlineField.tsx` (new) — presentation wrapper giving
  the title field headline scale; wraps the stock Payload `TextField`.
- `src/modules/admin/WritingCanvasField.tsx` (new) — presentation wrapper
  giving the Lexical field writing-room proportions; wraps the stock
  `RichTextField`. Lexical document structure untouched.
- `src/modules/admin/writing-editor.module.css` (new) — the two wrappers'
  styles, using Payload theme tokens (`var(--theme-text)` etc.); no public
  website theme tokens touched.
- `src/app/(payload)/admin/importMap.js` — regenerated with
  `payload generate:importmap` on the delivery base; the delta vs current
  main is exactly +4 lines (the two new components). The owner's own regen in
  `93bb8aa` (which dropped stale `AiDistributionActionField` entries) is
  preserved.
- `tests/unit/progressive-disclosure.test.ts` — updated to assert the new
  layout contract: no tabs, headline before body, sidebar positions, Advanced
  group intact, and complete field preservation (see Gate C for the count
  correction).
- `tests/unit/content-publication-references.test.ts` — visibility-contract
  assertion follows the field to its sidebar position.
- `tests/unit/rc1-06a-metadata-schema-indexing.test.ts` — the metadata
  extractor now recurses collapsible/row wrappers.
- `tests/beta-gui01b/editor-journey.ts` (new) — authenticated browser harness
  (passkey fixture session, disposable DB) used for the before/after captures
  and DOM probes. During closeout, Harbor fixed three of its title selectors
  (`#field-title input` → `#field-title`; in Payload 3.90 the id is on the
  input element itself).
- `docs/beta/evidence/GUI-01B/` — this RESULT, `before/` and `after/`
  captures + indexes + the after trace.
- `docs/beta/gui-overhaul/progress.md` — pack tracker with this prompt
  recorded as early/PARTIAL.

## Gates

### Gate A — Writing-first interface: PARTIAL

Live DOM probes against the running admin (authenticated fixture session,
disposable DB) confirm: the sidebar exists and holds the identity/publishing
fields (`siteInSidebar: true`); the headline is the first field of the main
column; horizontal overflow at 1440px is 0. NOT measured live: headline font
size and canvas height (the harness's geometry step repeatedly stalled in
this environment — see Gate D). The CSS that sets them is source-verified
(headline 1.625rem/600; canvas min-height 24rem, 1.0625rem/1.75 line height).

### Gate B — Progressive disclosure: PASS (structure), error-pill demo NOT VERIFIED

All seven collapsible groups render in the live DOM with their exact labels
(probe-verified). The collapsed-group error indication is Payload 3.90's
built-in Collapsible `WatchChildErrors`/ErrorPill mechanism, verified in the
installed `@payloadcms/ui` source; a live demonstration (invalid slug inside
a collapsed group raising the pill) was not completed in this environment.

### Gate C — Function preservation: PASS

- **Field preservation, proven mechanically:** the set of named schema fields
  (path + type) extracted from the new `Publishing.ts` is identical to the
  set extracted from base `fcf046a` — 84 named entries at all depths (76
  top-level named fields + 8 named array subfields). The pass's own unit test
  originally asserted 76 against a recursive flatten (76 was the worker's
  top-level count); Harbor corrected the assertion to 84 with the proof
  recorded here. No field was added, removed, or renamed.
- Integration suite (publishing/editorial and all other suites sharing the
  acceptance DB): **317/317** on the implementation tree; and **317/317 again on the exact delivery tree** at closeout
  (fresh `ship_gui04a_release_acceptance` DB, all 132 migrations applied).
- A form-state POST on the new create page succeeded in the server log
  during the worker's run.
- NOT VERIFIED end-to-end in a browser: UI click-through
  create → save → reload (the harness stalls in this VM — Gate D). The
  persistence path itself is unchanged stock Payload behavior and is covered
  by the integration suites.

### Gate D — Visual quality: VISUAL VERIFICATION PENDING

Real captures exist for the old layout (before/) and for the top of the new
create page (after/create-article-desktop.png: [Untitled] header, Title and
Subtitle leading, save-state note, sidebar fields). Full after-captures
(edit view, mobile, tablet, dark) were NOT obtained: across repeated runs,
the authenticated journey in this VM stalls ~60 seconds in (dev server dies
silently, or the page blanks under sustained load) — the same environment
behavior that killed two dev servers during closeout probing. This is an
environment limit, not a product finding. GUI-01B — the pack's screenshot
baseline pass, which runs next in order — exists precisely to build the
trustworthy capture machinery and completes this gate.

### Gate E — Engineering quality: PASS

On the delivery tree (base `aa92a5e` + this delta): format check 0, lint 0,
TypeScript 0; unit suite **2,104 passed / 0 failed** (284 files) on the
implementation tree, with the three layout test files re-verified 20/20 on
the delivery tree; integration **317/317 on both** the implementation tree and the exact
delivery tree. `tsconfig.json` is byte-stable; no migrations,
no schema changes, no new dependencies.

## NOT VERIFIED (explicit)

1. Full after-screenshots (edit view, 375/768, dark) — Gate D.
2. Headline font size / canvas height as rendered (live geometry).
3. UI click-through create → save → reload persistence in a browser.
4. Collapsed-group error pill, live demonstration.
5. Focus mode (a GUI-04C item) — NOT implemented in this pass.
6. Autosave failure/retry states in a browser (behavior preserved by
   construction; the truthful no-autosave-before-first-save state WAS
   verified live, twice).

## Pass 2 / next-prompt recommendations

- **Next prompt: GUI-01B** (pack order, per the owner's sequencing decision).
  Its harness work should start from `tests/beta-gui01b/editor-journey.ts`
  and fix the two known harness hazards found here: tsx-transformed
  `page.evaluate` closures hang (`__name` is not defined — pass string
  evaluates or import from a plain .mjs), and dev-server runs in this VM die
  under sustained authenticated load (serve a production build, or run the
  capture on the owner's Windows/Docker machine like the 18C golden journey).
- The workspace header and save controls remain Payload's stock document
  controls; going further needs a custom edit view (weigh at GUI-04B).
- The subtitle has no prominence treatment yet (candidate for GUI-04C polish).
- Sidebar relationship values load asynchronously; first paint can look
  emptier than the old form (note for GUI-03C site-context work).

## Delivery note

Push-files is text-only: the four evidence PNGs in this delta
(before ×3, after ×1) are excluded from the connector push and listed in the
PR body. They exist in the author's clone and can be uploaded to the PR or
pushed from a credentialed git client on request.
