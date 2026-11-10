# GUI-06C — Themes, navigation menus and graphics workflows

**Result: PARTIAL** (two named defects fixed; live menu/theme proofs ride the capture cycle)

## Fixed

1. **NavigationCenter's silent site switch (register follow-up from
   GUI-03C, now closed).** Its site selector repeated the exact defect
   03C fixed in the shell switcher: it set the displayed site first,
   POSTed the new context, and swallowed failure with `catch {}` — so
   menus could load for a site the operator's context never moved to,
   with no signal. Now the selection changes only after the POST
   succeeds; failure keeps the previous site and shows an error
   message. Same rule, second surface.
2. **Themes discoverability.** ThemeCenter exists only embedded in
   the Capability Center (no route of its own; the prompt forbids
   inventing one). The Everyday nav group now carries an honestly
   labeled entry — "Themes (in Capability Center)" → `/admin/capabilities`
   — alongside Layouts and Menus, so presentation work is findable
   from the nav instead of buried.

## Audited, no change

- Graphics/image-editor entry and return: the media library's editor
  modal returns to the selected asset via the refresh cycle (06A
  context); no wrong-asset return found in source.
- NavigationCenter load/save errors were already surfaced through
  its message state (unlike the switch, which was the silent one).

## Not verified here

Menu edit/save/reload across placements, theme preview safety, and
the switch-failure state live — capture cycle, with the two-site
fixture the switch proof needs (same outstanding fixture debt as
03C's live proof).

**Exact next prompt: GUI-06D.**
