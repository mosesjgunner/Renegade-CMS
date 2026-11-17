# RC2-FIXALL-DEBT23 — Admin accessibility residuals (DEBT-23, IN full)

**Verdict: PASS with bounded findings** — five of the six residuals closed and
live-proven; error semantics improved measurably but its field-level half is a
bounded PARTIAL with two root-caused findings (below), recorded as findings per
the RC2 rules, not dressed as a pass.

Owner direction: Nov 16, 2026 — "Fix everything": DEBT-23 IN (full).
Baseline: H-01 probe run 7 (`docs/rc2/evidence/RC2-H-01/RESULT.md`).
Instrument: `tests/rc2-h01/probe.mjs`, re-run on the final build of this pass.
Probe host-form note: the probe now browses the rig's canonical origin
(127.0.0.1:39071, the rig's APP_URL) instead of `localhost` — the app's
cross-origin mutation guard correctly refused the error-state scenario's POST
from the mismatched origin, so the scenario died at the guard before it could
measure anything. No check was changed; only the host form.

## Before / after (H-01 probe, same checks)

| Check                             | Run 7 (baseline)                           | This pass                                                                                         |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Admin nav `aria-current`          | 0 markers                                  | **1 marker**, correct item                                                                        |
| Public nav `aria-current`         | code-verified only                         | **live: 2 on home, 2 on the article**                                                             |
| Editor overflow @375px            | document ~9px wider than viewport          | **scrollWidth 375 = viewport 375**                                                                |
| Touch targets <24px @375px        | 15/166                                     | **1/167** (named exception below)                                                                 |
| Tab path to Save                  | not reached in 30 stops                    | **Skip-to-Save bypass** (see below)                                                               |
| Error state (empty create → Save) | 500-class toast, `{alerts: 0, invalid: 0}` | **400, toast names the field**; `{alerts: 0, invalid: 0}` — PARTIAL, findings F1/F2               |
| Focus visibility                  | 24/30 with indicator (6 Lexical)           | 25/30; the 5 ring-less stops re-confirmed as Lexical `ContentEditable__root` (standing exception) |
| Contrast                          | 0 below AA                                 | 0 below AA (held)                                                                                 |

## What shipped

1. **Fixture menu seed** (`tests/fixtures/rc2-world.ts`): both publications per
   site carry a real navigation menu (Home `/`, Articles `/articles`, footer
   Home). Before this, the fixture configured no menu, so no rendered public
   page could carry an `aria-current` marker and the public half of the H-01
   residual was unprovable. `/articles` is the articles' real canonical prefix
   (the route template derives `/articles/<slug>` from the title — verified
   against the published fixture article's canonical path).
2. **`AdminA11yBridge`** (`src/modules/admin/AdminA11yBridge.tsx`, registered
   under `admin.components.providers`): annotates the stock admin nav's
   current item with `aria-current="page"` in place (exact match wins, else
   longest whole-segment prefix; `/admin` and `/` exact-only), and upgrades
   any rendered `.field-error` with `role="alert"`, an id, and
   `aria-invalid`/`aria-describedby` wiring on its field's control. The nav
   half is live-proven; the error half is implemented and ready but has no
   live rendering path in this build (findings F1/F2).
3. **Skip-to-Save** (`src/modules/admin/SkipToSave.tsx`, in the content
   editor's `beforeDocumentControls`): the WCAG 2.4.1 bypass pattern for the
   long form. Visually hidden until focused; activation moves focus to the
   real Save button — live-proven on a modified form. On a pristine form
   Payload disables Save (nothing to save), and a disabled button is
   unfocusable by any means, Tab included; the skip mirrors the platform
   there.
4. **CSS floors** (`src/modules/admin/writing-canvas.css`): 24px minimums for
   the nav toggler, mobile close, log-out, step-nav home/links, and
   react-select clear/dropdown indicators and input (the input's inline
   `min-width: 2px` needs `!important` to yield); at ≤768px the header
   step-nav wrapper can shrink (`min-width: 0`) and the step-nav scrolls
   internally — the avatar spill is gone.
5. **Title/slug guard error** (`src/modules/editorial/publishing-pass.ts`):
   the path-derivation hook threw a bare `Error`, which the API returned as
   a **500 "An unknown error occurred"** — measured live on the empty create
   form. It now throws a field `ValidationError` on `title`: the create
   answers **400** and the toast names the field ("The following field is
   invalid: title"), and the toast region is `aria-live`, so the message is
   announced. Pinned by a unit test.

## Named exceptions (not hidden, not forced)

- **Touch targets, 1 remaining:** the "All posts" link (45×14) is an inline
  link inside a sentence of helper prose in Renegade's own ContentTypeEntry —
  the WCAG 2.5.8 inline exception (a target in a sentence, constrained by the
  line height of the surrounding text). Growing it would break the sentence's
  layout; it stays, named.
- **Focus visibility:** the ring-less stops are Lexical editor canvases
  (`ContentEditable__root`, role=textbox), where the text caret is the focus
  indicator — the same exception H-01 closed, re-confirmed stop by stop.

## Veto grounds (why the two "native" routes were not taken)

- **Error semantics, native route:** Payload 3.90.2 resolves the Error
  component strictly per field from `fieldConfig.admin.components.Error`;
  there is no global default-Error override, and even a per-field Error
  component cannot touch the input element to set `aria-invalid`. The native
  route requires forking every field component in @payloadcms/ui or a
  Payload upgrade — disproportionate for this residual. The DOM bridge is
  the proportionate route.
- **Raw Tab order:** measured live — 45 stops reach only the form's start;
  the tail is the rich-text editor walking its document blocks, then the
  sidebar fields, with Save last in DOM order. Reordering means replacing
  Payload's document-form tree. The bypass block (skip control) is the
  standard, proportionate answer.

## Bounded findings (the PARTIAL in error semantics)

- **F1 — REST error responses drop per-field data in this build.** Payload's
  error formatter (`formatErrors`) includes the per-field error list only
  when the thrown error is an `instanceof` its ValidationError/APIError —
  and in this build's module graph that check fails, so every validation
  error reaches the client as `{message}` only. Measured with Payload's own
  native validation error (missing `contentType`), not just this pass's
  hook error: the response names the field in prose but carries no field
  list, so the admin can only toast it. Plausibly the same build-level
  cause as Performance lane 08's finding (the middleware/build pulling the
  whole Payload config into the app bundle). Needs its own build pass.
- **F2 — the editor's custom fields don't render field errors.** On the
  edit form, clearing the required title and blurring renders no
  `.field-error` at all (the custom HeadlineField does not render the stock
  error element), and the create form's submit path produces toasts only.
  Until F1/F2 are fixed, no live path renders a field error for the bridge
  to upgrade; the announcement that does occur is the `aria-live` toast
  naming the field.

Both findings are recorded here for I-03 triage as candidates for their own
pass, per the owner's rule that known problems get a real slot instead of
rolling forward silently.

## Proof

- H-01 probe on the final build: **14/17 green** — the three non-green are
  error-state (PARTIAL, F1/F2 above), focus-visibility (standing Lexical
  exception), touch-targets (1 named inline exception). All run-7 greens
  held: editor overflow at 375/768/1440/dark/zoom, contrast 0 below AA on
  editor and public, empty state, focus mode, keyboard path.
- Skip-to-Save activation verified directly: focus lands on the Save button
  on a modified form.
- GAUNTLET: full verify:release gauntlet green locally, stage by stage — fresh migrations, fixture seed, upgrade migrations, format:check, lint, typecheck, unit 289 files / 2,123 tests, integration 65 files / 366 tests, production build (all exit 0 on the final tree).
- Unit: bridge nav matcher 7/7; publishing-pass 3/3 (incl. the new
  ValidationError pin).
