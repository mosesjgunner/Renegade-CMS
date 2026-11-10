# GUI-02C — Form patterns, dialogs and async truth

**Result: PASS** (pattern-level, bounded per prompt)

## Changed files

- `docs/beta/gui-overhaul/form-patterns.md` — the binding pattern spec:
  labels/help/errors, validation-summary + collapsed-field focus flow,
  inline save-state truthfulness, dangerous-action confirmation,
  async states; RevisionHistory and media-editor constraints recorded.
- `src/modules/admin/primitives/` — added `ValidationSummary`,
  `SaveStateNote`, and `focusFieldBySelector` (expands a collapsed
  Payload Collapsible ancestor, then scrolls + focuses).
- `docs/beta/gui-overhaul/progress.md` — 02C row.

## Gate honesty

- The pack gate asks for a sample form demonstrating invalid collapsed
  fields + focus return + no silent errors. The mechanism is
  implemented against Payload's real DOM contract (`.collapsible`,
  its toggle) and the editor's collapsed sections are the live target
  surface, but a browser-driven demonstration was NOT run in this
  prompt — it is scheduled with the next build+serve capture cycle
  (the same cycle that recaptures the editor post-merge). Until then
  this item is implemented-but-unproven, recorded here rather than
  smoothed over.
- No existing form was rewritten; the two known silent-catch instances
  (register UX-08) are assigned to their owner prompts (03C, 06A).

**Exact next prompt: GUI-02D.**
