# RC3-21 Result — AI, Identity & Governance

Base: `a1140b1bfa77893938e9c481fa3e8fc42307eed8` (fresh GitHub main, merge of PR #147).
Baseline: `docs/rc3/evidence/RC3-21/BASELINE.md` (five read-only audits, one per area).
Scope: ledger rows #57–68 + DEBT-02. Every verdict below is backed by the
gauntlet on this tree (see §Gauntlet) or by the cited focused suite.

## Per-row verdicts

### #57 AI provider gateway — E2 (harness-bounded), stands

Re-verified at route level in this pass: the proposal journey and its
negative proofs now run against the real routes and a real database
(`tests/integration/rc321-ai-proposal-journey.integration.test.ts`, 5/5),
with the loopback Ollama fixture as the provider. No hosted AI provider
has been verified; the harness-bounded qualifier stands unchanged.

### #58 AI writing tools — E2 (harness-bounded), stands

`editor.improve-selection` re-proven end to end at route level, including
a persisted revision on apply. The other 17 registered writing tasks
remain registry-only (no workflow loader, no route) — recorded plainly in
the ledger note; no credit taken for them.

### #59 AI content intelligence — E2 (metadata-seo) / E1 (taxonomy, related-links), stands; one real defect fixed

The baseline found that a metadata-seo apply persisted **no new
revision**: `ensureEditorialCompanion()` creates a `revision-records`
row only on a body-hash change, so `application.revisionId` silently
named the pre-existing revision. Fixed: the apply route now calls the new
`recordEditorialMetadataRevision()` (`src/modules/editorial/persistence.ts`)
when a field-only apply leaves the companion revision unmoved — a real
revision row is persisted in the same transaction, `application.revisionId`
names it, its `createdBy` is the deciding user, and AI provenance
(`proposalId`, `auditId`, `providerKey`) is recorded on the proposal's
`application` object (the revision-records schema has no provenance
field; none was invented). Negatives proven at route level: undecided
proposal leaves the target byte-identical; decline changes nothing;
replay and stale applies return 409; cross-site decide returns 403;
unauthenticated and grant-less staff are refused. Taxonomy and
related-links remain registry-only at E1. Space scope remains absent
from the normal surface (named gap, not built).

### #60 AI agent system — E0 → E1. DEBT-02 CLOSED (mounted)

The read-only `content.draft.read` tool is mounted as the
`agent.draft-read` action on the production route
`POST /api/admin/integrations`. The manifest is looked up server-side
from `RENEGRADE_TOOL_MANIFESTS`; grants are derived from the operator
grant context; target scope is derived from the loaded content record
(never from the request); output is a summary projection (no draft body);
and one `integration-audit-events` row is persisted per invocation —
allowed and denied alike — with the write deliberately not swallowed,
readable afterwards via the route's own GET and the Payload admin.
Proof: `tests/integration/rc321-agent-mount.integration.test.ts` (4/4),
plus a happy-path unit case for `invokeScopedAgentTool`.
E1 is the honest ceiling for this: exactly one read-only tool, no
persisted run record, no approval journey. Approval-gated
(`payments.refund`) and idempotency-required
(`content.draft.propose_change`) tools remain **unmounted** — neither
entry point contains approval persistence or durable dedupe, and
mounting them would be approval theatre. `AgentToolRuntime`
(`src/modules/extensions/agent-runtime.ts`) is a second, still-unmounted
implementation, flagged in the ledger as a follow-up honesty item.

### #61 Translation & localization — E2, stands with the real-content legs built

New: `src/modules/editorial/localization/content-bridge.ts`.
`create-group-from-content` loads a real `content` document and pins its
companion revision; `publish` materializes a real localized content
document (published only if the source is published; linkage recorded in
the discovery-overrides seam: locale, alternates, source id, group id),
and a materialization failure is reported as a 502 with the engine state
stated, never as a silent success. Legacy hand-built groups keep their
prior publish behavior. Journey proven through the route handlers with a
real passkey staff session against the real DB
(`tests/integration/rc321-localization-journey.integration.test.ts`, 1/1;
flow-05 suites unregressed: 9/9 unit, 3/3 integration). Named gaps that
remain: engine state is in-memory only (no persistence), and no live
translation provider is implemented — the simulated fixture is the only
adapter.

### #62 Authentication infrastructure — E2 (local), stands

Audit re-substantiated the claim in code: passkey-only staff auth with
server-side session checks; member magic-link + passkey with hashed
single-use tokens and revocable hash-only sessions; the I-02 magic-link
completion fix (mutable 302 + Set-Cookie) verified in the current route.
No build was required; the area's suites pass in the gauntlet.

### #63 Renegade ID — E0 → E1 (bounded local slice)

Built: `src/modules/identity/renegade-id.ts` + routes under
`/api/renegade-id/` (enroll, revoke, challenge, assert, verify, keys).
An authenticated member enrolls (recorded on `linked-identities` with
`providerKey: 'renegade-id'`; `kind: 'oauth'` is used because the
collection's kind enum has no renegade-id value — the providerKey is the
discriminator); the install issues a short-lived RS256 assertion (jose;
key from env, following the ActivityPub key pattern; JWKS published at
the keys route; routes answer 503 when unconfigured) carrying granted
scopes and, for the handshake, a challenge nonce; verification checks
the signature, expiry, a required scope, and the live enrollment row on
every call — so revocation actually revokes (proof: verify succeeds,
revoke, verify refuses with `enrollment_revoked`). Challenge nonces are
short-lived signed tokens with in-process single-use burning
(cross-process single-use would need a shared store — documented in the
module). Evidence: `tests/unit/rc321-identity.test.ts` (21) +
`tests/integration/rc321-identity-journey.integration.test.ts` (3).
Cross-install federation is **NOT RUN** and remains an owner decision;
claim-vs-signal consistency remains posture, not implementation.

### #64 Enterprise identity — E0 → E1 (isolated test-IdP slice)

Built: `enterprise-idp-connections` / `enterprise-idp-credentials`
collections (config + enveloped secret, Ai pattern, generic access
denied), `src/modules/identity/enterprise-idp.ts`, and
`/api/auth/sso/start|callback`. The slice is loopback-bound by
construction: a `beforeValidate` hook refuses any non-loopback issuer at
save time on every write path. The flow runs authorization-code + PKCE
(S256) against a loopback fixture IdP, verifies the ID token against the
fixture JWKS, maps the subject to `linked-identities` (`kind: 'oauth'` —
the enum's first writer), links or creates the member under the existing
registration policy, and mints a member session with
`createdFrom: 'oauth'`; the callback uses the mutable-302 + Set-Cookie
pattern from the magic-link fix. One migration
(`20261124_140000_rc321_enterprise_idp`, incl. the
`payload_locked_documents_rels` columns Payload requires) rehearsed
fresh and as an upgrade. Evidence: same identity suites as #63.
External/production IdPs are **NOT RUN** and remain an owner decision;
the full enterprise-SSO program stays 1.5+/2.0 scope, outside RC3's gate.

### #65 Roles & permissions — E2 (server-side), stands

Audit re-substantiated the single grant engine and its fail-closed
resolution, with the integration authorization matrix (21 tests, real
DB) green in the gauntlet. Caveats recorded in the ledger so the claim
is not over-read: the H-02 "38 holds / 0 breaches" matrix is an external
script with an out-of-repo fixture world; parts of the unit
authorization matrix are tautological; sub-site role differentiation is
coarse in the access layer; the interactive browser role matrix remains
open (GUI-08C).

### #66 Security Center — E1, stands

The surface's listed actions work from `/admin/security` (passkeys,
recovery-code rotation, owner-only staff invitations, sign-out), and
credential redaction is unit-proven at service level. The BUILD_PLAN
posture content (threat/event log, blocked attempts, bans, warnings,
backup status) still does not exist in the surface — named as an RC4
gap. No build in this pass; the level does not move.

### #67 Privacy & data governance — E2, stands; deletion wired end to end

The baseline's red gap is closed: `POST /api/member-auth/delete` no
longer returns 410 — it performs the deletion request (member session +
CSRF, mirroring the deactivate route); a new operator route
`POST /api/admin/members/deletion` (owner/administrator only, 409 when
the member is not deletion-pending) executes `finalizeMemberDeletion()`;
and finalize now also revokes the member's `linked-identities` rows.
Proven on a real DB (`tests/integration/rc321-governance-journey.integration.test.ts`,
4/4): export contains the member's data → request → staff finalize
refused → administrator finalize → anonymized readback (member and
profile anonymized, sessions revoked, linked identity revoked, exactly
one `member.deletion.finalized` audit event), plus the route negatives.
The operator-side cross-site governance queue remains absent (named gap).

### #68 Retention & ephemeral content — E2 (analytics purge journey) / E1 (community/content retention)

The baseline's red gap is closed for analytics: `run-jobs-worker.ts` now
services the `analytics` queue (the purge task previously sat on a queue
no worker ran, so it could never execute), and the handler now deletes
only `retentionMode: 'expire-at'` + `retentionHold: 'none'` rows past
expiry. The purge was executed against a real DB with before/after
readback: expired+unheld deleted; expired+legal-hold preserved;
unexpired preserved (governance journey, above). Community/content
records are still only hidden on read — no physical purge exists — and
`rollupRetentionDays` still has no consumer; both are named in the
ledger, and that leg stays E1.

## Gauntlet (final tree, CI order, local PG16)

- Fresh migrations: **PASS** — 178 migrations, incl.
  `20261124_140000_rc321_enterprise_idp`.
- Fixture seed: **PASS**.
- Upgrade rehearsal: **PASS** — the new migration applies on the prior
  schema (`20260914_110000_med_05_video_workflow -> current`).
- format:check (repo-wide, pinned prettier): **PASS**.
- lint: **PASS**.
- typecheck: **PASS**. Note: regenerating `payload-types.ts` with the
  repo's `generate:types` also normalized two pre-existing JSON-field
  types (`chunkManifest`, `creatorDetails`) and two doc comments; those
  four unrelated hunks were reverted, so the delivered generated-types
  delta is purely additive (+91/−0) and `creator-studio/submissions.ts`
  typechecks exactly as on the base.
- Unit: **PASS** — 368 files, **2,975 tests, 0 failed** (base 2,953;
  delta +22 = exactly the new identity unit tests + the agent
  happy-path case).
- Integration: **PASS** — **698 passed / 11 skipped / 0 failed** (base
  681/11; delta +17 = exactly the five new RC3-21 journey files:
  AI proposals 5, agent mount 4, localization 1, identity 3,
  governance 4).
- Production build + smoke: **NOT RUN** — the local rig cannot complete
  this repo's production build (standing limitation); GitHub CI is the
  arbiter, as in every RC3 pass.

Environment note: the VM was replaced mid-gauntlet (the first unit run
was killed with the machine). PostgreSQL was reinstalled, the role and
databases recreated, and the baseline re-established — fresh migrations,
seed, and upgrade rehearsal were all re-run green on the recovered rig
before the recorded unit/integration results.

Full logs: `~/workspace/rc3-wave3-logs/rc321-gauntlet-*`.

## What this pass deliberately did not do

- No hosted AI provider, live translation provider, external IdP, or
  cross-install federation leg was run or claimed; each is labeled
  NOT RUN / owner-decision in its row.
- No approval-gated or mutating agent tool was mounted (see #60).
- No engine persistence for localization, no community/content physical
  purge, no Security Center posture surface, no browser role matrix —
  each is named in its ledger row as the remaining gap.
