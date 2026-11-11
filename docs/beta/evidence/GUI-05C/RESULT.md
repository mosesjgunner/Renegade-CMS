# GUI-05C — Selected-item detail and exception-first operations

**Result: PARTIAL** (model applied to one dense operations view and live-verified at rest; the live audit run rides the RC2 fixture work)
**Executed by:** Harbor

## Proof surface
`src/modules/admin/RenderedQualityCenter.tsx` — the discovery/audit operations view (high-density: findings, cross-checks, cannibalization, AI proposals).

## What changed
- The view's chrome now follows the shared detail model: `WorkspaceHeader` carries the **single primary task — Run Rendered Audit** — with the plain-language purpose line; tab sections use `SectionHeader`.
- Severity is no longer carried by color alone: both findings tables render severity as `StatusPill` (dot + text; blocking = danger tone, warning = warning tone).
- Audit failure renders `ErrorState` **with a retry that re-runs the audit** (previously a static red box).
- Accepting an AI proposal no longer reports failure via `alert()`; failures land in an inline `ErrorState` an operator can read and act on (the 02C honest-states rule).
- The pre-run state uses the shared `EmptyState`.
- NOT changed: audit data, rule IDs/explanations, accept endpoint, tabs, summary cards, or any permission (the staff-gated audit API is untouched).

## Proof
- Typecheck PASS; production build cycle-17 PASS.
- Live (probe-05d, zero page errors): the center renders with the primary task in the header, the four tabs, and the shared empty state — capture in `docs/beta/evidence/GUI-05D/`.
- NOT VERIFIED: a live audit run against published content (the fixture's public surface is minimal — the same limitation recorded for GUI-07A), the populated findings table with pills, and the accept-proposal failure path in browser.

## Guarantees
No financial/consent permissions touched; no data contracts changed. Next prompt: GUI-05D.
