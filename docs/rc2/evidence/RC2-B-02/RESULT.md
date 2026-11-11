# RC2-B-02 — Presentation journey: Puck builder, themes, navigation — RESULT

**Verdict: PASS.** Extending the GUI-06D Puck proof onto the A-04
two-site world: a page was composed in the real visual builder with two
different block types, edited off defaults, given a library media asset,
saved, reloaded, and published; anonymous readers render it identically
at desktop and mobile widths; a navigation change reaches the public
header; a theme switch persists without losing the canonical content;
an unsupported block degrades gracefully; and the tenant wall holds in
both directions (no page on Site B, no builder for the denied
principal).

- Tested HEAD: `0167be9` (main; merge of PR #49, RC2-B-01). The served
  production build is of `64d1ec5`; the B-01 merge changed no production
  code (tests/docs only), so the build is identical for this surface.
  Zero production code changed by this prompt.
- World suffix `00695e59`, served `RENEGADE_MODULES=all`, database
  `b01_release_acceptance` (PostgreSQL 16, local).
- Executable journey: `tests/rc2-b02/journey.mjs` (Playwright, headless
  Chromium) seeded by `tests/rc2-b02/seed-layout.spec.ts` (creates and
  resets the showcase layout on Site A; resolves the publication the
  public shell binds to — see F1).
- Green run: 2026-11-11, **14/14 stages PASS**, exit code 0. Six
  screenshots captured (builder composed, builder published, public
  desktop, public mobile, public after theme switch, denied builder).
  Screenshots are binary and the delivery path for this repo is
  text-only, so they are retained with the run artifacts rather than
  committed; stage results below are the committed record.

## Stage results (green run)

| #   | Stage                                                             | Result |
| --- | ----------------------------------------------------------------- | ------ |
| 1   | Builder opens on the Site A layout with the starter theme         | PASS   |
| 2   | Two different block types added (Hero + Rich content)             | PASS   |
| 3   | Hero fields edited off defaults (title read-back)                 | PASS   |
| 4   | Hero media attached from the library                              | PASS   |
| 5   | Rich content fields edited                                        | PASS   |
| 6   | Save + reload keeps both blocks and the edited titles             | PASS   |
| 7   | Anonymous desktop renders hero + rich with edited props           | PASS   |
| 8   | Attached media renders on the public page                         | PASS   |
| 9   | Anonymous mobile renders the same content, no horizontal overflow | PASS   |
| 10  | No Site A page on Site B (404)                                    | PASS   |
| 11  | Navigation change reaches the public site header                  | PASS   |
| 12  | Theme switch to Renegade Party persists, canonical content kept   | PASS   |
| 13  | Unsupported block falls back gracefully on the public page        | PASS   |
| 14  | Denied principal gets no builder for the Site A layout            | PASS   |

Edited props were verified where readers meet them: the public hero
section renders `data-align="center"`, `data-bg="brand"`,
`data-variant="split"` (defaults are left/canvas/default), and the
stored block props carry the plain values (`alignment: 'center'`,
`background: 'brand'`, `variant: 'split'`, the library media id/href/
label). The media picker is site-scoped: the choices endpoint returned
exactly Site A's asset. Theme persistence was verified by REST
read-back of the layout (`themeId: 'renegade-party'`, status
published), not by UI text alone. The unsupported-block page was
created through the operator API with a valid Hero plus a
`publisher.does-not-exist` block, published through the builder, and
renders 200 with the Hero shown and the unknown block silently
skipped — no error page, no placeholder text.

## Findings

**F1 — (P2, presentation coherence) The public shell's identity and
navigation bind to the most recently created publication, not to the
site.** `src/app/(frontend)/layout.tsx` resolves the host's site, then
takes the site's newest active public publication (`sort: '-createdAt'`,
limit 1) and lets its `name` overwrite the site-settings site name and
its `navigation` drive the header/footer. Site A has three
publications with divergent navigations (an auto-created default with
Home/Articles, the blog, the news publication with an empty menu). In
run 1 of this journey, adding a "Showcase" link to the _blog_
publication's navigation saved successfully (200) and never appeared
anywhere public, because the shell reads the _news_ publication.
Editing the shell-bound publication's navigation works end to end
(stage 11), so the supported path is functional — but on a
multi-publication site, which publication owns the header is an
accident of creation order. This cuts against the settled scope model
(a website has its own identity and admin control; publications are
outlets hosted on it). The builder's admin chrome shows the same
smell: its header labeled the session "Site B News 00695e59" — the
globally newest publication — while editing Site A's layout and even
while refusing the Site B outsider. Access control was correct in
every case; this is identity/labeling, not a scope leak. Root-cause
class: presentation binding decision. Candidate fix direction (not
taken here): shell identity + navigation from site settings, with
publication-level override only when a route belongs to that
publication.

**F2 — Two theme levels exist and both work; the UI does not say so.**
The builder's "Compatible theme" switch sets the _layout's_ theme
(stages 1/12; persisted, content immutable across the switch, matching
ledger row #8's contract). The public shell's `data-theme` comes from
_site settings_ (`resolveSiteSettings` in the frontend layout), so a
layout theme switch does not re-skin the site chrome. Neither behavior
is broken; the distinction is invisible to an operator until they go
looking. Recorded as documentation/UX debt, not a defect.

**F3 — Builder draft state persists server-side across sessions.**
Blocks added in an early probe session (never explicitly saved) were
still present when the builder reopened, and the layout revision
counter advances through builder sessions (rev 12 by the end of run
1). This reads as deliberate draft autosave with revision history
(the builder ships a Rollback Revision control); the B-02 seed resets
the layout before each run for determinism. No action; noted so the
behavior is on record as observed, not assumed.

**Gating/scope note.** Presentation is floor functionality: the ledger
rows #8 (theme engine) and #9 (visual page builder) are marked floor,
`page-layouts` is not claimed by any optional module, and the builder
ran identically in the world's Standard configuration. The
Lean-profile builder case rides the H family's module-profile proofs.

## Named for RC3 (per the prompt: identify, do not implement)

- **#10 Adaptive template conversion** — below E2 in the ledger
  (split rating); no conversion journey exists. RC3 candidate.
- **#11 Starter-site generator** — E1 (mounted demo). The journey used
  a hand-seeded layout on an existing site; generating a coherent
  starter site end to end is unproven. RC3 candidate, and the natural
  home for the Shopify Canvas board-view idea filed with this family.

## Family ledger update

`docs/rc2/RC2-12-FAMILY-JOURNEYS.md`: Presentation & Website Building
records this journey as its E2 proof. Next prompt: **RC2-B-03**.
