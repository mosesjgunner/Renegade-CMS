# Form patterns, dialogs, and async truth — GUI-02C

The one consistent way operators complete work and understand failures.
These patterns bind later prompts; they do not rewrite existing forms.

## Labels, help, errors

- Every field keeps its schema label; help text sits under the field in
  muted small type; nothing important lives only in a placeholder.
- An error is text next to its field AND an entry in the validation
  summary (below). Color is never the only signal.
- Required-ness comes from the schema; presentation never invents or
  drops a validation rule.

## Validation summary + collapsed fields (the pattern)

Native Payload forms already show a per-collapsible error pill
(`WatchChildErrors`, verified in the installed `@payloadcms/ui` during
GUI-04A). For custom operator forms, the shared pattern is:

1. On failed submit, render `ValidationSummary` (primitives) listing
   every invalid field with its message.
2. Each entry links to its field; activating it expands a collapsed
   ancestor section first, then scrolls to and focuses the field
   (`focusFieldBySelector`). Focus always lands on the control, never
   on a void.
3. The summary is `role="alert"` + `aria-live`, so screen readers
   announce it without a focus fight.

## Inline save state

- Save state is a labeled text state, not a spinner alone:
  `SaveStateNote` renders idle / dirty ("Unsaved changes") / saving /
  saved (with time) / error (with the failure and a retry path).
- Truthfulness rules inherited from the editor work: a document that
  has never been saved must never claim autosave is active; a failed
  save must never display as saved. (Register: UX-02/UX-08.)

## Dangerous-action confirmation

- Destructive or financial actions keep their existing server-side
  guards, reasons and audit — presentation adds: a confirmation using
  Payload's dialog primitives where the surface is Payload-native, an
  explicit statement of scope ("this site", "these 12 assets"), and a
  pending state that disables repeat submission.
- Native `confirm()` in RevisionHistory is grandfathered until its
  owner prompt (GUI-04D) replaces it; do not let new surfaces copy it.

## Async truth: loading, stale, failed

- Loading: skeleton or labeled progress after ~300ms; never an
  indefinite blank.
- Empty vs no-matches-after-filter vs denied: three different messages,
  three different next actions (create / clear filter / request access).
- Failed fetch on a detail surface: keep the last good data visible,
  mark it stale with its timestamp, show error + retry. Silent catches
  that blank the panel are defects (register UX-08; concrete instances:
  MediaLibraryClient detail fetch, SiteSwitcher GET — owner prompts
  GUI-06A and GUI-03C respectively; this prompt defines the pattern,
  those prompts fix the instances).
- A selection change clears the previous record's detail immediately;
  stale detail for a new selection is a defect.

## Special constraints checked

- **RevisionHistory restore**: restore creates a NEW saved revision and
  the public body stays pinned until publication — confirmation copy
  must say exactly that (owner: GUI-04D).
- **Media image editor**: edits produce a new version; the original is
  never mutated in place, and replacement scope (selected / all usages
  / new only) must be stated in the confirmation (owner: GUI-06A).

**Exact next prompt: GUI-02D.**
