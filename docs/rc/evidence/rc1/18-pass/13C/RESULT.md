# RC1 13C — PASS, Tracking, Exception Handling and Restart Recovery

2026-10-29. **131 passed / 0 failed / 0 skipped in accepted final checks:**
- 101 focused unit tests across 8 suites (`rc1-13c-fulfillment-lifecycle`, `rc1-13b-adapters`, `rc1-13b-provider-truth`, `shop-03-pod-fulfillment`, `pod-production-key`, `rc1-13b-operator`, `rc1-13a-fulfillment-eligibility`, `fulfillment-provider-boundaries`).
- 23 persisted operator journey checks (`docs/rc/evidence/rc1/18-pass/13C/journey.json`).
- 7 restart recovery checks (`docs/rc/evidence/rc1/18-pass/13C/restart.json`).
- 0 mandatory local 13C acceptance groups unexecuted. Aggregate RC1 remains NOT READY. No next subpass executed.

Remote sandbox and real-world production fulfillment/shipping are separate **unexecuted** evidence classes; neither is claimed by this PASS.

## Exact source and ownership

Base **`aa8c32b35890bd91510b3feea399468a3117474b`** plus [source-tree.json](source-tree.json): **1,536 source/configuration files**, SHA-256 **`79934685c7ed620bf678e25dc265e301487da11a30d270c53ef4b67150d68363`**.
No git push, tag, publish or deployment performed. Documentation/evidence, dependencies, media, databases and secrets are excluded from source hashing. Final source containment passes (`tests/rc1-13c/provenance.ts --check`).

Preexisting 13A and 13B implementation, migrations, tests, evidence, and ledger rows were preserved. The same repository checkout was used. Modified paths are:
- `src/app/(frontend)/admin/fulfillment/page.tsx`
- `src/app/(frontend)/api/commerce/pod/webhook/route.ts`
- `src/modules/admin/FulfillmentCommandCenter.tsx`
- `src/modules/commerce/fulfillment-mapping.ts`
- `src/modules/commerce/fulfillment-operator.ts`
- `src/modules/commerce/pod-operator.ts`
- `src/modules/commerce/pod-reconciliation.ts`
- `src/modules/commerce/pod-simulator.ts`
- `src/modules/commerce/pod-printify.ts`
- `src/modules/commerce/tasks.ts`
- `tests/unit/rc1-13c-fulfillment-lifecycle.test.ts`
- `tests/rc1-13c/journey.ts`
- `tests/rc1-13c/simulator.ts`
- `tests/rc1-13c/provenance.ts`
- `tests/rc1-13c/run.ps1`
- `next-env.d.ts` & `tsconfig.json` (Next.js dev output includes `.next-rc113c`)

## Implementation Details

1. **Webhook Processing & Deduplication (`/api/commerce/pod/webhook`)**:
   - Built provider webhook endpoint supporting HMAC-SHA256 signature verification across Printful, Printify, and local simulator formats.
   - Decrypts connection credentials dynamically and securely.
   - Enforces execution locking per order (`commerce.fulfillment.order:${orderId}`).
   - Monotonic reconciliation absorbs out-of-order deliveries and enforces terminal outcomes (cancelled/failed cannot be overwritten by earlier events).
   - Deduplicates identical webhooks (`replay: true`), preventing duplicate fulfillment actions.
   - Evaluates multi-package completion on every transition and updates order to `fulfilled` when all manual and POD packages are shipped.

2. **Tracking & Shipments Display (`FulfillmentCommandCenter.tsx` & `page.tsx`)**:
   - Persists sanitized carrier, tracking number, and tracking URL in `fulfillments` and job audit logs.
   - Displays tracking information with clickable external carrier links in the fulfillment command center for both POD fulfillments and manual packages.
   - Added bulk "Reconcile Outstanding Orders" operator control scoped by site.

3. **Exception Handling & Recovery (`pod-operator.ts` & `fulfillment-operator.ts`)**:
   - Reconciles outstanding orders (`reconcileOutstandingFulfillmentOrders`) by querying unconfirmed or in-progress jobs and resolving external order IDs via idempotency key.
   - Prevents duplicate provider orders: jobs in `exception` state cannot be resubmitted or cancelled before reconciliation.
   - Automated commerce worker recovery (`recoverStaleCommerceJobs`) recovers abandoned/stale jobs older than the staleness threshold without interfering with live operator workflows.
   - Supports owner manual override (`override-manual`) on failed POD jobs, cancelling the failed job and spawning a manual fallback package (`source: 'pod-provider-fallback'`).
   - Order fulfillment status becomes `cancelled` when all packages/jobs are cancelled, releasing inventory reservations automatically.

4. **Multi-Site & Webhook Security Negatives**:
   - Foreign-site operator denied from viewing or acting on Alpha fulfillment (HTTP 403).
   - Unsigned or forged webhook signature rejected with HTTP 401.
   - Webhook directed to disabled connection rejected with HTTP 403.

## Ordinary actions → storage → observed output

1. **Journey 1: Multi-package fulfillment + Duplicate webhook**:
   - Cart with 1 physical book and 1 POD shirt checked out and paid.
   - Order created with 1 POD job and 1 manual package.
   - POD job hold released and submitted to simulator (`externalOrderId: sim-13c-...`). Duplicate submit denied (HTTP 409).
   - Provider HMAC signed webhook delivered `package_shipped` with tracking `USPS` / `SIMULATOR13C999`. Job transitioned to `shipped`.
   - Identical duplicate webhook re-sent: acknowledged as `replay: true` without double application.
   - Manual package acknowledged, placed in production, and shipped by operator with tracking `MANUAL13C999`.
   - Cross-check: order transitioned to `fulfilled`, `activity-events` emitted `commerce.order.shipped`, inventory reservations consumed.

2. **Journey 2: Lost-response & Idempotency key recovery**:
   - Simulator injected socket destruction (`lost-response`).
   - Job submission threw network disconnect; persisted `state: 'exception'` and attempt count 1.
   - Guards: duplicate submit denied (HTTP 409), cancellation denied (HTTP 400).
   - Reconcile action polled simulator by idempotency key: recovered provider order identity (`state: 'submitted'`) without duplicate creation.

3. **Journey 3: Known rejection & Audited retry**:
   - Simulator injected HTTP 422 rejection. Job transitioned to `failed`.
   - Retry without reason or non-admin denied (HTTP 403).
   - Audited retry with explicit repair reason incremented attempt count to 2 and successfully submitted.

4. **Journey 4: Manual override & Full cancellation**:
   - Simulator rejected submission; job marked `failed`.
   - Owner executed `override-manual`: failed POD job cancelled, `manual-fulfillment-package` created (`source: 'pod-provider-fallback'`).
   - Operator cancelled manual package: order fulfillment status became `cancelled`, inventory reservations released.

5. **Restart Recovery**:
   - Disposable database container `rc113c-20261029` restarted.
   - Separate commerce worker restarted and verified heartbeat.
   - Persisted states survived restart: Job 1 retained `shipped` + tracking; Job 2 retained `submitted` + attempt 1; Job 3 retained `submitted` + attempt 2.
   - Bulk reconciliation ran safely without creating duplicate orders.
   - Double-submission blocked across restart (HTTP 409).
   - Browser UI rendered `admin/fulfillment` displaying `USPS` tracking details (verified via Playwright + saved screenshot [restart.png](restart.png)).

## Evidence Classes

| Evidence class | Executed disposition |
| --- | --- |
| Safe unconfigured/error behavior | Passed units and persisted unauthorized/disabled operator and webhook actions |
| Local real-adapter protocol harness | 12 protocol tests passed against loopback HTTP endpoints |
| Local operator/simulator lifecycle | 23 journey + 7 restart checks passed, actual PostgreSQL and browser screenshot |
| Approved remote Printful/Printify sandbox | Unexecuted; no remote credentials/approval or provider-artifact claim |
| Real production manufacture/shipment/delivery | Unexecuted; no real POD order or physical outcome claim |

## Commands and Explicit Exits

| Command | Exit / Result |
| --- | --- |
| `npx vitest run ...` (8 suites, 101 unit tests) | Exit 0, 101 passed |
| `powershell tests/rc1-13c/run.ps1 journey` (23 journey checks) | Exit 0, 23 passed |
| `docker restart rc113c-20261029` | Exit 0, container restarted |
| `powershell tests/rc1-13c/run.ps1 restart` (7 restart checks) | Exit 0, 7 passed, screenshot `restart.png` |
| `npm run typecheck` | Exit 0, 0 errors |
| `npx eslint --max-warnings 0 ...` | Exit 0, 0 warnings/errors |
| `npx prettier --check ...` | Exit 0, all files formatted |
| `git diff --check` | Exit 0, clean whitespace |
| `node --import tsx tests/rc1-13c/provenance.ts --check` | Exit 0, 1,536 files matched SHA-256 |
| `docker stop rc113c-20261029` | Exit 0, stopped; data retained |

