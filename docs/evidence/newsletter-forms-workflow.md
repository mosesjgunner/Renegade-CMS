# Newsletter and forms workflow evidence

## Scope delivered

- Payload admin exposes form definitions, versioned schemas, submissions, audience lists, consent history, messages and deliveries. Form schemas validate a bounded set of renderable field types; file inputs are explicitly not supported by the public endpoint.
- A published public form is rendered at its configured `publicPath`. Submission enforces same-origin browser requests, a honeypot, a short-window IP-digest rate limit, server-side schema validation and an idempotency key. Stored submissions retain the schema and reviewed consent snapshot, while raw IP addresses are not retained.
- A form may request a newsletter subscription only when its configured action receives an explicit checked consent field. The originating form and schema revision are placed in both the consent event and source provenance. It uses the existing list policy, including double opt-in.
- Marketing dispatch snapshots active list memberships, deduplicates delivery records, excludes suppressions at snapshot time and immediately before send. Transactional confirmation is deliberately not subject to marketing suppression. Provider callbacks use raw-body HMAC verification, bind to an existing site-scoped delivery, and create idempotent suppression evidence.
- SMTP requires a non-injected valid sender mailbox, TLS validation and bounded timeouts. Development capture is suitable for tests; disabled mail returns a permanent recorded failure rather than attempting a network send.

## Operational limitations and retention

- Notification routing remains the existing staff-only submission inbox/workflow surface; no CRM or audience automation engine was added.
- Form submissions use the existing retention controls, remain private to staff, and can be exported or deleted through Payload's scoped admin/API controls. Attachment metadata exists for governed/private media, but public file upload is intentionally rejected until a scanning and direct-upload workflow is introduced.

## Verification

`npx vitest run tests/unit/audience-contracts.test.ts tests/unit/audience-newsletter-workflow.test.ts tests/unit/email-delivery.test.ts tests/unit/config.test.ts` and `npm run typecheck` pass. The focused suite proves schema/consent validation, pagination and idempotent newsletter snapshots, suppression exclusion, exact webhook signing, development/disabled/SMTP adapter behavior, sender-header rejection, and error normalization. The local app returned HTTP 200 from `/health/live` and `/health/ready`. Browser E2E could not run because this environment reported no available browser binding; it is not fabricated as passing evidence.
