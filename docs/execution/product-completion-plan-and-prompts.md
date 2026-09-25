# Renegade CMoS product completion plan and execution prompts

Date: 2026-09-24. Scope: finish the nine product priorities, then rerun SHOP-08 as a release gate. This is a work plan, not evidence that a gate passed.

## Starting point

The repository has canonical modules and substantial implementations for community, commerce, AI, analytics, presentation, and integrations. Do not rebuild those domains. The current checkout has uncommitted changes; preserve them. `shop-08-final-release-gate-2026-09-24.md` reports a pass, while `shop-08-prompt-2-release-proof-2026-09-24.md` says exact candidate identity, ordinary clean-clone install/build, a real prior-version upgrade, and full media-aware nine-surface restore are unproved. The latter is the narrower release claim until new evidence resolves the conflict. `FEATURE_READINESS.md` is useful inventory but contains older statuses; audit each claim against current executable evidence.

## Sequence and dependencies

| Phase | Work                                  | Depends on                              | Exit artifact                                                               |
| ----- | ------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| 0     | Candidate and capability baseline     | None                                    | SHA/configuration ledger, gap register, reproducible acceptance environment |
| 1     | Community completion                  | 0                                       | Complete member/moderator journeys and policy evidence                      |
| 2     | Commerce productization               | 0; coordinate entitlement checks with 1 | Complete customer/operator journeys and financial reconciliation evidence   |
| 3     | AI control plane and BYO providers    | 0                                       | Governed connections, budgets, permissions, proposals, usage/audit          |
| 4     | AI features across surfaces           | 3                                       | Finished authoring, discovery, media, and distribution assist workflows     |
| 5     | Analytics, attribution, experiments   | 1 and 2 for real outcomes               | Consent-safe event model, operator insights, live experiment journey        |
| 6     | Templates, starter sites, blocks      | 1, 2, 4 for integrated examples         | Two installable, polished starter experiences                               |
| 7     | Integrations and provider UX          | 2 and 3 provider contracts              | Connection health, webhook operations, conformance evidence                 |
| 8     | Federation/events/edge scope decision | 0                                       | Explicit 1.0 include/defer matrix; proof for included modules               |
| 9     | UX/install/admin sweep                | 1-8                                     | Clean operator journey without fixture shortcuts                            |
| 10    | SHOP-08 final gate                    | 0-9                                     | Immutable candidate proof, nine-surface demo/runbook and truthful ledger    |

Phases 1 and 2 can proceed in parallel in separate branches or worktrees. Phase 8 is a decision point: events already exist; federation has experimental evidence; do not make edge infrastructure a release dependency without an explicit 1.0 requirement. Reserve a stabilization interval after phase 9 for phase 10; do not keep adding features during the final candidate run.

## Shared rules for every prompt

Use these rules with each prompt below. Work in `Renegade-CMS`; read `AGENTS.md`, relevant domain docs, current routes/services/collections, tests, and migrations first. Preserve pre-existing work. Use existing CMS, member identity, media, workflow, release, consent, money, order, entitlement, notification, and provider contracts. Implement through normal UI and output boundaries. Add or change tests only to check meaningful behavior; do not weaken or skip failures. Keep all external mutations opt-in; use isolated databases and local/sandbox providers. Never report emulator evidence as live provider proof. Record exact commands, results, candidate identity, configuration without secrets, first failure, and remaining limits. Use only `VERIFIED`, `VERIFIED WITH CONFIGURED PROVIDER REQUIRED`, `DEGRADED BUT SAFE`, `PARTIAL`, `INCOMPLETE`, or `BROKEN` in release ledgers. A core authorization, money integrity, duplicate side effect, data loss, or restore failure blocks completion.

For each package, deliver code, migrations if needed, operator documentation, focused and relevant aggregate checks, browser/output acceptance, and a concise evidence file under `docs/execution/`. Do not stop at schemas, service contracts, or a passing unit test when the package asks for a usable workflow.

## Copy-ready prompts

### Prompt 0 — Candidate baseline and gap register

> Establish the Renegade CMoS product-completion baseline. Inspect the current working tree without discarding changes. Record HEAD and whether it identifies the exact candidate, module/profile settings, migrations, seed/import path, provider configuration classes, policy/template versions, and baseline commands/results. Reconcile the conflicting SHOP-08 reports and audit `FEATURE_READINESS.md` against current UI, service, and test evidence. Create a nine-surface capability ledger and a prioritized gap register with each first failing boundary, owner, reproduction, and required proof. Prepare a clean candidate clone and isolated database/media/search/worker/browser/emulator environment for future gates; do not treat a clone made with ignored install scripts as a normal install. Repair only bounded baseline defects. Deliver exact setup commands and an evidence file. Do not declare the release complete.

Exit: a reproducible environment, evidence-backed gap register, and an exact candidate identification method.

### Prompt 1 — Community completion

> Finish the existing Community domain as a usable member and moderator product. Inspect ADR-0009 and current member, profile, discussion, forum, messaging, notification, moderation, and policy code. Complete any missing UI and service wiring for registration/passkey login, privacy-controlled profiles, article comments, forum participation, direct and group messages, block/report/moderation, notification preferences/in-app/digest delivery, recovery, export, and deletion. Preserve canonical `members`, `profiles`, and shared notifications; do not create a second identity or forum. Test at least three members across sites and roles through browser/HTTP and persisted state, including object-ID attacks, blocked relationships, private attachments, search/notification leakage, realtime reconnect, worker restart, and backup/restore policy. Record the first unmet boundary and do not mark Community verified while it remains.

Exit: a member can complete the journey without fixture shortcuts, and moderators can inspect and resolve reports with an audit trail.

### Prompt 2 — Commerce productization

> Turn existing SHOP-00 through SHOP-07 contracts into complete customer and operator workflows. Inspect the canonical catalog, cart, checkout, payment intent, order, subscription, entitlement, donation, affiliate/referral, POD, and Commerce Operations code before editing. Finish customer browsing, variant selection, cart merge, server-priced checkout, hosted test payment status, orders/receipts, subscription change/cancel and invoices, donation choices/receipts, affiliate disclosure/tracking choices, and POD status. Finish Commerce Command Center views and authorized drilldowns for readiness, pending/unknown payments, refunds/disputes, dunning, entitlement state, fundraising, commissions, fulfillment/tracking, provider health, reconciliation age, failures, audit, and currency-separated metrics. Exercise duplicate/out-of-order webhooks, checkout replay, coupon/inventory races, unknown provider responses, worker restarts, product/price changes after purchase, and deletion retention. Keep financial snapshots immutable and totals authoritative on the server. Use emulator or sandbox boundaries by default; no real payout, charge, or POD order.

Exit: one guest purchase, one member subscription, one-time and recurring-test donations, one referral lifecycle, and one POD lifecycle pass through normal product surfaces with exactly-once effects and truthful provider labels.

### Prompt 3 — AI control plane and BYO provider layer

> Productize the existing proposal-only AI gateway and BYO provider adapters. Inspect `docs/architecture/ai-gateway-safety.md` and current AI contracts before implementing. Build an admin connection flow with capability discovery/validation, encrypted secret handling, test connection, disabled/degraded states, tenant and task permissions, context preview, model selection, cost/token budgets, usage and audit views, cancellation, and actionable errors. Support only providers with tested adapters; label OpenAI-compatible and local Ollama capabilities precisely, and do not infer compatibility from a URL alone. Preserve human review: AI returns proposals and cannot publish, send, spend, moderate, change permissions, or mutate provider connections. Test wrong-site access, secret redaction, prompt injection in imported content, budget exhaustion, timeout, cancellation, provider failure, and restart.

Exit: an operator can configure a supported provider and an authorized editor can request, inspect, and decline a proposal without changing content.

### Prompt 4 — AI tools across surfaces

> Build a small finished set of AI-assisted workflows on the governed gateway: writer revision assistance, SEO/title/description suggestions, media alt text or metadata suggestions, and social/distribution copy variants. For each, define allowed source context, permission, proposal schema, preview/diff, human apply action, provenance, and failure state. Use canonical editorial revisions, Discovery metadata, governed media, and Distribution drafts. Do not silently overwrite published work or send externally. Add browser acceptance for create → preview → apply/decline → revision/audit, plus wrong-site, private-source, and no-provider paths. Prefer four complete workflows over many half-wired buttons.

Exit: each tool produces a reviewable proposal and an explicit, attributable application through its owning product surface.

### Prompt 5 — Analytics, attribution, and experiments

> Turn existing telemetry and experiment contracts into a usable, consent-aware product. Inventory event sources, grain, identity linkage, retention, suppression, and reconciliation against canonical content/audience/community/commerce records. Build an operator dashboard with clear definitions, date/site filters, privacy-safe drilldowns, source freshness, and currency-separated financial views. Complete attribution for disclosed links, referrals, campaigns, and eligible order outcomes without claiming certainty where identity/consent is absent. Wire one public experiment to actual variant rendering, assignment, exposure, conversion, and human winner approval. Verify tracking-off and consent withdrawal, duplicate-event handling, bot/internal filtering where supported, restart, and source-to-dashboard totals. State uncertainty and missing data in the UI.

Exit: an operator can explain one campaign funnel and one experiment from inspectable source events without exposing suppressed visitors.

### Prompt 6 — Templates, starter sites, and polished blocks

> Create two complete starter experiences using the existing theme, template, pattern, global-region, media, and visual-builder systems: a publication/community site and a campaign/commerce site. Include accessible home, article, archive/search, signup, member, product/checkout, donation, and legal/disclosure placements where applicable. Use realistic local sample content and governed media without seeding around ordinary editing workflows. Make setup, customization, preview, publish, upgrade, and rollback usable in the admin UI. Check responsive layouts, keyboard use, screen-reader names, empty/loading/error states, performance, and public bundle isolation. Preserve canonical content and URLs when switching themes.

Exit: a new operator can install either starter, personalize it, publish it, and complete its core visitor journey without editing code.

### Prompt 7 — Integrations, webhooks, and provider UX

> Complete the operational UX for existing integrations. Provide authorized connection setup, capability/health and last-success displays, scopes and secret rotation, webhook subscription/history, failed delivery diagnosis, bounded retry/manual redelivery, provider reconciliation, and safe disconnect behavior. Use canonical provider and audit records; do not introduce a second notification or payment ledger. Prove HMAC signatures, replay rejection, tenant scope, backoff, response redaction, rate limits, and restart with local receivers and available sandboxes. Show unavailable or unconfigured features honestly; do not send, charge, post, or order externally by default.

Exit: an operator can see what is connected, what actually succeeded, what is unknown, and the next safe repair action.

### Prompt 8 — Federation, events, and edge 1.0 decision

> Decide whether federation, events, and edge modules belong in Renegade 1.0 using current product requirements and executable evidence. Produce an include/defer matrix with user value, owning contract, operational cost, security risk, and exact acceptance test. For included work, finish only the needed normal UI/output path and prove interoperability or runtime behavior, including auth, retries, privacy, restart, and restore. For deferred work, disable or label it clearly without breaking existing data. Events already have runtime schema/route evidence; verify the complete author-to-visitor workflow before marking them done. Do not turn experimental ActivityPub routes into a live federation claim without a remote-server test.

Exit: an explicit 1.0 scope decision and evidence for every included module.

### Prompt 9 — UX, install, and admin coherence

> Run a first-time operator and visitor sweep across all included 1.0 surfaces. Start from an ordinary clean clone and isolated install using lifecycle scripts, documented Lean/Standard profiles, migrations, admin setup/passkey login, provider selection, starter customization, publishing, audience, community, commerce, analytics, and backup. Repair broken navigation, confusing permissions, duplicated settings, weak empty/error states, inaccessible controls, and misleading provider claims in their owning modules. Check upgrade from a real previous release artifact if one exists; if none exists, state that customer-upgrade proof is unavailable and keep the release label partial. Record task completion time, points of confusion, accessibility results, and exact commands.

Exit: a new operator can run the documented journey without developer intervention or fixture-only shortcuts.

### Prompt 10 — SHOP-08 final nine-surface gate

> Execute SHOP-08 on a clean, immutable candidate after phases 0-9. Record exact candidate SHA, configuration/profile, migration and seed/import provenance, provider matrix, policy/template versions, and baseline results. Use isolated databases, workers, media, search, local mail/telecom/payment/POD emulators, browser sessions, and sandbox accounts only when explicitly configured. Execute the full Renegade Party journey through normal UI and output boundaries: install and authoring; governed media/discovery/workflow/release/distribution; audience consent and suppression; member/community/moderation; guest order and duplicate webhook; member subscription and entitlement lifecycle; one-time and recurring-test donation; affiliate/referral reversal; POD preflight/unknown/reconciliation/shipping; Commerce Command Center; cross-site/security attacks; concurrent workers/restarts; complete backup and isolated restore. Run format, lint, typecheck, unit, integration, browser, security, accessibility, production build, Lean/Standard startup, migrations, search/media/provider conformance, money/property, load/query, privacy/secret, and restore checks. Repair bounded defects in their owning domains and rerun affected plus aggregate gates. Preserve a complete operator demo/runbook, exact commands/results, first failing boundary, and a six-label nine-surface ledger. Never average away a blocker or upgrade emulator evidence to a live provider claim. If any core authorization, money, duplicate-side-effect, data-loss, or restore failure remains, report the release as blocked.

Exit: exact candidate and environment are reproducible; every included non-provider core boundary passes; provider-dependent claims match observed evidence; full site restore is functionally checked.

## Suggested execution cadence

Treat each prompt as its own reviewable change set. Run focused checks while implementing, then the relevant browser and integration journey before closing it. Update the gap register after each phase. At the end, freeze one candidate and run Prompt 10 without feature churn. If a gate fails, record the first failure, repair the owning domain, create a new candidate SHA, and repeat the affected proof plus the final aggregate gate.
