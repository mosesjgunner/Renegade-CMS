# RC1 15B — PASS (2026-11-01)

Scoped operator analytics and attribution PASS. Aggregate RC1 remains NOT READY. Only 15B executed; no commit, push, tag, external dispatch, live charge, publication or deployment of an existing environment.

Exact source: base `d83a1cc2539a06d024bec148fa212a7b69c3d40d` plus the complete 1568-file dirty runtime manifest `source-tree.json`, SHA-256 `63672dc95fd2fb44c858122b1a50284a8b0fe8a53a465307892de7ba736080a7`. Journey and PostgreSQL/web restart used identical source. Final handoff SHA-256 `61fd587f3687d00beaab620afaa9adac7410fa47e4c968706bbfbefdae7a06ed` restores only preexisting Next-generated type configuration, byte-for-byte. `containment.json` reconstructs both identities and the prior 15A handoff `ec1bc3eb5f0981024e376728c1c347ce4e42b43814a4df0c020b67ec52b95a01`. All prior source outside the 13 15B paths is unchanged; earlier receipts keep their own tested sources and are not relabelled as current.

Implementation:

- Shared canonical report service supplies dashboard and funnel with complete matching rows, site constraints, explicit-offset ISO date validation, UTC start-inclusive/end-exclusive windows, source availability and per-collection timestamps. Query errors propagate; disabled optional sources are marked unavailable.
- Acquisition counts observed consented UTM landings; content counts paths; audience counts created subscriber records/submissions; community counts created discussions/posts; commerce counts created and receipted paid orders. Empty data and identity/coverage uncertainty are visible in the admin UI. Zero subscribers, discussions and posts were actually observed in this fixture; no positive community/subscriber workflow is claimed.
- Financial gross comes from canonical paid/fulfilling/fulfilled receipted order amountMinor grouped by presentment currency, using bigint. Pending/refunded orders are excluded by the visible definition; snapshots are never added. Fees, provider payout, FX and net settlement remain unknown.
- The browser sends URL campaign labels to the existing consent gate. Only bounded UTM labels survive; arbitrary query strings and asserted identities do not. First/last observed same-subject campaign touches precede canonical conversions inside the selected window. Conversion rates use distinct converted consent subjects divided by distinct landing subjects, not event-count ratios or people. No email/member identity inference or external-dispatch verification claim.
- Authorized checkout status observes a persisted paid order receipt and records one canonical consent-aware payment outcome through the existing writer/subject lock. Replay deduplicates. Unconsented/GPC/withdrawn observations cannot manufacture attribution; canonical commerce remains independent of analytics consent. Admin copy removes fixed newsletter attribution, assumed fees/net, unsafe null formatting and unsupported read-depth thresholds. Native services/collections and commerce worker are reused; no schema/type migration needed.

Actual ordinary path and persisted facts:

`journey-trace.json`: 23 passed, 0 failed/skipped. Supported public consent/collector/form APIs persist two campaign landings, one site-scoped consent subject and one canonical form submission. Replaying the landing and form adds no duplicate. Operator product creation/review/approve/publication occurs only in this disposable installation. Guest cart → quote → local deterministic checkout → signed inbox event → actual commerce jobs.run → authorized paid-order status produces a canonical USD receipt for 2,359 minor units. Campaign totals reconcile exactly: 2 landings, 1 distinct subject, 2 canonical conversions, 100.0% distinct-subject conversion rate, USD 2,359. The independent funnel endpoint matches the dashboard.

A second anonymous supported checkout produces a canonical EUR receipt for 2,731 minor units. Dashboard financial output preserves USD 2,359 and EUR 2,731 separately. The unconsented EUR order has no analytics payment event or inferred campaign credit. `reconciliation.json` and `currency-reconciliation.json` retain observed output and canonical order references. Chromium renders definitions/campaigns, changes sites to empty beta and back, selects an empty custom date window and clears it to recover the campaign; `admin-dashboard.png` captures the product UI. A real Chromium campaign URL reaches the collector. Operator sessions/site grants and configuration are fixtures; this is not genuine passkey enrollment/login acceptance.

Negatives and restart:

Both reporting APIs reject anonymous and foreign-site administrators (403) and malformed dates (400). Actual PostgreSQL filtering includes the exact start timestamp and excludes the exact end. The repeated DST hour with -05:00/-06:00 offsets normalizes to distinct UTC instants. Empty beta contains no alpha events, campaigns or financial amounts. GPC suppresses a consented observation. Withdrawal purges linked analytics and campaign conversions while preserving canonical forms and both paid orders; old-cookie and unconsented retries remain excluded.

`restart-trace.json`: 5 passed, 0 failed/skipped after an actual owned PostgreSQL restart and a new web process. Both currency amounts survive, suppression remains effective, a withdrawn order-status retry cannot resurrect analytics, and foreign-site denial remains. The commerce worker was actually executed for both signed events; no interrupted worker or live-provider restart claim.

Commands and counts:

Exact commands/exits are in `commands.json`. Accepted focused Vitest: 5 files / 39 passed / 0 failed / 0 skipped (14 new 15B cases). Scoped ESLint, TypeScript, Prettier and git diff checks exit 0. Fresh guarded migrations: 129, exit 0. Journey: 23/0/0, exit 0. Restart: 5/0/0, exit 0. Total accepted behavioral checks: 67 passed / 0 failed / 0 skipped; mandatory scoped groups unexecuted: 0. Four earlier verifier runtime failures and one verifier type failure are preserved separately in commands/attempt logs; superseded exploratory successes are not counted or reused as current proof. No assertion or production guard was weakened.

Runtime: Node 24.19.0, installed Next 16.3.8 development/webpack, Payload 3.90.2, all modules; test auth/routes false. PostgreSQL 17.11 owned container `rc115b-20261101`, label `rc1.scope=15b`, image `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`, loopback 5476, DB `rc115b_release_acceptance`; web 39062, media `scratch/rc115b/media`, dist `.next-rc115b`. Email/telecom disabled. No production application image, genuine passkey, external click, remote provider, live payment or payout claim. Full repository quality/build/release gates remain outside this focused subpass.

Changed paths:

- `src/app/(frontend)/api/admin/telemetry/dashboard/route.ts`
- `src/app/(frontend)/api/admin/telemetry/funnel/route.ts`
- `src/app/(frontend)/api/analytics/collect/route.ts`
- `src/app/(frontend)/api/commerce/checkout/status/route.ts`
- `src/modules/admin/TelemetryCommandCenter.tsx`
- `src/modules/analytics/ConsentManager.tsx`
- `src/modules/analytics/definitions.ts`
- `src/modules/analytics/operator-report.ts`
- `tests/rc1-15b/journey.ts`
- `tests/rc1-15b/provenance.ts`
- `tests/rc1-15b/run.ps1`
- `tests/rc1-15b/tsconfig.json`
- `tests/unit/analytics-15b.test.ts`

Open scoped blockers: none. Owned web/browser stopped; owned PostgreSQL stopped/data retained. Handoff is NEXT.md. Next subpass not executed.
