# GUI-04B — Unified save, saved preview and publication actions

**Result: PARTIAL** (audit + one bounded truthfulness fix; interactive gate proofs ride 04E)

## Audit of the current state (source-verified)

- **Save/autosave:** native Payload Save in the document header;
  `DraftAutosave` (mounted in the main flow by 04A) saves through the
  native form submit — so validation, site policy, locks and
  canonical revisions all apply — and its states are truthful by
  construction: a never-saved document says "Save a draft once to
  enable autosave", an unsaved-changes state precedes the debounced
  save, failure keeps edits in the editor with an alert + retry, and
  it enables only for draft/updated statuses ("Autosave pauses for
  live, review and scheduled content"). This already meets the 02C
  save-truth rules.
- **Transitions/scheduling/history:** status + publishedAt live in
  the editor sidebar (04A), guarded server-side by
  review-write-guard / approval / timezone contracts — untouched by
  this prompt, per its boundary (no new endpoint, no status bypass).
- **Preview:** the saved-preview creation lives in DiscoveryPanel
  inside the collapsed "SEO and discovery" group — functional but
  undiscoverable, which is the scattered-actions complaint (UX-02)
  in miniature.

## The gap found and fixed (`src/modules/admin/DiscoveryPanel.tsx`)

The preview block labeled itself "saved draft preview" and showed
the 30-minute expiry, but after the author kept typing, nothing said
the preview no longer matched the text. Fix: the panel now reads the
form's modified state (`useFormModified`, the same hook DraftAutosave
uses) and the preview line says either "reflects your last saved
revision" or "you have unsaved edits since this preview was created —
save, then create a new preview to see them." No endpoint, token, or
expiry behavior changed.

## NOT done here, deliberately

- Relocating the preview action next to Save (the full UX-02 fix)
  needs a custom document-header component — a bigger, riskier
  surface than this prompt's "smallest safe change"; it is recorded
  in the defect register as 04B's remaining item for a bounded
  follow-up (04B-R1) rather than improvised mid-pack.
- Interactive gate proofs (first-save truth, publish permitted vs
  denied, scheduled approved revision, history links) are exactly
  GUI-04E's end-to-end acceptance scope; claiming them here without
  running them would be the fake-success the roadmap bans.

**Exact next prompt: GUI-04C.**
