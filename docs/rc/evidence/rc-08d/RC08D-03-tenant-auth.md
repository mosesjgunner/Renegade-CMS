# RC08D-03: Tenant Authorization & Scoped Operator Grants Gate Receipt

- Gate: `RC08D-03` (`RC08C-TENANT`)
- Status: **PASS**
- Scope: Shared canonical operator site-grant policy, site-filtered queries, verified object ownership, collection allowlists, and origin verification preventing cross-tenant information disclosure and unauthorized mutations.
- Target Modules: `src/modules/operations/operator-grants.ts`, `src/app/(frontend)/connections/page.tsx`, `src/app/(frontend)/api/admin/integrations/route.ts`, `src/app/(frontend)/api/admin/audience/intake/route.ts`, `tests/unit/tenant-isolation.test.ts`.

## Accepted Scope & Provenance

- Created `resolveOperatorGrantContext` and `checkOperatorSiteAccess` in `src/modules/operations/operator-grants.ts`.
- Bounded operator authority by canonical Member identity and explicit `member-site-roles` grants; preserved global superuser semantics strictly for `owner`.
- Scoped all integration reads and mutations (`ALLOWED_COLLECTIONS`, origin verification, target site grant enforcement) in `src/app/(frontend)/api/admin/integrations/route.ts`.
- Scoped connection dashboard queries to granted site identifiers in `src/app/(frontend)/connections/page.tsx`.
- Scoped audience intake operations by target site in `src/app/(frontend)/api/admin/audience/intake/route.ts`.

## Executed Commands & Results

- Command: `npm.cmd run test tests/unit/tenant-isolation.test.ts`
  - Result: Exit 0. All 3 tenant boundary tests passed (denial of anonymous/subscriber actors, global owner grants, scoped member-site-roles grants with cross-tenant denial).
- Command: `cmd /c "set DATABASE_URL=... && node --env-file=.env scripts/run-integration.mjs tests/integration/integrations-admin-api.integration.test.ts"`
  - Result: Exit 0. 8/8 tests passing with staff role enforcement and credential lifecycle actions.

## Contained in Candidate

- `src/modules/operations/operator-grants.ts`
- `src/app/(frontend)/connections/page.tsx`
- `src/app/(frontend)/api/admin/integrations/route.ts`
- `src/app/(frontend)/api/admin/audience/intake/route.ts`
- `tests/unit/tenant-isolation.test.ts`
- Provenance confirmed in repository tree.
