# Project state

## Second Pass Prompt 0 reconciliation — 2026-08-25

**First Pass remains completed and preserved.** Prompt 0 was audit/reconciliation only. The source-of-truth inventory is [docs/FULL_STACK_COMPLETION.md](docs/FULL_STACK_COMPLETION.md); it records registered schemas, migrations, routes, jobs, providers, auth, tests, reuse boundaries, enterprise capability ownership, and the exact Second Pass order.

**Next Second Pass implementation prompt: Prompt 1 — Shared jobs/integration runtime and Coordinated Content Releases.** No newly identified blocker prevents starting it. Reuse `article-family-content`, `revision-records`, `scheduled-publish-jobs`, `campaigns`, and Payload Jobs; do not create a parallel editorial or scheduling family.

## Preserved First Pass evidence

- PostgreSQL/Payload modular-monolith foundation, centralized runtime configuration, structured logging/redaction, health routes, installation/recovery flow, and Payload Jobs were implemented.
- Canonical ownership is Site/Publication/Space-first with stable UUID identities. Registered core records include Members, Profiles, Spaces, Publications, Content, MediaAssets, sources, taxonomy, forums/discussions, CalendarEntries, Events and Timelines.
- Editorial implementation includes article-family content, immutable revision records, previews, review/approval lifecycle, scheduled publication and a focused database acceptance scenario.
- Page layouts, two portable rendering themes, builder APIs, magic-link Member identity/session records, staff passkey authentication, media publishing schema/task boundaries, social distribution schema/task boundaries, and associated focused tests are present.
- First Pass migrations are registered in `src/migrations/index.ts`: foundation; operations jobs; installation; canonical information architecture; Event/Timeline reconciliation; Site Settings/SEO reconciliation; editorial workflow; page layouts; passwordless identity; media publishing; and social distribution.

## Reconciliation findings

- `src/collections/Audience.ts` and `src/collections/Analytics.ts` are prospective source definitions only: neither is registered by `src/payload.config.ts` nor represented by a migration. `audience-email-delivery` is also not a registered Payload task.
- Coordinated Content Releases, Translation Operations, Optional Enterprise Administrator Identity, privacy-safe personalization/experimentation, and Unified Site Quality Center have no canonical persisted implementation. Digital Asset Governance must extend existing media records/usages/derivatives rather than create a parallel asset family.
- Web3/SIWX remains capability-gated contract vocabulary only. Messaging, commerce, crypto/crowdfunding/POD, executable import/export, provider webhooks and live provider connections remain incomplete.

## Verification debt and risks

- Historical evidence records focused integration acceptance for operations, canonical information architecture, editorial, page builder and media. This reconciliation did not rerun database tests because no live PostgreSQL availability was established.
- Historical handoff records a pre-existing production build failure during `/_global-error` prerendering (`useContext` on null). This remains production-hardening debt.
- There is no Git worktree in this directory, so clean status/history/remote evidence is unavailable.
- Background operations must continue to use idempotency keys, bounded retries, observable Payload jobs, permissions, lifecycle state and audit records. External-provider failure must not break public reading or ordinary editorial work.

## Second Pass Prompt 14 � First-party analytics, privacy-safe experimentation, and Quality Center

- Registered canonical analytics events/rollups/goals/snapshots and Command Center preferences, together with the Experiment/Experience family and Quality Policy/Rule/Scan/Issue/Exception/Waiver/Report family.
- Analytics remains first-party, consent-gated, deduplicated and bounded; rollups aggregate only bounded deduplicated windows. No fingerprinting, cross-site identity graph, or third-party tracking is introduced.
- Experiment variants are registered components only. Deterministic salted assignment returns a non-personalized control on opt-out or Lean collection disablement; exposure/conversion are separate idempotent events, analysis gives uncertainty/effect/sample warnings, and winner selection requires human approval.
- Quality Center reuses local source producers through a common issue shape, blocks release scheduling on publication-blocking findings, keeps remote link failure uncertain, and restricts waivers for security/privacy/blocking issues.
- Added metric, privacy-experiment, and quality-policy documentation plus focused Prompt 14 tests. PostgreSQL migration generation remains dependent on the configured service, as recorded in prior Second Pass handoffs.
