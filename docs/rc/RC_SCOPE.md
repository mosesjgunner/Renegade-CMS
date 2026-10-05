# RC scope and claim policy

## RC-04 Pass 2 current bounded scope — 2026-10-04

Source `3a3260f120f500a48d51a5251a7fd3b900ba6e93` passes the ordinary boundaries in [RC-04 evidence](evidence/RC-04-PASS2.md). Newsletter signup/consent/confirmation/preferences/suppression/re-subscribe, local MIME delivery and recovery, canonical forums and moderation, member profile privacy, owned account export, direct/group messages and in-app notification controls are the supported subset. This is an existing-publication copy journey, not a fresh-install/upgrade/restore claim. Local SMTP is DEGRADED BUT SAFE; live delivery is PROVIDER-REQUIRED.

Forms/automation and telecom dispatch are **DEFERRED**: native collections deny product access and are hidden, forms return 410, and telecom tasks are not registered for shipping dispatch. External community email/SMS/digests and per-event relationship switches return 410 and are removed from active controls. Permanent deletion and private upload presigning return 410. Full contribution/message export and private attachment launch are explicitly deferred in settings/messages copy. Records and internal contracts are preserved. No encrypted-message or production provider-success claim is made.

These entries supersede historical audience/community prose only for this exact subset. The broader RC-01 owner/administrator/staff, tenant/module/provider and operational gates remain open.

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

## RC-03 Pass 2 scope boundary ? 2026-10-04

This pass preserves RC-02's narrow site-build claim and tests only the orchestration path described in [RC-03 evidence](evidence/RC-03.md). Exact current results live in `evidence/rc-03/checks.json`. Article revision publication, coordinated redirects and persisted Bluesky delivery/recovery are the supported acceptance subset. Bluesky proof uses a configured local provider harness through the real adapter; live remote commercial acceptance is not asserted.

Events support creation, future occurrence dates/time zones, native admin and public rendering. Event auto-publication scheduling is not advertised by this proof. Workflow/release future publication and DST behavior remain supported. Full interactive calendar, calendar feed, timelines and memberships are **DEFERRED**: native collections deny product access and are hidden, public helpers exclude them, `/calendar` explains deferral, `/api/calendar/export` returns 410, and the starter timeline component is removed. Records/schema are preserved. Composer preview dispatch is **DEFERRED** and returns 410; persisted approved Social Drafts and their release/outbox route are the supported path.

Federation is **DEGRADED BUT SAFE** only at the proved local signing/outbox/failure boundary. Interoperable remote federation remains **DEFERRED**; no successful remote acceptance has been proved. The broader RC-01 role/tenant/module/provider gates remain open.

## RC-04 final bounded scope — 2026-10-04

Source `fb8c9d7c3211f4c257ad569edb366d089074e492` receives the final RC-04 PASS for the audience, local-email, member identity, canonical community, moderation, direct/group messaging, in-app notification and cross-surface privacy boundaries recorded in [Pass 3 evidence](evidence/RC-04-PASS3.md). Production email and live SMS/RCS remain provider-required. Forms/automation, telecom dispatch, external community notifications/digests, per-event switches, permanent deletion, complete contribution/message export and private attachment launch remain deferred. The broader release, role/tenant, upgrade and restore gates remain open.
