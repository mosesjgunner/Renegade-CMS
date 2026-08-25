# Renegade CMS: 15 Proof-Driven Build Milestones

## What these milestones are

These are fifteen **direct build milestones**, not a prediction that the product will require exactly fifteen agent turns. Each milestone contains proof gates. Codex inspects the repository, implements the next incomplete gate, runs the real verification suite, updates shared project state, and continues to another gate when it safely fits. A run must write code; it must not turn into another prompt-writing exercise.

Run them in order. Do not paste all fifteen at once.

The build strategy is:

`platform foundation â†’ publications and canonical content â†’ flagship publishing â†’ public presentation â†’ visual composition â†’ identity and safety â†’ extension contracts â†’ AI â†’ media â†’ social command center â†’ audience/email â†’ sovereign finance and commerce â†’ analytics â†’ portability and production launch`

The architectural default is a **modular monolith**, not premature microservices. Renegade Party is the first production implementation and native theme, but it must consume the same public contracts available to any other site.

## Constitutional product rules

1. The kernel is small and mandatory: stable identity/ownership, configuration, permissions, capability registry, module lifecycle, migrations, updates, audit, jobs, health, and portability. Every user-facing feature family is optional.
2. Articles, profiles, personal blogs, albums, portfolios, forums, messaging, newsletters, AI, social, forms, analytics, payments, crypto, shops, subscriptions, affiliates, and fulfillment appear only when policy plus installed capabilities permit them.
3. Install, enable, disable, reconnect, upgrade, replace, export, archive, and uninstall are explicit lifecycle operations. Disabling or disconnecting never silently deletes canonical data. Re-enabling restores it. Incompatible versions refuse safely before mutation.
4. Contracts and stored data are versioned. Prefer additive evolution, preserve unknown fields/blocks, require migrations for breaking changes, test old-core/new-module and new-core/old-module boundaries, and block unsafe downgrades. â€œCompatibleâ€ means proven by a declared range and fixtures, not assumed.
5. A permitted Member can operate a self-service Space assembled from capabilities: profile, blog/publication, albums/portfolio, forum/community, messaging, newsletter, store, donations/subscriptions, crypto, events, media, and provider connections. Site policy controls grants, quotas, moderation and risk; routine operation belongs to the Space owner.
6. Automation is exception-driven. Normal publishing, payments, fulfillment, webhooks, retries, token refresh, notifications, backups, retention and health run without daily owner intervention. Humans receive actionable exceptions, never hidden failure.
7. Renegade remains fully self-hostable and movable. Optional managed hosting uses isolated portable installations and cannot become a runtime dependency or data hostage.
8. Commerce has no baked-in processor, country, currency, or payment rail. PayPal is one adapter among many. Checkout discovers eligible methods from connected merchant accounts at runtime and shows only methods valid for the merchant, buyer, currency, amount, purchase type, and current provider rules.
9. Wallet connection, wallet authentication and crypto payment are three separate capabilities. Connecting exposes a public account; a valid purpose-bound signature proves control for login/linking; a separately created and server-verified PaymentIntent records payment. None implies either of the others, and none may request custody, seed phrases or token approvals merely to authenticate.

## Rules that apply to every milestone

Each prompt below repeats the critical execution contract, but these rules govern the entire sequence:

1. Inspect the repository and existing documentation before changing anything. Treat working code and recorded architectural decisions as evidence.
2. Read `AGENTS.md` and all relevant repository instructions.
3. Preserve unrelated user changes. Never rewrite working subsystems merely to match a preferred style.
4. Use the versions already installed unless there is a demonstrated incompatibility. Do not silently replace Next.js, Payload, PostgreSQL, React, Tailwind, or other settled choices.
5. Prefer stable contracts and a modular monolith. Do not introduce a network service, second database, event bus, or search cluster without a measured need and a documented revisit trigger.
6. Implement the next incomplete proof gate in the current run. Continue through additional gates when they safely fit. Codex may keep a short internal checklist, but it must not generate child prompts, require a separate pseudocode pass, or stop after planning.
7. Keep `docs/architecture/`, `docs/decisions/`, `docs/operations/`, and `PROJECT_STATE.md` synchronized with the implemented system. Do not document hypothetical behavior as complete.
8. All important mutations must have authorization, validation, auditability where appropriate, and failure behavior. All external operations must be idempotent where possible.
9. AI, social, email, commerce, and other external providers must fail independently. Their failure must not take down public reading or ordinary editorial work.
10. Use provider contracts and capability discovery. Never scatter vendor conditionals through product code.
11. Add tests at the correct level: unit tests for business rules, integration tests for persistence/contracts, and end-to-end tests for critical user journeys.
12. Run the repositoryâ€™s actual formatting, lint, type-check, test, migration, and build commands. Record the exact results and any pre-existing failures.
13. Do not claim a milestone is complete because files exist. Demonstrate the acceptance scenario.
14. Do not cross into the next milestone. Record the exact completed and next incomplete gate so interrupted work resumes without reconstruction.
15. Never expose secrets in source, logs, fixtures, browser payloads, diagnostic exports, or error messages.
16. A missing/disabled module must degrade safely: hide creation UI, retain existing records, render an honest unavailable/archive state where needed, and leave unrelated public reading operational.
17. Every schema-owning module declares compatibility, dependencies, permissions, capabilities, migrations, backup/export ownership, retention behavior, failure isolation and uninstall semantics.

## Direct execution model

Put this document in the repository as `docs/BUILD_PLAN.md`. Put the useful research reports in `docs/research/source/`. Then run one milestone at a time.

The shortest invocation is:

```text
Continue the Renegade CMS build. Read docs/BUILD_PLAN.md and PROJECT_STATE.md. Implement the next incomplete proof gate; do not merely plan or create more prompts. Read only research mapped to that gate. Run tests, update PROJECT_STATE.md, and continue to another gate if it safely fits. Do not repeat completed work.
```

Milestone 1 performs the one-time repository and research inventory. Milestones 2â€“15 use that index and read only relevant material. There is no separate pseudocode agent or planning pass. When a risky contract genuinely needs explanation, record a concise ADR and continue implementing in the same run.

If a run is interrupted by power loss, context, or tooling failure, do not restart blindly. Resume with: `Resume the current milestone after an unexpected interruption. Inspect git status, the working tree, PROJECT_STATE.md, migrations, and tests. Preserve valid work, repair partial/inconsistent work, and continue from the first incomplete proof gate. Do not repeat completed work.`

## Research corpus rules

Store or copy the chosen reports under `docs/research/source/` before Prompt 1. Prompt 1 creates a compact `docs/research/INDEX.md` containing filename, subject, freshness, duplicate/superseded status, relevant milestones, accepted findings, and unresolved conflicts. Hash or compare duplicates so later milestones do not waste tokens rereading the same material.

Research informs decisions; it does not automatically become a requirement. The authority order is:

`explicit current user requirement â†’ accepted ADR/contract â†’ working repository behavior â†’ current authoritative technical evidence â†’ research recommendation â†’ agent preference`

Every milestone reads only its relevant reports through the index. If a time-sensitive API, pricing, security, SEO, legal, or provider claim may have changed, verify it against current primary documentation before implementation and record the verification date. Preserve the original report; capture changed conclusions in an ADR rather than rewriting research history.

## Planning reconciliation and source of truth

This execution plan is synchronized with the master roadmap in `BUILD_PLAN.md.md` for Milestones 4â€“15. The bounded cards in `docs/tasks/m04-editorial-publishing/` and `docs/tasks/FUTURE_MILESTONE_CARDS.md` are navigation and handoff records only; they do not replace this plan, accepted ADRs, or repository evidence.

When records differ, retain the authority order already established for this project:

`explicit current user requirement â†’ accepted ADR/contract â†’ working repository behavior and completed proof evidence â†’ current authoritative technical evidence â†’ this roadmap/research recommendation â†’ agent preference`

Completed gates remain completed. A later roadmap addition may define a future gate or an explicit reconciliation, but it must not silently reopen, regenerate, or rewrite an accepted milestone. Omitted future scope is planned, not implemented.

### Current gate registry

| Position            | Gate            | Status                              | Bound                                                                                                                                              |
| ------------------- | --------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Last completed      | M04-B           | Complete by unit/type/lint evidence | Preserve Markdown fidelity/reporting contracts, additive article-family persistence planning, and earlier M01-M04-A evidence.                      |
| Next implementation | **M04-C**       | **Next**                            | Implement revisions, workflow, scheduling, citations, previews, permissions, and the editorial acceptance scenario; do not start later milestones. |
| Future              | M05 through M15 | Planned                             | Follow the ordered prompt scope and the bounded milestone cards only after the preceding acceptance gate is recorded.                              |

M04-B recorded boundary: Markdown import/export reports are versioned under `MARKDOWN_FIDELITY_BOUNDARY` with exact source checksums, warning codes, and source-slice preservation for unsupported constructs. The smallest article-family persistence plan is additive: keep the existing `content` collection as the spine and add only planned `article-family-content` plus `markdown-conversion-reports` persistence before later workflow/revision collections.

---

## Prompt 1 of 15: Repository audit, architecture freeze, and executable skeleton

```text
You are building Renegade CMS, a free, self-hosted, portable publishing and personal-brand platform. The settled core stack is Next.js, React, Tailwind, Payload CMS, PostgreSQL, TypeScript, and Docker. Renegade Party is the first production site and first native theme, but no core domain logic may be Renegade-specific.

Your job in this milestone is to establish the repository as a trustworthy executable foundation and freeze only the cross-system contracts that prevent expensive rework.

First inspect the repository, its git state, package manifests, Payload configuration, database setup, Docker files, tests, CI, existing reports, and documentation. Read AGENTS.md and repository-local instructions. Do not assume the repository is empty and do not overwrite working code.

Implement this milestone directly. Plan briefly from repository evidence, then modify code, test it, update PROJECT_STATE.md, and stop only at the acceptance gate. Do not create more prompts or stop after planning.

Required outcomes:

1. Write a concise project spine: target users, product promise, core publishing loop, ownership/portability promise, Renegade Party boundary, and first production vertical slice.
2. Inventory every supplied research report before designing. Create `docs/research/INDEX.md`, identify exact duplicates and likely superseded copies, record research cutoff/freshness, map each report to relevant milestones, and extract decisions versus recommendations versus unresolved questions. Keep this index compact; do not silently merge conflicting reports or generate a second documentation bureaucracy.
3. Produce a current-state repository map and gap analysis. Mark each major capability as implemented, partial, stubbed, or absent.
4. Establish module boundaries for platform/kernel, publications, content, profiles/spaces, relationships, albums/portfolios, conversations/messaging/encryption, discussions/forums, editorial, presentation, identity, providers/connections, retention/ephemeral content, AI, media, social, audience/email, payments/supporters, cart/orders, crypto payments, commerce/fulfillment, analytics, security, imports/exports, updates, managed-hosting readiness, and operations. Use a modular monolith with explicit TypeScript boundaries. Do not create empty abstraction theater.
5. Freeze initial shared contracts: stable IDs, tenant/site/brand/Space boundary even if v1 is single-site, timestamps, lifecycle states, authorship, audit metadata, soft deletion rules, provider connection identity, capability flags, background-job identity, public/private data separation, release version, schema version, module/theme compatibility, migration ownership, disable/archive/uninstall behavior, unknown-data preservation, and safe downgrade refusal.
6. Freeze the passwordless identity doctrine. One canonical internal Member owns profile, content, relationships, media, messages, and financial history. Passkeys, established OAuth/social accounts, signed Web3 wallets, and expiring email magic links are replaceable LinkedIdentity credentials; external providers never become the Member record. Traditional passwords, password hashes, password reset flows, and password login UI are not part of core. Separate owner/staff security from public-member authentication. A wallet connector is only a replaceable client transport; Renegade owns nonce issuance, signature verification, account linking, Member sessions, recovery, revocation and audit.
7. Freeze only the cross-system contracts for Member, LinkedIdentity, WalletConnectionProvider, CryptographicAccount, Profile/Space, SpaceCapabilityGrant, Relationship, Album/Portfolio, Conversation, ConversationParticipant, Message, CalendarEntry, Campaign, Cart, MerchantConnection, PaymentMethodCapability, PaymentIntent, Order, and ProviderAccount so later modules do not invent competing identity, ownership, scheduling, commerce, or permission models. `CalendarEntry` is a time-zone-aware, owner-scoped planning item that can reference, but does not duplicate, a publication, campaign, event, social post, newsletter, livestream, launch, task or future external calendar object; it carries visibility, status, participants/assignees hooks, recurrence/version policy, audit, conflict and job references. Represent chains/accounts with canonical namespaced identifiers compatible with CAIP-style namespaces while retaining chain, normalized address/public key, wallet type and proof provenance. `PaymentMethodCapability` must describe provider/rail identity, merchant and buyer geography, presentment/settlement currencies, amount bounds, one-time/recurring/refund/dispute support, synchronous/asynchronous flow, required redirect/QR/SDK/hosted UI, current availability and verification provenance. Do not build their complete product UI in this milestone.
8. Define the capability/module lifecycle and manifest: identity/version, compatible core/schema range, dependencies/conflicts, provided/required capabilities, configuration schema, permissions, health, failure mode, migration/rollback owner, backup/export owner, enable/disable/archive/uninstall behavior, and data-retention choice. Consumers query capabilities, never vendor names.
9. Freeze a shared RetentionPolicy contract usable by messages, attachments, posts, albums, forms, share links and other eligible objects: permanent, expire at, burn after first/all-recipient read, burn after view count, manual burn, archive/tombstone, legal/moderation hold, scheduled purge, cache/search/feed removal, backup-retention boundary, and cryptographic-erasure hook. Never promise deletion of recipient downloads, screenshots, federated copies, or third-party archives.
10. Freeze a versioned optional encrypted-message envelope: public encryption key/fingerprint, private recovery-key boundary, algorithm suite/version, ciphertext, nonce, sender/recipient wrapped content keys, signature/authentication metadata, rotation/revocation, encrypted attachment hook, and recovery/export behavior. Use an audited library later; never invent primitives or claim forward secrecy unless implemented and tested.
11. Record architecture decisions for monorepo versus single app, package boundaries, configuration strategy, testing strategy, error model, logging, API style, migration conventions, release manifests, update channels, compatibility checks, isolated managed-instance provisioning boundary, and recovery boundaries. Honor the existing repository unless evidence justifies change.
12. Make the development environment reproducible. Supply an accurate .env.example with descriptions but no secrets, Docker-based PostgreSQL for development, seed/demo data, and documented commands.
13. Establish baseline formatting, linting, type-checking, unit/integration test harnesses, and CI. Add one meaningful smoke test through Next.js, Payload, and PostgreSQL rather than only testing a utility.
14. Create PROJECT_STATE.md as the canonical handoff. It must record what works, commands, migrations, architecture decisions, known risks, deferred work, completed proof gates, and the exact next incomplete gate.

Acceptance gate:

- A new developer can follow the documented setup, start the required services, migrate/seed the database, open the public app and Payload admin, and run the full verification suite.
- The repository contains an evidence-based module map and no core code is coupled to Renegade Party branding.
- Passwordless identity, portable Member/Space ownership, optional capability lifecycle, retention/burn behavior, encrypted-message envelopes, commerce ownership, release versions, schema ownership, and compatibility rules are explicit contracts rather than later assumptions.
- Every supplied report has an authoritative/duplicate/freshness status and milestone mapping; explicit requirements have traceability rather than being buried in prose.
- The smoke test proves the real stack, not mocks alone.

Non-goals: do not build the full Member/profile/messaging product, CMS data model, visual builder, social integrations, AI features, commerce, updater UI, or a polished theme in this milestone.

At completion, update PROJECT_STATE.md, list changed files, report commands and results, identify unresolved blockers, and stop. Do not start milestone 2.
```

---

## Prompt 2 of 15: Installation, passwordless owner bootstrap, updates, jobs, backup, and operational safety

```text
Continue Renegade CMS from the existing repository. Read AGENTS.md, PROJECT_STATE.md, architecture decisions, and milestone 1 verification evidence before changing code. Verify the current baseline first.

This milestone builds the self-hosted platform shell: first-run installation, passwordless owner bootstrap, validated configuration, persistent jobs, deployment, versioned updates, backups, health, and safe operational behavior. Implement the next proof gate directly, verify it, update PROJECT_STATE.md, and continue when safe.

Required outcomes:

1. Implement a browser-based first-run setup flow available only when installation is incomplete. `OWNER_EMAIL` may identify the intended owner but is never an authentication factor. Use a short-lived single-use bootstrap token delivered through a verified channel or printed to the operator console, enroll a passkey, issue recovery codes, strongly encourage a second passkey/recovery method, and permanently disable bootstrap after completion. Do not create a password, password hash, reset route, or reusable setup secret.
2. Add typed, centralized configuration validation for database, public URL, proxy behavior, storage, email placeholders, secrets, and production safety. Fail early with actionable messages while keeping secrets out of output.
3. Make reverse-proxy and HTTPS behavior explicit, including trusted proxy configuration, secure cookies, canonical public URL, forwarded headers, origin exposure warnings, and Cloudflare-compatible documentation. Do not hard-code Cloudflare.
4. Implement the durable background-job foundation using the simplest PostgreSQL-compatible approach justified by the installed Payload/version stack. Jobs need stable IDs, idempotency keys where relevant, scheduled execution, retry with bounded backoff, dead/failed state, reboot recovery, structured logs, cancellation where safe, and admin visibility.
5. Prove the job system with one harmless real scheduled task and one forced failure/retry scenario.
6. Add health/readiness diagnostics for app, database, job worker, storage, disk where available, build/version, and migration status. Public health output must reveal minimal information; authenticated diagnostics may be richer.
7. Implement documented PostgreSQL and media/config backup procedures, retention configuration, encryption guidance, an operator-triggered backup, and a restore drill in a disposable environment. Do not advertise restore support without proving it.
8. Implement the updater as an operator-controlled subsystem outside the normal public web process. It must consume a signed/versioned release manifest, identify current/target core and schema versions, check system requirements plus theme/module/provider compatibility, detect modified core files where practical, create and verify a pre-update backup, build/pull staged Docker artifacts, run ordered migrations, execute readiness/health checks, switch only after proof, retain the prior image/release, and produce an actionable report. The public application must never receive unrestricted Docker/host privileges.
9. Establish stable, preview, and development release channels plus semantic versioning, migration/update/rollback conventions, version metadata, and safe startup behavior for pending or incompatible migrations. Distinguish reversible code rollback from data restore after an irreversible migration. Every later schema-owning module must ship forward migration and upgrade tests.
10. Prove an update path from a minimal previous fixture release containing representative configuration/data. Test success, an intentionally failed health check before cutover, and documented restore for an irreversible boundary. Do not claim rollback or one-click update behavior that has not been exercised.
11. Produce production Docker artifacts and deployment documentation for a normal VPS. Include app/worker/updater privilege boundaries, persistent volumes, proxy example, scheduled backups, resource assumptions, recovery, and both CLI-guided and future admin-guided update paths.
12. Add a minimal System area in admin that reports health, failed jobs, backup freshness, installed/core/schema versions, release channel, available update metadata, compatibility blockers, and configuration warnings without becoming a full dashboard. The UI may orchestrate requests but may not hold host-level privileges.
13. Make deployments ready for optional managed hosting without creating a SaaS dependency: reproducible per-installation provisioning, isolated app/database/media/secrets/backups, instance identity, customer-owned domain, least-privilege remote health/update interface, redacted support bundle, full transfer/export procedure, and clean detachment from any future fleet manager. Do not build a multitenant control plane in core.

Acceptance gate:

- From a clean environment, an operator can configure, install, restart, and reopen the system without re-exposing setup.
- A scheduled job survives restart; a deliberately failed job retries and is visible.
- A backup is created and restored into a disposable database with verification.
- Production configuration rejects unsafe or missing critical values.
- The initial owner is created without a password, bootstrap cannot be replayed, and loss of one external provider does not define the owner account.
- A fixture installation upgrades through backup, compatibility check, migration, health verification, and cutover; a forced failure preserves or restores the last known-good release according to the documented boundary.
- Two fixture installations can be provisioned with no shared database, secrets, media or domain state, and either can be transferred or operated without a Renegade-managed control plane.

Non-goals: no complete content model, provider marketplace, social scheduler, newsletters, or polished monitoring product yet.

Run all repository verification commands, update operational docs and PROJECT_STATE.md with exact evidence, and stop at the gate.
```

---

## Prompt 3 of 15: Publications, profiles/spaces, albums, taxonomy, media, sources, and the content spine

```text
Continue from the verified Renegade CMS foundation. Read AGENTS.md, PROJECT_STATE.md, existing schemas, migrations, and architecture decisions. Implement this milestone directly and stop at its acceptance gate.

This milestone defines the durable information architecture that every later feature will reuse. The CMS must remain conceptually simple as the site becomes complex.

Implement a canonical model centered on Site, Publication, Brand, Member-owned Profile/Space, Content, Album/Portfolio, Discussion, Placement/Taxonomy, CalendarEntry/Event, Media Asset, Source, and typed Relationships. Preserve Payloadâ€™s strengths; do not fight the framework or create a generic entity system so abstract that editors cannot understand it.

Required outcomes:

1. Implement Publication as the first-class ownership and presentation boundary inside a Site. A Publication can represent the main site, a magazine section, a member-owned blog, a research journal, a podcast network, or a campaign publication. Include owner, memberships/roles hook, slug and canonical base path, status/visibility, brand/profile reference, theme preset, moderation policy, feature/capability policy, quotas hook, navigation, feeds, SEO defaults, and suspension/archive behavior. Default to `/blogs/{slug}` or another documented path for member publications; leave subdomains/custom domains as later capabilities. This is multi-publication inside one installation, not a false claim of fully isolated SaaS tenancy.
2. Implement the canonical Brand Profile with organization and personal identity separated: names, logos, favicon, colors, typography references, tagline, mission, descriptions, bios, boilerplate, contact/site/social defaults, primary author, audience, voice, vocabulary, avoided phrases, graphic/image style, SEO/social/newsletter defaults, disclosures, and structured-data defaults. Allow controlled Publication overrides without duplicating the entire site brand.
3. Implement the canonical public Profile/Space separately from authentication secrets. A Space belongs to one Member, may be disabled without deleting the Member, and may enable any permitted combination of profile, personal blog/publication, albums, portfolio, forum/community, messaging, newsletter, store, donations/subscriptions, crypto, events, media and provider connections. Include handle/canonical path, display identity, avatar/cover, bio, profile visibility, field-level audience, layout/theme reference, capability grants, quotas, provider ownership, moderation state, export ownership, suspension and transfer behavior. Capability removal must hide creation/actions while preserving data.
4. Implement people/author profiles and authorship relationships, including multiple authors and display order. A Member may be an author, but public authors/guests must not require login accounts.
5. Implement a clear content hierarchy using sections, recursively nested categories, topics, tags, series, and explicit navigation/curation relationships. Define site-global versus publication-local taxonomy, slug uniqueness, canonical paths, moves/renames, redirect implications, cycle prevention, ordering, and breadcrumbs.
6. Create the shared content base: stable identity, type, title, slug, summary/excerpt, status, authors, dates, owning site/publication/Space, taxonomy, hero media, relationships, SEO/social overrides, comments policy, audit metadata, and revision compatibility. Specialized content types and member posts must extend clear shared fields rather than duplicate them.
7. Implement Album and Portfolio ownership contracts over the shared media spine. Support ordered media, album/project cover, title/description, public/unlisted/members/friends/private visibility, captions/alt text/credits/license, original/download policy, EXIF privacy/display policy, comments policy, stable paths, quotas hook, moderation state, and export. Do not duplicate media bytes per album.
8. Implement typed Relationship records needed later for follow, mutual friend/buddy, block, mute, publication membership, content association, and curation. Define directionality, uniqueness, lifecycle, visibility, and block precedence without building feed-ranking theater.
9. Implement the shared Discussion model. A Discussion may attach to an article/page/media/album object or act as a standalone forum thread. Model forum sections, recursively nestable forums/subforums, standalone Thread content, Post/reply contributions, stable permalinks, reply/quote relationships, ordering, pagination anchors, attachment references, status, visibility, solution/helpful markers, moderation state, and canonical relationship to any promoted/derived editorial content. Do not create separate storage engines for article comments, forum replies, album comments, and member-blog discussion.
10. Implement a source/citation repository independent of article prose: title, publisher, authors, URL, dates, type, excerpt/quote metadata, archive metadata placeholders, credibility/editorial notes, reuse, and passage attachment contract. Keep editorial notes private. Allow a thread/post to cite registered sources without pretending every user link is a vetted citation.
11. Implement the shared CalendarEntry/Event data lifecycle from the kernel contract: all-day or timed ranges, IANA timezone, status, visibility/audience, owner/Publication/Space scope, calendar placement, recurrence boundary, RSVP/registration hook, conflict metadata, stable public URL where published, structured-data hook and references to scheduled content/campaigns/livestreams/products. It must work privately as an operating calendar and publicly as an event without separate scheduling tables. Do not implement external calendar sync yet.
12. Implement the media asset spine for images, audio, video, PDFs/documents, covers, thumbnails, and graphics. Include owner, metadata, alt text, caption, credits, rights/license, dimensions/duration where applicable, tags/collections, storage-provider-ready location, variants/derivatives, usage references, replace-globally semantics, quotas hook, and original export. Use local storage first behind a real contract.
13. Add permission-aware admin views and editor-friendly field language. Hide developer concepts where normal publishing language is available.
14. Seed a small, neutral demo brand with realistic authors, a Member-owned Space/blog, hierarchy, sources, a portfolio/album, media placeholders, a private operational-calendar entry, a public event, a forum structure, one article-attached discussion, and one standalone thread. Do not seed Renegade Party assumptions into core migrations.
15. Add integration and upgrade tests for publication/Space ownership and isolation, capability enable/disable/re-enable without data loss, album visibility, relationship uniqueness/block precedence, discussion attachment/standalone invariants, calendar timezone/ownership/privacy/reference invariants, hierarchy cycles, slug/path rules, stable post permalinks, media usage references, private source notes, authorship order, deletion safeguards, and migration behavior.
16. Implement the RetentionPolicy persistence and query contract from Milestone 1 across eligible shared content/media/discussion/calendar records. Expired or burned objects must leave public routes, caches, search, feeds, sitemaps and relationship queries consistently; holds override destruction; tombstones preserve only the minimum permitted identity/audit evidence.

Acceptance gate:

- An editor can configure a brand, create the main publication plus a member-style sub-publication, create an author, build Section â†’ Category â†’ Subcategory organization, add a reusable source and media asset, and create minimal content scoped correctly to each publication.
- Moving or renaming taxonomy produces a defined, tested canonical-path/redirect outcome.
- The model can support article, page, book, podcast, video, product, public event, shared operating-calendar and crowdfunding extensions without placing all specialized fields on one table/collection.
- One Discussion can render as article comments while another renders as a standalone forum thread, using the same contribution, identity and moderation contracts.
- A Member-owned Space can expose a personal blog and portfolio album without gaining staff access or duplicating media, and its privacy rules hold across direct URLs and queries.
- Enabling a forum or blog capability makes its creation path available to an authorized Space owner; disabling it preserves records and safely removes actions. An expiring fixture disappears from every discovery surface at the defined time.

Non-goals: do not implement the flagship editor, theme rendering, visual builder, social, AI, or commerce UI.

Update schema documentation and PROJECT_STATE.md, run migrations and the full suite, then stop.
```

---

## Prompt 4 of 15: Flagship articles, citations, revisions, and editorial workflow

```text
Continue from the canonical content spine. Read AGENTS.md, PROJECT_STATE.md, current schemas, and verification evidence. Implement this milestone directly and stop at its acceptance gate.

This milestone proves Renegade CMSâ€™s first signature promise: excellent article, op-ed, essay, research-brief, press-release, and quick-post publishing with serious sourcing and human-controlled workflow.

Required outcomes:

1. Choose and implement a high-quality rich-text architecture compatible with the installed Payload version. Support structured headings, lists, tables, links, images/galleries, audio/video/embeds, pull quotes, blockquotes, callouts, code, footnotes/endnotes, citation marks, and registered custom blocks. Store structured content, not rendered HTML as the source of truth.
2. Provide Markdown import and export with a documented fidelity boundary. Preserve unsupported constructs safely and report conversion warnings rather than silently losing content.
3. Implement article-family schemas with title, subtitle/deck, excerpt, hero, multiple authors, taxonomy, series, sources, citation attachments, bibliography, featured/pinned state, related content, correction notices, change notes, reading time, table of contents, comments policy, SEO/social overrides, and structured-data inputs.
4. Implement drafts, autosave, preview, immutable publication/revision history, revision comparison, restoration as a new revision, and an auditable workflow: draft â†’ review â†’ approved â†’ scheduled â†’ published â†’ updated â†’ archived/rejected. Enforce role transitions and separation where configured.
5. Implement scheduled publishing and embargo behavior through the durable job system. Make timezone behavior explicit. Publishing must be idempotent and survive restarts.
6. Implement publish/unpublish/update semantics, correction notices, canonical first-published date, updated date, and public change history policy.
7. Build source selection and citation insertion UX. Generate numbered references/footnotes deterministically, reuse sources, and keep passage anchors stable across ordinary editing where practical. Define behavior when cited text is deleted or moved.
8. Add preview modes for desktop/mobile and a true public-route preview protected from unauthorized access and accidental indexing.
9. Add article-level permissions, audit events, and tests for unauthorized transitions, schedule races, revision restore, citation ordering, Markdown round trip, autosave conflict, and embargo leakage.
10. Define an auditable promotion workflow from eligible forum thread/post material to article, FAQ, research brief, timeline or community roundup. The derived editorial object must credit/link contributors according to policy, preserve the original discussion as provenance, copy nothing privately without authorization, and never let AI publish the transformation automatically.

Acceptance gate:

- An author creates a sourced op-ed, an editor requests changes and approves it, it is scheduled, the worker publishes it exactly once, and the public preview/published representation contains correct citations, TOC, reading time, authors, taxonomy, and correction/change metadata.
- A revision diff is inspectable and an old revision can be restored without erasing history.
- A selected public forum contribution can be promoted into an editorial draft while the original thread remains intact and linked.

Non-goals: do not build the final public theme system, full visual page builder, AI writing, comments, social distribution, or analytics.

Run the full suite and a documented end-to-end editorial scenario. Update PROJECT_STATE.md and stop.
```

---

## Prompt 5 of 15: Public rendering, native themes, SEO, feeds, navigation, and discovery

```text
Continue from the verified editorial workflow. Read AGENTS.md, PROJECT_STATE.md, architecture decisions, and current public routes. Implement this milestone directly and stop at its acceptance gate.

This milestone turns approved content into a fast, accessible, discoverable public publication while keeping content independent from presentation.

Required outcomes:

1. Define and implement a versioned theme contract: metadata, compatibility, design tokens, typography, colors, spacing/density, header/footer variants, layout slots, content templates, component registry, defaults, migrations, preview, and child/custom extension points. Themes may present content but may not own canonical content.
2. Build the first polished neutral starter theme and the Renegade Party native theme as separate consumers of the same contract. No core import may depend on the Renegade theme.
3. Implement site homepage, Publication homepage, member Space/profile, personal-blog homepage/post archive, album/gallery, portfolio/project, forum index/section/forum/thread, article, page, author, section/category/topic/tag/series, search, date archive, and 404 routes with breadcrumbs, navigation/footer management, announcement bar, related content, and responsive layouts. Make site-global versus publication-local discovery explicit.
4. Implement SEO fundamentals: title/description defaults and overrides, canonical URLs, robots controls, sitemap index, segmented sitemaps, robots.txt, redirects, 404 logging, OpenGraph/X cards, dynamic social-image hook, clean URLs, RSS/XML feeds, and search-engine verification fields.
5. Emit validated structured data appropriate to the actual visible page: WebSite, Organization/Person/Profile, Article variants, ImageObject/CollectionPage where supported by current primary documentation, BreadcrumbList, DiscussionForumPosting or other qualified discussion markup, and only other schemas supported by visible content. Avoid fabricated FAQ/Q&A/review data.
6. Implement forum-specific technical SEO and index policy: one stable canonical thread identity across pagination, permanent post anchors, correct author/date/reply markup, qualified UGC links, segmented sitemap inclusion, public/private boundaries, merge/move redirects, and explicit index/hold/noindex states for useful, new/unreviewed, thin, duplicate, private, removed or spam content. Do not mark a thread â€œupdatedâ€ as editorially refreshed merely because it received a trivial reply.
7. Implement full-text site search using PostgreSQL first. Search articles/pages/authors/public profiles and opted-in Spaces/blogs/albums/portfolios/topics/forums/threads/posts, respecting every visibility and moderation rule. Expose filters and useful empty states. Document the measured trigger for external search or semantic search.
8. Establish cache and revalidation behavior for publish/update/unpublish, new/edited/removed discussion contributions, thread merge/move/lock, taxonomy moves, theme changes, redirects, and navigation changes. Prevent drafts, embargoed, private, held or removed content from leaking into caches, feeds, sitemaps or search.
9. Meet an accessibility baseline: semantic landmarks, keyboard navigation, visible focus, contrast, alt behavior, reduced motion, accessible forms/components, heading discipline, captions/transcript hooks, and navigable quoted/reply context.
10. Establish performance budgets and test public pages and large paginated threads for server rendering/static generation choices, responsive images, font loading, JavaScript cost, query count, stable pagination and cache behavior.

Acceptance gate:

- Switching between the neutral theme and Renegade Party theme changes presentation without changing content records.
- Publishing or updating an article correctly refreshes route, archives, search, sitemap, feed, metadata, structured data, and caches.
- Publishing, replying to, moving and merging a public thread preserves canonical identity and post permalinks, applies the configured index policy, and refreshes only the correct discovery surfaces.
- Draft and embargoed content are absent from every public discovery surface.
- Private, friends-only, members-only, unlisted, held, or suspended profile/album/portfolio data never leaks through search, metadata, structured data, feeds, sitemaps, caches, or direct object lookup.
- Core routes pass the projectâ€™s automated accessibility and performance thresholds.

Non-goals: no drag/drop page builder, comments, social APIs, commerce, AI, or external search service.

Run validators/tests/build, update theme and SEO documentation plus PROJECT_STATE.md, and stop.
```

---

## Prompt 6 of 15: Visual page builder, reusable blocks, graphic placeholders, and starter sites

```text
Continue from the theme-enabled public site. Read AGENTS.md, PROJECT_STATE.md, theme contracts, current editor technology, and relevant research about Puck or alternatives. Implement this milestone directly and stop at its acceptance gate.

This milestone eliminates the blank-canvas problem without turning content into a proprietary page-builder blob.

Required outcomes:

1. Evaluate the visual-builder choice against the installed stack and written constraints. Prefer Puck only if the evidence supports it. Record the decision, rejected alternatives, integration boundary, and exit strategy.
2. Implement structured page composition from registered real React components. Stored layouts must be versioned, validated structured data with stable component IDs and migrations. Unknown/removed components must degrade safely and remain recoverable.
3. Implement direct manipulation: select, edit, reorder, duplicate, hide/show, delete/undo, preview, responsive visibility/settings, draft layouts, and publish. Use theme tokens; prevent arbitrary unsafe code/style injection.
4. Implement global blocks, reusable sections/patterns, component presets, and a developer registration escape hatch with schemas, editor controls, public renderer, preview renderer, permission requirements, and compatibility version.
5. Deliver the initial block library: hero, featured article, article grid/list, profile card/grid, profile bio/status/links, friend/buddy list, personal-post feed, album/gallery, portfolio/project, author card/grid, pull quote/quote card, newsletter CTA, generic CTA, donation block, image/video/audio, book/podcast/video cards, forum activity, featured discussion, unanswered/solved thread list, timeline, chart/stat/data/comparison table, FAQ, source/evidence box, team, event, contact form placeholder, custom embed, and custom React component registration. Build shared primitives; do not implement full downstream business logic prematurely.
6. Implement intelligent graphic placeholders as a reusable first-class component/field state. Each conveys purpose, aspect ratio, recommended dimensions, subject/style/composition, placement, text-safe area, accessibility reminder, and actions for upload, media browse, idea generation hook, prompt generation hook, and replace later.
7. Implement starter-site/Space recipes containing theme config, pages, navigation, realistic instructional content, categories, authors, example content, graphic placeholders, capability grants and module defaults. Include safe starters for a simple member profile, writer/blogger, photographer portfolio, discussion forum/community, creator store/support page, organization and maximalist social Space. Recipes configure the same primitives and can be expanded later; they do not create incompatible site types. No lorem ipsum. Installation must be previewable and idempotent or explicitly one-time.
8. Implement safe theme switching and starter-content behavior so switching themes never duplicates or destroys canonical content.
9. Implement MySpace-level expressive profile customization through registered blocks and constrained design tokens without arbitrary executable code. Disallow user JavaScript and raw unsafe HTML. If custom CSS is offered, isolate it behind an explicit advanced capability with an allowlisted parser, URL restrictions, size limits, CSP, preview/reset, moderation controls, and tests; never concatenate untrusted CSS blindly.
10. Add visual regression coverage for representative blocks/themes/profile layouts and migration tests for stored layouts.

Acceptance gate:

- A nondeveloper installs a starter site, edits the hero by clicking its visible fields, replaces a guided image placeholder, reorders blocks, saves a draft, previews it, and publishes it.
- The same layout renders in both native themes through the registry.
- Removing or upgrading a component does not corrupt the page; the system reports and preserves unmigrated data.
- A member can choose a starter profile, customize colors/layout, add a blog feed and album/portfolio, and cannot inject script or affect another profile/site chrome.

Non-goals: no full AI generation, live forms backend, commerce cards, or social graphic editor yet; expose extension hooks only.

Update builder/theme SDK docs and PROJECT_STATE.md, verify the end-to-end journey, and stop.
```

---

## Prompt 7 of 15: Passwordless members, Reown wallet connection, social profiles, relationships, private messaging, forums, moderation, and security

```text
Continue from the public publishing platform. Read AGENTS.md, PROJECT_STATE.md, auth/session code, deployment proxy rules, and security decisions. Implement this milestone directly and stop at its acceptance gate.

This milestone turns the publishing platform into an optional independent social/community platform with strong defaults. It is intentionally divided into proof gates because identity, profiles, relationships, conversations, forums, and abuse controls must be proven separately. Implement the next incomplete gate, update PROJECT_STATE.md, and continue only when the repository remains verified.

Settled doctrine:

- No traditional passwords, password hashes, password login UI, forgot-password route, or password reset flow in core.
- One canonical internal Member owns profile, content, relationships, media, messages, and financial history.
- Passkeys, established OAuth/social accounts, signed Web3 wallets, and expiring email magic links are replaceable LinkedIdentity credentials. Providers authenticate access; they do not own the Member.
- Reown AppKit is the preferred first wallet-connection UX adapter, not the canonical Member/session service and not the crypto ledger. Web3 remains optional; its absence or outage cannot break ordinary login, publishing, profiles, forums or fiat checkout.
- Staff/owner authentication is a stronger security domain than ordinary public membership.
- Native messages may be normal or optionally public-key encrypted per message/conversation. Encrypted mode is client-side and the server stores ciphertext, but v1 must not claim Signal-style forward secrecy, guaranteed recipient erasure, or metadata secrecy.

Required outcomes:

Gate 7A â€” Passwordless identity and recovery:

1. Implement the canonical Member and LinkedIdentity contracts from Milestone 1. Support passkeys, OAuth/social identities, signed wallets, and email magic links through provider-ready strategies; build only flows that can be honestly tested and capability-gate the rest. Never automatically merge accounts merely because providers report the same email. Linking or merging requires current authenticated proof and proof of the added identity. Support multiple identities, verified emails, sessions/device view, recovery methods/codes, unlink safeguards, duplicate-account resolution, account export/deletion hooks, and session revocation.
2. Implement magic links as single-use, expiring, hashed, purpose-bound tokens with generic responses, send/verification throttling, replay prevention, secure remembered sessions, and no enumeration. Implement optional multichain Web3 login/linking through a generic `WalletConnectionProvider` plus a Reown AppKit reference adapter. Use Renegade-owned server-side SIWX verification and Member sessions: issue a single-use purpose-bound nonce, bind the human-readable statement to exact domain/URI, chain/account, action, issued/expiry time and current browser session, verify the signature and smart-account form where supported, consume the nonce transactionally, then create or link a `LinkedIdentity`. Never treat `connect` as authentication. Require no token approval, transaction, gas, asset permission or balance disclosure for login.
3. Isolate AppKit behind one optional client-only integration package and one singleton provider mounted at a narrow application boundary; do not import wallet/browser code into Payload, server components, migrations, jobs or unrelated public bundles. Disable AppKit-owned email/social identity and cloud-managed authentication when Renegade's canonical identity service is in use. Treat the Reown project ID as public configuration, bind it to administrator-approved production origins/metadata, and keep unrelated secrets server-only. Configure only administrator-approved networks. Begin with an EVM proof and add Solana through its separate adapter when tested; Bitcoin and additional namespaces remain capability-gated. A receiving address used for donations or sales is configured and control-proven separately and is never inferred from a Member's login wallet.
4. Treat Reown, Wagmi, Viem, TanStack Query, React and Next.js as one tested compatibility set. At implementation time inspect the repository first, verify current official requirements, pin exact known-good versions in the lockfile, and record them in the compatibility matrix. Do not install `latest`, do not upgrade Next.js merely to satisfy AppKit, and do not downgrade the working application silently. Current research on 2026-08-11 shows AppKit's Next.js App Router path and Wagmi 2.x requirement; reverify before install. Add a production-build/browser smoke fixture before enabling the module, and make the updater refuse an incompatible matrix before mutation.
5. Complete owner/staff passkey enrollment and recovery from Milestone 2. Require stronger staff session policy, reauthentication for dangerous actions, recovery auditing, and owner-only critical operations. Social login or one wallet alone must not be the sole owner recovery path.

Gate 7B â€” Profiles, Spaces, relationships, blogs, albums, and portfolios:

6. Build the public Member Profile/Space product over Milestones 3, 5, and 6: handle, avatar/cover, bio/status, links, privacy per field/block, profile layout/theme, optional personal blog/Publication, albums, portfolio projects, forum activity, supporter/contact blocks, bookmarks/saved content, and preferences. A simple account remains simple; advanced modules appear progressively.
7. Implement follow, mutual friend/buddy, block, mute, request/approval, and removal flows over typed Relationships. Define who can view lists, contact whom, invite whom, or see friends-only content. Block precedence must apply consistently to profiles, feeds, discussions, album comments, mentions, and messages.
8. Complete member album/portfolio behavior: create/order albums and projects, upload/reuse media, choose audience and download/original/EXIF policy, moderate/report, enforce storage quotas, and export originals plus metadata. Prevent private media leakage through derivatives, direct URLs, caches, search, feeds, or metadata.

Gate 7C â€” Lightweight native private messaging:

9. Implement native PostgreSQL-backed Conversation, ConversationParticipant, Message, MessageAttachment, MessageReceipt, MessageRequest, and MessageReport models with stable IDs, participant authorization, pagination, unread state, idempotent send, edit/delete policy, shared RetentionPolicy, export/deletion rules, attachments, blocking, reporting, moderation boundaries, and audit metadata. Start with one-to-one and small-group asynchronous conversations.
10. Implement optional public-key message encryption from the Milestone 1 envelope using an audited, maintained cryptographic library. Generate a Member/device public encryption key string plus fingerprint and a separately protected private recovery key; never send plaintext or an unwrapped private key to the server. Encrypt content locally with a random authenticated content key, wrap that key separately for every recipient and the sender, sign/authenticate the envelope, store only ciphertext for encrypted mode, and encrypt attachments before upload. Version the suite and test tampering, wrong key, key rotation, revoked key, sender-history access, multi-recipient envelopes, export/recovery and loss behavior.
11. Build understandable controls: normal message, encrypt this message, always encrypt this conversation, key fingerprint/QR verification, recovery-key export warning, key rotation, and honest security details. The server may retain sender/recipient/time/size metadata; loss of every private/recovery copy may make history unrecoverable. Reported abuse includes only plaintext the reporting participant explicitly decrypts and submits. â€œBurnâ€ destroys wrapped content keys first and schedules ciphertext/attachment purge, subject to holds and the explicit inability to erase recipient copies.
12. Add a transport abstraction with server-sent events or WebSockets only where justified for live delivery; messaging must still work as a durable inbox when realtime transport is unavailable. Presence and typing indicators are optional capabilities, not correctness dependencies. Add notification hooks without exposing encrypted message bodies.
13. Keep a MessagingProvider adapter boundary for future open-protocol delivery, but do not deploy a second messaging server or block native encrypted messaging on federation. Any later forward-secrecy/E2EE protocol claim requires a separately proven contract and migration path.

Gate 7D â€” Publications, forums, and comments:

14. Implement Publication-scoped membership and roles so one Member may own a personal blog, edit another publication, and only contribute to the main publication. Include site-owner override, invitation/application/open-creation policies, first-post review, quotas, suspension, ownership transfer, and tests preventing cross-publication leakage. Keep ordinary controls simple: Start a Blog, invite a writer, choose who may publish.
15. Implement the optional self-service Community/Forum module over the shared Discussion engine: an authorized Space owner can enable a forum, create sections/nested forums, appoint scoped moderators, choose public/members/private access and operate threads/posts, replies, quoting/multiquote, mentions, polls, attachments/embeds, drafts, edits/history, reactions/helpful/accepted solution, pin/feature, lock, move, merge, split, soft deletion, subscriptions, unread tracking, recent/trending/unanswered/solved views, article-linked discussions, album/profile discussions, and publication policies without receiving site-wide administration.
16. Implement comments as the compact presentation of the same Discussion engine: configurable depth, edit/delete windows, staff/author badges, pins, reports, moderator notes, queue/actions, locks, subscriptions/notifications hooks, permalinks, counts, RetentionPolicy, and per-content/publication policy. Article, profile, album, and forum contributions share identity/moderation infrastructure without requiring identical layouts.

Gate 7E â€” Trust, moderation, abuse prevention, and application security:

17. Implement explainable trust states: new, established, trusted, restricted, banned. Use auditable rules and moderation history; do not expose gamified public karma. Trust may reduce friction but may not bypass profile audience, block, Publication, private-forum, or Conversation authorization.
18. Implement moderator operations across profiles, albums, comments, forums, and message reports: queues, reports, notes, warnings, temporary restrictions, bans, approval, move/merge/split with permalink guarantees, bulk spam action, audit, restoration, and strict boundaries preventing moderators from casually browsing private or encrypted conversations.
19. Implement a shared abuse-prevention engine for auth, magic links, identity linking, profiles, follows/friend requests, conversations/message requests, comments, threads/posts, reports, Publication/forum creation, media uploads, forms hooks, newsletter hooks, API, search, admin, and future callbacks/webhooks. Combine route policy with IP/account/session/email-hash/wallet/provider signals. Support allow, throttle, challenge, moderate, block, and log outcomes.
20. Implement edge-aware and application-level rate limiting, temporary escalation, IP/CIDR/account/session bans, allowlists, revocation, audit history, and configurable country/ASN policy when reliable request metadata exists. Never trust forwarded geo/IP headers from untrusted proxies.
21. Implement staff roles/permissions: owner/admin/editor/author/contributor/moderator/social manager/designer/analyst, site versus Publication/forum scope, field/action permissions, passkeys, session expiry/revocation, reauthentication, login history, brute-force protection, and owner-only critical actions.
22. Apply secure cookies, CSRF, CSP/security headers, output sanitization, safe profile customization, upload validation, SSRF-safe URL fetching, webhook verification, OAuth state/PKCE, secret redaction, and audit logs. Build a Security Center showing staff auth posture, proxy/origin warnings, rate limiting, recent blocked/challenged events, spam, active bans, failed login/link attempts, backups, and expert detail beneath a simple status.

Acceptance gate:

- Anonymous comments are rejected by default.
- A new Member can sign in without creating a password through an honestly verified identity flow, link a second method, lose the first provider, recover through the second, and cannot be silently merged with another account.
- Reown AppKit connects an approved EVM test wallet through the client-only adapter; connecting alone creates no authenticated session. A single-use SIWX signature creates or links the correct Member, replay/domain/account/network substitution fails, disconnect/revocation ends the correct session, and the rest of the site still works with AppKit disabled or unreachable. The pinned Next.js/React/AppKit/Wagmi/Viem matrix passes a production build and browser smoke test.
- The owner bootstrap is disabled and staff reauthentication protects dangerous actions; no password or password-reset surface exists.
- A Member creates a customizable Space, personal blog, friends list, private album and public portfolio; every audience and block rule holds across direct URLs, search, caches, feeds, and derivatives.
- Two Members exchange normal and encrypted messages, verify fingerprints, recover the senderâ€™s encrypted history from an authorized recovery copy, detect tampering, burn one encrypted message through key destruction/purge, survive worker/realtime failure, block further contact, and report only explicitly selected plaintext without granting moderators general conversation access. Database, logs, notifications and backups contain no encrypted-message plaintext.
- A Member can create or be invited to a Publication only under configured policy, cannot access another Publicationâ€™s drafts/settings, and can be suspended without deleting their identity or content history.
- A verified-email user completes the token flow and enters the correct moderation path; replay and enumeration tests pass.
- A trusted user and restricted user experience their configured friction, with an explainable audit trail.
- An authorized Member enables a forum on their Space, creates sections and appoints a scoped moderator without gaining site administration; another Member starts a thread/replies/quotes, the moderator splits or moves it without breaking retained permalinks, and an article uses the same engine in compact comment mode.
- A simulated burst is throttled without blocking ordinary readers, and proxy spoofing does not bypass policy.
- Unauthorized staff actions fail at both UI and server boundaries.

Non-goals: production-complete adapters for every identity provider, XMPP/Matrix deployment, federation, Signal-style forward-secrecy claims, guaranteed deletion from recipient devices, advanced AI spam classification, token gating, donations, or external WAF automation.

Run security-focused integration/end-to-end tests plus the full suite, update threat model and PROJECT_STATE.md, and stop.
```

---

## Prompt 8 of 15: Extension SDK, provider contracts, connections center, secrets, and capability UX

```text
Continue from the secured modular monolith. Read AGENTS.md, PROJECT_STATE.md, module boundaries, security model, and any existing plugin/provider work. Implement this milestone directly and stop at its acceptance gate.

This milestone establishes how Renegade CMS evolves without hard-wiring vendors or allowing unsafe plugins to destabilize the product.

Required outcomes:

1. Implement the kernelâ€™s module lifecycle contract from Milestone 1 for trusted in-process modules, installable themes, provider adapters, and any future third-party plugins. Every user-facing family is optional; modules declare compatible core/schema ranges, dependencies/conflicts, capabilities, permissions, migrations, failure mode, data/export ownership and retention. Do not promise arbitrary untrusted server code installation unless a real sandbox/security model exists.
2. Implement versioned provider contracts for social, AI/text, image generation, transcription, email, storage, auth/identity, wallet connection, wallet signature verification, messaging/realtime, optional federation, payment processing, patron/supporter-platform synchronization, crypto payments/donations, affiliate, commerce/marketplace, fulfillment, analytics, edge/security, challenge, and media import. Each contract needs identity, config schema, capabilities, health/test, authorization/scopes, rate-limit metadata, normalized errors, disconnect/revocation behavior, and explicit data ownership/portability boundaries. Wallet-connection adapters expose accounts/networks/signing transport but never own canonical Members or server sessions. A payment processor adapter must additionally expose merchant onboarding/account state and a machine-readable, refreshable payment-method catalog with geography, currency, amount, checkout-flow, recurring, capture, refund, dispute and settlement constraints; one processor may expose many payment rails.
3. Implement a capability registry. Product features must query capabilities such as social.publish.text, email.transactional, ai.text.rewrite, identity.oauth, wallet.connect.evm, wallet.connect.solana, identity.wallet.siwx, messaging.realtime, messaging.external_delivery, federation.public_actor, payments.method.list_eligible, payments.checkout.one_time, payments.subscription.recurring, payments.refund, patron.members.sync, crypto.payment.verify, storage.object, or commerce.orders instead of checking vendor names.
4. Implement connection records with site/brand/account ownership, external account identity, status, encrypted secret/token storage, minimal scopes, expiry, refresh metadata, last health check, audit events, and safe deletion. Secrets must never enter normal client state or logs.
5. Build the Connections Center grouped by Social, Media, AI, Payments & Support, Commerce, Fulfillment, Email, Analytics, Identity, Messaging and Security. Scope a connection to site, Publication, Space or Member as policy allows. Support connect/configure, test, account choice, scope display, health, expiry warning, reconnect, disable and disconnect. Payment connections display the merchant account's currently verified countries/regions, currencies, rails and feature limits rather than implying that installing an adapter makes every method globally available.
6. Implement dynamic capability UX so installing/enabling/disabling modules and connecting/disconnecting providers makes relevant actions appear/disappear or enter a clear unavailable/archive state without hard-coded vendor UI scattered across modules. Disable/re-enable must preserve canonical data and configuration; uninstall requires an explicit retain/archive/export/delete decision.
7. Implement adapter failure isolation, normalized retryability, circuit/backoff guidance, webhook/callback ownership, idempotency expectations, and diagnostic redaction.
8. Build at least two real low-risk reference adapters that prove different contract shapes, such as local filesystem plus S3-compatible object storage in a test environment, or SMTP plus a development email adapter. Use available credentials only; do not fabricate production success.
9. Create extension SDK documentation, example adapter, contract tests, compatibility matrix tests, and a permission/dependency manifest. Prove enable/disable/re-enable, old-core/new-compatible-module, new-core/old-compatible-module, incompatible refusal before mutation, unknown-field/block preservation, database migration ownership, upgrade ordering, provider replacement, and safe behavior when an adapter becomes incompatible. For browser SDK adapters such as Reown AppKit, matrix-test the exact Next.js/React/SDK/peer-dependency set and production SSR/client boundary; updater compatibility must be decided by recorded test evidence, not permissive semver alone.
10. Document measured triggers before moving trusted modules out of process or supporting a public plugin marketplace.

Acceptance gate:

- A reference adapter can be connected, tested, used through a generic capability, disabled, and disconnected without vendor-specific conditionals in the consuming feature.
- Expired/invalid credentials produce a redacted actionable warning and do not take down unrelated features.
- Contract tests can be reused against future adapters.
- The UI changes from capability state, not provider-name branching.
- A module can be disabled and re-enabled with its records intact; an incompatible module is refused before migrations or runtime execution and unrelated capabilities remain healthy.

Non-goals: do not implement every named provider or a public plugin marketplace. Those are adapter backlog items after their consuming vertical slices exist.

Update SDK/connection docs and PROJECT_STATE.md, run tests, and stop.
```

---

## Prompt 9 of 15: Bring-your-own AI, task routing, contextual assistance, and human approval

```text
Continue from the provider/capability foundation. Read AGENTS.md, PROJECT_STATE.md, Brand Profile, editor contracts, connection security, and mapped AI research. Implement this milestone directly and stop at its acceptance gate.

This milestone makes Renegade CMS useful before AI is connected and substantially more capable after a user supplies a provider. AI must remain contextual, reviewable, cost-bounded, and unable to publish by default.

Required outcomes:

1. Implement AI provider adapters through the generic contracts for the highest-priority available targets: OpenAI-compatible APIs first, then only Gemini/Qwen/local Ollama adapters justified by available libraries and testability. Support multiple connections/models and per-task routing.
2. Implement an AI task registry describing required capability, allowed inputs, output schema, quality/cost class, timeout, maximum context, sensitive-data policy, permission, audit policy, and fallback behavior.
3. Implement secure server-side execution with cancellation, timeout, retry only when safe, usage/token accounting, cost estimation where pricing is configured, per-task and monthly limits, per-role permissions, redacted logs, and explicit no-provider/no-budget states.
4. Build contextual editor actions: improve selection, tighten, expand, simplify, clarify, alternatives, headlines, subtitle, opening/conclusion ideas, excerpt, summary, outline, FAQ extraction, tone/brand adaptation, grammar, repurposing, and brand-profile-based About/Mission drafts. Preserve original text and apply only after explicit user acceptance.
5. Implement structured content intelligence: tag/category/topic suggestions, related/internal-link suggestions, overlap detection, metadata/SEO suggestions, social/newsletter draft hooks, quote extraction, transcript cleanup hook, chapters/timestamps hook, product suggestion hook, and discussion intelligence. Discussion intelligence includes duplicate-thread suggestions, cited summaries linked to exact posts, agreement/disagreement and unresolved-question extraction, helpful/solution candidates, related threads/editorial content, moderation assistance, digest drafts, and promotion-to-article/FAQ/research-brief proposals. Separate suggestion generation from mutation.
6. Implement image assistance hooks: concept directions, detailed prompts using brand style, aspect/composition suggestions, alt text, caption, and social-graphic text. Manual upload and copyable prompts must work without an image provider.
7. Make prompt construction inspectable enough for users to understand what brand/content context is being sent. Add explicit controls for including sources, article text, brand voice, and private notes. Private editorial notes are excluded by default.
8. Defend against prompt injection in imported/web/source text: treat content as data, restrict tools, validate structured output, and never let model text authorize actions, reveal secrets, or bypass permissions.
9. Add regression/evaluation fixtures for brand voice, factual preservation, citations not being fabricated, thread summaries supporting every point with visible post references, private/deleted/held posts being excluded, structured-output validation, cost limits, permission enforcement, and provider outage.

Acceptance gate:

- With AI disabled, editing and publishing remain fully functional.
- With one BYO provider connected, an editor requests a rewrite and taxonomy suggestions, compares output to the original, accepts selected changes, and sees usage/cost accounting.
- A long fixture discussion can be summarized with links to exact visible posts and proposed for editorial promotion without modifying or publishing either object.
- The model cannot publish, schedule, alter permissions, access secrets, or silently modify content.
- Provider failure leaves the draft intact and produces a recoverable state.

Non-goals: autonomous agents, automatic publishing, universal factual verification, or provider-specific UI outside connection/configuration.

Update AI safety/usage docs and PROJECT_STATE.md, run tests/evals, and stop.
```

---

## Prompt 10 of 15: Books, podcast, video, interviews, livestreams, transcription, TTS, and media production

```text
Continue from the publishing, theme, capability, and AI foundations. Read AGENTS.md, PROJECT_STATE.md, mapped media research, and installed storage/job/provider contracts. Implement this milestone directly and stop at its acceptance gate.

This milestone turns Renegade CMS into a first-class media publication rather than an article CMS with embeds.

Required outcomes:

1. Implement specialized content types and relationships for Books/parts/chapters/editions, Podcast shows/seasons/episodes, Videos/playlists, Interviews/guests, and Livestream events/replays. Reuse the content spine, people, sources, taxonomy, media, comments policy, campaigns hook, SEO, and analytics event contract.
2. Implement book ordering, serialized release, online reading, previous/next navigation, excerpts/previews, citations/footnotes, purchase/download links, ISBN/edition data, related media, and Book structured data based on visible facts.
3. Implement podcast metadata, audio player, external-host support, RSS import with idempotent synchronization, optional valid RSS generation, show notes, transcript, chapters/timestamps, guests/hosts, products/links/sources, and PodcastEpisode structured data.
4. Implement YouTube/media import through the provider layer: channel/playlists/videos, incremental sync, new-upload detection, embeds, metadata, thumbnail, transcript/chapters, related content, clips/short derivatives, and VideoObject structured data. If live credentials are unavailable, build a recorded-fixture contract test and clearly mark live verification pending.
5. Implement interview and livestream workflows, including schedule/countdown, embed, reminder hook, replay conversion, transcripts, quotes, sources, and related campaign.
6. Implement upload/import pipelines as durable jobs with progress, cancellation, retry, idempotency, duplicate handling, media derivatives, and failure visibility. Large files must not pass through fragile in-memory request paths.
7. Implement provider-based transcription with transcript versions, speaker/segment structure where available, manual correction, chapter/timestamp editing, and AI cleanup as an explicit derived revision.
8. Implement text-to-speech and publisher-read audio as two distinct modes. TTS must be provider-based, asynchronous, chunk long documents safely, preserve pronunciation/voice settings, track source revision, regenerate only affected output where practical, and store licensed output metadata. Publisher-read mode must support browser upload/recording in resumable chunks, replacement/edit metadata, and association with a content revision. Never clone a voice without explicit rights and consent.
9. Add accessible players, captions/transcripts, keyboard controls, download policy, poster/artwork placeholders, responsive media, and feed/schema validation.
10. Add article-from-transcript draft creation, quote/clip suggestions, and cross-content relationships without auto-publishing.

Acceptance gate:

- Import or fixture-sync one podcast episode and one video twice without duplication.
- Publish a book with ordered chapters and correct navigation.
- Transcribe a media item through a real or test adapter, manually correct it, and derive an article draft.
- Generate or fixture-prove revision-bound TTS, and attach a publisher-read recording without exposing unfinished chunks publicly.
- Public pages, feeds, players, transcripts, and structured data validate.

Non-goals: full nonlinear video/audio editing, live transcoding infrastructure at massive scale, DRM, or support for every host/provider.

Update media/feed/rights documentation and PROJECT_STATE.md, run the complete scenario, and stop.
```

---

## Prompt 11 of 15: Social command center, unified calendar, scheduling, campaigns, and graphic studio

```text
Continue from the content, media, jobs, providers, and AI foundations. Read AGENTS.md, PROJECT_STATE.md, mapped social API research, and each target networkâ€™s documented capability constraints already stored in the project. Implement this milestone directly and stop at its acceptance gate.

This milestone proves â€œcreate once, distribute everywhereâ€ while respecting that social networks have unequal and changing APIs.

Required outcomes:

1. Implement the normalized Social Account, Social Draft, Network Variant, Attachment, Schedule/Queue Item, Publish Attempt, External Post, and Campaign models. Preserve per-network text/media rather than reducing everything to a lowest-common-denominator post.
2. Implement a social publishing state machine with draft, review, approved, queued, scheduled, publishing, published, partially published, failed, cancelled, and deletion-request states. Use idempotency, lease/locking, bounded retries, backoff, dead-letter visibility, and provider-normalized errors.
3. Build the Social Studio: compose, per-network variants/previews, validation, images/video, character/link/hashtag handling, publish now, schedule, duplicate, retry, cancel/delete where supported, approval flow, and accessible status/error UX.
4. Build the unified Calendar Center over the shared CalendarEntry/Event contract. It covers website content, social queue, campaigns, newsletters, livestreams/public events, product launches, crowdfunding milestones/updates, Space-owned calendars and optional internal planning entries. Give each user a simple â€œMy calendarâ€ view and owners a scoped Site/Publication/Space view. Support agenda/week/month views, timezone-safe drag rescheduling, filters, conflict/status display, privacy, permissions, reminders/notification hooks, ICS import/export and shareable read-only feeds. Calendar mutations must use domain commands, not directly edit timestamps blindly; source objects remain authoritative. External Google/Outlook/CalDAV two-way sync is a later adapter capability, not a promise in this milestone.
5. Implement queue slots/default schedules per account, evergreen queue, pause/resume, bulk scheduling, and safeguards against accidental duplicate or stale promotion.
6. Implement Campaign as the orchestration object connecting source content, site content, social variants, graphics, newsletter hooks, media, products/affiliate links, goals, approvals, schedule, failures, and status. A failed network must not roll back successful publishing elsewhere.
7. Implement repurpose-to-social drafts from article/book/podcast/video/interview/curated public discussion: X post/thread, Threads, Facebook, Instagram caption, LinkedIn, Bluesky, newsletter excerpt, community-post hook, quote cards, and clip prompts. Forum-derived drafts must preserve contributor attribution/consent policy, link to the canonical thread or derived editorial page, exclude private/removed/held posts, and require review.
8. Implement a lightweight template-based graphic studio, not a general Canva clone: article, quote, podcast, video, book, product, event, donation, stat, profile, and announcement templates; brand tokens; image/text replacement; safe zones; accessible controls; square/portrait/story/OG/hero output; deterministic server-side export to PNG/WebP and SVG only where safe; batch size generation.
9. Implement adapters in a deliberate order based on API access and testability. Start with open/federated networks such as Mastodon/Bluesky if supported by the research and available credentials, then add others as separate adapter tasks. For X, Threads, Meta, LinkedIn, YouTube, and TikTok, implement only capabilities permitted by current access; expose unsupported actions honestly. An optional Buffer-style adapter may broaden compatibility but cannot become a required Renegade service.
10. Add social-account health, scope/credential expiry, webhook handling where available, failure logs, diagnostic export, and adapter contract tests using recorded fixtures/sandboxes.

Acceptance gate:

- From one published article, create reviewed variants and graphics, schedule them on at least two independently implemented/tested adapters, restart the worker, and publish exactly once per target.
- Force one target to fail while another succeeds; the campaign becomes partially published and offers a safe retry only for the failed target.
- Dragging an item on the calendar reschedules it with correct timezone and audit history.
- A private Space planning entry, a public event and a campaign launch appear in the correct scoped views; direct access, ICS feed and notifications respect each entryâ€™s visibility and owner.

Non-goals: fabricated support for restricted APIs, scraping social networks to bypass APIs, full creative-suite editing, or guaranteed cross-network analytics not provided by APIs.

Update adapter capability matrix and PROJECT_STATE.md with live-tested versus fixture-tested status, then stop.
```

---

## Prompt 12 of 15: Forms, subscribers, newsletters, notifications, and audience workflows

```text
Continue from identity, jobs, providers, content, campaigns, and calendar. Read AGENTS.md, PROJECT_STATE.md, privacy/security decisions, and mapped email research. Implement this milestone directly and stop at its acceptance gate.

This milestone lets a publisher capture and communicate with an audience without leaving the platform, while preserving consent, deliverability, and provider independence.

Required outcomes:

1. Implement a reusable form schema and renderer for contact, newsletter signup, volunteer, donation interest, reader submission, tips, event registration, surveys, and custom forms. Support typed fields, conditional behavior only where safe, file uploads, identity-required option, retention policy, consent fields, database storage, notifications, CSV export, and signed outbound webhooks.
2. Route form submissions through abuse prevention, rate limits, challenge providers, upload validation, privacy/redaction policy, and auditable status. Protect sensitive tip/submission data with explicit permissions and do not leak values into analytics/logs.
3. Implement Subscriber, List, Segment, Consent Event, Preference, Suppression, and Delivery identity models. Keep Member, Subscriber, and future Supporter related but not incorrectly merged: a person may be any combination, and newsletter consent must never be inferred from a payment. Support import/export with validation, duplicates, unsubscribe, global/provider suppression, and double opt-in.
4. Implement transactional and bulk email capabilities separately. Transactional delivery must support passwordless magic links, identity/recovery alerts, friend/follow/message requests, conversation notifications without message bodies by default, moderation, and system security events. Add at least one real testable email adapter plus development capture. Support SMTP/SES/Resend through adapters as access allows.
5. Build the newsletter editor from structured reusable content blocks, article/campaign conversion, curated forum/community digest blocks, templates, brand defaults, personalization with safe fallbacks, test send, review, schedule, queue, cancellation cutoff, and archive/web version where configured. Never include private, removed or held discussion content.
6. Implement bulk delivery as chunked durable jobs with idempotency, provider limits, retry classification, progress, cancellation, and per-recipient outcome. Never send bulk email in a request cycle.
7. Process signed provider webhooks for delivery, bounce, complaint, click/open only when enabled, and unsubscribe. Treat privacy-sensitive tracking as opt-in/configurable and distinguish machine/privacy-proxy opens from reliable engagement.
8. Implement unified notifications for follows/friend requests, message requests and private-conversation activity, album/profile/comment/forum replies, mentions, quotes, accepted/helpful posts, subscriptions, reports/moderation, member events, identity linking/recovery, editorial approval, social failure, credential expiry, scheduled content, orders hooks, backup/security/update/system warnings. Support in-app/email channels, digest frequency, quiet hours and preferences, with forced critical owner notices narrowly defined. Notification payloads must respect blocks, visibility, conversation membership, and content privacy.
9. Add Audience UX for subscribers, members, segments, preferences, form submissions, notification templates, and delivery health with role-based access and safe exports.

Acceptance gate:

- A visitor completes double opt-in, appears once in the correct list with consent evidence, receives a scheduled newsletter, and can unsubscribe globally.
- A campaign-derived newsletter survives worker restart and does not duplicate deliveries.
- A bounce/complaint fixture updates suppression correctly.
- A spam burst against a public form is throttled/challenged while valid submissions continue.

Non-goals: building a full marketing automation suite, purchased-list enrichment, guaranteed open accuracy, or unreviewed AI email sending.

Update privacy/deliverability/runbook docs and PROJECT_STATE.md, run end-to-end tests, and stop.
```

---

## Prompt 13 of 15: Global creator commerce, crowdfunding, local payment methods, carts, donations, subscriptions, simple crypto pay, products, and POD

```text
Continue from publications, identity, content, provider contracts, campaigns, email, security, and jobs. Read AGENTS.md, PROJECT_STATE.md, mapped payment/commerce research, and provider legal/capability constraints. Implement this milestone directly and stop at its acceptance gate.

This milestone proves the financial-sovereignty and autonomous-creator promise: the site or a permitted Member Space owns its canonical supporter/customer relationship, products, membership rules, financial history and exports while interchangeable outside providers process payments or fulfillment. A creator can connect whatever compliant processors, local payment methods, receiving wallets and POD accounts are available to that merchant in their country, publish a product or donation surface, and operate normally without daily site-administrator intervention. PayPal is a representative adapter, not a platform assumption. Renegade must never custody card credentials, wallet private keys or pooled creator funds, and processor billing mandates may remain nonportable.

Required outcomes:

1. Implement canonical site/Publication/Space-owned Person/Member-linked Supporter, Customer, MerchantProfile, Funding Campaign, Contribution, Recurring Agreement, Membership Plan, Supporter Tier, Entitlement Grant, Financial Event, Refund/Dispute, Payout/Reconciliation record, and Provider Customer/Merchant/Account references. Preserve provider IDs and provenance while making Renegadeâ€™s supporter identity and entitlement state provider-neutral. Store immutable money/currency snapshots and append-only financial events; corrections are compensating events, not silent edits.
2. Implement one-time donations/tips, recurring support, fixed or user-entered amounts, fundraising goals, optional public supporter recognition, anonymous-to-public donations, donor messages with moderation, gift support, receipts/acknowledgment hooks, cancellation, grace periods, failed-payment recovery state, refunds/disputes, and publication-specific or site-wide support. Do not claim tax deductibility or issue charitable tax language unless the configured organization and jurisdiction explicitly support it.
3. Implement supporter memberships independently from newsletter subscription. Plans/tiers may grant publication/content access, badges, downloads, comments/community privileges, events, or other explicit entitlements. Centralize authorization in an entitlement service; never scatter checks such as `provider === Patreon` through content routes. Payment does not imply marketing-email consent.
4. Implement a provider-neutral payment orchestration contract that separates `MerchantConnection`, `PaymentProcessor`, `PaymentMethodCapability`, `PaymentIntent` and `SettlementReference`. Each adapter reports the methods actually enabled for that merchant account. The eligibility engine filters and ranks them using explicit merchant country/account status, buyer billing/shipping/selected country, presentment currency, settlement support, final amount and bounds, one-time versus recurring use, product/risk restrictions, device/wallet availability, required customer fields and provider health. IP geolocation is only a coarse hint, never the sole country decision. Never hard-code `if country then provider` rules into checkout.
5. Add adapters in evidence-based order from real target-market demand and credential access. Candidate families include global processors and wallets, regional processors, bank debit/transfer and open-banking rails, mobile money, cash/voucher methods, buy-now-pay-later, and external hosted payment links; examples may include PayPal, Stripe, Adyen, Mollie, Mercado Pago, Razorpay, Paystack, Flutterwave, Square, and future country-specific adapters, but none is promised until its current API, merchant eligibility, currencies, sandbox, compliance and webhook behavior pass contract tests. Support multiple processors concurrently and scope every merchant connection to its site/Publication/Space owner without cross-Space credential or customer access. Prefer provider-hosted checkout or official tokenized components; never handle raw card data.
6. Implement a localized checkout-method catalog rather than a static logo wall. Normalize method families such as card, wallet, bank debit, bank transfer/open banking, mobile money, cash voucher, buy-now-pay-later, crypto, and external link while preserving the real provider and rail. Show only currently eligible methods, translated provider-supplied instructions, correct currency formatting, fees or conversion disclosures when known, estimated confirmation timing, redirect/QR/pending behavior, recurring/refund limitations and an honest unavailable reason for operators. Never silently convert currency; persist quote source/time and buyer confirmation when conversion occurs.
7. Implement external patron/support-platform adapters for Patreon, Buy Me a Coffee, Ko-fi, and future services where official APIs, exports, webhooks, or permitted links make specific capabilities possible. Distinguish: deep synchronization, periodic import, webhook updates, and simple external support link. Never fabricate recurring-control or member-sync features a provider does not expose. Provide import/reconciliation so external patrons become canonical Supporters without automatically granting duplicate entitlements.
8. Implement `Renegade Simple Crypto Pay` over the generic PaymentIntent contract. Modes are independently optional: disabled, direct Member/Space tip or donation, and cart checkout. Generate exact expiring payment requests with address, network/asset, amount, QR and standard URI where available; monitor through a watch-only/node/BTCPay/provider adapter; track awaiting, detected, confirming, paid, underpaid, overpaid, late, reorged, expired and manually reconciled states; record quote source/time, confirmation policy, transaction hash privacy and refund instructions. When the selected network/asset and connected-wallet capabilities permit, Reown AppKit may initiate the buyer-approved transaction as a convenience, but payment completion is determined only by server-side PaymentIntent verification. QR/address/manual-wallet checkout remains available, and Dogecoin uses its own fixture-proven payment adapter rather than being falsely assumed to work through WalletConnect. Never request, store, transmit or back up seed phrases/private keys, sign transactions, pool creator funds or equate wallet login with payment.
9. Build Support/Donate/Send Crypto UX components: support button, tip jar, direct Member/Space payment request, recurring membership card, tier comparison, fundraising progress, sponsor wall, external support cards, eligible local payment-method buttons, crypto wallet/QR/payment-status block, manage-support page, cancellation, billing-history links and provider-outage fallback. Site policy plus Space grants control whether each surface exists; when disabled, all crypto/payment UI and network activity disappear while history remains available to authorized owners.
10. Implement a server-authoritative Cart and CheckoutSession with owner/merchant scope, line items, variants, quantities, prices/currency snapshots, discounts, shipping/tax hooks, expiration, inventory reservation boundary, anonymous/Member buyer, payment-method capability discovery and conversion to exactly one PaymentIntent and Order. Model synchronous success plus redirect, customer-action-required, pending/asynchronous, expired, failed, cancelled, refunded and disputed states. A cart may not silently combine independent merchants; split it into explicit direct checkouts rather than pooling and redistributing money.
11. Build scoped Finance/Operations Centers for site owners and permitted Space merchants: gross support/sales, fees, refunds, disputes, net known receipts, recurring status, churn/failures, provider balances/payout imports where available, settlement currency, unreconciled events, webhook/fulfillment failures, supporter/customer search, entitlement overrides with audit/expiry, exports and provider migration assistance. Site staff see only policy/health/detail their role permits. Clearly mark estimates and unavailable provider data; Renegade is an operational ledger, not certified accounting software.
12. Implement a canonical site/Publication/Space-owned Product model supporting physical, digital, book, affiliate, print-on-demand and external products; variants, offers, retailers, external IDs, provider associations, purchase URLs, media/artwork, disclosures, related content, campaigns, inventory/availability hooks and analytics. Implement optional Shop routes and product blocks with structured data matching visible offers.
13. Implement affiliate-provider contracts, managed affiliate links, disclosures, health checks and privacy-aware click tracking. Implement fulfillment/marketplace contracts plus one sandbox/fixture-proven POD adapter selected from Printful, Printify or Gelato. A permitted Space owner can connect their own shop, import/create a shirt/product, attach artwork, publish it and receive tracking without site-wide privileges. Build only Etsy/Shopify capabilities actually available.
14. Implement a provider-independent Order state machine with immutable totals/line items, customer-data permissions, payment state separated from fulfillment state, idempotent fulfillment submission, refunds/cancellations, shipping/tracking, signed webhook handling, reconciliation and audit. Once payment is confirmed and policy permits, durable jobs submit POD orders, process production/shipping updates and notify customer/merchant. Repeated failure pauses only the affected order/connection and raises an actionable exception; it never duplicates fulfillment.
15. Implement optional creator-owned Crowdfunding Campaigns over Funding Campaigns, Products, Entitlements, CalendarEntry and PaymentIntent. A permitted site/Publication/Space owner can create a public or private campaign with accountable recipient/merchant, title/story/media, goal amount or flexible funding, start/end/launch dates, currency, visibility, supporter recognition policy, updates, milestones, risks/terms, refund/cancellation policy, campaign-specific comments/moderation, linked content and transparent public progress. One-time contributions, recurring patronage, preorders and reward tiers are explicit modes, not a vague pooled â€œfundingâ€ state.
16. Implement reward tiers and preorder fulfillment without duplicating commerce: contribution minimum/limit, availability, estimated delivery, physical/digital/POD/external reward reference, supporter entitlement, shipping/tax collection hook, post-campaign fulfillment state and campaign-specific supporter messaging. A tier may grant a product, download, membership entitlement, badge, event access or acknowledgment; it may not promise a reward that cannot be tied to an explicit fulfillment or entitlement path.
17. Make campaign updates first-class content and calendar items: creator update posts, milestone reached/failed/extended/closed states, funding timeline, public and supporter-only updates, subscriber/social notification drafts, exportable supporter communications and truthful progress. The platform may show funds received/confirmed, fees and known net; it must not manufacture expense transparency. Add an opt-in transparent-project ledger where creators can publish categorized spending/receipts/links with correction history, but do not claim audit or charitable accountability merely because a chart exists.
18. Start with one accountable merchant or receiving wallet per campaign. The contributor pays that recipient directly through the selected processor or crypto payment request; Renegade records the obligation and evidence but does not custody, escrow, pool, split or redistribute funds. Multi-recipient campaigns, conditional milestone release, bounties/acceptance disputes, matching pools and on-chain contracts are explicitly deferred modules requiring jurisdiction, custody, dispute and tax review.
19. Implement support/product/crowdfunding campaign creation across landing page, profile/Space, article blocks, social drafts, newsletter blocks, graphics, calendar and goals. AI/manual monetization suggestions must explain themselves and require approval; never insert hidden advertising or donation appeals automatically.
20. Add Space-scoped grants for enable store, create product, connect payment provider, accept donations, create crowdfunding campaign, manage campaign updates, accept crypto, manage orders, connect fulfillment, issue refund and view finance. Add signed webhook verification, replay defense, secret rotation, idempotency, amount/currency/merchant verification, audit events, quotas, automated risk holds and redacted diagnostics. Site policy may require creator approval or first-order review without forcing daily supervision. Document that merchants remain responsible for provider onboarding, KYC, taxes, sanctions and local legal compliance; Renegade reports capabilities and evidence but never claims worldwide legal availability.

Acceptance gate:

- A region/currency matrix proves at least two materially different payment-method flows: one immediate/hosted method and one redirect, QR, voucher, bank, mobile-money or otherwise asynchronous local-method fixture. Eligible methods appear for supported merchant/buyer/currency/purchase combinations; unsupported methods do not appear. Replayed webhooks create exactly one canonical contribution.
- A supporter begins recurring support, receives the correct tier entitlement, experiences a simulated failed renewal/grace period, cancels, and loses access only according to the configured policy.
- An imported Patreon/Buy Me a Coffee/Ko-fi-style supporter and a direct supporter resolve to one canonical Supporter without duplicate benefits.
- A crypto fixture or test transaction is verified using explicit network/confirmation rules without Renegade ever receiving a private key.
- A connected login wallet cannot satisfy, redirect or alter a PaymentIntent merely because its address matches a Member. An AppKit-initiated test payment and the equivalent QR/manual-wallet path converge on the same server-verified state, while an unsupported network falls back honestly.
- A permitted Space owner launches a campaign with a goal, deadline, one reward tier and an accountable connected merchant; a visitor contributes, receives the correct entitlement, sees accurate public progress, and the owner publishes an update that schedules a newsletter/social draft without site-admin action. A private campaign or supporter-only update does not leak through search, feeds, public calendar, analytics or notifications.
- Disabling the Crowdfunding capability hides new contribution actions but preserves campaign, supporter, financial, entitlement and update history for authorized export/archive. A campaign cannot combine separate creator merchants, and the UI never claims escrow, pooled funds, tax deductibility or guaranteed delivery.
- A permitted Member enables commerce on their Space, connects an available processor or external-payment-link adapter plus a Dogecoin/crypto fixture, accepts a direct donation in the configured local currency, and cannot access another Spaceâ€™s credentials, customers or financial history. Switching merchant/buyer country or currency recomputes eligible methods without source-code changes. Disabling crypto removes its UI/network work but preserves authorized records; re-enabling restores it.
- The owner exports supporters, contributions, agreements, entitlements and reconciliation data, disables one provider, and retains the canonical history and supporter identities. The system explicitly reports which recurring mandates cannot be migrated automatically.
- A permitted Space owner creates a shirt through the chosen POD sandbox/fixture, publishes it, receives a cart order, completes sandbox/crypto payment, submits fulfillment exactly once, receives production/tracking updates and notifies the customer without site-admin action. A forced failure appears in the exception queue and pauses only that order/connection.
- Failure of a payment, patron, crypto, marketplace or fulfillment provider does not affect public editorial reading or unrelated payment options.

Non-goals: raw card handling, crypto custody, seed/private-key storage, pooled creator funds, escrow, multi-recipient settlement, bounties with acceptance disputes, automatic irreversible crypto debits, promises that processor billing mandates are universally portable, pretending unavailable APIs work, certified accounting/tax preparation, multiwarehouse ERP, tax/legal guarantees, or unapproved autonomous monetization.

Update compliance/capability docs and PROJECT_STATE.md, run tests, and stop.
```

---

## Prompt 14 of 15: First-party analytics, goals, attribution, command dashboard, and actionable reporting

```text
Continue from the integrated publishing platform. Read AGENTS.md, PROJECT_STATE.md, privacy controls, campaign/content/member/commerce contracts, and mapped analytics research. Implement this milestone directly and stop at its acceptance gate.

This milestone connects content â†’ distribution â†’ audience â†’ conversion/revenue without turning analytics into surveillance or presenting incomparable provider metrics as equivalent.

Required outcomes:

1. Define a versioned first-party event taxonomy with event ID, occurred/received time, site/brand, anonymous/session/member identity policy, content/campaign/channel/referrer/UTM context, device/region coarse data, consent basis, and schema version. Use minimal data and configurable retention.
2. Implement privacy-aware collection for page views, sessions/returning visitors, read depth/engagement, outbound/internal clicks, site search, media engagement, forum/thread/post views and contribution events, signups, forms, follows, social outbound links, affiliate/product/support clicks, completed contribution/payment events from trusted server-side sources, downloads, event registration, and configured goals. Respect consent and Do Not Track policy as documented.
3. Implement durable aggregation and retention jobs in PostgreSQL first. Define raw-event access, rollups, deletion, late events, bot filtering, internal traffic, timezone, unique-count approximation, and backfill/version migration.
4. Implement goals for newsletter/member signup, one-time contribution, recurring-support start/renewal/cancellation, external patron signal, product purchase where known, affiliate click/conversion where available, book purchase, lead/contact/volunteer, download, media subscription, and event registration.
5. Implement bounded attribution models beginning with transparent last-non-direct and first-touch views. Preserve path examples such as social â†’ article â†’ signup and podcast â†’ article â†’ affiliate click. State uncertainty; do not infer external conversions without provider evidence.
6. Normalize imported social/email/payment/patron/commerce metrics while preserving processor, payment method/rail, merchant and buyer region at the allowed privacy granularity, definition, time window, grain, fees, presentment and settlement currency, exchange-rate provenance and reconciliation status. Do not sum incompatible metrics, mix gross with net, or call clicks revenue.
7. Build analytics views for website, content, authors/topics/series, forums/community health, media/books, campaigns/crowdfunding, audience/email, social, supporters/subscriptions, commerce/affiliates, search, and returning readers. Crowdfunding views distinguish contribution count, gross, fees/known net, recurring support, reward fulfillment and campaign conversion; they never imply externally unverified expenses or outcomes. Forum reporting must distinguish healthy participation and solved/helpful outcomes from raw outrage-generating reply counts; include unanswered threads, moderation load, trusted-new-member progression, search landings, discussion-to-editorial promotion and index-quality states.
8. Build the main exception-driven attention dashboard: drafts/reviews, scheduled calendar, social failures, moderation and unanswered/high-value discussion, Space capability/creator approvals, security alerts, new members/subscribers/supporters, failed renewals/disputes/unreconciled or reorged crypto events, cart/order/POD submission and tracking failures, provider-specific paused operations, quota pressure, expiring credentials, backup/system health, failed jobs and updates. Show traffic/content/campaign/product performance secondarily. Each exception links to the scoped action, owner and retry/pause history; healthy automation should require no daily site-admin review.
9. Implement data export and deletion propagation, role-based revenue/customer visibility, query performance safeguards, and tests for double counting, retries, timezone boundaries, bot/internal filtering, and consent changes.

Acceptance gate:

- A test journey from social-tagged link â†’ article â†’ newsletter signup appears once in the correct funnel and attribution views.
- A test journey from campaign â†’ support page â†’ completed contribution appears once with correct gross amount, fee/net provenance, currency and provider attribution.
- Replayed events/webhooks do not double count.
- A content update, email delivery, affiliate click, and known order retain distinct provenance and definitions.
- A public thread landing from search, receiving a helpful answer, and later producing an editorial draft remains traceable without treating raw reply volume as quality.
- The dashboard identifies at least one forced operational failure and links to the action that resolves it.
- A normal creator order/fulfillment flow completes without site-admin action, while a forced provider failure appears once, identifies the affected Space/connection/order and leaves unrelated creators and public reading healthy.

Non-goals: black-box multi-touch claims, fingerprinting, data resale, a separate data warehouse, or external BI infrastructure without measured need.

Update metric dictionary/privacy docs and PROJECT_STATE.md, validate calculations and full suite, and stop.
```

---

## Prompt 15 of 15: Imports, exports, legacy migration, final hardening, Renegade Party launch, and release proof

```text
Continue from the completed platform milestones. Read AGENTS.md, PROJECT_STATE.md, every architecture decision, operations runbook, capability matrix, threat model, metric dictionary, and mapped migration research. Implement this milestone directly and stop only when the release acceptance gate passes.

This milestone proves the signature ownership promise and prepares the first credible Renegade Party production release. It is not permission to hide unfinished work; classify it honestly.

Required outcomes:

1. Implement a versioned import framework with source adapter, discovery, mapping preview, validation, dry run, deterministic IDs/idempotency, resumable batches, media transfer, progress, warnings, error report, rollback boundary, and redirect output.
2. Implement highest-value importers in dependency order: Markdown, RSS, JSON/CSV mapping, WordPress export/API, Ghost, Medium/Substack where lawful/exportable, podcast RSS, YouTube through the existing adapter, and a documented Legacy CMS mapping path. Include a forum migration path for the userâ€™s legacy phpBB-style archive and prioritized adapters/mappers for phpBB, bbPress/WordPress, Discourse or other supplied exports only where their official/exported formats are available. Do not screen-scrape around access controls. Preserve posts/pages, forum hierarchy, threads/posts, stable authors, timestamps, attachments, quotes/reply relationships, slugs/legacy URLs, media, taxonomy, SEO, redirects and moderation state where feasible, with an explicit unsupported-field report.
3. For legacy templates, implement an explicit conversion-assistance pipeline rather than claiming instant perfect conversion: inventory template structure/assets, map recognizable regions to registered components/tokens, import assets, generate a conversion report, and require visual/editor review. Preserve legacy URLs with redirects. Keep unconvertible code isolated and reported.
4. Implement complete portable export: versioned content/RetentionPolicy/tombstone data plus Markdown where representable, media originals/derivatives/encrypted blobs manifest, authors, Members, non-secret LinkedIdentity and public encryption-key references, profiles/Spaces/capability grants, relationships, blocks/mutes, publications/blogs/forums, calendar/events, albums/portfolios, privacy rules, subscribers/supporters/customers, comments/threads/posts/moderation, authorized normal/encrypted conversation envelopes/receipts/reports, carts/orders/products/POD references, merchant/provider references, campaigns/crowdfunding/tiers/updates/entitlements, taxonomy and financial history. Exclude secrets, OAuth tokens, passkey private material, message private/recovery keys unless a Member explicitly exports their separately encrypted recovery package, wallet private keys, raw payment credentials and provider secrets. Include checksums and an importable manifest. State that processor billing mandates and external fulfillment accounts may not transfer automatically.
5. Prove round-trip portability in a clean disposable installation. Compare counts, stable IDs where promised, relationships, slugs, dates, media checksums, redirects, and rendered representative pages. Document expected lossy fields.
6. Perform release hardening: dependency/security review, secret scan, threat-model closure, passwordless bootstrap/linking/recovery tests, Reown/SIWX nonce-domain-chain-account-replay and smart-account verification tests, wallet-versus-payment separation, client-only/SSR and dependency-matrix tests, profile-customization injection tests, profile/album/conversation privacy tests, encrypted-envelope tamper/key-loss/rotation/recovery/plaintext-leak tests, retention/burn/cache/backup-boundary tests, Space/merchant isolation, cart/payment/crypto/POD idempotency and webhook tests, permission matrix, upload/SSRF/OAuth/job race tests, CSP, proxy/origin configuration, rate limits, backup/restore, disaster recovery, failed-provider behavior, migration rehearsal, update/rollback, logging/redaction and diagnostic export.
7. Perform accessibility, cross-browser, mobile, performance, SEO/schema/feed, cache invalidation, search, and visual regression audits against defined budgets. Fix release blockers and record nonblocking debt.
8. Create the Renegade Party production configuration/theme package using public extension contracts only. Seed/convert enough real representative content to prove articles/op-eds, sources, books/media, a Member Space/blog, photographer portfolio/album, self-service forum, normal/encrypted/burnable message, comments/moderation, personal and publication calendars, social campaign, crowdfunding campaign with a reward/update, newsletter/community digest, two regionally distinct payment-method fixtures, Renegade Simple Crypto Pay fixture, cart/order, POD shirt and product/affiliate surfaces without hard-coding them into core.
9. Define release tiers in the UI/docs: production-ready core, beta modules, experimental adapters, and deferred capabilities. Provider claims must state live/sandbox/fixture verification and access requirements.
10. Produce operator, Space creator, editor, moderator, merchant, theme developer, adapter developer, security/encryption/recovery, retention/burn, backup/restore, upgrade, migration, troubleshooting, privacy, managed-hosting transfer and launch documentation. Provide a release checklist and redacted support bundle.
11. Run a launch rehearsal from a clean isolated VPS-style deployment: passwordlessly bootstrap the owner; install; restore/import; connect available providers; connect an EVM wallet through Reown AppKit and authenticate through Renegade-owned SIWX verification; create/recover a Member with two identities; prove connect-without-signature is not login and that the site works with Reown unavailable; grant a Space blog/album/forum/store/donation/crypto/POD capabilities; publish; customize the Space; create private/public/burnable media; operate a scoped forum; exchange/encrypt/burn/report/block a message; accept one immediate sandbox payment, one asynchronous/local-method fixture payment, one AppKit-initiated server-verified crypto payment and one Dogecoin/manual-wallet fixture payment; prove that an ineligible country/currency/method is hidden; complete a cart/POD order without site-admin action; force one exception; restart; back up; update from the previous fixture release; export; transfer to a second isolated host; detach any management connection; and serve the public site.

Acceptance gate:

- A clean installation can import or restore the representative dataset and render equivalent canonical content with redirects and media intact.
- The forum hierarchy, threads, posts, authors, timestamps, attachments, reply/quote relationships, moderation state and retained legacy permalinks survive the migration/round trip within the documented fidelity boundary.
- A full export can be restored without relying on Renegade-owned infrastructure.
- Supporter identities, contribution history and entitlements survive the round trip; processor-controlled recurring mandates are reported separately rather than falsely claimed as portable.
- Members, profiles/Spaces, relationships, albums/portfolios, visibility rules and authorized message history survive backup/restore and version upgrade without leaking private data or authentication secrets.
- Encrypted-message plaintext and private/recovery keys never appear in server storage/logs/backups; a burn removes keys and scheduled data within the documented boundary while holds and unavoidable recipient copies are represented honestly.
- A permitted creator independently starts a blog, album/portfolio, forum, donation surface and POD store; payment/crypto/POD provider ownership remains scoped to that Space, locally eligible payment methods are capability-discovered rather than hard-coded, routine operation completes automatically and a failure becomes an actionable exception.
- The installation remains operational after transfer to isolated customer-controlled infrastructure with managed-hosting control detached.
- Renegade Party runs as configuration/theme/content over the reusable core.
- Backup restore, job restart, provider isolation, security, accessibility, performance, SEO, and critical editorial/social journeys have recorded pass/fail evidence.
- The release notes accurately distinguish complete, beta, experimental, fixture-tested, and deferred features.

Do not add new feature families during hardening. Fix release blockers, record later work with revisit triggers, update PROJECT_STATE.md to a release handoff, tag/version only if the user has authorized repository release operations, and stop.
```

---

## Milestone dependency and proof map

| Prompt | Primary proof                                                                                                                                                                              | Unlocks                                                           |
| -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
|      1 | Reproducible kernel with optional-capability, compatibility, passwordless identity, Space, retention/encryption, commerce and update contracts                                             | All implementation without foundational rework                    |
|      2 | Passwordless bootstrap plus proven install/update/jobs/backup and two isolated transferable deployments                                                                                    | Safe self-hosting and managed-hosting readiness                   |
|      3 | Site hosts capability-driven Spaces, publications, blogs, albums/portfolios, forums and expiring content over one spine                                                                    | Every content/community/module schema                             |
|      4 | Complete sourced editorial lifecycle                                                                                                                                                       | Productâ€™s flagship promise                                     |
|      5 | Theme-independent publications, profiles, portfolios, forums and privacy-safe discovery                                                                                                    | Real audience and search discovery                                |
|      6 | Nondeveloper builds a finished site or expressive safe personal Space from guided components                                                                                               | Starter-site/profile/template promise                             |
|      7 | A pinned Reown/SIWX wallet flow and other passwordless identities safely unlock Member Spaces, blogs, albums, forums and normal/encrypted/burnable messages                                | Independent passwordless social/community platform and safe forms |
|      8 | Optional module/provider lifecycle survives disable, replacement and compatible upgrades without data loss                                                                                 | Sustainable plug-and-play integrations                            |
|      9 | Optional AI assists but cannot take control                                                                                                                                                | Contextual intelligence everywhere                                |
|     10 | Media imports/derivatives publish as first-class content                                                                                                                                   | Multimedia publisher promise                                      |
|     11 | One source becomes an audited multi-network campaign through a shared personal, Space and publication calendar                                                                             | Distribution command center and operating calendar                |
|     12 | Consented subscriber receives durable scheduled email                                                                                                                                      | Owned audience loop                                               |
|     13 | A Space owner launches a creator-owned crowdfunding campaign, accepts locally eligible processor/crypto methods, sells a POD shirt through cart/order automation and owns portable records | Global autonomous creator commerce and financial sovereignty      |
|     14 | Real journeys are attributed and operational failures surface as actionable exceptions                                                                                                     | Decision-making without daily babysitting                         |
|     15 | Clean round trip, update, autonomous creator rehearsal and transfer between isolated hosts                                                                                                 | Credible production and managed-hosting launch                    |

## Scope rule for the named integrations

The inventory names dozens of vendors. A core release should not claim every named connection merely because an interface exists. Each adapter must carry one of these statuses:

- **Live verified:** exercised against the production API with authorized credentials.
- **Sandbox verified:** exercised against an official sandbox/test environment.
- **Contract verified:** passes recorded-fixture and generic contract tests but still needs live credentials.
- **Scaffolded:** manifest/configuration exists, but operational behavior is not complete.
- **Deferred:** intentionally not implemented, with prerequisite and revisit trigger recorded.

This distinction prevents â€œplug-and-playâ€ from becoming a collection of buttons that do not work.

## Immediate execution instruction

Resume at **M04-C** only. Read `PROJECT_STATE.md`, the M04 card, ADR-0005, current schemas, and relevant research index entries. Preserve M04-A, M04-B and Milestones 1-3.5 exactly as evidenced; do not regenerate the repository, rewrite completed migrations, or implement a later milestone. Implement revisions, workflow, scheduling, citations, previews, permissions and the documented editorial acceptance scenario, then reassess M05.
