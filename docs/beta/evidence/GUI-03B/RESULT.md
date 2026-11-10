# GUI-03B — Task-first navigation and location

**Result: PARTIAL** (structure landed; live verification in the next capture cycle)

## Changed files

- `src/modules/admin/PublishingLinks.tsx` — the flat 25-link stack is
  now: SiteSwitcher, an "Everyday" group (Dashboard, Posts, Pages,
  Sections, Categories, Collections, Media, Podcasts, Layouts, Menus),
  then expandable groups — Discovery, Workflow, Distribution,
  Audience & Community, Commerce, Intelligence, Platform — and View
  Site. No link was added or removed; every destination comes from
  the GUI-03A ownership map, and the module-registration checks are
  preserved verbatim. Newly surfaced from already-registered views:
  History, Capability Center, Security, Design System, Migration
  (previously reachable only by URL or secondary links).
- `docs/beta/gui-overhaul/progress.md` — 03B row.

## Behavior notes

- Disclosure uses native `<details>/<summary>`: keyboard-operable,
  no client JS, works in the Payload nav slot as rendered today.
- The taxonomy follows the audit §6 proposal (Dashboard, Publishing,
  Media, Presentation as daily entries; the rest grouped).
- Navigation visibility remains presentation only; server access
  policies are untouched.

## NOT VERIFIED in this prompt

- Live rendering inside the Payload nav (the nav slot's layout of
  `<details>` groups), active-state indication (`aria-current` is a
  Payload-nav behavior; the custom links do not set it yet), and
  denied/unmounted handling — all ride the next capture cycle and
  GUI-03D's shell acceptance, which exists precisely to exercise the
  shell across roles/routes. Recorded, not smoothed over.

**Exact next prompt: GUI-03C.**
