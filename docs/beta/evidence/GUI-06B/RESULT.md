# GUI-06B — Puck builder and layout entry experience

**Result: PARTIAL** (return-path and preview-truth labels fixed; full builder journey rides the capture cycle)

## Audit (source, this tree)

The builder is frontend-tree, not admin: `BuilderShell` (1,006 lines,
`src/modules/public/BuilderShell.tsx`) at `/builder/:id`, rendering
`VisualEditor` (Puck) from `src/modules/presentation/`. Findings:

- **Return path lied by omission:** the header's "← Back" linked to
  `/` (the public home page) — leaving the builder dumped the operator
  on the public site, not back at the page they were composing.
- **Preview naming:** the preview route is literally
  `DraftLayoutPreview` (staff-only, renders the *saved draft*), but
  the button called it "Exact Preview" — exact about what, it never
  said. The dirty-guard under it was already truthful (blocked with
  "Save your draft before opening its preview" when unsaved), matching
  the 04B pattern.
- Already-good, preserved: dirty tracking with a leave-confirmation,
  autosave-on-idle, save failure keeps edits with a named retry,
  publish is a distinct confirmed action ("Publish Live"), published
  snapshots stay pinned until publish (save(false) vs save(true)).

## Changed (`BuilderShell.tsx`, labels/destinations only)

1. "← Back" → **"← Back to Page (admin)"**, destination changed from
   `/` to the layout's own admin record
   (`/admin/collections/page-layouts/<id>`) — the operator returns to
   the page they were composing, in the surface that owns it.
2. "Exact Preview (…)" → **"Preview Draft (…)"** — the name now says
   what the route serves. The not-found state's "Return to Home" link
   is unchanged (there is no page to return to in that state).

No Puck block registration, snapshot, or save/publish behavior
changed. Typecheck runs with the batch gate.

## Not verified here

Builder open/edit/save/preview journey in a browser, small-viewport
panel behavior, role/site checks live — all ride the capture cycle
that follows the 04E re-proof (same fixture, same server). The
builder needs a seeded page-layout to exercise; noted for that cycle.

**Exact next prompt: GUI-06C.**
