# FLOW-05: Renegade CMoS Translation Groups, Localization Quality & Reliable Notifications

## Overview
Workflow Pass **FLOW-05** implements comprehensive **Content Localization, Translation Groups, Side-by-Side Review, Provider Boundaries, Deterministic Quality Gates, Reliable Notification Outbox, and Signed Webhooks/Events**, integrating directly with FLOW-01/02 and preceding the FLOW-04 Coordinated Release Gate.

Translation is strictly **human-controlled**: machine drafts are explicitly attributed with tokens, costs, and error metadata, and require mandatory human review and approval prior to publication or release. Notifications and webhook automation operate on an operationally reliable outbox pattern where external delivery failures never compromise workflow truth.

---

## Key Invariants & Architectural Capabilities

### 1. Translation Groups & Source Immutability (`src/modules/editorial/localization/contracts.ts`, `engine.ts`)
- **Conceptual Content Item Linking**: A `TranslationGroup` binds multiple locale variants (e.g., `en`, `es`, `fr`) to a single conceptual content entity.
- **Independent Locale Revisions**: Each locale retains its own canonical revision sequence, hash, canonical URL (`/es/articles/...`), SEO/discovery state (`seoTitle`, `seoDescription`), localized media choices (alt text and captions), and workflow lifecycle status (`draft`, `review`, `approved`, `published`).
- **Strict Non-Overwriting**: Creating, drafting, updating, or reviewing a target locale variant **never overwrites** the source document.

### 2. Translation Requests & Staleness Detection
- **Formal Request & Assignment**: Captures `sourceDocumentId`, `targetLocale`, pinned source revision sequence and hash (`sourceRevisionPin`), assigned `translatorId`, `reviewerId`, `dueDate`, and progress percentage.
- **Automated Staleness Detection**: When a source document advances to revision sequence $N+1$, `advanceSourceDocument` scans all translation requests pinned to revision $N$ or prior hashes, marks them as stale (`isStale = true`, `staleReason`), and dispatches `stale_translation` notifications.
- **Approval Guard**: The engine prevents approving stale translations (`CANNOT_APPROVE_STALE`) until the translator re-aligns the pin and updates the content.

### 3. Side-by-Side Review & Structured Completeness Checks (`src/modules/editorial/localization/completeness.ts`)
- **Deterministic 7-Point Completeness Inspection**:
  1. **Title**: Present, non-empty, and verified not to be an untranslated duplicate.
  2. **Body / Excerpt Blocks**: Block count comparison, plain text presence, and AST traversal.
  3. **Unsupported Node Visibility**: Unknown or corrupted rich-text/layout AST nodes fail visibly with fatal blockers (`TRANSLATION_UNSUPPORTED_NODE_TYPE`).
  4. **Links Validation**: Target links must be valid URLs; broken links or malformed protocols are flagged.
  5. **Media Alt & Captions**: Every media asset in the target must have localized `alt` text. Missing alt text produces a blocker.
  6. **SEO Bounds**: Validates `seoTitle` (10–70 chars) and `seoDescription` (40–160 chars).
  7. **Schema Facts & Presentation Slots**: Preserves author, publication dates, and presentation layout slots.
- **Direct Repair Links**: Every blocker and warning contains a direct `repairUrl` (e.g. `/admin/workflow/translations?id=...&focus=media`).

### 4. Translation Provider Boundary & Mandatory Human Review (`src/modules/editorial/localization/adapter.ts`)
- **Attributed Draft Action**: Pluggable provider adapter (`TranslationProviderAdapter`) creates drafts with comprehensive attribution metadata:
  - `provider`: Provider identifier (e.g. `simulated-ai-translator`, `deepl`, `renegade-ai`)
  - `model`, `tokensUsed`, `cost`, `generatedAt`
  - `isMachineDraft = true`
  - `humanReviewed = false`, `humanReviewerId = null`, `humanApprovedAt = null`
- **Mandatory Human Review Guard (`assertHumanReviewApproved`)**: Machine drafts are strictly forbidden from direct publication or release. Attempted publication without human review raises `HUMAN_REVIEW_REQUIRED`. Approval requires an authorized human reviewer ID.

### 5. Hreflang Alternates & Phantom Language Elimination (`src/modules/editorial/localization/hreflang.ts`)
- **No Phantom Languages**: Unreviewed, draft, changes-requested, or unpublished locale variants are strictly omitted from `alternateLocales`.
- **Self-Reference**: Every published page includes an alternate tag pointing to its own canonical URL with its own hreflang.
- **Canonical Consistency**: Each locale's `canonicalUrl` points to itself.
- **x-default**: Points to the source/default locale variant.

### 6. FLOW-04 Preflight Gate Integration (`src/modules/releases/gates.ts`, `policy.ts`)
- Added **Rule 11: Localization Quality & Translation Integrity Gate** (`rule-localization-quality`) to FLOW-04's `evaluateReleaseGates`.
- Evaluates all localized release artifacts:
  - Rejects stale translations (source advanced post-pin).
  - Rejects unreviewed machine drafts.
  - Rejects artifacts with unresolved completeness blockers.
- Enforces role-authorized waivers (`ReleaseGateRuleWaiver`) with authorizer, reason, and expiration dates.
- Incorporates localization properties into `computeReleaseFingerprint` to guarantee cache and gate invalidation upon modification.

### 7. Notification Preferences & Durable Outbox (`src/modules/editorial/localization/notifications.ts`)
- **Supported Event Types**:
  - `assignment`
  - `mention_comment`
  - `changes_requested`
  - `approval`
  - `due_overdue`
  - `schedule_release_failure`
  - `stale_translation`
  - `rights_quality_issue`
  - `completion`
- **In-App Zero-Provider Reliability**: In-app notifications are stored synchronously and are immediately queryable and markable as read without external services.
- **Decoupled Outbox Pattern**: External channels (email, webhook) are queued in a durable outbox with retry counts, exponential backoff, and last-error tracking.
- **Workflow State Immunity**: Failures in external delivery adapters **never roll back or compromise** editorial workflow state.

### 8. Webhook Automation, SSRF Protection & Secret Rotation (`src/modules/editorial/localization/webhooks.ts`)
- **HMAC SHA-256 Signatures**: Emits `X-Renegade-Signature: t=${timestamp},v1=${signature}` with timestamp tolerance checks.
- **Zero-Downtime Secret Rotation**: Supports both `primarySecret` and `secondarySecret`. Signatures signed with either key are accepted during migration.
- **SSRF Protection (`validateWebhookUrl`)**: Blocks private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), loopback (127.0.0.0/8, localhost, ::1), cloud metadata (169.254.169.254), non-HTTPS schemes, and embedded credentials.
- **Stable Identifiers**: Generates stable event IDs (`evt_...`), version `"1.0"`, and idempotency keys (`idemp_...`).
- **No Arbitrary Code Execution**: No `eval`, `new Function`, or dynamic script execution in webhook dispatch or automation rules.

---

## API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/translations` | `GET` | Retrieve translation group, requests, or variant status. |
| `/api/admin/translations` | `POST` | Perform lifecycle actions: `create-group`, `request-translation`, `draft-provider`, `update-target`, `submit-review`, `request-changes`, `approve`, `advance-source`, `realign-pin`, `publish`, `check-completeness`. |
| `/api/admin/notifications` | `GET` | List in-app notifications and preferences for the authenticated user. |
| `/api/admin/notifications` | `POST` | Execute `mark-read`, `update-preferences`, or `process-outbox`. |
| `/api/admin/webhooks` | `GET` | Query webhook delivery audit logs. |
| `/api/admin/webhooks` | `POST` | Manage webhooks: `register`, `rotate-secret`, and `test-dispatch`. |

---

## Verification Evidence

1. **Unit Test Suite (`tests/unit/flow-05-localization-workflow.test.ts`)**:
   - 9/9 PASS.
   - Verified translation groups, non-overwriting of source, staleness detection, side-by-side completeness, unsupported rich-text node rejection, AI draft attribution, human review guard, hreflang calculation with phantom exclusion, FLOW-04 preflight gate integration, notification outbox resilience, HMAC signing, secret rotation, and SSRF rejection.
2. **Integration Test Suite (`tests/integration/flow-05-localization-pass-gate.integration.test.ts`)**:
   - 3/3 PASS.
   - Tested HTTP API endpoints for translation lifecycle, notification preferences/outbox, and webhook secret rotation/dispatch.
3. **Full Repository Unit & Integration Suite**:
   - 98 test files passed / 518 tests passed cleanly.
4. **Static Typecheck**:
   - `tsc --noEmit`: 0 errors.
5. **Next.js Standalone Production Build**:
   - `npm run build`: verified clean compilation.
