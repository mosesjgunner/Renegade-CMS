# GUI-04C — Contextual settings and editor focus mode

**Result: PARTIAL** (settings groups verified standing since 04A; active-site prefill added; focus mode assigned to GUI-08B, not improvised)

## State of the gates

- Collapsible contextual sections: DONE in GUI-04A and verified live
  twice (cycles 2 and 4 probes: exactly 7 groups with the pack's
  labels; field preservation was proven mechanically at 04A — 84
  named fields, sorted path diff identical to base).
- Validation discoverability in collapsed panels: the 02C pattern
  (ValidationSummary + focusFieldBySelector expanding the collapsed
  ancestor) is implemented; its interactive browser proof is still
  owed and rides 04E's journey, recorded not claimed.
- Entitlement/access fields remain in the collapsed "Publishing and
  visibility" group, server-guarded — untouched.

## Done in this prompt: Site as admin context (fix-list item 2)

Matthew's Nov 9 directive — "It needs to be like a admin setting not
a thing you set on a post" — is implemented as far as the pack's
boundaries allow: the content collection's `site` field now carries a
`defaultValue` that reads the operator's persisted active site (the
`renegade-active-site` cookie the switcher sets, the same context the
navigation/social/themes APIs already resolve from). A new post
opened from the admin is pre-aimed at the site the operator is
working in instead of an empty required dropdown. Guarantees:

- The field stays visible and required — record ownership is never
  silently assigned; changing site remains a deliberate act.
- The prefill grants nothing: create still runs the existing tenant
  boundary + operator grant checks, so a stale or foreign cookie
  fails validation truthfully rather than saving anywhere.
- No schema, migration, or endpoint change — one field-level
  defaultValue in the existing layout builder. Typecheck PASS.

Full "which site am I in" indicator work remains GUI-03C's surface
(switcher) plus the still-owed two-site live proof.

## Focus mode: assigned, with the reason

A bespoke focus mode built through raw CSS in this VM risks exactly
what the pack forbids — hiding the inspector by unmounting it and
losing form state. The task-first move is GUI-08B, where focus
behavior, zoom and drawer focus trap/restore are exercised together
with the machinery to prove "unsaved content survives." Recorded in
the register as 04C's remaining item so it cannot evaporate.

**Exact next prompt: GUI-04D.**

## Verification addendum (Nov 9, 2026) — a real bug caught by the gates

The first implementation had a defect that typecheck could NOT see:
the layout expression called the field-take helper twice for `site`,
and the second call returned undefined — the layout emitted a broken
entry (`{defaultValue, admin}` with no field type) that crashed
Payload's config sanitize (MissingFieldType) on any fresh boot. The
running cycle-4 server never showed it (it serves the older build).

How it was caught: the integration protocol (fresh disposable DB →
migrate → suite) failed at migrate on the new code; a control run on
stashed code failed identically **under a hand-rewritten env file**,
which was itself corrupt (seven integration-only variables stripped)
— that env artifact is recorded so it is not chased again. A field
probe over the raw config then named the exact broken entry
(`content` field index 0), the double-take was fixed, and the field
wrapper rewritten type-clean. Re-verified: typecheck PASS, migrate
PASS on the fresh integration DB, integration suite re-run (result
appended below when it lands), unit suite green separately.

Lesson recorded in the pack notes: typecheck alone does not prove a
layout-builder change; the migrate/boot step is the real gate.

## Final gate results (Nov 9, 2026)

- Typecheck: PASS (final, type-clean rewrite).
- Migrate on fresh integration DB: PASS.
- Integration suite (full, untimed): **54/54 test files passed,
  INTEG_DONE=0** (660s). The earlier 280s-capped run had reached 8/54
  files with zero failures before the cap — a harness timeout, not a
  failure, and it is not counted as a pass anywhere.
- Unit suite: green in all output observed (its own capped run ended
  on the timer without a totals line; no failures appeared).
