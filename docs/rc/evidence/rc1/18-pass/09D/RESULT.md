# RC1 09D — tag mismatch fixed; overall NOT READY

2026-10-26 (America/Chicago). The previously reported tag-selector blocker is **fixed**. This is a bounded repair, not closure of all 09D acceptance. No later subpass executed.

## Current implementation and source

Base commit `0e37d694b856d6ff275c2e42d4799591717347ae` plus the four-file [tested source overlay](tag-repair-20261026/tested-tree.json), SHA-256 `277cdf2cceaa84ae2e3c409f0e37099efb894ff658106415969b2397050b3d26`.

`src/modules/audience/service.ts` now bulk-loads canonical `contact-taggings` for subscribers' persisted contact links. Both `contact.site` and `tag.site` must match the requested site. IDs are normalized from populated/unpopulated relationships, tag facts are deduplicated, and complete query results are used. Existing consent, status, email deduplication and suppression rules remain enforced. Storage failure propagates rather than becoming a successful empty audience. No schema, migration or generated Payload type change was needed.

`tests/unit/rc1-09d-segments.test.ts` adds real evaluator regression coverage for linked tags, deduplication, suppression, source-query tenant predicates and storage failure. `tests/rc1-09d/segment-current.ts` rechecks the original failed persisted fixture, exercises native operator creation/removal/restoration, campaign snapshot creation, tenant negatives and restart. `run-current.ps1 segment-restart` exposes the read-only restart check. Test outputs use an explicit evidence-directory override; the original failing receipt is not overwritten.

## Current proof and counts

Exact commands/exits: [commands.json](tag-repair-20261026/commands.json).

| Check | Exit | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Focused ESLint, three changed TypeScript files, max-warnings=0 | 0 | command | 0 | 0 |
| npx.cmd tsc --noEmit | 0 | command | 0 | 0 |
| Focused Vitest, 11 files | 0 | 117 | 0 | 0 |
| run-current.ps1 segment | 0 | 15 | 0 | 0 |
| Actual PostgreSQL restart, then segment-restart | 0 | 3 | 0 | 0 |
| **Current repair assertions** | | **135** | **0** | **0** |

[segment.log](tag-repair-20261026/segment.log), [segment-trace.json](tag-repair-20261026/segment-trace.json) and [segment-observed.json](tag-repair-20261026/segment-observed.json) prove actual operator/service actions → persisted relationships → API output:

- The exact historical fixture that returned zero now returns exactly one eligible subscriber, with its original subscriber ID.
- A fresh subscriber is confirmed through the canonical double-opt-in service; an authenticated native operator creates its contact, tag, tagging and segment. The campaign API selects exactly that subscriber.
- Anonymous evaluation and foreign-site segment substitution return 403. Deliberately inconsistent negative fixtures prove foreign-site tags and foreign-site contacts cannot contribute tag facts to the local audience.
- Operator deletion of the tagging immediately removes the recipient; operator restoration restores it. Ordinary save-and-schedule persists an immutable recipient snapshot containing exactly that subscriber and a matching fingerprint.
- Canonical unsubscribe suppression then makes the tagged recipient ineligible. No direct status mutation is used to manufacture a successful workflow.

[restart.log](tag-repair-20261026/restart.log) and [segment-restart-trace.json](tag-repair-20261026/segment-restart-trace.json) prove that a real PostgreSQL restart and a new application process retain the original fixture's positive selection, the new fixture's suppressed eligibility, and the exact approved snapshot hash/member. A saved snapshot is historical approval evidence; it does not authorize sending after suppression.

These are fixture-authenticated operator/API and canonical-service proofs, not genuine WebAuthn/browser authentication or external delivery proof. The new campaign is scheduled in the future; no worker/provider delivery is asserted. No external credentials, carrier messages, charges or posts were used.

## Preservation and remaining 09D scope

The initially clean checkout and retained, explicitly isolated `rc109d-review-20261025` database were reused without migration/reset. Its `rc1.scope=09d-review` label was inspected before starting it. PostgreSQL is stopped again with data retained; no web/worker/browser/sink process was started for this repair. No commit, push, tag, publication, deployment or operation on sibling environments.

Prior 09D results are preserved in [prior-RESULT.md](tag-repair-20261026/prior-RESULT.md), [prior-NEXT.md](tag-repair-20261026/prior-NEXT.md) and their original artifacts. Their 235/1 counts, browser/SMTP journey, migrations and old manifests retain their historical source boundaries. They are not added to the current 135 assertions or relabelled as fresh current-browser acceptance.

Overall 09D remains **NOT READY**: canonical form/sourceCampaign/engagement/role/locale/commerceFact/communityFact selector reconciliation and general event-driven automation acceptance remain unexecuted/unaccepted. The complete visitor/UI/local-sink journey was not rerun after this narrow repair. This turn fixes the concrete tag mismatch; it does not establish those remaining promises or aggregate RC1 readiness. See [NEXT.md](NEXT.md).
