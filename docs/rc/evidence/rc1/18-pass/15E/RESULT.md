# RC1 15E — PASS (2026-11-01)

Federation, module registration and auxiliary acceptance PASS. Aggregate RC1 remains NOT READY. Only 15E executed; no commit, push, tag, external dispatch, live charge, publication or deployment of an existing environment.

Exact source: base `88a25b495ee5a7d6d1f259591ff93c1ec2394f82` plus the complete 1581-file dirty runtime manifest `source-tree.json`, SHA-256 `9ef4cc51e8dce8045466c9d73446bbdd3524d9aa8d904d9f84d566b540a56aea`. Journey and PostgreSQL/web restart used identical source. Provenance verification (`node --import tsx tests/rc1-15e/provenance.ts --check`) verified cleanly. All prior source outside 15E paths is unchanged; earlier receipts keep their own tested sources and are not relabelled as current.

Implementation:

- Module Registry & Honest Provider Boundaries (`src/modules/module-registry.ts`):
  - Added `ProviderBoundaryType` ('local-only', 'local-harness', 'local-peer', 'local-sink', 'local-adapter') and explicit honest boundary claims to all 17 optional modules (collaboration, community, events, sources, media-studio, social, network, integrations, releases, forms, crm, newsletter, notifications, analytics, experiences, quality, commerce).
  - Exported `getModuleBoundaryRecords()` and serialized `module-boundaries.json` evidence. No unsupported promotion to a production federation claim; independent local-peer boundaries remain strictly delimited.
- Graceful Unmounted Auxiliary Module Degradation:
  - Patched 12 public routes (`forums`, `forums/[forumSlug]`, `forums/[forumSlug]/[topicSlug]`, `store`, `store/[slug]`, `podcasts/[slug]`, `podcasts/episodes/[slug]`, `videos`, `videos/[slug]`, `network`, `ap/actors/[handle]/inbox`, `.well-known/webfinger`) to return clean HTTP 404 / `notFound()` without application failure when corresponding modules or collections are unmounted.
- ActivityPub & Network Foundation Repair:
  - Added migration `20261101_160000_rc1_network_relationship_ids.ts` providing `SET DEFAULT gen_random_uuid()` on `network_relationships`, `remote_objects`, `network_access_decisions`, and `network_audit_events` to resolve missing ID defaults on Payload create operations.
  - Reconciled WebFinger actor resolution and ActivityPub HTTPS signature verification across local host headers.
- Connections Center Client/Server Boundary Repair:
  - Extracted `src/modules/integrations/contracts.ts` containing pure type and scope definitions (`INTEGRATION_SCOPES`, `WebhookDeliveryDiagnosis`, etc.), eliminating client-side `node:crypto` bundling failure in `ConnectionsCenter.tsx`.
  - Removed forbidden non-serializable function prop passing (`groupFor={determineGroup}`) from server component `connections/page.tsx` to client component `ConnectionsCenter.tsx`.

Actual ordinary path and persisted facts:

`journey-trace.json`: 20 passed, 0 failed/skipped.
1. Next.js web process boots cleanly on `http://127.0.0.1:39064`.
2. Independent local peer HTTPS server boots on `127.0.0.1:39154` with independent RSA keypair.
3. Reconciles all 17 optional modules with explicit local boundary definitions.
4. Discovers and persists independent remote peer actor and instance in `remote-actors` and `remote-instances`.
5. Queues outbound delivery with persistent idempotency key in `outbound-network-deliveries`.
6. Outbound delivery attempt 1 records transient failure on peer HTTP 503 response.
7. Attempt 1 recorded in `network-delivery-attempts` and delivery remains in `queued` state.
8. Outbound delivery attempt 2 succeeds on peer HTTP 202 and delivery transitions to `delivered`.
9. Outbound delivery worker task is idempotent; running again for delivered item creates zero extra attempts.
10. Inbound ActivityPub `Follow` activity accepted with HTTP 202 and verified HTTP signature.
11. Inbound activity recorded in `inbound-network-activities` and active inbound follow relationship persisted in `network-relationships`.
12. Duplicate inbound activity returns HTTP 202 and produces zero new database records (replay deduplication).
13. Inbound request from policy-blocked remote peer is rejected with HTTP 401.
14. Outbound delivery to blocked destination transitions to status: `blocked`.
15. Inbound activity with forged signature is rejected with HTTP 401.
16. WebFinger endpoint (`/.well-known/webfinger`) resolves publication actor to ActivityPub profile URL.
17. Public `/network` page renders Network connections heading and admin link.
18. Auxiliary module routes return clean 404 for missing items without crashing the application.
19. Anonymous request to `/connections` redirects to `/login` (HTTP 307).
20. Authorized owner with passkey session views Connections Center (`/connections`) with operational connection groups in Chromium headless.

Negatives and restart:

- Negative policy enforcement: remote instance blocked by operator access decision rejects inbound activities with HTTP 401 and marks outbound deliveries as `blocked`.
- Negative cryptographic verification: inbound activity with forged RSA signature is rejected with HTTP 401.
- Negative idempotency: replaying existing delivery keys or inbound activity IDs creates zero duplicate attempts or relationships.
- Negative authorization: anonymous access to `/connections` is rejected with HTTP 307 redirect to `/login`.
- Negative unmounted route handling: auxiliary routes cleanly 404 without crashing.
- `restart-trace.json`: 8 passed, 0 failed/skipped after container `rc115e-20261101` restart and fresh Next.js web boot.
  - Remote actor and instance records survive restart.
  - Outbound delivery status (`delivered`) and 2 delivery attempts survive restart.
  - Inbound activity record and active follow relationship survive restart.
  - Operator network access decision (`block`) survives restart.
  - Delivery task retry after restart produces zero duplicate attempts.
  - Public `/network` renders properly in Chromium after restart.

Commands and counts:

- Accepted focused Vitest: 7 files / 43 passed / 0 failed / 0 skipped (`tests/unit/modules-and-federation-15e.test.ts`, `tests/unit/module-registry.test.ts`, `tests/unit/module-profiles-acceptance.test.ts`, `tests/unit/network-foundation.test.ts`, `tests/unit/network-experience.test.ts`, `tests/unit/activitypub.test.ts`, `tests/unit/production-module-config.test.ts`).
- Fresh guarded migrations: 130 migrations migrated fresh, exit 0 (`npm run test:migrations:fresh`).
- TypeScript: `npx.cmd tsc --noEmit`, exit 0.
- Scoped ESLint: 6 changed files, 0 errors, 0 warnings, exit 0.
- Journey Acceptance: 20 passed / 0 failed / 0 skipped, exit 0.
- Restart Acceptance: 8 passed / 0 failed / 0 skipped, exit 0.
- Source containment: 1581 files, SHA-256 `9ef4cc51e8dce8045466c9d73446bbdd3524d9aa8d904d9f84d566b540a56aea`, exit 0.
- Total accepted behavioral checks: 71 passed / 0 failed / 0 skipped.

Runtime: Node 24.19.0, installed Next 16.3.8 development/webpack, Payload 3.90.2, all modules; test auth/routes false. PostgreSQL 17.11 owned container `rc115e-20261101`, label `rc1.scope=15e`, loopback 5479, DB `rc115e_release_acceptance`; web 39064, peer HTTPS 39154, media `scratch/rc115e/media`, dist `.next-rc115e`. Email/telecom disabled. No production application image, remote federation server, or external network claim. Full repository quality/build/release gates remain outside this focused subpass.

Changed paths:
- `src/app/(frontend)/.well-known/webfinger/route.ts`
- `src/app/(frontend)/ap/actors/[handle]/inbox/route.ts`
- `src/app/(frontend)/connections/page.tsx`
- `src/app/(frontend)/forums/[forumSlug]/[topicSlug]/page.tsx`
- `src/app/(frontend)/forums/[forumSlug]/page.tsx`
- `src/app/(frontend)/forums/page.tsx`
- `src/app/(frontend)/network/page.tsx`
- `src/app/(frontend)/podcasts/[slug]/page.tsx`
- `src/app/(frontend)/podcasts/episodes/[slug]/page.tsx`
- `src/app/(frontend)/store/[slug]/page.tsx`
- `src/app/(frontend)/store/page.tsx`
- `src/app/(frontend)/videos/[slug]/page.tsx`
- `src/app/(frontend)/videos/page.tsx`
- `src/migrations/20261101_160000_rc1_network_relationship_ids.ts`
- `src/migrations/index.ts`
- `src/modules/extensions/ConnectionsCenter.tsx`
- `src/modules/integrations/contracts.ts`
- `src/modules/module-registry.ts`
- `tests/rc1-15e/journey.ts`
- `tests/rc1-15e/provenance.ts`
- `tests/rc1-15e/run.ps1`
- `tests/rc1-15e/tsconfig.json`
- `tests/unit/modules-and-federation-15e.test.ts`

Open scoped blockers: none. Owned web/browser stopped; owned PostgreSQL stopped/data retained. Handoff is NEXT.md. Next subpass not executed.

