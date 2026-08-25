# Research Notes

## Evidence and authority

The authority order from `BUILD_PLAN.md.md` is:

`explicit current user requirement -> accepted ADR/contract -> working repository behavior -> current authoritative technical evidence -> research recommendation -> agent preference`

There are currently no accepted ADRs, source-code contracts, installed dependency versions, or research index entries in the repository. Therefore, all report-derived statements below are **inputs to verify and decide**, except where the current milestone prompt itself declares a core stack or product constraint.

## Relevant source inventory

| Source                                                                         | Research date/cutoff stated in file | Relevant Milestone 01 findings                                                                                                                                                                  | Status for this packet                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUILD_PLAN.md.md`, Prompt 1                                                   | Not separately dated                | Declares the sequence, required foundation outcomes, authority order, core stack, modular-monolith default, proof gate, and documentation obligations.                                          | Current milestone requirement; authoritative for packet scope.                                                                               |
| `docs/research/Renegade_CMS_Architecture_Report.md`                            | Not stated                          | Portable content core; modular monolith; stable IDs; PostgreSQL; Payload/Next substrate; local-first Docker; DB-backed jobs; public/private boundaries; export, audit, and versioned contracts. | Architecture proposal; likely primary source for cross-system design. Freshness and acceptance must be recorded in the future index/ADR set. |
| `docs/research/COMMENT_IDENTITY_SECURITY_ARCHITECTURE_REPORT.md`               | 2026-08-10                          | Separate staff/public identity domains; PostgreSQL policy/audit data; edge plus application controls; opaque sessions; redacted security events; database constraints for invariants.           | Security architecture proposal. Its concrete provider and Cloudflare recommendations remain conditional.                                     |
| `docs/research/Template-System-Architecture-Report.md`                         | Not stated                          | Content/presentation separation; versioned theme contracts; trusted-code boundary; portable layout IR; accessibility/performance test expectations.                                             | Future-presentation input. Only its boundary principle affects M01 contracts.                                                                |
| `docs/research/Renegade_CMS_Social_Publishing_Architecture_Report.md`          | 2026-08-10                          | Provider-neutral contracts, PostgreSQL as durable state, worker separation, explicit idempotency/reconciliation, capability state.                                                              | Future-distribution input. M01 should reserve contract patterns, not implement social work.                                                  |
| `docs/research/Renegade-CMS-Media-Distribution-Command-Center-Architecture.md` | 2026-08                             | Durable media/campaign boundaries, worker isolation, direct uploads, UTC/IANA time treatment, append-only attempts.                                                                             | Future media/distribution input. Its Payload Jobs choice must be verified against installed Payload version.                                 |
| `docs/research/ai-seo-content-discovery-engine-report.md`                      | 2026-08-10                          | Provenance, stable IDs, lifecycle, adapter boundaries, human approval, SSR and deterministic validators.                                                                                        | Future intelligence input. It conflicts with the current low-complexity baseline in places.                                                  |
| `docs/research/renegade-cms-maximalist-audio-publishing-research-prompt.md`    | Not a report; no result date        | States research questions and desired evaluation criteria for audio/TTS.                                                                                                                        | Research prompt, not an architecture decision or evidence source. It must not be treated as accepted design.                                 |

## Findings to carry into foundation design

1. The product must be a portable, self-hosted publishing platform whose core is not coupled to Renegade Party branding.
2. The intended implementation shape is a TypeScript modular monolith, with Next.js, Payload, PostgreSQL, and Docker identified by the milestone prompt as the core stack.
3. PostgreSQL should be the durable system of record for relationships, transactions, scoped authorization, audit, and job state; JSON/JSONB is limited to structured/versioned payloads rather than universal relational data.
4. Cross-system mutations need authorization, validation, auditability where appropriate, explicit failure behavior, and idempotency where external side effects are possible.
5. Stable internal IDs, public/private data separation, UTC timestamps, and append-only audit/operational records recur across the research corpus.
6. Provider-specific behavior belongs behind contracts and capability discovery; external failure must not break public reading or ordinary editorial work.
7. Theme/presentation data must not become canonical content data. This is an M01 boundary, not a request to build the theme system now.
8. Security-sensitive events require redaction and retention boundaries. Secrets must remain outside source, normal logs, fixtures, browser payloads, and diagnostic exports.

## Settled decisions for planning

These are settled only because the Milestone 01 prompt states them directly; implementation details remain undecided until codebase evidence exists.

| Decision                                                                                            | Basis                                          | Boundary                                                                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Use a modular monolith as the architectural default.                                                | `BUILD_PLAN.md.md` general rules and Prompt 1. | No network service/event bus/search cluster without measured need and a revisit trigger.   |
| Treat Renegade Party as a first production implementation/theme, not core-domain logic.             | `BUILD_PLAN.md.md` introduction and Prompt 1.  | Neutral naming and fixture data are required.                                              |
| Target the core stack of Next.js, React, Tailwind, Payload CMS, PostgreSQL, TypeScript, and Docker. | `BUILD_PLAN.md.md`, Prompt 1.                  | Existing installed versions win; do not replace or invent versions without audit evidence. |
| Create the canonical project-state handoff and research index in M01.                               | `BUILD_PLAN.md.md`, Prompt 1.                  | Neither file currently exists; do not backfill fictional completion evidence.              |

## Conflicts and tensions requiring explicit handling

| Topic               | Conflicting or tensioned claims                                                                                                                                            | Required resolution path                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline operations | The architecture report favors app + Postgres + local media as a base. The SEO report’s final architecture includes Redis, Neo4j, object storage, and home-server workers. | Accept the minimal self-hosted baseline for M01 only if installed-stack evidence supports it; record measured triggers for optional infrastructure rather than adopting the SEO target architecture now. |
| Job system          | Architecture/security reports recommend a DB-backed job table initially. Social/media reports recommend Payload Jobs Queue in a dedicated worker.                          | Verify installed Payload version and its jobs semantics before selecting the M02 implementation. M01 may define job identity/idempotency conventions but must not claim a job backend exists.            |
| Media storage       | Architecture report recommends local media first with an S3 adapter; media command-center report recommends S3-compatible direct multipart uploads for large media.        | Use a storage-provider boundary. Defer the default production storage choice until M02/M10 and deployment evidence; do not make an M01 smoke test depend on external object storage.                     |
| Security edge       | Identity report recommends Cloudflare as the first edge provider but requires provider-neutral application policy. The build plan says not to hard-code Cloudflare.        | Record a provider-neutral proxy/edge boundary; treat Cloudflare specifics as deployment documentation pending operator choice.                                                                           |
| Public identity     | Identity report recommends a first-party Member identity service separate from Payload admin users.                                                                        | Preserve the separation as a future M07 design constraint; M01 must not create unreviewed auth schemas or authentication claims.                                                                         |
| Visual editor       | Template report recommends Puck; build plan requires re-evaluation against installed stack in M06.                                                                         | Do not add Puck or record it as accepted in M01.                                                                                                                                                         |
| Audio source        | The audio file is a research prompt, while media reports make architecture recommendations.                                                                                | Index it as a prompt/question set, not authoritative research. Obtain a completed, dated source before technology selection in M10.                                                                      |

## Stale or unverified claims

- All report claims about current library support, APIs, prices, quotas, platform terms, and provider capabilities need primary-source revalidation at the implementation date.
- Payload version compatibility, including Lexical integration, PostgreSQL adapter behavior, storage adapters, direct uploads, and jobs queue semantics, cannot be inferred because no `package.json` or lockfile is present.
- Current Next.js, React, Tailwind, Node.js, Docker Compose, PostgreSQL, test tooling, and CI compatibility are unknown.
- Cloudflare tier economics, provider review requirements, OAuth scopes, social quotas, and TTS/audio provider comparisons are time-sensitive and out of scope for this foundation packet.
- The report inventory has not been hashed for duplicates or assigned authoritative/superseded status because `docs/research/INDEX.md` is missing.

## Unresolved choices

1. Canonical repository location and whether an unlisted implementation must be imported before scaffolding.
2. Package manager, Node.js LTS line, exact framework/library versions, and Windows-local versus WSL/container developer path.
3. Single-app versus monorepo layout, based on the actual codebase and deployment needs.
4. Payload integration boundary: direct usage in the app versus a first-party repository/policy wrapper, including the minimum viable package/module organization.
5. Migration tool ownership, seed convention, test database isolation, and rollback/downgrade policy.
6. Job backend and worker process mechanism, to be selected from installed Payload capabilities in M02.
7. Initial local media persistence and the deployment prerequisites that would warrant object storage.
8. License, contribution policy, CI provider, and release/versioning convention.
