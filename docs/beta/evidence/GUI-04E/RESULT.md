# GUI-04E — Publishing end-to-end acceptance

**Result: PARTIAL — and the pack's most important find so far: NEW-02 (P0), fixed in R1.**

## The find (NEW-02): the body editor never rendered

The interactive journey (create form + seeded-article edit form,
headless Chromium against the cycle-5 production build) failed its
first gate: no Lexical editable in the DOM — not late, not hidden,
*absent*. Evidence chain, each step firsthand:

1. Journey: create form mounts title + sidebar but no
   `.ContentEditable__root` after 3 minutes; site prefill PASSED
   ("GUI01B Site" selected in the sidebar before any typing — 04C's
   live proof, on a create form).
2. Seeded article's body is present and well-formed via the REST API
   (Lexical root with the seeded paragraph) — data is fine.
3. The raw config probe shows `body [richText]` correctly placed in the
   main flow — schema/layout are fine.
4. DOM anatomy of the edit form: title, subtitle, autosave note, seven
   collapsibles, full sidebar — and *no rich-text wrapper at all*;
   form innerHTML has no `field-body`, zero console/page errors.
5. Root cause in the installed package: `@payloadcms/ui`'s
   `RichTextField` dist implementation is `() => null` (a deferred
   stub). GUI-04A's `WritingCanvasField` imported it from there. The
   real field is exported from `@payloadcms/richtext-lexical/client`.
   The stub satisfies the shared prop type, so typecheck, the import
   map, and every layout-landmark probe passed while the editor
   silently did not exist.

**R1 fix (FAILED at runtime — superseded by R2, same day):** import
from `@payloadcms/richtext-lexical/client` + prop type derived via
`ComponentProps`. Typecheck passed; the cycle-6 runtime proof then
showed the whole edit view crashing — the real field's client loader
runs `Object.values(clientFeatures)` on undefined. Reading Payload's
own form-state builder in the installed dist settled why: a custom
Field override for richText receives only base props; the lexical
props are computed exclusively by the editor's server entry
(`RscEntryLexicalField`), which the builder renders by default and
which an `admin.components.Field` override *replaces outright*.

**R2 fix (ALSO FAILED at runtime — superseded by R3, same day):**
made the override a server component rendering the editor's entry
directly. The cycle-7 proof showed server-side serialization
errors: the entry additionally needs the builder's server-only
assembly (sanitizedEditorConfig, schema maps, function-bearing
i18n), which base client props cannot supply.

**R3 fix (ALSO FAILED at runtime — superseded by R4, same day):**
bet on the builder passing the composed editor as `children` (true
for the framework's internal wrappers). The cycle-8 proof: no
crash — but the edit form still had NO body field, and the served
form-state showed the custom component receives only the base
client props; children are not the editor for collection fields.

**R4 fix (current):** remove the custom Field override entirely.
The stock lexical field renders itself — the cycle-2 baseline
(before the override existed) measured a working editable, and the
pre-override tree is the last known-good editor. The writing-canvas
proportions move to a global admin stylesheet
(`writing-canvas.css`, imported beside the admin tokens) targeting
the stock field's own DOM — presentation preserved, zero component
interference. HeadlineField audited: text fields genuinely receive
their props (its TextField import from '@payloadcms/ui' is a real
component), and the title visibly renders — left untouched.
Typecheck PASS; runtime proof runs against the cycle-9 build.

**Why every earlier gate missed it:** pre-04A baseline probes read
`editableCount: 1` (stock field, ~49px) — the regression arrived WITH
04A. Cycle-2 probes read 0 and were recorded as a settle-timing
suspicion; that suspicion is hereby resolved — it was this defect,
live since PR #31 merged. Matthew's hands-on verdict ("a really good
beta, but not a RC1") was, in this specific way, literally correct: he
could not have written a post body in the shipped editor.

## Evidence matrix (honest status per row)

| Row | Status | Basis |
|---|---|---|
| Create article/page; update; publish exactly once; restore; embargo leakage prevented | PASS | Integration `editorial-acceptance` suite, full run Nov 9 on this tree (317/317, 54/54 files) |
| Saved preview truthfulness (unsaved edits declared) | PASS (code) / live capture pending | GUI-04B |
| Site prefill on create | PASS (live) | Journey step 2: fixture site pre-selected |
| Body editor mounts; typing; autosave; reload round-trip | **WAS FAIL (NEW-02)** → R1 fix, runtime re-proof pending cycle-6 | Journey + probes (this file) |
| History view renders; breadcrumb follows document | PARTIAL | 04D code + typecheck; fixture has no revision rows; screenshot not captured |
| Denied roles; two-site ownership | NOT VERIFIED interactively | Single-owner, single-site fixture; server-side enforcement covered by the integration suite's access tests |
| Scheduling / SEO canonical rows | PASS at service level | Integration suite coverage (15C/18-era proofs stand) |

**Exact next prompt: GUI-05A** (dashboard; a standalone Codex job file
was prepared for it Nov 10 — Harbor verifies its output the same way).


## Journey addendum — R4, cycle 10 (Nov 10, 2026)

Build source `e17542b` (clean), production serve, fresh fixture
(VM replacement mid-cycle: PostgreSQL + fixture rebuilt per the
standing recovery recipe). Probes first, then the full journey:

- Error probe (pageerror listeners): **1 benign egress-tunnel
  failure (gravatar), zero page errors** — the R1 crash and the R2
  error boundary are gone.
- DOM probe: rich-text wrapper present, exactly **1
  `.ContentEditable__root`**, seeded body text rendered.
- Interactive journey (`editor-journey.mjs`, now with pageerror
  capture + an explicit first-save step the product's own autosave
  rule requires): **8/8 PASS** —
  1. editor mounts (title + Lexical)
  2. site prefilled from active-site context ("GUI01B Site")
  3. first save creates the document (URL gains the id)
  4. autosave fires and reports — "Draft saved automatically."
  5. reload round-trips the title
  6. reload round-trips the typed body
  7. history view renders (Dashboard / Posts / History — the
     breadcrumb names Posts correctly for an article; the 04D fix
     shows Pages for pages)
  8. zero page errors across the whole journey

Evidence: `journey-r4.json`, `journey-editor-typed.png`,
`journey-editor-reloaded.png` in this folder.

**NEW-02 is closed.** The editor that ships is the stock Payload
Lexical field; the writing-canvas proportions are global admin CSS.
Lesson recorded for RC2: a custom Field override on richText is a
trap in Payload 3.90 — presentation for built-in fields belongs in
CSS, not components.
