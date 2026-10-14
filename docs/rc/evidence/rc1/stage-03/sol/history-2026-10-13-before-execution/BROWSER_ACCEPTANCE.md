# Stage 03 Sol browser acceptance

**STAGE 03 BLOCKED — RC1 NOT READY.** Sol, 2026-10-13. Independent prerequisite/artifact inspection only. The [October 12 receipt](history-2026-10-12/BROWSER_ACCEPTANCE.md) is preserved; its missing-Gemini-02 finding is superseded by the documents now present.

Inspected clean HEAD: `f15a9e369f26b03b08976f8a320ff0847286705a`, tree `37c5ee1b882d81a5eff975b9b8904cadf88eddc6`. Gemini names `be0f163e99e3ceb9ee3b93272ceb6508f1510b2a` for both Stage 02 and Stage 03. That commit exists, but the ancestor check exits 1. Tree comparison exits 0 and identifies only the two Gemini handoff documents. Executable source is identical; containment does not establish acceptance.

## First dependency failure

Gemini Stage 02 HANDOFF.md and VERIFICATION.md now exist and claim eleven commands passed. Independent [Sol Stage 02](../../stage-02/sol/HANDOFF.md) still explicitly records **STAGE 02 BLOCKED**, with eleven acceptance commands unexecuted. No replacement Sol Stage 02 PASS receipt was located in the current RC1 evidence inventory. The required Gemini N → Sol N → Gemini N+1 sequence and [mandatory gates](../../stage-01/sol/mandatory-gates.md) require independent Stage 02 closure before Stage 03 acceptance.

The Gemini Stage 02 directory contains summary claims, without adjacent command logs, full integration counts, tested-tree manifest or disposable-environment receipt. These claims cannot substitute for Sol closure. This is a workflow prerequisite, not an unavailable external provider. No optional provider is made mandatory. Acceptance stops before runtime setup; no in-scope capability is waived or marked deferred. Silently performing another assigned stage would bypass the required sequence.

## Updated artifact audit

Command arguments, exits, artifact hashes, CRC checks and runner counts are in [audit.json](reinspection-2026-10-13/audit.json). Inspection command: `python docs/rc/evidence/rc1/stage-03/sol/reinspection-2026-10-13/audit.py`; exit 0. Inspection success is not product acceptance.

- Retained browser report starts `2026-10-13T00:05:36.785Z` (October 12 in America/Chicago), with **7 expected / 0 unexpected / 0 skipped / 0 flaky**, duration 133,763.058 ms. All seven results are passed. These are retained Gemini results, not independent Sol reproduction.
- Eight inspected ZIP paths pass CRC checks: seven distinct test traces plus a duplicate site-build copy. Current site-build trace has 882 entries and SHA-256 `c7493840a432dd17171fac6ad40e08b69e591f62fcbf680f03113b90dcbf925b`. Adjacent source-attribution.json still names older candidate `b684ee11460637bf2177f349057f14d6e804bbbd` and hash `85977963e767b98012a65095cfdf867f2b5507b42c62691adf592f980b5f0d9a`. That attribution does not match the current trace. Do not retrospectively bind it to this run.
- `tests/rc02/staff-invitation.spec.ts:173` submits a nonexistent token, then a malformed credential with another invalid token. A 400 does not isolate expiration or WebAuthn origin/challenge validation. Actual expired/foreign/reused invitation and valid-flow origin/challenge/replay/expiry negatives remain unproven.
- The logout test clears cookies before checking the redirect; it does not demonstrate rejection of the prior cookie. The recovery test does attempt the prior stored owner session after CLI rotation and signs in through the browser; retain that bounded evidence.
- The lock test at line 276 asserts a successful lock-collection response and that two forms load. It does not assert lock record/holder, conflict refusal, denied-state preservation, heartbeat or release. Closing contexts is not an assertion of release. Its passed label does not establish the claimed complete lock journey.
- The new tenant-authorization integration test creates fixture actors/grants with privileged Local API writes, then supplies actor objects to Payload with `overrideAccess: false`. It includes useful policy and denied-state assertions, but does not authenticate those actors through ordinary HTTP sessions. Configuration cases call `loadConfig` and `parseEnabledModules`; they do not boot and exercise Lean/default, Standard/default, Standard/all, Lean/all or subset configurations.
- Browser configuration loads `.env.rc02`, uses `test-results/rc02` and writes into historical `docs/rc/evidence/rc-02`. Sol did not invoke it or load that environment. A resumed run needs new disposable DB/media, isolated output paths, explicit safety verification and production boot with test-auth/fallback off.

These are assertion/provenance gaps, not reproduced application failures. Repair and independent execution remain required after the prerequisite closes. Gemini counts are not added to Sol totals.

## Counts and boundaries

| Mandatory acceptance group                                                               | Sol result | Exit | Passed / failed / skipped | Unexecuted   |
| ---------------------------------------------------------------------------------------- | ---------- | ---- | ------------------------- | ------------ |
| Fresh setup, owner/admin/staff passkeys, grants, recovery and identity negatives         | UNEXECUTED | none | 0 / 0 / 0                 | Entire group |
| Settings, locks, publishing/media/presentation/discovery, worker and restart persistence | UNEXECUTED | none | 0 / 0 / 0                 | Entire group |
| Two-site five-actor native/custom read/mutation negatives and required configurations    | UNEXECUTED | none | 0 / 0 / 0                 | Entire group |

Sol runtime: **0 executed / 0 passed / 0 failed / 0 skipped**; **3 mandatory groups unexecuted**, total test-case count unknown. Zero executed skips does not establish zero omitted requirements.

Nonsecret environment: Windows PowerShell/Python/Git. No environment files loaded, dependencies installed, DB/media/Compose changes, server/browser/worker execution, delivery or provider calls. No persistence checks executed; no image digest applies. User data, secrets, media and executable source preserved. No tag, push, publish, deployment or next stage; existing tag refs were only listed.

Required prerequisite: independently close the already assigned Sol Stage 02 on the actual candidate with command receipts and containment. Then resume this same Stage 03 in new disposable resources, repair assertion/provenance gaps and reproduce every mandatory group. This BLOCKED receipt carries no browser sign-off.
