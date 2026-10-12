# RC1 Acceptance Matrix — Stage 01 (Gemini)

Date: 2026-10-11  
Release Target: `v0.1.0-rc.1`  
Candidate Baseline HEAD: `764e77dd869564e13ab5add7e10710f2cb6c61e9`  

This matrix defines every required acceptance claim across the 7 stages of the RC1 completion run.  
Classifications:
- **Valid Retained Proof**: Existing historical proof structure verified; re-execution required on final candidate.
- **Rerun Required**: Valid implementation exists; must be executed on frozen clean candidate.
- **Repair Required**: Code or configuration defect identified; must be repaired in Stage 02 before gate execution.
- **Genuine External Prerequisite**: Capability depends on unavailable external real-world artifact or live provider; safe degraded behavior verified instead.

---

| # | Exact Action | Actor / Configuration | Expected Outcome | Proof Gate | Dependencies | Classification |
|---|---|---|---|---|---|---|
| **01** | Inventory workspace, tracked modifications, worktrees, and user edits | Developer / CLI | Full inventory recorded without modifying databases, media, or secrets | Stage 01 | None | **Rerun Required (Completed)** |
| **02** | Reconcile historical reports, resolve 27/1 skip contradiction, define Golden Journey | Release Lead / Documentation | Contradiction traced to `phase-a-install-login.spec.ts:16`; A–T journey documented from source | Stage 01 | Gate 01 | **Rerun Required (Completed)** |
| **03** | Run focused pre-commit checks (unit, lint, format, diff) | Developer / Node & Python | 22 unit files pass (155 tests), 0 lint errors, Prettier check passes, clean diff | Stage 01 | Gate 01, 02 | **Rerun Required (Completed)** |
| **04** | Repair fulfillment address invention, error swallowing, and UI fake success | Core Engineer / Commerce | Validation error on missing address; failure recorded; truthful UI status | Stage 02 | Gate 03 | **Repair Required** |
| **05** | Repair telecom simulator global state leakage across sites | Core Engineer / Telecom | Enforce tenant isolation so site A simulation never affects site B | Stage 02 | Gate 03 | **Repair Required** |
| **06** | Enforce default `LOCAL_E2E_TEST_MODE: false` in restore compose | DevOps / Compose | Realistic non-test-mode environment configuration | Stage 02 | Gate 03 | **Repair Required** |
| **07** | Review and verify operator site create form permissions | Security Engineer / Identity | Ensure missing-data form permission does not allow unscoped global writes | Stage 02 | Gate 03 | **Repair Required** |
| **08** | Commit reviewed candidate repairs and freeze clean SHA in isolated worktree | Release Lead / Git | Clean commit SHA with zero uncommitted working tree changes | Stage 02 | Gates 04–07 | **Rerun Required** |
| **09** | Execute complete build, lint, typecheck, and full unit test suite (1,193+ tests) | Test Runner / Clean Candidate | Clean exit code 0 across npm ci, format:check, lint, typecheck, vitest unit suite | Stage 02 | Gate 08 | **Rerun Required** |
| **10** | Execute fresh database migrations on disposable Postgres | DB Runner / Clean Candidate | All additive migrations apply cleanly from empty database | Stage 02 | Gate 09 | **Rerun Required** |
| **11** | Execute synthetic upgrade migration suite (`test:migrations:upgrade`) | DB Runner / Synthetic Baseline | Migration from baseline fixture completes without data corruption | Stage 02 | Gate 10 | **Rerun Required** |
| **12** | Execute integration test suite (270+ tests) | Test Runner / Disposable DB | All integration suites pass against isolated database | Stage 02 | Gate 11 | **Rerun Required** |
| **13** | Execute presentation bundle build and verify assets | Next.js Build / Clean Candidate | Production Next.js build succeeds with valid route manifests | Stage 02 | Gate 12 | **Rerun Required** |
| **14** | First-run setup: capture bootstrap token and register owner passkey | Anonymous Visitor -> Owner / Standard profile | Token validated; WebAuthn virtual authenticator registers resident key; owner created | Stage 03 | Gate 13 | **Rerun Required** |
| **15** | Negative first-run: invalid token, expired token, wrong origin | Malicious Actor / WebAuthn | HTTP 400 Bad Request; zero tokens echoed; registration refused | Stage 03 | Gate 14 | **Rerun Required** |
| **16** | Offline owner recovery: run recovery CLI script and generate single-use code | Server Operator / CLI | Emergency recovery credential generated; passkey reset allowed once | Stage 03 | Gate 14 | **Rerun Required** |
| **17** | Staff invitation: owner invites admin and editor to Site 1 | Owner / Admin UI | Invitation token generated; sent to email sink with expiration timestamp | Stage 03 | Gate 14 | **Rerun Required** |
| **18** | Staff enrollment: invited staff registers first WebAuthn passkey | Invited User / Browser | Token consumed atomically; role assigned; subsequent re-use denied | Stage 03 | Gate 17 | **Rerun Required** |
| **19** | Multi-site isolation: staff on Site 1 attempts to access Site 2 resources | Staff (Site 1) / Multi-Site | HTTP 403 Forbidden; cross-tenant document and media access blocked | Stage 03 | Gate 18 | **Rerun Required** |
| **20** | Site Settings: update title, description, active theme and save/reload | Owner / Admin UI | Settings persisted in database; verified upon page reload | Stage 03 | Gate 14 | **Rerun Required** |
| **21** | Document locking: acquire lock on article, test concurrent edit conflict and release | Editor A & Editor B / Admin UI | Editor A holds lock; Editor B receives conflict warning; lock releases cleanly | Stage 03 | Gate 18 | **Rerun Required** |
| **22** | Core Authoring: create draft page and article with body, media, and taxonomy | Editor / Admin UI | Draft saved; unauthenticated visitors cannot read draft (draft isolation) | Stage 03 | Gate 21 | **Rerun Required** |
| **23** | Publication workflow: publish article and verify public page, schema, and RSS | Anonymous Visitor / Frontend | HTTP 200; OpenGraph and JSON-LD present; RSS feed updated; sitemap contains URL | Stage 03 | Gate 22 | **Rerun Required** |
| **24** | URL redirect: change article slug and verify permanent redirect | Anonymous Visitor / Frontend | Request to old URL returns HTTP 301/308 redirecting to new slug | Stage 03 | Gate 23 | **Rerun Required** |
| **25** | Module profiles: verify Lean, Standard, and Enabled-all registrations | Server Boot / Lean vs All | Lean loads only core; Standard loads core+audience+shop; All loads everything | Stage 03 | Gate 13 | **Rerun Required** |
| **26** | Commerce: create guest cart, add product, verify server-side pricing | Anonymous Visitor / Frontend | Price calculated authoritatively by server; client manipulation ignored | Stage 04 | Gate 25 | **Rerun Required** |
| **27** | Commerce: bind cart to authenticated member and merge items | Member / Frontend | Cart re-bound to member ID; duplicate items merged with correct quantity | Stage 04 | Gate 26 | **Rerun Required** |
| **28** | Commerce: generate checkout proposal and verify cryptographic signature | Customer / API | Proposal hash matches item SKUs, prices, and taxes; tampering rejected | Stage 04 | Gate 27 | **Rerun Required** |
| **29** | Commerce: local-test checkout execution | Customer / Local Test Mode | Zero-cost checkout completes; order created with state `paid` | Stage 04 | Gate 28 | **Rerun Required** |
| **30** | Commerce: Stripe webhook simulation with signature verification | Stripe Webhook / Test Secret | Webhook signature verified; payment recorded; idempotent replay ignored | Stage 04 | Gate 28 | **Rerun Required** |
| **31** | Commerce: digital delivery download grant creation and download | Customer / Download API | Time-limited signed grant key allows byte-identical file download | Stage 04 | Gate 29 | **Rerun Required** |
| **32** | Commerce: order refund and download grant revocation | Admin / Commerce Dashboard | Refund recorded; digital download grant key immediately returns 403/410 | Stage 04 | Gate 31 | **Rerun Required** |
| **33** | Commerce: subscription plan checkout, billing status, and entitlement grant | Member / Subscriptions | Active subscription grants member access to paywalled article | Stage 04 | Gate 29 | **Rerun Required** |
| **34** | Commerce: POD fulfillment routing to emulator adapter | Order Worker / POD Emulator | POD job created with idempotency key; emulator records submission | Stage 04 | Gate 29, 04 | **Rerun Required** |
| **35** | Commerce: manual fulfillment package creation | Fulfillment Operator / Admin | Manual physical package queued with recipient shipping manifest | Stage 04 | Gate 29, 04 | **Rerun Required** |
| **36** | Audience: double opt-in newsletter subscription and confirmation | Anonymous Visitor / Frontend | Confirmation token emailed to test sink; clicking confirms subscription | Stage 04 | Gate 25 | **Rerun Required** |
| **37** | Audience: unsubscribe and suppression list enforcement | Subscriber / Frontend | Unsubscribe token adds email to suppression list; worker skips address | Stage 04 | Gate 36 | **Rerun Required** |
| **38** | Community: member discussion post, profanity filter, staff moderation | Member -> Staff / Community | Post submitted; profanity flagged; staff approves/hides post | Stage 04 | Gate 25 | **Rerun Required** |
| **39** | Provider boundaries: unconfigured provider degraded-safe behavior | System / Unconfigured SMTP/Stripe | Informative warning logged; fallback to sink/manual; no unhandled crash | Stage 04 | Gate 25 | **Rerun Required** |
| **40** | Production Docker build: verify multi-stage build, embedded SHA, non-root user | Docker / Clean Candidate | Image builds cleanly; user is non-root; web and worker binaries present | Stage 05 | Gate 08 | **Rerun Required** |
| **41** | Security audit: review npm audit advisories with primary-source dispositions | Security Analyst / Repo | Every advisory documented with path, reachability, and disposition | Stage 05 | Gate 40 | **Rerun Required** |
| **42** | Security negatives: CSRF verification, origin headers, replay attacks | Penetration Tester / API | Mutating requests without valid origin/CSRF rejected with HTTP 403 | Stage 05 | Gate 40 | **Rerun Required** |
| **43** | Security negatives: zero token/secret leakage in logs, traces, and API responses | Security Analyst / System Logs | Sanitization verified across all responses and server logs | Stage 05 | Gate 40 | **Rerun Required** |
| **44** | Background worker: process outbox jobs, restart mid-batch, verify exactly-once | System Operator / Worker | Interrupted worker resumes; zero duplicate emails, publications, or charges | Stage 06 | Gate 40 | **Rerun Required** |
| **45** | Operational backup: create consistent database dump and media archive | Operator / Backup CLI | Checksummed archive generated; secrets and runtime tokens excluded | Stage 06 | Gate 44 | **Rerun Required** |
| **46** | Clean restore: restore archive into fresh empty container instance | Operator / Restore CLI | Database schemas match; media checksums match; owner passkey login works | Stage 06 | Gate 45, 06 | **Rerun Required** |
| **47** | Customer upgrade: verify historical production customer backup upgrade | Operator / External Predecessor | Declared as Genuine External Prerequisite; synthetic path verified | Stage 06 | Gate 11 | **Genuine External Prerequisite** |
| **48** | Final Immutable RC1 Acceptance Gate | Independent Lead / Stage 07 Sol | All mandatory gates 01–46 passed on clean final candidate SHA | Stage 07 | Gates 01–46 | **Rerun Required** |
| **49** | Final Release Tag & Handoff (`v0.1.0-rc.1`) | Release Lead (Sol Only) | Signed local git tag `v0.1.0-rc.1` created only after verified PASS | Stage 07 | Gate 48 | **Pending Sol Gate 07** |
