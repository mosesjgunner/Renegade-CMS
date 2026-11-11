# Admin design system — GUI-02A

One coherent operator design language for the Renegade admin, derived
from the GUI-01A audit and the GUI-01B baseline captures. Admin-only:
nothing here touches the public `--presentation-*` tokens, starter
themes, or any persisted presentation data.

## Visual principles (from the audited screens)

1. **Calm application chrome.** The shell recedes; content leads. (The
   01B dashboard capture already does this — plain headings, generous
   whitespace — and is the reference mood.)
2. **Clear hierarchy.** One page title, one primary action, sections in
   task order. Operations and diagnostics never lead a screen (UX-06).
3. **Compact management tables.** Lists are for scanning: dense rows,
   muted metadata, actions at the row's end.
4. **Generous editor canvas.** Writing surfaces get the width and the
   type size; settings compress into an inspector (GUI-04 family).
5. **Contextual advanced controls.** Advanced fields exist and stay
   reachable, disclosed progressively — never deleted to look simpler.
6. **Truthful states.** Loading, saved/unsaved, empty, no-matches,
   denied, stale, error/retry are distinct and labeled (UX-08).

## Semantic tokens

Implementation: `src/modules/admin/styles/admin-tokens.css`, imported
by `src/app/(payload)/layout.tsx` after `@payloadcms/next/css`. Every
token maps onto an installed Payload `--theme-*` variable, which Payload
itself switches under `html[data-theme='dark']` — so the map is verified
structurally in both themes with zero dark-specific overrides.

| Semantic token                                           | Payload source                                                      | Use                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| `--admin-bg`                                             | `--theme-bg`                                                        | App background                                               |
| `--admin-surface`                                        | `--theme-elevation-0`                                               | Cards, panels                                                |
| `--admin-surface-raised`                                 | `--theme-elevation-50`                                              | Raised/hover surfaces                                        |
| `--admin-surface-sunken`                                 | `--theme-input-bg`                                                  | Inputs, wells                                                |
| `--admin-text`                                           | `--theme-text`                                                      | Primary text                                                 |
| `--admin-text-muted`                                     | `--theme-elevation-600`                                             | Metadata, help text                                          |
| `--admin-border`                                         | `--theme-border-color`                                              | Dividers, control borders                                    |
| `--admin-focus`                                          | `--theme-text`                                                      | Focus outline color                                          |
| `--admin-success` / `--admin-warning` / `--admin-danger` | `--theme-success-500` / `--theme-warning-500` / `--theme-error-500` | Status + intent (always paired with text, never color alone) |

Typography: `--admin-font` = Payload `--font-body` (no second stack in
admin). Scale: sm 0.8125rem (metadata), base 0.9375rem, lg 1.125rem,
line-height 1.55. Editor prose sizes are the GUI-04 family's concern
(the writing canvas sets its own), not this layer's.

Spacing: 4px base scale `--admin-space-1..8` (0.25–2rem).
Shape: `--admin-radius` from Payload `--style-radius-m` when present.
Measure: content width 72rem; reading width 44rem.

**Contrast targets (documented, not yet measured):** body text ≥ 4.5:1,
large text and control boundaries ≥ 3:1 against their surfaces, in both
themes. Because every text token resolves to Payload's own theme pair
(`--theme-text` on `--theme-bg`/elevations), the pairs inherit Payload's
shipped contrast; independent measurement is a GUI-08B task. Per the
pack rule, no compliance is claimed from this document.

## Reference specs

**Workspace header** (used by dashboard, centers, lists): page title in
the base font at lg size, one-line purpose in `--admin-text-muted`, one
primary action right-aligned, secondary actions as plain links. Bottom
border `--admin-border`. No banners above the title.

**Form section** (editor inspector, settings): section label (sm,
muted, uppercase never), fields on `--admin-surface-sunken` inputs with
`--admin-border`, help text sm muted, field errors in `--admin-danger`
with text (the error pill pattern from Payload's Collapsible is the
reference). Sections separated by `--admin-space-6`, never by nested
cards.

**Editor canvas** (spec only — implementation is GUI-04A/04C, already
partly landed): dominant central column at reading width, headline
first, settings in a collapsible inspector, publishing actions in a
compact header bar (GUI-04B). This layer supplies its colors, spacing
and type scale only.

## Boundaries kept

- No new UI framework; Payload UI remains the component source.
- Public `--presentation-*` tokens and starter CSS untouched.
- No schema, route, or contract changes. The only runtime change is one
  CSS import in the Payload layout.

**Exact next prompt: GUI-02B.**

## Primitives (GUI-02B)

Location: `src/modules/admin/primitives/` (`index.tsx` +
`primitives.module.css`). Styling consumes only `--admin-*` tokens.

| Primitive         | Props (summary)                                  | Notes                                                                                       |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `WorkspaceHeader` | `title`, `purpose?`, `actions?`, `crumbs?`       | Breadcrumb uses `aria-current` on the last crumb; actions wrap on small screens             |
| `SectionHeader`   | children                                         | One section heading style for operator views                                                |
| `ActionLink`      | `href`, `intent: primary/secondary/destructive`  | Real link; `:focus-visible` outline; disabled state styled via `[disabled]`/`aria-disabled` |
| `StatusPill`      | `tone: success/warning/danger/neutral`, children | Tone is a dot + text label — meaning never rides on color alone                             |
| `EmptyState`      | children                                         | Distinct from no-results-after-filter copy; callers pass the right words                    |
| `ErrorState`      | `message`, `retryHref?`, `retryLabel?`           | `role="alert"`; retry is a link back to the surface                                         |
| `DetailContainer` | children                                         | Selected-item detail surface                                                                |
| `LoadingSkeleton` | `rows?`                                          | `role="status"` + `aria-busy`; honors `prefers-reduced-motion`                              |

First adoption: `PublisherDashboard` (WorkspaceHeader, SectionHeader,
StatusPill for content status, EmptyState for empty groups). Interactive
button variants (pending/denied behavior in client components) arrive
with the first client-side consumer; the link-based actions above carry
keyboard/focus behavior natively.
