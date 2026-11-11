# GUI-05A — Dashboard: actions before diagnostics

**Result: PASS** (live-verified on the cycle-17 production build, source `db20b76`, clean)
**Executed by:** Harbor (the Codex assignment was superseded by Matthew's direction on Nov 10, 2026)
**Started from:** working tree `ac8ac69` (contains merged PRs #31/#32/#33 state plus batch 6, which is open as PR #37)

## What changed

- `src/modules/admin/PublisherDashboard.tsx` only:
  - Header actions are now real action buttons via the GUI-02B `ActionLink` primitive: **Write Article** (primary), **New Page**, **Upload Media** — in the first viewport, replacing the dot-separated text links. (Edit Menus remains reachable from navigation; it is not a primary creation task.)
  - A dedicated **Waiting for review** queue (status = review) now leads the work queues, followed by Recent drafts, Scheduled, Recently published. Queue headers carry real counts from `totalDocs` — no fake counters, no new endpoints.
  - Setup guidance is prominent only in the first-run state (nothing published); once the site has published content it tucks behind a native "Site setup and details" disclosure.
  - All queries remain permission-bound (`overrideAccess: false`, request-scoped): a role sees only rows it may read. Needs-attention content is unchanged (redirects note + Capability Center pointer for owners).

## Proof

- Typecheck PASS. Production build cycle-17 PASS.
- Live (probe-05d, zero page errors): dashboard renders Write Article / New Page / Upload Media as buttons, "Waiting for review" queue present, "Recent drafts (1)" with the seeded draft and its status pill; dark theme capture correct (primary action inverts properly); 375px capture with no page-level overflow. Captures in `docs/beta/evidence/GUI-05D/`.
- NOT VERIFIED: the review queue populated with an actual in-review item (fixture has none); role-denied dashboard rows (single-role fixture — the RC2 harness item).

## Guarantees

Deep links unchanged; no schema, endpoint, or access changes. Next prompt: GUI-05B.
