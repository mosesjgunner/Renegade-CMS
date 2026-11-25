# RC3-21 Baseline — AI, Identity & Governance

Base: fresh GitHub main `a1140b1bfa77893938e9c481fa3e8fc42307eed8` (merge of PR #147).
Method: five parallel read-only code audits against the ledger claims in
`docs/rc3/RC3-90-AREA-LEDGER.md` rows #57–68 and `docs/rc2/RC2-ENGINEERING-DEBT.md`
DEBT-02. No tests were re-run for this baseline; test claims below describe what
the committed suites assert, verified by reading them.

## #57 AI provider gateway — ledger: E2 (harness-bounded)

Substantiated as harness-bounded. `src/modules/ai/` (contracts/gateway/connections/
workflows/persistence/budget-reservation) with two provider keys only
(`ai.openai-compatible` HTTPS, `ai.ollama` loopback-only). Connections/credentials
persisted (`ai-connections`/`ai-credentials`, encrypted envelope, budget leases).
No auto-selection: a proposal without an explicit active connection degrades to a
persisted `no-provider` proposal. No fixture provider exists in `src/`; the
loopback story is the real Ollama adapter plus a test-only HTTP fixture
(`tests/browser/ai-proposal-workflows.spec.ts`).

## #58 AI writing tools — ledger: E2 (harness-bounded)

Substantiated as harness-bounded. 18 rewrite tasks are registered in
`AI_TASKS`, but exactly one (`editor.improve-selection`) can traverse a normal
surface (workflow loader + update mapping + route + AiStudio). The other 17 are
registry entries executable only by direct gateway calls in tests.

## #59 AI content intelligence — ledger: E2 (metadata-seo journey) / E1 (taxonomy, related-links)

The metadata-seo journey is real and complete: gateway instruction + strict
output validator, workflow loader, AiStudio review, transactional PATCH
apply/decline with site scoping, stale-target 409, revision-id check, row
locking, and attribution (`requestedBy`/`decidedBy`/`application.actorId`/
`auditId`). Browser-proven end to end.

Baseline defects found:

- **A revision gap on the headline journey.** A metadata-seo apply changes only
  `seoTitle`/`seoDescription`; `ensureEditorialCompanion()` creates a
  `revision-records` row only when the canonical body hash changes, so an SEO
  apply creates **no new revision**, and `application.revisionId` silently
  points at the pre-existing current revision. Revision-record attribution
  (`createdBy`, AI provenance) is likewise not wired for applies.
- **No route-level negative proofs.** Nothing asserts a target is unchanged
  while a proposal sits undecided; cross-site POST/PATCH refusals, replay /
  double-decide 409s, and role negatives are proven only at gateway/loader
  unit level or for the preview route in the browser suite.
- Taxonomy and related-links are registry-only (no instruction, no output
  validator, no workflow, no route, no UI) — E1 is accurate and stands.
- Space scope is absent from the normal surface (no `space` field on
  connections/proposals; routes never pass `spaceId`). Named gap; not built
  in this pass.

## #60 AI agent system — ledger: E0; DEBT-02 open

Claim verified precisely: `invokeScopedAgentTool`
(`src/modules/ai/agents.ts`) has exactly one caller in `src/` — the other
unreachable entry point, `invokeIntegrationAgentTool`
(`src/modules/integrations/agent-service.ts`). The system has zero routes,
zero UI, zero jobs. Neither function contains grant issuance, an approval
flow, or audit persistence: grants are a caller-supplied string array,
approval is a status string / self-asserted boolean, and the audit trail is
an in-memory array on the returned run object.

Mount decision (lead direction: mount-first): **mount** the read-only
`content.draft.read` tool from `RENEGADE_TOOL_MANIFESTS` as a new action on
the existing `POST /api/admin/integrations` route — server-side manifest,
grants derived from `resolveOperatorGrantContext`, target scope derived from
the loaded content record, summary-only output, audit persisted to the
existing `integration-audit-events` collection (readable via the route's own
GET and Payload admin). Approval-gated (`payments.refund`) and
idempotency-required (`content.draft.propose_change`) tools stay unmounted:
no approval persistence or durable dedupe exists, and mounting them would be
approval theatre. Expected outcome: #60 E0 → E1 (mounted, one read-only tool,
persisted audit) — not E2: no persisted run record, no approval journey, no
second tool. `AgentToolRuntime` (`src/modules/extensions/agent-runtime.ts`)
is a second, also-unmounted implementation — flagged as a follow-up honesty
item, outside DEBT-02's file scope.

## #61 Translation & localization — ledger: E2

The engine (`src/modules/editorial/localization/`) implements a complete
lifecycle — group → request → fixture draft → completeness/policy gates →
human review → approve → publish + hreflang — behind `POST
/api/admin/translations`, and the lifecycle is well tested in-memory and at
route-handler level with mocked auth. Baseline gaps:

- **In-memory only.** Groups/requests/variants live in singleton Maps; no
  persistence. Restart loses everything.
- **No bridge from real content.** `create-group` requires a hand-constructed
  source document; nothing reads a Payload `content` doc or its revision.
- **Publish is a dead end.** It flips an in-memory status and returns an
  hreflang object; it creates no localized content document and no public
  readback exists.
- The only provider is a hardwired prefix fixture
  (`SimulatedTranslationProviderAdapter`); **no live provider is implemented
  at all** (ledger wording stands: none verified).
- The admin UI tab is display-only; there is no connection to the AI
  proposal flow (no translate task key exists).

This pass builds the real-content bridge (loader from a `content` doc + its
current revision) and publish materialization (a real localized content
document with public readback), exercised through the translations API.
Engine-state persistence remains a named gap; #61 stays E2 with refreshed
evidence.

## #62 Authentication infrastructure — ledger: E2 (local)

Substantiated. Staff auth is passkey-only Payload auth (`users`,
`admin_sessions`, `@simplewebauthn/server`, HS256 JWT + server-side session
check); member auth is magic-link + passkey with hashed single-use tokens
and revocable hash-only sessions (`src/modules/identity/member-identity.ts`).
The I-02 magic-link completion fix (DEBT-18) is verified in code: the GET
route builds a mutable 302 response so `Set-Cookie` no longer throws.
Wallet auth is deliberately stubbed off. No RC3-21 build required; evidence
refreshed by the gauntlet.

## #63 Renegade ID — ledger: E0

Confirmed absent: no Renegade ID code, DID/VC types, or claim-vs-signal
machinery exists anywhere in the tree. Primitives available locally:
`linked-identities` (unique `(providerKey, externalSubject)`, `verifiedAt`/
`revokedAt`/`expiresAt`), hashed scoped tokens (`identity-tokens`), member
sessions with a `createdFrom` enum, and runtime-only RSA signing
(`src/modules/network/key-management.ts` + `network-signing-keys`).

Bounded slice built in this pass: local enrollment issuing a signed,
scoped, expiring assertion (RS256 via `jose`, install key from env, public
key published from the install), a challenge-bound verification
("handshake") through normal API routes, demonstrated scopes (a required
scope not in the assertion is refused), and revocation that actually
revokes (verification fails after revoke). Enrollment recorded as a
`linked-identities` row with `providerKey: 'renegade-id'`; actions audited
to `identity-audit-events`. Cross-install federation is **NOT RUN** /
owner-decision. Expected outcome: E0 → E1.

## #64 Enterprise identity — ledger: E0

Confirmed absent: no OIDC/SAML/SSO/SCIM code, config model, or library
exists. Available primitives: OAuth2 authorization-code + PKCE machinery
(`src/modules/extensions/connection-runtime.ts`), `jose` for ID-token
verification, and the `ai-connections`/`ai-credentials` config+secret split
as the configuration pattern. `linked-identities.kind: 'oauth'` and
`member-sessions.createdFrom: 'oauth'` enum values exist but have never had
a writer.

Bounded slice built in this pass (the isolated test-IdP slice the governing
plan assigns to RC3): an IdP connection record (config + enveloped secret)
whose issuer is restricted to loopback origins (the local-peer gate
pattern), an authorization-code + PKCE sign-in flow against a loopback
fixture IdP in tests, ID-token verification against the fixture JWKS,
identity mapping to `linked-identities` + a member session with
`createdFrom: 'oauth'`, and revocation of the link. External/production
IdPs are **NOT RUN** / owner-decision — the slice refuses non-loopback
issuers by construction. Expected outcome: E0 → E1.

## #65 Roles & permissions — ledger: E2 (server-side)

Substantiated server-side. One grant engine
(`src/modules/operations/operator-grants.ts`) resolves staff roles via the
linked member's `member-site-roles` rows (fail-closed), and its access
adapters guard essentially every collection; cross-site relationship
writes are blocked in `canonical-shared.ts`. The strongest in-suite proof
is `tests/integration/tenant-authorization-matrix.integration.test.ts`
(21 tests, real DB). Caveats recorded: the cited "38 holds / 0 breaches"
H-02 matrix is an external script whose fixture world lives outside the
repo (not reproducible from the repo alone); parts of
`tests/unit/authorization-matrix.test.ts` (§§3–7) are tautological; role
differentiation below site level is coarse in the access layer; no
browser-level role matrix exists (already flagged GUI-08C). No RC3-21
build; level stands at E2 with this refreshed, honest evidence. New
route-level role negatives land in this pass's AI/agent test files.

## #66 Security Center — ledger: E1

E1 is accurate. `/admin/security` exists and its listed actions work from
the surface — passkey list/add/remove, recovery-code rotation,
owner-only staff invitations, sign-out — all wired to real routes, with a
recorded surface journey in RC3-06 evidence. But the component is a
personal staff-auth page: the BUILD_PLAN posture content (threat/event
log, blocked attempts, bans, rate-limit and origin warnings, backup
status) does not exist in it, and no failed-login tracking surface exists
in `src/`. Credential redaction (PR #98) is real and unit-proven at
service level (`logging.ts` `redact()`, social account view, credential
scan). No RC3-21 build; level stands at E1, gap named for RC4.

## #67 Privacy & data governance — ledger: E2

Export and deactivation are genuinely surface-wired (settings UI →
`GET /api/member-auth/export` with ownership refusal for foreign member
ids; deactivate revokes all sessions). The anonymization service
(`finalizeMemberDeletion()`) genuinely anonymizes member + profile,
revokes entitlements and sessions, and writes the audit event.

**Red gap: deletion is unreachable.** `POST /api/member-auth/delete`
returns **410** ("Permanent deletion is deferred"), and
`requestMemberDeletion()` / `finalizeMemberDeletion()` have **no caller in
`src/`** — no route, admin action, or job. Anonymization is proven only
against an in-memory store at unit level. Anonymization is also partial:
`linked-identities` rows are not revoked by finalize.

This pass wires deletion through normal surfaces: the member-facing
request route (replacing the 410), an operator finalize action, linked-
identity revocation inside finalize, and a real-DB journey proving
export → request → finalize → anonymized readback, with negatives.

## #68 Retention & ephemeral content — ledger: E1

Policy fields (`retentionFields()`), read-path hiding (burn → 410,
tombstone/expired → 404, holds preserve readability), and discovery
filtering are real and unit/integration-proven. Analytics events are
stamped `expire-at` from `SiteSettings.privacy.rawEventRetentionDays`,
and a purge task (`analytics-retention-cleanup`, daily cron) is
registered.

**Red gap: the purge never runs.** `src/scripts/run-jobs-worker.ts`
services only the `media`, `operations`, and `commerce` queues; the
retention task sits on the `analytics` queue, and no other
`handleSchedules`/`jobs.run` call exists in `src/`. The handler also
ignores `retentionHold`/`retentionMode`, and no test executes the handler
(the test named for retention cleanup proves a pure helper the handler
does not use). No purge exists for community/content records;
`rollupRetentionDays` has no consumer.

This pass fixes the worker's queue list, adds the hold/mode predicate to
the handler, and proves the purge by executing the handler against aged,
held, and unexpired records with before/after readback. Community/content
purge remains unbuilt and is named as such.
