# GUI-05D — Dashboard and management regression

**Result: PARTIAL** (browser matrix executed on the three refactored surfaces; the unrun cells are named)
**Executed by:** Harbor. Build: cycle-17 production build, source `db20b76`, clean. Probe: `tests/beta-gui01b-v2/probe-05d.mjs` (pageerror listeners registered; **zero page errors across all surfaces and contexts**).

## Matrix (live, fixture session)
| Surface | Desktop 1280 | Dark | 375px | Notes |
|---|---|---|---|---|
| Dashboard (/admin) | PASS — action buttons, review queue, drafts (1) w/ pill | PASS (capture) | PASS — no page overflow | First-run branch shown (nothing published yet) |
| Redirects (/admin/redirects) | PASS — shared header/sections, distinct empty state | NV | NV | No-match capture owed (empty rule list) |
| Rendered Quality (/admin/rendered-quality) | PASS — primary task in header, shared empty state | NV | NV | Live audit run NV (see 05C) |

Captures: `dashboard-desktop.png`, `dashboard-dark.png`, `dashboard-mobile.png`, `redirects-desktop.png`, `quality-desktop.png` (this folder).

## Consistency verdict
The three refactored surfaces now share one chrome vocabulary (WorkspaceHeader / SectionHeader / StatusPill / EmptyState / ErrorState) and read as one system next to the editor and shell work from GUI-02–04. Payload-native lists were audited under 05B and remain framework-consistent.

## NOT VERIFIED (rides to RC2, with owners)
- Role-denied and two-site cells (fixture expansion = RC2-A-02).
- Review queue populated; no-match state with seeded rules; live audit run on real published content (05A/05B/05C proof debts).
- 200% zoom, screen reader, focus trap/return (GUI-08B backlog, unchanged).
- Full unit/integration regression was not re-run for the 05 family; typecheck + production build + this live matrix are the gates claimed.

## Next
GUI-05 family complete. The GUI pack's execution is now finished end to end (GUI-08 exit report already on main via PR #36); remaining pack conditions transfer to RC2 per the exit report.
