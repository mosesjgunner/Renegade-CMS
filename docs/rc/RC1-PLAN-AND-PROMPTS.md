> Execution authority (2026-10-11): the user has assigned the final seven sequential Gemini→Sol pairs. Use the assigned stage instruction with [Sol mandatory gates/owners](evidence/rc1/stage-01/sol/mandatory-gates.md). The self-contained stage prompts below remain the stage scopes; do not create another round. Only final Sol Stage 07 may create a local RC1 tag after actual PASS; older no-tag wording below is superseded solely for that action. No push, publish or deploy.

# RC1 plan and execution prompts

Assessment date: 2026-10-09. Inspected HEAD: `2aa4957ac044694714cb4dfc52fb76f7c4109262`; substantial tracked and untracked repairs are present. This is a planning review, not an acceptance run. No tests, image verification, or provider acceptance were executed for this assessment.

## What stands between this tree and RC1

The October 8 final report claims PASS for `100bd80fa8451ab04eb6e14c937697bb77970e4c`, not the current HEAD or its uncommitted changes. BLOCKERS and HANDOFF still lead with an October 7 failure. These records need a source-bound reconciliation, not a blanket deletion of historical failures or acceptance of newer PASS prose.

The inspected RC08D-02 receipt records lint/typecheck/unit results without ordinary invited-staff browser enrollment/login proof or an exact tested source. RC08D-04 records typecheck/build without persisted fulfillment or role/action proof. RC08D-06 JSON has no tested SHA. RC08D-07 records one browser skip, while FINAL_RC_REPORT says no skipped gates. These are concrete evidence gaps; they do not prove the implementation is broken or the historical executions did not occur.

`verify:release:checks` runs migrations, seed, formatting, lint, typecheck, unit, integration, build and smoke. It does not run browser or presentation-bundle acceptance, image inspection, business recovery or complete restore. The default browser configuration enables local test mode and can fall back to `.env` database and media paths. It must never be used against existing local data, and it cannot replace ordinary first-run/passkey acceptance.

The current changes span identity/recovery, scoped grants, audience truth, cart/checkout, merchant selection, webhooks, digital delivery, subscriptions and fulfillment. Treat those as unfinished acceptance work until verified. No honest time estimate is possible before the first two gates identify actual failures.

Run the prompts below in order, one stage at a time. A stage may require a repair and rerun. Final RC1 requires every mandatory stage to pass on the final candidate or have inspectable, valid source-containment evidence. Existing substantive evidence should be reused where valid. RC1 does not require every future feature or live provider, but mandatory shipping features cannot become deferred merely to obtain green status.

## How to use these prompts

Each stage below is a complete prompt. Copy its entire text block and paste it as one message. Run one stage at a time, in order; no separate instruction block is needed.

## Prompt 1 — Reconcile scope, existing work and evidence

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 01: Establish the actual RC1 baseline.

Inventory current HEAD, index, tracked modifications and untracked files. Review all existing repairs without overwriting them. Compare FINAL_RC_REPORT, BLOCKERS, HANDOFF, RC_SCOPE, capability/route/provider/security ledgers, RC08C repair cards and RC08D-01 through RC08D-07 receipts. Locate underlying execution artifacts; check SHA/tree binding, source containment and whether each receipt proves its claimed behavior. Reuse valid evidence; explicitly distinguish stale, unsupported and missing results. Resolve the 27 passed/1 skipped versus no-skips claim by identifying the skipped case and its requirement.

Produce a current RC1 scope and dependency-ordered acceptance matrix covering all advertised capabilities, module configurations, roles, providers and operational requirements. Classify each as valid retained proof, rerun required, repair required, or genuine external prerequisite. Resolve the canonical golden journey definition from repository and supplied attachments; do not invent an A–T mapping. Identify any authentic predecessor artifact needed for advertised upgrade claims.

Review and organize the existing uncommitted work into coherent candidate changes, excluding secrets and generated runtime artifacts. Run appropriate focused checks before committing reviewed candidate work; preserve unrelated edits. Record committed and still-uncommitted work explicitly. Do not declare RC1. Reconcile current summary documents while preserving historical receipts. Deliver exact scope, candidate source and a checklist for stages 02–07.
```

## Prompt 2 — Stabilize and freeze a reproducible candidate

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 02: Finish and validate the candidate changes identified by stage 01.

Review identity/owner recovery and staff invitation changes, scoped authorization, audience data projections, cart ownership, merchant selection, checkout/status/download controls, webhook retry, subscription plans and fulfillment wiring. Resolve implementation defects within the approved shipping scope. Verify collection changes have required additive fresh/upgrade migrations, generated types and import maps. Do not assume generated types prove database compatibility.

Commit coherent repairs and freeze a clean SHA in an isolated checkout. Verify tool versions and safe disposable database/media targets before invoking scripts. Execute npm.cmd ci --include=dev, format:check, lint, typecheck and the full unit suite in order. Then run fresh and supported-upgrade migrations, full integration, production build and presentation-bundle verification in the order required by their actual script dependencies. Record exact counts; rerun from a new clean candidate after repairs. Do not use the aggregate release command as a substitute for gates it omits.

Deliver a reproducible clean candidate and quality/schema receipts, with later browser/security/provider/recovery gates explicitly pending.
```

## Prompt 3 — Ordinary setup, identity, publishing and role boundaries

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 03: Prove ordinary product entry and core workflows on stage 02's candidate.

Use production boot and a fresh disposable database/media directory with local test authentication mode disabled. Complete actual first-run setup through Chromium with a real browser WebAuthn virtual authenticator. Invite administrator/staff through shipping UI/API, enroll their first passkeys, log out/in, and verify canonical member/site grants. Exercise expired/reused/foreign invitations, wrong origin/challenge, role revocation and owner recovery through supported interfaces. Never forge sessions or directly mark setup complete.

Prove native Site Settings save/reload and document lock acquisition/conflict/release. Run the accepted core site-build and publishing journey through media, drafts, preview, review, scheduling, worker publication, public rendering, discovery and redirects, including restart/refetch and draft isolation.

Execute owner/administrator/staff/member/anonymous permitted and denied actions across two sites. Cover native collections and custom views, object-ID substitution, reads and mutations, connections, AI, audience, catalog, commerce, fulfillment, moderation and private media. Exercise approved Lean/default, Standard and enabled-all combinations, distinguishing resource profiles from module registration. A visible control requires a real outcome or approved explicit unavailable state. Persist traces, screenshots, console/network/server evidence and state assertions. A navigation-only matrix is insufficient.
```

## Prompt 4 — Commerce, audience, community and provider boundaries

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 04: Complete ordinary shipping module workflows after stage 03 passes.

Execute stage 01's capability matrix through shipping browser/API/operator paths. Commerce must cover guest/member cart ownership and merge, server pricing and proposal integrity, merchant/site binding, available payment methods, checkout/status authorization, signed webhook settlement and replay, inventory concurrency, digital delivery authorization/revocation, refunds, subscriptions and entitlements, cancellation/dunning, donations/privacy and any advertised affiliate behavior. Verify actual persisted fulfillment mappings, tracking and exception actions through scoped roles. Do not describe integration-only commerce checks as a browser journey.

Audience/community must cover consent and suppression, newsletter confirmation/preferences, actual worker dispatch/retry, truthful audience metrics and supported automations/telecom, forums/moderation, messages, privacy and notifications. Verify cross-site and unauthorized failures plus empty/unconfigured/provider-error states.

Use actual adapters against isolated local harnesses or approved configured sandboxes. Keep local/test settlement, remote sandbox outcomes, real delivery and real fulfillment separately labeled. Do not send unsolicited messages or incur live charges. If required credentials/artifacts are absent, record the exact external prerequisite and leave dependent acceptance pending. Approved provider-required scope must retain safe unconfigured behavior; it does not authorize marking a mandatory broken workflow deferred. Preserve valid earlier evidence and rerun affected paths.
```

## Prompt 5 — Production artifact and security decision

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 05: Verify the production web/worker artifact and security boundary.

Refresh dependency graph and audit evidence for the candidate. Enumerate each unique advisory with installed path/version, importing code, runtime/build/test classification, exploit prerequisites, production reachability, patch options and explicit disposition. Verify current advisory facts from primary sources. Do not use audit fix --force, parent-package counts or an old image as proof of this candidate.

Build the production image from the clean candidate; record exact digest, full embedded BUILD_SHA, OCI revision and build context. Inspect the entire runner filesystem/dependency graph plus standalone tracing. Prove both web and worker boot with required runtime dependencies, non-root operation, media persistence and operational CLI availability.

Execute the required authenticated runtime security negatives from the ledger: tenant/object/role access, CSRF, WebAuthn origin/challenge/replay/expiry, logout/revocation/recovery, private assets, unsafe external URLs/provider requests and secret leakage in responses, logs and artifacts. Prove denied operations leave protected state unchanged. Map dispositions to the exact image and candidate. End with remaining blocking security findings or a bounded PASS; health alone is insufficient.
```

## Prompt 6 — Business recovery, complete restore and supported upgrade

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 06: Prove operations using representative state created through accepted workflows.

Populate the isolated candidate with published pages/articles/search, media, users/roles/settings, audience consent/delivery, community/messages, orders/refunds/subscriptions/donations/entitlements and pending scheduled/outbox/fulfillment state required by the RC1 scope.

Create pending and failed business work through real actions. Interrupt actual web/worker execution at relevant lease/dispatch/settlement boundaries, restart, and verify durable attempts, deduplication, failed-only retry and exactly-once business effects. Include restoration of pending work without duplicate publication, messages, charges, orders or entitlement grants.

Use supported operational backup and restore tools for a consistent database/media archive with checksums, maintenance controls and secret exclusions. Restore only into a separate empty disposable project. Verify schema/data/media plus ordinary owner/staff/member authentication and refetch every required business category. Explain legitimate housekeeping differences rather than ignoring mismatches.

Prove multi-instance project/network/volume/secret isolation and supported upgrade/rollback behavior using exact artifact provenance. Fixture migration proof must remain distinct from authentic customer upgrade proof. If the approved claim requires an unavailable predecessor, retain that blocker. Never perform destructive restore or upgrade against the user's existing installations. Deliver state manifests and recovery/restore/upgrade receipts.
```

## Prompt 7 — Immutable RC1 acceptance and handoff

```text
Work in C:\Projects\RENEGADE CMS\Renegade-CMS. Read AGENTS.md and docs/rc/RC1-PLAN-AND-PROMPTS.md, then the current scope, ledgers and relevant evidence. Complete only the stage below. Preserve existing local databases, media, secrets, user changes and historical evidence. Use isolated disposable databases/media/Compose projects for acceptance. Never print credentials or tokens.

Act autonomously within this stage. Repair narrowly; do not redesign, weaken assertions, disable document locking, fabricate provider success, edit business status rows to simulate success, or promote static/unit proof to browser acceptance. Keep sandbox/emulator/local and real-provider claims distinct. Do not tag, push, publish or deploy to existing installations.

For every result record exact tested SHA or full tested-tree manifest, commands, exit codes, passed/failed/skipped/unexecuted counts, runtime configuration without secrets, and inspectable logs/traces/persistence assertions. Save new evidence under docs/rc/evidence/rc1/<stage>/ and a concise handoff. Stop acceptance at the first dependency-ordered failure; preserve it, repair separately, freeze a new candidate and rerun affected gates. Missing evidence is not PASS. End with PASS or FAIL/NOT READY, exact scope, remaining blockers and next stage; do not automatically execute the next prompt.

Stage 07: Decide whether v0.1.0-rc.1 is ready; this is an acceptance gate.

Review stages 01–06 for individually inspectable PASS evidence and complete coverage of mandatory scope. Every receipt must bind to the actual tested SHA/tree, with proof of containment in the final candidate. Do not retrospectively assign current SHA to historical runs. If later repairs changed accepted behavior, rerun affected workflows and all required final aggregate checks.

Freeze a clean final SHA and use a fresh isolated checkout, clean dependencies and fresh disposable acceptance environment. Execute required quality, unit, integration, fresh/upgrade migration, build, bundle, ordinary browser/golden journey, smoke, security, image, business recovery and complete restore gates in dependency order. Inspect scripts rather than assuming verify:release includes them all. Audit default Playwright destructive targets before running it, and retain ordinary no-test-mode browser proof separately. No required skipped case counts as PASS; execute it in a supported environment or leave readiness blocked.

Produce mutually consistent FINAL_RC_REPORT, BLOCKERS, HANDOFF, scope and ledgers. Include final SHA, exact image digest/version, command artifacts, exact counts, provider-required/deferred boundaries, upgrade/rollback requirements and installation/operator instructions. Keep evidence-only commits distinct from the tested executable artifact and document containment.

If all mandatory gates pass, report RC1 READY and prepare the exact tag/release notes/distribution instructions for v0.1.0-rc.1. Otherwise report NOT READY with the first failure and unexecuted gates. Do not create a tag, push, publish or deploy; those require a separate explicit release instruction.
```
