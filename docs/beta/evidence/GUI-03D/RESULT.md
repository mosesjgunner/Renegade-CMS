# GUI-03D — Shell responsive and permission acceptance

**Result: PARTIAL** (shell proven coherent at the widths/themes exercised; role matrix + zoom + focus behaviors remain NV, owned by GUI-08)

## Exercised (Nov 9, 2026, production build of 9f3220f, fixture owner)

- Captures: dashboard at 1440 / 375 / dark, media library at 1440 —
  **zero horizontal overflow everywhere**; dashboard renders the 02B
  primitives (WorkspaceHeader actions, status pill on the draft row)
  identically across widths and themes. `captures.json` has hashes.
- **Nav drawer opened and probed live** (shell-nav-open-desktop.png +
  nav-probe.json): the 03B structure is really there — "Everyday"
  group with 10 daily links, then exactly 7 `<details>` groups
  (Discovery, Workflow, Distribution, Audience & Community, Commerce,
  Intelligence, Platform), module-gated links absent where their
  collections are unregistered (Lean profile), and Payload's native
  collection nav below, untouched. This also closes GUI-03B's owed
  live-rendering proof.
- **Permission check:** unauthenticated /admin and
  /admin/collections/content return the login screen (no content
  leak); the fixture owner session reaches the shell. Frontend-tree
  operator pages verified 200 under the same session in 03A.

## Findings (recorded, not repaired here)

1. **No `aria-current` in the nav** (probe count 0): the custom links
   don't mark the active route. Owner: shell polish in GUI-08C, or a
   bounded 03B-R1 if Matthew wants it sooner.
2. Module-gated links render expanded inside their collapsed groups —
   correct content, but a group can look empty-ish at a glance in
   Lean (e.g. Commerce shows only Fulfillment). Acceptable; revisit
   if a group ever renders fully empty (hide-empty-groups rule for
   08C).

## NOT VERIFIED (explicit)

- Role matrix (editor/staff/viewer denial paths) — the fixture has
  one owner user; multi-role fixtures belong to GUI-08D.
- 200% zoom, focus trap/restore in the drawer, screen-reader pass —
  GUI-08B/08C scope, as the pack sequences it.
- GUI-03C's two-site switch proof — still owed (fixture has one
  site); NOT closed by this prompt.

**Exact next prompt: GUI-04B** (04A already landed early via PR #31;
its after-evidence closed in cycle 2).
