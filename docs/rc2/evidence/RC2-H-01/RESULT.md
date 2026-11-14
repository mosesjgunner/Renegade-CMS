# RC2-H-01 — Accessibility, responsive layout and editor UX carryovers

**Verdict: PASS** — the GUI overhaul's UX proof debt is now measured end to end in a real
browser against the authenticated two-site world, the three fixable defect classes it exposed
are fixed and re-measured clean, and the editor focus mode the UX overhaul specified (three-area
editor + focus mode) exists and works. What remains red is characterized, not hidden: every
residual is stock Payload admin chrome (fixing it means replacing Payload's Nav/forms layer,
out of proportion for this pass) or a fixture-data gap, and the set is filed as RC2-DEBT-23 (P2).
Final evidence: probe run 7 on the shipped tree, 9/17 checks green; run 1 (pre-fix) was 7/16.

## Method

`tests/rc2-h01/probe.mjs` (shipped with this PR) drives headless Chromium against the A-04
two-site world on a production build: the article editor at 375/768/1440 px, dark scheme and
200% zoom; a 30-stop keyboard Tab walk; computed-style WCAG contrast sampling of every visible
text node in the editor and on a public article; touch-target geometry at 375 px; empty-state
and error-state attempts; and the focus-mode toggle's enter/exit behavior. Runs 1–7 are the
before/after record (run 1 = pre-fix baseline, run 7 = final).

## Fixed in this PR (before → after, measured)

1. **Editor contrast (WCAG AA)** — 14/241 text samples below 4.5:1 → **0/242**. All 14 were
   Payload's sidebar group labels at 2.81:1, plus the document meta labels and the Lexical
   placeholder at 3.95:1. Admin-scoped overrides in `src/modules/admin/writing-canvas.css`
   set readable grays for `.nav-group__toggle`, `.doc-controls__label` and the editor
   placeholder, in both color schemes.
2. **Public contrast** — the starter theme's "min read" badge measured 3.84:1 → **0/3 below
   AA**. Root cause was the theme token, not the stylesheet fallback: themed pages resolve
   `--color-highlight` from the theme's `focus` color, so `neutral-starter`'s focus token
   moved #0284c7 → #0369a1 in `src/modules/presentation/themes/legacy.ts` (the unthemed
   fallback in `starter.css` moved with it). Renegade Party's focus token (#005ea8) already
   passed and is unchanged.
3. **Editor content overflow at phone width** — the editor's metadata row rendered ~475 px
   wide and forced horizontal scrolling at 375 px; `.doc-controls__meta` now wraps, and the
   nav header box no longer extends past the viewport. Editor pages at 375/768/1440, dark
   scheme and 200% zoom all render without content overflow.
4. **Focus mode (the UX overhaul's missing piece)** — new `FocusModeToggle` in the content
   editor's document controls: one click hides the admin nav and the settings sidebar and
   gives the writing canvas the full width; Escape or a second click restores. Verified live:
   class applied, nav and sidebar hidden, canvas visible, `aria-pressed` tracks state.
5. **Visible keyboard focus** — Payload gives its nav/header links no focus indicator at all
   (measured directly: outline none, no shadow, no background change). A global
   `:focus-visible` outline in the admin stylesheet takes focus-ring coverage from 17/30
   Tab stops to **24/30**; nav touch targets at phone width rose from 20 px rows to 32 px
   (48 sub-24px targets → 15, the rest being stock icon buttons).

## Characterized, not fixed (filed as RC2-DEBT-23, P2)

- **Admin nav `aria-current`** — Payload's stock Nav component renders no `aria-current`
  markers. Adding them means replacing the whole Nav component. (The public shell's own
  navigation _does_ implement `aria-current="page"` — `PublicNavigation` + `isActiveMenuItem`,
  code-verified; the fixture world has no menu items configured, so no live page exists on
  which a marker could render. Live-proofing it needs a seeded menu — noted in the debt row.)
- **Keyboard path to Save** — the document form's DOM order puts ~30 stops (nav, header,
  toolbar, fields) before Save; within the probe's 30-stop budget Save is not reached. A
  stock-layout property, reported as measured.
- **Focus visibility, last 6 stops** — after the fix above, the only stops without an
  outline/shadow are the Lexical canvas regions themselves, where the text caret is the
  focus indicator.
- **Error-state semantics** — stock Payload renders validation text without `role="alert"`
  or `aria-invalid` (measured `{alerts: 0, invalid: 0}`); the text itself renders.
- **Touch targets, residual 15/166** — upstream Payload chrome: 16–22 px icon buttons, the
  18 px "Log out" text, 14–20 px doc-header links.
- **Drawer avatar spill (9 px)** — at 375 px the document still measures ~9 px wider than
  the viewport, traced to the account avatar inside the _closed_ nav drawer's header
  (`.app-header__account`, right edge 384). Invisible to users (the drawer is off-canvas)
  and part of the same stock chrome; the page _content_ overflow (item 3 above) is fixed.

## Files

- `src/modules/admin/writing-canvas.css` — contrast, wrap, focus-visible, touch-target and
  focus-mode rules (admin-only stylesheet).
- `src/modules/admin/FocusModeToggle.tsx` — new focus-mode control (plain client component).
- `src/collections/Publishing.ts` — registers the control in the editor's document controls;
  `src/app/(payload)/admin/importMap.js` regenerated.
- `src/modules/presentation/themes/legacy.ts`, `src/modules/presentation/themes/starter.css`
  — the highlight/focus contrast fix.
- `tests/rc2-h01/probe.mjs` — the measurement probe (the evidence instrument above).
