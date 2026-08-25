# Open Architecture Questions

These questions are not blockers for the existing foundation slice. They identify decisions that should be resolved before the related capability is implemented or exposed as a durable platform contract.

## Operations and Deployment

- What is the first supported deployment shape beyond local development: single VPS, container host, managed platform, or another target?
- Which job runner will own background work once Payload jobs are not sufficient for scheduling, retries, and operational observability?
- What backup, restore, and migration rollback guarantees are required before production data is accepted?
- What health, diagnostics, and version endpoints should be public, staff-only, or operator-only?

## Identity and Security

- How will staff authentication and public member authentication remain separate in routing, session storage, and audit trails?
- Which public-member sign-in methods ship first: passkeys, email magic links, OAuth providers, signed wallets, or a staged subset?
- What is the minimum role and capability model needed before member-owned Spaces, publications, and contributor workflows launch?
- Which data classes require field-level encryption, redaction, or restricted operational access beyond ordinary application authorization?

## Content, Presentation, and Portability

- What is the canonical article revision model, and which revision data is exported as portable provenance?
- How are public routes allocated across site-wide pages, publications, member blogs, spaces, taxonomy paths, events, and timelines without route ambiguity?
- What is the first stable theme contract for templates, blocks, navigation, metadata, feeds, and structured data?
- Which export format becomes the first supported portability target, and how are unknown future fields preserved across import/export cycles?

## Providers, Commerce, and External Systems

- What provider capability keys must exist before social distribution, email delivery, commerce, and analytics adapters are implemented?
- How are provider secrets stored, rotated, audited, and excluded from exports, logs, fixtures, and client props?
- What payment records are canonical Renegade-owned records versus remote provider evidence?
- Which reconciliation model handles asynchronous provider state, webhooks, retries, and partial failures?

## Retention and Moderation

- Which modules are eligible for recoverable soft deletion, tombstones, manual burn, legal holds, and scheduled purge?
- What user-facing deletion language is allowed given backup retention, third-party distribution, screenshots, and recipient downloads?
- What moderation/audit evidence must be immutable even when public content is removed?
- When is cryptographic erasure required, and which encrypted payloads are in scope for the first implementation?

## Analytics and AI

- What first-party event schema is sufficient for analytics without leaking member, staff, secret, or restricted data?
- Which AI actions may propose changes, and which require explicit human approval before mutating content or configuration?
- What provenance is required for AI-generated drafts, edits, summaries, classifications, or moderation proposals?
- What data boundaries prevent AI and analytics modules from bypassing owning module contracts?
