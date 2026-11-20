# UXI-12 — Make the same journey accessible and fast

Partial: setup-form changes preserve native controls (selects, checkboxes, buttons), visible focus defaults, and text (non-color-only) status in the new readiness cards and recovery kit. A full WCAG 2.2 AA audit, zoom/reflow runs, screen-reader passes, and performance budgets were NOT performed in this pass and are not claimed. Follow-up required before any accessibility claim.

## Continuation (Stage 7) — axe audit, fixes, and measured timings (2026-11-19/20)

The full audit the original task prescribed was executed against a
production build of this tree (standalone server, seeded demo data,
headless Chromium). Tooling: `axe-core@4.14.1` (added as a devDependency —
the one new dependency this pass permits) driven by
`tests/browser/uxi12-accessibility.spec.ts`, which also checks document
structure, keyboard focus, reflow, and target size directly, because axe
does not cover those.

### Baseline (pre-fix build of this branch)

Every audited page carried at least one serious axe violation:

- `color-contrast` on all 10 pages: the shell footer's site-description
  text (`stone-500` at 12px on a stone-100 tint, ≈4.3:1) — one node per
  page; plus home "View all" links (`red-600`, 2 nodes), the home
  empty-state paragraph (`stone-500`), and the setup form's passkey
  status text (`emerald-600`, ≈3.8:1) and "Required" badges (`red-600`
  on `red-50`, 10px).
- `document-title` (serious) on `/cart`, `/donate`, `/events`, `/store`,
  `/setup`: no `<title>` at all (setup exported robots metadata only).
- `/events`: the date-filter inputs were bare elements with no focus
  styling (the shared `.form-input` focus ring was not applied).

### Fixes shipped in this stage

- Shell footer description `stone-500` → `stone-600`.
- Home "View all" links `red-600` → `red-700`; home empty-state text
  `stone-500` → `stone-600`.
- Setup form: passkey status `emerald-600` → `emerald-700`,
  `amber-600` → `amber-700`, support-panel body `stone-500` →
  `stone-600`, Field badges `red-600` → `red-700` and `stone-500` →
  `stone-700`.
- Page titles added: Cart, Donate, Events, Store, Videos, and
  "Set up your site" (setup, keeping its robots exclusion).
- `/events` date filters now use the shared `form-input` class (visible
  focus ring, consistent with every other form on the site).
- `/member-auth` validation errors are programmatically exposed
  (`role="alert"`, `aria-invalid`, `aria-describedby`, focus moved to
  the field) — see the UXI-13 continuation; verified by the audit's
  dedicated validation test.

### Post-fix verdict (same audit, rebuilt tree)

12/12 audit tests pass. On all 10 audited pages (`/`, `/articles`,
`/videos`, `/events`, `/store`, `/donate`, `/cart`, `/login`,
`/member-auth`, `/setup`):

- axe-core (WCAG 2.x A/AA tag set): **zero violations at any impact**.
- Exactly one `<h1>` and a `<main>` landmark on every page; `lang="en"`.
- Keyboard walk (first 25 Tab stops per page): every element that takes
  focus shows a visible indicator. Two measurement notes, both
  probe-verified: (1) the shared form styles transition the focus ring
  over 150ms, so the walk settles 220ms before sampling; (2) native
  date inputs expose intra-element tab stops (segments + picker) whose
  indication is painted by the browser inside the shadow tree — the
  audit counts a missing indicator once per element, at the stop where
  the element takes focus (the ring computes correctly there).
- Reflow: no horizontal scrolling at 640px or 320px CSS widths (200% /
  400% zoom equivalents) on any audited page.
- Target size: no non-link control under the 24px WCAG 2.2 AA minimum.
  Text links under 24px in height remain in nav/footer lists (footer
  links 16px, "View all" 20px); these are recorded, not gated — WCAG
  2.5.8 exempts inline links and links whose 24px spacing circle clears
  neighbours. Primary actions under the 44px AAA/HIG size are likewise
  recorded in the evidence JSON (e.g. nav links at 33px height). The
  skip link measures 1×1 at rest by design (visually-hidden until
  focus, when it becomes a fixed visible banner — the standard
  pattern, verified in the walk's first stop).
- Incomplete axe checks (contrast of disabled controls, some background
  images) are listed per page in the evidence JSON; none was promoted
  to a claim.

### Performance (indicative only — this rig is NOT the declared host)

Cold+warm page loads against the local production server, 6 loads per
page, median load-event: `/` 666ms, `/articles` 1032ms, `/events`
587ms on this shared 1.5-CPU rig under contention. These numbers say
the pages are not pathologically slow; they are **not** a budget
measurement on the declared minimum host, and no performance budget is
claimed from them. A budget run on the declared host remains open.

### Not claimed

- No screen-reader pass (NVDA/JAWS/VoiceOver) was performed; axe +
  structure + keyboard evidence supports "no automated WCAG A/AA
  violations found on the audited pages", not a WCAG conformance claim.
- Admin/Payload surfaces and the authenticated operator journeys were
  not axe-audited in this stage; the audit covers the public core
  journeys plus setup and both sign-in pages.
- Dark-mode contrast was not audited (axe ran in the default light
  rendering); the `dark:` variants of every fixed class were kept at
  their existing values.
