# GUI-07A — Discovery and SEO

**Result: PARTIAL** (internal-code de-emphasis done on the audit surface; center journeys ride captures)

## Changed (`RenderedQualityCenter.tsx`)

The rendered-quality audit spoke in internal codes: the page heading
ended in "— DISC-05" and both issue tables led with the raw ruleId
(`DISC-05-TITLE-MISSING`, …) as the primary cell — the register's
UX-10 complaint ("internal codes in headings") on the discovery
surface. Now:

- Heading reads "Rendered Quality & Discovery".
- Each issue row leads with a plain-language explanation that says
  what is wrong and what to do ("Missing page title — add a title so
  search results and tabs name this page."), covering the DISC-05
  family (title missing/bounds, description missing/bounds,
  cannibalization review); unknown future ruleIds fall back to a
  generic line pointing at the evidence column rather than showing a
  bare code.
- The ruleId is preserved as the cell's tooltip and untouched in the
  audit data itself — evidence and machine contracts intact; only
  the human surface changed.

## Audit notes

- `DiscoveryPanel` (per-record) already leads with evidence + repair
  targets and carries no DISC codes in its visible copy — no change.
- IndexingCenter / RedirectManager: no internal codes in visible
  headings found; their action/validation behavior untouched per the
  prompt's boundaries (no indexing/publication semantics changed).

## Not verified here

Live audit run, cross-site/role behavior, redirect safety checks —
the capture cycle (fixture has no indexed public surface to audit
yet; a live audit needs a published page, which the 04E/06D journey
sequence now produces).

**Exact next prompt: GUI-07B.**
