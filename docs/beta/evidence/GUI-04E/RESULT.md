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

**R1 fix:** import from `@payloadcms/richtext-lexical/client`; prop
type derived via `ComponentProps<typeof RichTextField>` (3.90 does
not re-export `LexicalRichTextFieldProps` from its entry points).
Typecheck PASS. Runtime proof (editor mounts, typing, autosave,
reload round-trip) runs against the cycle-6 build — see the journey
addendum below when it lands.

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
