# RC-08C dependency-ordered closure blockers

Verdict: **FAIL / NOT READY**. Evidence source for every card: `01908f39a3ce40b5eae5d4dec64b981e103d5fb1`. Full suites pass; these mandatory gates remain unsatisfied. [Final report](../FINAL_RC_REPORT.md) controls all broader claims.

## 1. RC08C-UI-LOCK — native settings reload fails

- Trigger: ordinary owner completes blank-site setup, saves Site Settings (200), then reloads the editor. Core browser test fails after 13.7 seconds; footer input is absent and rendered page is blank.
- Exact error: `Cannot read properties of undefined (reading 'id')`, compiled Payload `getIsLocked` / `extractID(docs[0].user?.value)`; dependency source `@payloadcms/next/dist/views/Document/getIsLocked.js`.
- Evidence: `core-browser-results.json`, `core-error-context.md`, `settings-failure.png`, `web.log`, `core-sanitized-trace.zip` in the [receipt directory](../evidence/rc-08c-2026-10-06/).
- Root cause established: an unhandled missing lock-owner projection during native reload. Subsequent REST owner hydration succeeds; why the projection is missing remains unresolved.
- Smallest safe repair: preserve locking, guarantee correct lock owner creation/hydration, handle absent projections without unauthorized editing, and rerun the unchanged save/reload/core journey. Do not disable locking or weaken the footer assertion.

## 2. RC08C-STAFF-ENROLL — no ordinary first credential route

- Trigger: authenticated owner creates STAFF by ordinary `/api/users` (201); anonymous first enrollment `/api/auth/passkeys` options returns 401; `/login` authentication options return 400, `No passkey is registered for this owner.`
- Evidence: `staff-results.json`, `staff-enrollment.json`, `staff-login.json`, `staff-sanitized-trace.zip`. Existing owner adds a second passkey successfully: `additional-passkey-results.json`.
- Root cause: first-owner bootstrap provisions an initial credential, while additional registration requires an existing authenticated session. A new staff user cannot enter that cycle. Canonical member linkage/site grants must also be provisioned through supported operator behavior.
- Smallest safe repair: owner-issued, expiring, user-bound, single-use first-credential invitation with real WebAuthn verification and canonical site/member grants. Prove anonymous denial, wrong-user/site denial, expiry and replay rejection, then owner/administrator/staff workflows without forged sessions.

## 3. RC08C-TENANT — operator object/site authorization incomplete

- Source finding: `src/app/(frontend)/connections/page.tsx` uses global roles and seven unscoped privileged queries. `src/app/(frontend)/api/admin/integrations/route.ts` permits absent/arbitrary site IDs, privileged object mutations and provider collection selection without canonical actor-to-site checks. Audience intake/form access resolves host site but does not establish actor site membership.
- Runtime proof: anonymous integrations/intake denial passes. Authenticated cross-tenant/object cases remain unexecuted because card 2 blocks legitimate staff access. Source findings are not reported as successful exploit executions.
- Smallest safe repair: a shared canonical operator site-grant policy, site-filtered queries, checked object ownership, collection allowlist and relevant origin/CSRF protection. Test two real sites and ordinary scoped actors for each read and action.

## 4. RC08C-PROFILES — live route/action and module promises unclosed

- Fulfillment live page still renders `UnavailableWorkspace`; repaired component contracts are not live fulfillment proof. Complete Lean/Standard/all role/action matrices, moderation operations and every visible control remain unexecuted.
- Restore legitimate scoped roles first, exercise ordinary actions and persisted effects in each required profile, and repair unavailable mandatory surfaces. Do not replace mandatory acceptance with new deferrals or navigation-only checks.

## 5. RC08C-COMMERCE — ordinary settlement and providers unproved

- SQL/contract integration PASS does not cover ordinary checkout, persisted settlement, inventory races, affiliate/donation/subscription effects, signature failures, provider results and failed-only recovery. Printful unsupported upload/preflight/cost operations remain explicit unavailable boundaries.
- Complete the actual operator/checkout/webhook/worker path with genuine local or approved sandbox provider evidence; distinguish sandbox and real provider results. No invented payment/provider IDs or edited settlement rows.

## 6. RC08C-DEPS — dependency graph and advisory adjudication open

- `npm ls --all` reports `ELSPROBLEMS`: YAML 1.10.3 conflicts with Vite's YAML 2 optional peer. Audit: 23 package entries, 10 unique advisory IDs, including two critical tinypool advisories. Root dependencies ship in the production image.
- Evidence: `audit.json`, `dependency-graph.json`, `image-dependencies.json`, `dependency-decisions.json`. Standalone exclusion alone cannot adjudicate the whole image.
- Resolve the compatible graph without forced updates; review each unique advisory's actual importer, reachable surface, attacker prerequisites and explicit disposition. Rerun clean install, required suites and artifact inspection. Do not describe parent package counts as unique exploits.

## 7. RC08C-SECURITY — mandatory runtime negatives incomplete

- Inventory contains 1,618 review entries, not 1,618 reviewed safe sites. Broad authenticated tenant/object, passkey replay/origin/expiry/recovery/logout, CSRF, private media, external adapters and secret handling gates are incomplete.
- Review the inventory in context, create actors through card 2, execute required negatives through real interfaces and record persisted denials plus sanitized runtime evidence. Existing anonymous denial and owner login do not clear this card.

## 8. RC08C-GOLDEN — canonical A–T definition and successful journey missing

- Supplied attachments/repository reference golden proof but provide no authoritative A–T stage definitions. Existing core-site test fails at card 1 before publication. No A–T mapping has been invented.
- Recover the authoritative runbook, then execute every stage with normal UI/API paths, state assertions, rendered/network/console evidence and restart/refetch. Preserve missing prerequisites as blockers until supplied.

## 9. RC08C-RECOVERY — pending business work restart unproved

- Actual worker restarts and housekeeping jobs ran. No qualifying pending/failed business outbox workload was created and recovered with deduplication and failed-only retry.
- Create that state through real business actions, interrupt the genuine worker at the required boundary, restart and prove persisted exactly-once effects/attempt history. Do not edit status rows.

## 10. RC08C-RESTORE-COVERAGE — bounded restore lacks release business state

- Backup/restore tools pass; 21 files match, 306/309 tables match before post-restore login, with three worker housekeeping differences disclosed. Accounts/settings/media and real owner login survive.
- Published pages/search, commerce, audience/community and pending scheduled business state were absent. Complete cards 1–9, produce those states through ordinary flows, then repeat supported backup into a separate fresh project and refetch every required category.
- Authentic customer predecessor upgrade and a complete standard/Lean installer journey also remain unproved; fixture upgrade and manual Docker deployment do not substitute for them.

Each repair requires a clean committed candidate and restart of the affected dependency-ordered acceptance. Do not tag, push or publish a release while any mandatory card remains open.

## Affected files and downstream validity

Paths below identify the investigation/repair surface, not an assertion that every file is defective. For unexecuted gates, the root cause is missing accepted evidence or a stated prerequisite; a production defect is not invented.

| Card             | Affected files or surface                                                                                                                                                      | Downstream gates invalidated                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| UI-LOCK          | `node_modules/@payloadcms/next/dist/views/Document/getIsLocked.js`, Payload native document/global lock lifecycle, `tests/rc02/site-build.spec.ts`                             | Core publish journey, golden, complete business-state backup                                   |
| STAFF-ENROLL     | `src/app/(frontend)/api/auth/passkeys/route.ts`, `src/app/(frontend)/login/`, user provisioning, canonical member/site-team services                                           | Ordinary administrator/staff role actions, scoped moderation, authenticated security negatives |
| TENANT           | `src/app/(frontend)/connections/page.tsx`, `src/app/(frontend)/api/admin/integrations/route.ts`, `src/app/(frontend)/api/admin/audience/intake/route.ts`, form access policies | Secure multi-site operation, complete security/golden acceptance                               |
| PROFILES         | `src/app/(frontend)/admin/fulfillment/page.tsx`, `FulfillmentCommandCenter.tsx`, admin route/module registry                                                                   | Truthful supported profile acceptance, ordinary commerce operation                             |
| COMMERCE         | Checkout/payment/webhook/settlement services, commerce worker, POD provider adapters                                                                                           | Commerce golden stages, business recovery, commerce restore                                    |
| DEPS             | `package.json`, `package-lock.json`, `Dockerfile`, traced standalone and runner dependencies                                                                                   | Accepted dependency/security verdict, clean final release artifact                             |
| SECURITY         | Files listed in `access-inventory.json`, auth/CSRF/private media/provider handlers                                                                                             | Safe operator and tenant closure, final immutable release decision                             |
| GOLDEN           | Missing authoritative A–T runbook; `tests/rc02/site-build.spec.ts` is partial core coverage                                                                                    | Canonical end-to-end release proof and representative backup state                             |
| RECOVERY         | Worker, lease, outbox, scheduler, automation and settlement paths                                                                                                              | Persisted interruption recovery and pending-work restore                                       |
| RESTORE-COVERAGE | `src/scripts/operational-backup.ts`, `src/scripts/operational-restore.ts`, production/restore Compose and required state-creation journeys                                     | Complete second-environment restore, final release decision                                    |

Reproduction for missing acceptance: execute the corresponding phase of the supplied RC-08C runbook after its upstream cards pass; missing definition/artifact/provider prerequisites must be supplied explicitly. The captured core/probe harness commands are in the [dated execution receipt](../evidence/RC-08C-2026-10-06.md). Bounded backup/restore commands are recorded there and do not reproduce absent business-state coverage by themselves.
