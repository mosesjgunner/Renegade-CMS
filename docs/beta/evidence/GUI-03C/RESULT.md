# GUI-03C — Authoritative site and publication context

**Result: PARTIAL** (defect fixed in code; two-site live proof rides the next capture cycle)

## The defect (audit UX-03, source-confirmed)

`SiteSwitcher` set the displayed site BEFORE the POST, ignored the
response status entirely, and reloaded the page even when the switch
failed — so the UI could confidently show a site the server never
persisted. Its initial load also swallowed errors (`.catch(() => {})`).

## The fix (`src/modules/admin/SiteSwitcher.tsx`)

- Selection updates only after a successful POST (`res.ok` checked);
  on failure the previous site stays selected and an inline
  `role="alert"` message says the switch did not save.
- A pending state disables the select and announces "Switching site…"
  (`aria-busy` + `aria-live`); the reload now happens only on success.
- Load failure renders a visible error instead of vanishing silently.
- Hardcoded slate colors replaced with Payload theme variables
  (register UX-07, this surface).
- No endpoint, payload, or tenant-policy change: the server still
  decides which sites the user may select.

## Scoped out, assigned

- MediaLibrary's first-active-site fallback and NavigationCenter's
  independent selector (audit-named): separate surfaces with their
  own data paths; the fallback removal belongs with the media
  workspace work (GUI-06A) and the NavigationCenter alignment with
  its owner surface — recorded in the defect register so they are
  not lost. This prompt fixes the switcher, the component every
  operator actually uses to change context.

## NOT VERIFIED in this prompt

The acceptance gate wants a two-site success + a failed/forbidden
switch captured live. The disposable fixture currently has ONE site;
the two-site proof (add a second fixture site, switch, force a
failure) rides the next capture cycle. Code behavior is deterministic
from the diff; the live proof is recorded as owed, not claimed.

**Exact next prompt: GUI-03D.**
