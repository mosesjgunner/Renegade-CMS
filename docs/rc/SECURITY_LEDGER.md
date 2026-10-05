# Security ledger

## RC-04 Pass 2 executed privacy subset — 2026-10-04

Source `3a3260f120f500a48d51a5251a7fd3b900ba6e93`; [evidence](evidence/RC-04-PASS2.md). Real member sessions prove private profile and private thread API/SSR denial, foreign conversation denial even for a moderator, guessed attachment association denial, ordinary-member moderation denial, mute/block effects, owned export and logout/fresh-session persistence. Canonical post projections flatten member relationships; public native identity/community reads require staff access. Moderator authority is site-scoped and distinct from the admin cookie.

A genuine unsubscribed newsletter recipient receives an allowed internal reply notification, while no external communication is generated. In-app off and mute prevent subsequent notifications; enabling external community channels returns 410. DOI cannot clear non-unsubscribe suppressions. Malformed signup returns 400 and repeated requests hit the implemented process-local 429 window behind the tested proxy that replaces forwarded client-address headers. This does not assert distributed rate limiting or arbitrary deployment proxy safety.

Permanent deletion, full contribution/message export, per-event switches and private attachment launch are deferred. New private uploads return 410, and no end-to-end encryption claim is made. Remaining broad role/tenant/provider, private byte and operational gates below are not cleared.

Source candidate: `e24fc53d9e370e28f01398c561b0f5adc4884756`. Reconciled 2026-10-03. Initial working tree was clean. This documentation freeze binds the source candidate; its artifact commit is discoverable with git log -- docs/rc. It does not establish runtime release readiness.

| Boundary                              | Source / contract                                                   | Status  | First known issue or mandatory proof                                                                               |
| ------------------------------------- | ------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| Admin identity / passkeys             | src/modules/operations/passkey-auth.ts; src/app/(frontend)/api/auth | BLOCKER | Replay/origin/recovery/session/CSRF and owner/administrator/staff browser matrix pending                           |
| Multi-site access                     | Collection access callbacks; route actor/site resolvers             | BLOCKER | Audience first-site overrideAccess fallback and unscoped subscriber total require repair/audit                     |
| Member privacy                        | src/modules/community/policy.ts; src/collections/Identity.ts        | BLOCKER | Member identity distinct from Payload admin; profile visibility, block/mute/export/deletion negative proof pending |
| Provider secrets / outbound egress    | src/modules/ai; src/modules/extensions; provider adapters           | BLOCKER | Credential encryption/redaction/rotation and allowlisted egress must be exercised; no secret values printed        |
| Webhook / payment / delivery outcomes | Commerce, telecom, social and network handlers                      | BLOCKER | Signature/replay/idempotency/unknown outcome/retry limits and receipt audit pending                                |
| Media / uploads / editor              | Media routes and image-editor adapters                              | BLOCKER | Private byte access, MIME/size, references/replacement/deletion and cross-site assets pending                      |
| Publication / builder / AI            | Canonical content and layout services; proposal gateway             | BLOCKER | Draft isolation, publish authorization, human approval, sanitization and transaction rollback pending              |
| Test bypass isolation                 | LOCAL_E2E_TEST_MODE and ENABLE_TEST_ROUTES guards                   | BLOCKER | Development fixtures must not bypass production authorization; production negative acceptance pending              |
| Operational recovery                  | src/scripts/operational-\*; docker/worker-healthcheck.mjs           | BLOCKER | Secret-safe manifests, restore consistency, restart leases and audit recovery pending                              |

Example credentials/tokens are inventoried by source search in evidence/stale-truth.md; matches in fixtures/build defaults are not automatically leaked production secrets. No credential-bearing environment file was copied.

Source-confirmed review priority: `/connections` obtains operational connection, delivery and audit data using overrideAccess without rejecting an unauthenticated actor before the queries/render. Its `isStaff` flag controls management UI, while account identifiers remain renderable. Treat disclosure and tenant scope as BLOCKER; no live exploit or browser claim is made here. Audience's first-site fallback and unscoped subscriber count are a separate tenant-boundary blocker. Frontend `/admin/*` wrappers must also be tested separately from the Payload catchall because several render client components without an explicit page-level authentication guard.
