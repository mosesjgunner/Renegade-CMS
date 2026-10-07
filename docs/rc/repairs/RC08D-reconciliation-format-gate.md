# RC08D reconciliation: first executed failure

Date: 2026-10-07 (America/Chicago). Verdict: **FAIL / NOT READY**.

This prerequisite repair run stopped at `npm.cmd run format:check`, exit 1,
on 20 files. No prerequisite acceptance PASS or RC08D-07 closure is established.

## Tested source and retained evidence

- Tested SHA: `0159f6bf3c7944a285743709514e487343aaa4f7`.
- Git tree: `1d406723b8e2b8686ea0d9473c2e073fa40a6425`.
- Detached checkout: `C:\Projects\RENEGADE CMS\rc08d-reconcile-0159f6b`.
- `git status --porcelain=v1` was empty before and after execution.
- Runtime: Node `v24.19.0`, npm `11.17.0`.
- Logs and machine-readable receipt: [reconciliation evidence](../evidence/rc-08d/reconciliation-2026-10-07/checks.json).

`npm.cmd ci --include=dev` exited 0, installed 879 packages, audited 880,
and applied the RC08D-01 postinstall patch. It reported 16 affected package
entries (7 moderate, 9 high) and pending dependency script-policy warnings.
Installation success is not security or workflow acceptance.

`npm.cmd run format:check` exited 1. Its retained output enumerates all 20
affected paths. Lint, typecheck, unit, migrations, integration, build,
presentation isolation, browser, smoke, aggregate release, golden A-T,
security negatives and business-state restore were not executed in this run.
No passing or failing test-case counts were measured.

## Actual prerequisite source containment

Each `git merge-base --is-ancestor <commit> HEAD` exited 0 in the tested checkout.
This proves repair commit containment, not the source on which historical tests ran.

| Gate     | Contained repair commit                    | Evidence still required                                                                                                   |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| RC08D-01 | `3a1681f8c9d5e83646f0d7b660288edb21c63c38` | Current native settings save/reload and lock behavior in a real browser; internal Payload tests do not supply this proof. |
| RC08D-02 | `b4b7523301ccf2e7bfc1f3e6437223da505cb03c` | Ordinary invited staff credential enrollment and subsequent WebAuthn login, with canonical grants and persisted evidence. |
| RC08D-03 | `949c0727ea1c2721e9ed0188fe6d7cdb6b97b94c` | Source-bound execution of scoped role/object and cross-site denials.                                                      |
| RC08D-04 | `d3a37e1d150cdf273b63afa8dc14b3d14296987a` | Persisted fulfillment actions and real role/action matrix on repaired source.                                             |
| RC08D-05 | `7f0ef9f2defebf6443f407487a97f64248b5348f` | Newly built source-bound production image and inspected web/worker/migration dependency reachability.                     |
| RC08D-06 | No current acceptance receipt              | Full ordered execution on repaired dependency graph; this run stopped at formatting.                                      |

The older master receipt predates the five later repair commits. Its historical
PASS and test counts are retained but cannot establish current acceptance.
The newer RC08D-01 receipt describes internal-service integration operations,
including direct lock creation, rather than a rendered native-editor journey.
No SHA was retrospectively assigned to those historical outputs.

## Existing image inspection

`docker image ls --no-trunc renegade-cms` and `docker inspect` found
`renegade-cms:security-check` with image ID
`sha256:10cc1d482ad1ff75aa566b3539b8801e85bf21ddd723c4fe8361c692e5223a8e`.
Its OCI revision label is `d3a37e1d150cdf273b63afa8dc14b3d14296987a`,
which precedes RC08D-05. This observation does not establish that image's
actual build tree. Do not attach this digest to a PASS on `7f0ef9f`.
No new Docker build or container acceptance was executed after the first failure.
A future build must explicitly pass `--build-arg BUILD_SHA=<full tested SHA>`;
the proposed command without that argument cannot satisfy this Dockerfile's
build-provenance requirement.

## Narrow repair and restart

Run repository formatting outside the tested checkout, inspect the formatting
diff, and commit the repair. Freeze a new clean source and restart prerequisite
verification from clean installation and formatting. Execute the missing
workflow/image gates and full RC08D-06; record actual commands, outputs,
tested SHA/tree and image identity before freezing an RC08D-07 candidate.
Preserve the old detached candidates and receipts. No gate was weakened;
no database was reset; no tag, push, deployment or publication occurred.
