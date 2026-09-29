# Renegade CMS stabilization controls

Renegade CMS is in functionality stabilization. Do not add new feature families unless explicitly instructed.

Current application behavior and implementation take precedence over historical documentation. Before work, read only:

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. the relevant section of `docs/FUNCTIONALITY_WORKTREE.md`
4. documentation relevant to the active subsystem

Do not recursively read `docs/archive/` or unrelated documentation. Do not perform broad repository audits unless specifically requested.

Work depth-first from the first failing acceptance criterion. Make the smallest appropriate repair, verify through the real workflow where applicable, and record evidence before moving on.

Canonical states: `TODO`, `UNPROVEN`, `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, `DEFERRED`, `N/A`.

`PASS` means behavior has been verified; code presence or an old completion claim is not enough.
