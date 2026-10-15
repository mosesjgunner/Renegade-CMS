# Stage 05 Sol image and security acceptance

**STAGE 05 BLOCKED — RC1 NOT READY.** Sol, 2026-10-15 (America/Chicago).

Acceptance stopped at the prerequisite provenance gate. Stage 01's mandatory gate table requires Stage 05 after Stage 04; the user's sequential Gemini/Sol instruction requires independent Stage 04 Sol closure first.

## Reviewed source and first failure

- Initial clean main HEAD: `0dc4d7bb1988a3e682f404437fd441e60c5edc18`.
- Gemini Stage 05 claimed executable source: `b7c2a20f10b128caa89e9347a54929b45964cc6e`.
- Gemini claimed image digest: `sha256:bcec6ae1833de40fd323f86d7532815a9ebb2e044eb3e9cdc32b8d4853460796`. **Not independently verified or accepted.**
- Available Stage 04 Sol repair source: `b5369e78faa228d7e0b4375d9a3147b164363b2c`, in `C:/Projects/RENEGADE CMS/sol-rc04-20261014`; that checkout was clean at inspection.
- [Stage 04 Sol record](../../stage-04/sol/WORK-IN-PROGRESS.md) explicitly says Stage 04 is not signed off. No Stage 04 Sol PASS handoff was located in the inspected RC1 evidence or history for that directory. The isolated Stage 04 checkout has no tracked `docs/rc/evidence/rc1/stage-04/sol/` directory.
- `git merge-base --is-ancestor b5369e78faa228d7e0b4375d9a3147b164363b2c b7c2a20f10b128caa89e9347a54929b45964cc6e` exits **1**. The Stage 04 repair source is not contained by ancestry in the claimed Stage 05 image source. Its diff against that source spans **55 source/test/build paths**, including authorization, enrollment, commerce, migrations and worker behavior. This is not an evidence-only divergence.
- `git merge-base --is-ancestor b7c2a20f10b128caa89e9347a54929b45964cc6e 0dc4d7bb1988a3e682f404437fd441e60c5edc18` exits **0**. However, this descendant changes `tests/unit/security-negative-matrix.test.ts` as well as adding Gemini evidence. Test results on the descendant cannot automatically bind to the image source.

The [machine-readable preflight](preflight.json) records exact commands, exit codes, outputs and tree identities. Failed ancestry returns 1 as expected; it is the failed prerequisite, not a passing acceptance gate.

## Claim review and execution boundary

Gemini's security matrix is a unit suite using mocked Payload/database methods and locally signed test JWTs. Static inspection of that suite does not establish authenticated HTTP/browser negatives against a production image, real WebAuthn challenge replay/origin checks, or persisted denied-state invariants. No such runtime claim is accepted here. No synthetic session was created or used by Sol.

Gemini's advisory counts, severity, upstream identifiers, importing paths and reachability dispositions remain **unverified**. They have not been refreshed from primary upstream sources in this run. No current advisory finding or mitigation is accepted. The claimed image digest, full runner graph, standalone tracing, web/worker behavior, CLI, non-root execution, DB/media persistence and leak surfaces likewise remain unaccepted.

| Gate                                                                     | Independent outcome                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| Stage 04 Sol closure and source containment                              | BLOCKED: explicit lack of sign-off; ancestry exit 1 |
| Stage 05 claimed source contained in initial main                        | Confirmed ancestry only; exit 0                     |
| Fresh dependency install, graph and primary-source advisory adjudication | Unexecuted                                          |
| Clean-candidate image rebuild and digest/revision correspondence         | Unexecuted                                          |
| Entire runner and standalone dependency inspection                       | Unexecuted                                          |
| Fresh disposable web/worker, CLI, permissions and persistence            | Unexecuted                                          |
| Authenticated runtime security negatives and protected-state checks      | Unexecuted                                          |
| Response/log/artifact/image leak checks                                  | Unexecuted                                          |

Independent tests executed: **0 passed / 0 failed / 0 skipped**; all downstream mandatory acceptance gates are **unexecuted**, not skipped or passed. No DB, media, environment file, container, Compose project or existing installation was modified. No tag, push, publication or deployment occurred. Read-only provenance commands ran in PowerShell in the two named checkouts; no application runtime environment was started.

## Required closure within the existing stage sequence

Complete the already assigned Stage 04 Sol acceptance and signed handoff on its actual repaired source. Reconcile that source into the intended candidate without discarding either branch's work, then freeze a clean candidate and rerun impacted prerequisites. Stage 05 must then independently execute its requested audit, image and runtime security gates against that reconciled source. This document creates no additional RC1 stage and does not sign Stage 04 on another stage's behalf.

Signed: **Sol — STAGE 05 BLOCKED**.
