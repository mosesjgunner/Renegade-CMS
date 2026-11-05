# RC1 18A ? scope reconciliation and immutable candidate

**PASS 18A STATUS: NOT READY.** 2026-11-04 (America/Chicago). Only 18A executed. No tag, commit, push, release, external message, charge, publication or deployment.

## Source and changes

Entry checkout: clean main at `3b6911e9e4bc6bf442fe6aefc044e64aa315bc1e`. Final executable/config/test/asset identity: **SHA-256 `fb3d77840012d23505b15e64664399da7e657f2d5ffa6bd68a7e1a5a777467c0`**, 1790 byte-hashed paths in [inventory.json](inventory.json). This is the permitted dirty-tree manifest alternative, not a clean new commit. It includes package-lock, Docker/Compose, source, scripts, tests, configuration and tracked assets. 414 reconciliation inputs (canonical documents, original and ledger-selected repaired receipts, handoffs, command/state/trace files and manifests) are separately byte-hashed. No accepted image is bound to this candidate. Prior image identities remain historical references only.

Implementation: added `scripts/release-inventory.ts`, `release:inventory` in package.json, six focused safety tests and `tests/rc1-18a/operator.mjs`. The operator command constructs actual registration metadata from canonical services without starting Payload or connecting to PostgreSQL, hashes the candidate, inventories the 66 assignments, writes exclusive evidence, refetches/recomputes it and rejects drift, tampering and unproved readiness. It is an inventory/readiness-denial tool; it does not certify a release or mutate tags. Module-registry UI copy now acknowledges shipping calendars/ICS/timelines, public forms/contact-task actions and reviewable digests. General automation stays a mandatory unresolved scope item. No schema/type generation or migration change was needed.

Changed existing paths: package.json; src/modules/module-registry.ts; docs/rc/RC1-SCOPE.md; docs/rc/RC1-ACCEPTANCE-MATRIX.md; only new row 18A in docs/rc/RC1-70-SUBPASS-LEDGER.md. New paths: scripts/release-inventory.ts; tests/unit/release-inventory.test.ts; tests/rc1-18a/operator.mjs; this seven-file evidence directory. Original ledger rows and all previous evidence retain their bytes. No database/media/secret/provider resources were modified. Existing generated Next trees were retained.

## Source-bound matrix and contradictions

[MATRIX.md](MATRIX.md) and [inventory.json](inventory.json) enumerate all 66 preceding assignments; 17 optional modules with collection/global/task slugs and provider boundaries; 293 current page/API source files; 1,215 historical ownership entries (including duplicates); 924 baseline entries; 19 mandatory gate groups; and all A?T requirements. These are inventory counts, not passed workflows. Source-constructed registrations: floor 62 collections / 1 global / 15 tasks; all modules 202 / 2 / 33. Deployed four-profile acceptance remains unexecuted.

All three supplied attachment hashes were reverified, and the golden attachment's 20 step lines exactly match the canonical A?T copy (automated.json). Read AGENTS.md and installed Next route-handler guidance before editing. The canonical scope/matrix now lead with this source-bound reconciliation, preserving historical banners below.

First recorded workflow blocker: **09D**, whose tag repair does not close the outstanding CRM projections/general automation. 12A has a retained 106-assertion receipt but no cumulative row; 15C has commands/manifest/containment but no RESULT or NEXT. 14A still lacks a completed persisted configuration/provider/browser/restart journey. The newer 17C continuation supersedes its earlier host-capability failure: local image `sha256:81cb8ae7dd46d96894bfd1dc4f911a76e0055f839011e752f4491f278d7e3578` failed in-image npm dependency inspection on older source ebbfeeb8 (monaco-editor/yjs missing). Current package declarations do not validate that image. No current-image inspection was rerun here.

17D's populated native 311-table/42-file receipt is real historical evidence and supersedes the earlier synthetic-only attempt within its own boundary. Source inspection confirms SQL-provisioned passkey credentials and native data-plane execution around Compose. It cannot prove ordinary enrollment/browser/Compose restore of this candidate. Newer repaired receipts are selected by ledger links; original receipts are preserved. Exact byte drift is listed per manifest and may include newline/platform differences; no count of changed hashes is presented as a count of product defects. Textual receipt mentions are discovery links only, never accepted proof. Missing external credentials do not waive local adapter/error/security acceptance. Approved exclusions are individually listed with hidden-entry checks still unexecuted.

## Ordinary operator action ? persisted state ? observed output

`node tests/rc1-18a/operator.mjs`: exit **0**, **7 passed / 0 failed / 0 skipped**. The supported inventory command wrote real filesystem state to inventory.json. A separate Node process re-read it and recomputed the candidate and evidence inputs successfully. Duplicate output was denied (exit 1) with byte-identical retained evidence. Forged PASS/tag permission and stale source identity were denied (exit 1 each). Missing input was denied (exit 1). Readiness request returned **exit 2**, naming 09D and leaving tagging disallowed. [operator-trace.json](operator-trace.json) records every exact command, exit and persisted artifact hash.

This is a filesystem operator journey. It creates no actor/session/site and exposes no web route; application role/site/browser/passkey, PostgreSQL state, worker and provider acceptance were not executed in 18A. The local restart proof is a new operator process refetching persisted state, not application/DB/Compose restart acceptance.

## Automated proof

Exact commands, counts, failure messages and source-only type configuration: [automated.json](automated.json).

| Command | Exit | Final observed result |
| --- | --- | --- |
| npm.cmd test -- --reporter=json --outputFile=scratch/rc118a-unit-final.json | 1 | 282 files; **2072 passed / 5 failed / 0 skipped**, total 2077 |
| npx.cmd vitest run tests/unit/release-inventory.test.ts tests/unit/module-registry.test.ts tests/unit/network-experience.test.ts --reporter=json --outputFile=scratch/rc118a-focused-final.json | 0 | 3 files; **20 passed / 0 failed / 0 skipped** |
| npx.cmd eslint scripts/release-inventory.ts tests/unit/release-inventory.test.ts tests/rc1-18a/operator.mjs src/modules/module-registry.ts --max-warnings=0 | 0 | No warnings/errors |
| npx.cmd prettier --check scripts/release-inventory.ts tests/unit/release-inventory.test.ts tests/rc1-18a/operator.mjs src/modules/module-registry.ts package.json | 0 | All matched files formatted |
| npm.cmd run typecheck | 2 | **32 TS2344 errors** in retained generated validators; [typecheck.log](typecheck.log) |
| npx.cmd tsc --noEmit --project scratch/rc118a/tsconfig.json | 0 | Source-only check; explicitly excludes retained generated validators; does not clear root gate |
| git diff --check | 0 | No whitespace errors |

Focused assertions are included in the full-unit count; do not sum them as unique tests. Earlier diagnostic runs reproduced the same five full-unit failures and were not substituted for these final-tree counts. Five failures: flow-04 waiver expiry; payload-domains task inventory mismatch (33 actual versus 32 expected); 04D product-showcase expected fixture product; two SHOP-08 affiliate request outcomes (403 versus expected 200/409). Assertions and policy were preserved. These remain mandatory failures, not approved deferrals. First reproducible automated failure: FLOW-04, ?Waiver expiry must be a future instant.?

Root typecheck's first error: .next-rc111a/dev/types/validator.ts(25,44), conflicting LayoutRoutes from retained .next-rc110d-turbo. No generated files were removed to obtain a green root result.

## Remaining acceptance and stop boundary

19 gate groups lack complete final-candidate closure; full units and root types above are partially executed failing gates. All **20 ordinary golden-journey steps are unexecuted on this final candidate**. Fresh dependency install, full lint/format, migrations, integration/build/bundles, deployed profile/role/site/object matrix, actual browser/identity/business journeys, production image/Compose/security, real worker interruption/retry, complete independent restore and conditional remote outcomes remain unexecuted here. Existing historical scoped PASS receipts are preserved with exact boundaries and cannot close these automatically.

The source is identified by manifest, but requirements remain unproved; **release tagging is prohibited**. No next subpass was started. [NEXT.md](NEXT.md) lists the remaining repair/acceptance handoff without authorizing its execution.
