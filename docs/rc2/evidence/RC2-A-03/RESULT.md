# RC2-A-03 — Result

- **Verdict: PASS**
- **Executed at:** 2026-11-11 (America/Chicago), Harbor — three parallel
  audits (seams, route ownership, debt), lead-reconciled.
- **Tested source:** `d438b3b03e1637aa9d309359046e2da22fa93281` (main,
  including the A-01 and A-02 merges). Tree clean apart from this pass's
  documents.
- **Scope:** audit only. No refactor; the one permitted exception (a
  focused P0 fix) was not needed — no P0 exists in this pass's findings.

## Deliverables

- `docs/rc2/RC2-SEAM-REGISTER.md` — the 11-seam register (owner paths,
  canonical model, site-ID handling, auth scope, caching, job ownership,
  provider adapters, evidence, status per seam) + the route-owner table.
- `docs/rc2/RC2-ENGINEERING-DEBT.md` — 13 debt rows (RC2-DEBT-01…13) with
  class, evidence, rank, compatibility risk, remediation sketch, owning
  pass, and the before/after measure per row, plus the full mandatory-
  checks appendix.

## Headline results

- **Seams: SOUND 5 · FRICTION 6 · BROKEN 0.** The sound five include the
  two that matter most: site-context propagation (isolation matrix-proven)
  and job ownership (one PostgreSQL queue engine, restart-recovery
  proven). No seam is broken.
- **Routes: 66 pages + 227 handlers measured; 18 custom admin views.**
  Ownership is single almost everywhere. The **five GUI-03A contested
  admin URLs all survive** (`/admin/email-composer`, `/admin/workflow`,
  `/admin/audience`, `/admin/releases`, `/admin/telemetry`) — each is the
  _same component_ mounted in two shells, so the duplication is chrome,
  not behavior; consolidation is a per-route decision (med risk), owned
  by the H batches. Collection slugs are each defined and claimed exactly
  once (double-claims are impossible — the registry throws); `/api/v1` is
  intentional versioning over the same services, not staleness.
- **Debt: 13 rows, P0 ×0, P1 ×2.** Flagship (RC2-DEBT-01, P1): the
  profile/space duplication is worse than briefed — 9 fields duplicated
  across two Payload collections **plus a third representation**: forum
  space access reads SQL tables `forum_spaces`/`space_memberships` that
  **no production code writes** (tests construct them from the migration).
  The register carries the exact seam/permission map the H-03 merge must
  preserve. Second P1 (RC2-DEBT-07): the Quality Center gate straddle —
  proof owned by C-03, explicitly not an alleged defect.
- **Negative results recorded:** the unscoped-query spot-check came back
  **clean** (sampled service finds are site-constrained or
  check-after-fetch; no leak instance found), and no executable import
  cycle could be demonstrated (the concrete finding is implicit two-way
  layering, RC2-DEBT-12).

## Carried resolutions (things earlier passes left open)

- **A-02 #74 GraphQL:** endpoints **are mounted** via the standard
  Payload tree — the NOT VERIFIED sub-point is settled at the routing
  level (schema depth follows Payload defaults).
- **Webhooks (A-02 open question): DECIDED** — one canonical store
  (`webhook-subscriptions` collection + `integrations/webhooks.ts`); the
  `extensions/api.ts` types are an unreferenced, divergent stale variant
  (RC2-DEBT-06, H-04).
- **A-01 carryover item 6:** `WritingCanvasField.tsx` confirmed present
  and inert at `src/modules/admin/` at this HEAD; deletion still needs
  the owner via the GitHub web UI.

## Change list

- `docs/rc2/RC2-SEAM-REGISTER.md` (new)
- `docs/rc2/RC2-ENGINEERING-DEBT.md` (new)
- `docs/rc2/evidence/RC2-A-03/RESULT.md` (new) — this receipt.
- `docs/rc2/RC2-STATUS.md` — A-03 marked PASS; A-04 next.
- No product code, migrations, or config changes.

## Unverified / blocked

- Seam statuses rest on mechanism inspection plus previously executed
  proof; no suite was re-run in this pass (suite health record: the A-01
  baseline chain on the parent baseline + green GitHub CI on main).
- Floor behavior of the three gate straddles remains unproven by design —
  that proof is A-04/H-02/C-03 work, now with exact targets.

## Next

**RC2-A-04** — Reproduction harness and standard fixtures: two real
websites, valid test providers, complete role ladder (owner, admin,
editor, author, contributor, moderator, member, subscriber, customer,
denied user, cross-site visitor), second publication type, store,
community space, and reusable sign-in/session helpers — so every later
pass tests against the same honest world. Not started.
