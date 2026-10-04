# RC scope and claim policy

Source candidate: `e24fc53d9e370e28f01398c561b0f5adc4884756`. Reconciled 2026-10-03. Initial working tree was clean. This documentation freeze binds the source candidate; its artifact commit is discoverable with git log -- docs/rc. It does not establish runtime release readiness.

## A. Advertised RC capabilities

None approved as RC-ready by this reconciliation. Implemented publishing, identity, operations, layout, media, discovery and module workflows are candidate scope, but remain BLOCKER until current-SHA ordinary actions pass. Existing broad marketing claims are historical and superseded.

## B. Provider-dependent RC capabilities

Candidate scope: SMTP, social adapters, Twilio, payments, Printful, federation, AI and external storage. All remain BLOCKER in the ledger; no VERIFIED WITH CONFIGURED PROVIDER REQUIRED status is inferred from old emulators or credential presence. See PROVIDER_MATRIX.md.

## C. Degraded-safe local capabilities

Candidate modes: local filesystem media, development email capture, disabled optional connections, local/test payment/POD transports and Lean module gating. None receives DEGRADED BUT SAFE until negative/error/empty-state behavior is observed on the source candidate. Simulation must be explicit and must not invent successful external work.

## D. Deferred/experimental capabilities

Optional module registrations are excluded from default Lean by environment gating, but they remain candidate shipping scope when enabled and are therefore inventoried as BLOCKER, not silently deferred. Test-only reference adapters (extensions/reference-adapters.ts) and the extension example (extensions/example-extension.ts) are explicitly DEFERRED/EXPERIMENTAL; source search found no shipping caller. No visible broken feature is granted deferral. Experimental extension/reference/local simulation components are not RC-ready marketing promises. Deliberate deferral requires hiding every entry point, rejecting unsupported APIs/jobs, and updating this ledger; RC-00 performs no such product changes.

## E. Absent future scope

Unconditional real-customer upgrade proof, universal provider support, and production fulfillment/delivery guarantees are absent claims. An actual predecessor artifact and applicable observed provider outcomes are required. A provider label in ConnectionsCenter does not establish an adapter. Do not implement future scope to improve this matrix.

## Frozen RC policy

An advertised feature must be VERIFIED, VERIFIED WITH CONFIGURED PROVIDER REQUIRED, or DEGRADED BUT SAFE. A visible nonfunctional or unsafe feature is BLOCKER unless deliberately hidden/deferred. A hidden/deferred experimental feature may remain implemented but cannot be marketed as RC-ready. Production claims must match observed boundaries. Baseline checks, test source files and historical reports do not confer workflow verification. Registration keys and extra capability IDs in CAPABILITY_LEDGER.md are the status authority; route/provider/security tables inherit their conservative BLOCKER status.

Resource profile (Lean/Standard/Media/Scale) controls heavy-work guidance; RENEGADE_MODULES independently controls registrations. Standard does not mean all modules automatically. Counts report Lean floor, Standard floor and explicitly enabled all separately.

## RC-02 current narrow claim ? 2026-10-03

Source `b684ee11460637bf2177f349057f14d6e804bbbd` passed fresh production Standard/all complete site-build acceptance. The narrow claim ?usable to build and launch a serious self-hosted publishing site? is approved by [RC-02 evidence](evidence/RC-02.md). This updates the earlier no-approved-workflow baseline only for the exact core workflows in the RC-02 ledger appendix. Broader modules/providers/roles and aggregate RC-01 release remain blocked.
