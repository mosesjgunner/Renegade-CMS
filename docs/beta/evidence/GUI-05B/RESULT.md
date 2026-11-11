# GUI-05B — Content-management list consistency

**Result: PARTIAL** (one custom surface standardized live; the rest of the pack's scope is honestly bounded below)
**Executed by:** Harbor

## What changed

- `src/modules/admin/RedirectManager.tsx` (the pack's own named example surface — redirects): page chrome adopted from the shared primitives — `WorkspaceHeader`, `SectionHeader`; rule status rendered as `StatusPill` (dot + text, never color alone; disabled rules read "301 · off"); load failure renders `ErrorState` with a working retry; **empty and no-match are now distinct states** ("No redirect rules yet. Add the first one above." vs "No rules match "…""); long paths wrap (`overflowWrap: anywhere`); the table scrolls internally on narrow screens.
- `src/modules/admin/primitives/index.tsx`: `ErrorState` gained an additive optional `onRetry` callback (existing `retryHref` behavior untouched) so client components can retry in place.

## Audit finding (no change, by design)

Payload-native collection lists (Posts/Pages/taxonomy/authors) are already consistent — Payload's own list view supplies shared search/filter/sort/pagination/selection semantics. Re-skinning them would fight the framework for no gain; recorded as audited, consistent, unchanged (the RC2 anti-trap: no aesthetic rewrites of working code).

## Proof

- Typecheck PASS; production build cycle-17 PASS.
- Live (probe-05d, zero page errors): Redirects page renders the shared header/sections, "Active Redirect Rules (0)", and the new distinct empty state — captures in `docs/beta/evidence/GUI-05D/`.
- NOT VERIFIED: the no-match state in browser — the probe's synthetic search returned false; the rules list was empty so search had nothing to filter. The state exists in code and is distinct, but the live capture is owed (needs a seeded rule). Bulk actions: the manager has no bulk operations to permission-check; row delete keeps its native confirm.

## Guarantees

No schema/API changes; delete confirmation preserved; deep links unchanged. Next prompt: GUI-05C.
