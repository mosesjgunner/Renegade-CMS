# GUI-07B — Editorial workflow and coordinated releases

**Result: PARTIAL** (presentation audit-clean on the named risks; live flows ride captures)

## Audit (source, this tree) — the prompt's named risks

- **"Release failures do not masquerade as full success": HOLDS.**
  ReleaseCenter distinguishes `completed`, `partially-failed`,
  `partial-failure`, `failed`, and `rolled-back` with separate
  status colors and raw status text (never collapsed into a generic
  success). Partially-failed releases surface "Retry Failed Steps";
  rollback is offered for completed *and* partially-failed releases
  (suppressed only when a distribution/newsletter artifact already
  succeeded — a deliberate guard, since those cannot be unsent).
- **Rollback/waiver protection: HOLDS in structure.** Destructive
  and recovery actions are status-gated in the UI and executed
  through the guarded action handlers (backend guards untouched,
  per boundaries).
- **Queue → selected → approvals → execute → audit separation:**
  present in both centers' structure (status filter chips, selected
  release panel, per-step timing/audit rows).

No bounded presentation defect was found that could be fixed
without redesigning two very large surfaces (2,408 + 1,530 lines) —
out of scope for a presentation pass and exactly the kind of
aesthetic restructure the RC2 anti-trap rule (Nov 10) forbids
without a measurable problem. Recorded as audited-clean rather than
churned.

## Not verified here

Approved vs denied flows live, timezone/pin rendering against a
real scheduled release — capture cycle; the fixture carries no
release records yet.

**Exact next prompt: GUI-07C.**
