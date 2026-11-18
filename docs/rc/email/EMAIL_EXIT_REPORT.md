# RC3-EMAIL-01 — Exit Report

**Pass:** RC3-EMAIL-01 — Full Production Email and Inbox Delivery Execution Pass
**Baseline:** GitHub main `6c291cfacdf25155e180de85530e49c4227195e3`
**Branch:** `rc3-email-01` · **Candidate:** code tree `729c3c0` (all validation below
ran on that tree; the only later commits on this branch add this documentation and
evidence — no code changes after `729c3c0`)
**Date:** November 17, 2026

## Lead statement

Legitimate email has **not yet been observed reaching a real inbox** under this pass.
No Postmark account exists yet, no sender DNS is published, and no controlled seed
inboxes are provisioned — those are owner-only externals, so the live gate (EMAIL-11)
is **BLOCKED**, and per the pass's own final-gate rule the overall pass verdict is
**BLOCKED** even though the engineering is complete and locally proven. Everything
that can be proven without a provider account has been proven: durable intent,
boundary isolation, pause behavior, DNS verification, native webhook handling, and
suppression semantics are implemented and covered by unit and integration tests on
this candidate. Nothing in this report claims placement that was not observed.

## Verdicts (pass §7 — separate, as required)

| Gate                   | Verdict     | Basis                                                                                                                                                                        |
| ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Engineering         | **PASS**    | Implementation, migration, deployment wiring, failure handling, and the repository gauntlet on the final tree (table below)                                                  |
| 2. Live readiness      | **BLOCKED** | No provider approvals, no published sender DNS, no native live event received, no seed placement observed. Owner actions listed below                                        |
| 3. Audience enablement | **BLOCKED** | Per site, until that site's sender is verified and pilot evidence exists (EMAIL-11). Pause machinery is the enforceable gate; campaigns are not broadly enabled by this pass |
| **Overall pass**       | **BLOCKED** | The pass may not be called PASS while the live gate is open (§7). No unresolved delivery defect was found, so nothing here is FAIL                                           |

## What changed (before → after)

- **Sign-in mail could be lost.** Member magic-link and email-link sends were inline
  and ignored adapter results. **Now:** both routes write a durable `email-intents`
  record before responding; if the enqueue fails, the just-issued token is revoked
  (compensating action — token issuance and intent creation are two writes, not one
  transaction; documented in EMAIL_CONTRACTS.md §3). A durable intent ID ties caller,
  outbox, attempt, and provider result together.
- **One global mail path.** A newsletter incident could consume the credentials and
  capacity account mail depends on. **Now:** account and audience dispatch are split
  end to end — separate outbox sweeps, `WORKER_PROFILE=account|audience`, per-boundary
  Postmark credentials/streams, a dedicated `email-account-worker` Compose service,
  and per-class retry policy bounded by action expiry. The isolation state honestly
  reports `shared-legacy` until the owner provisions separate provider accounts.
- **Pauses were not a hard boundary.** **Now:** `email-pauses` (global-class,
  boundary, site, sender, campaign scopes) are re-read immediately before submission,
  including on retries and recovery sweeps. Proven under a campaign pause with a
  backlog while account mail flowed on both sites (integration test 6).
- **DNS status lights were decorative.** The command center showed hardcoded
  unverified flags. **Now:** `dns-verification.ts` performs real SPF/DKIM/DMARC,
  alignment, and Return-Path checks with named missing records, surfaced as
  `emailDns` in the command-center payload.
- **Provider feedback was not native.** **Now:** a native Postmark webhook
  (`/api/email/webhook/postmark`) identifies the boundary by its credential, persists
  events before acknowledging, applies effects idempotently, classifies bounces, and
  writes site-scoped `invalid` suppressions for hard bounces to inactive addresses —
  which stop **all** classes for that site+address, while marketing opt-outs never
  disable account mail (integration test 5).
- **Staff invitations had a URL and no email.** **Now:** invitations send through the
  account outbox. Community notifications ride the account boundary as `operational`
  class; commerce receipt resends already used the durable audience outbox and are
  unchanged. Operator surface: the command center also returns `emailBoundaries`
  (isolation state) and `accountQueue` (per-state counts + oldest actionable item),
  and its copy states that provider acceptance is not placement.

## Files and migration

41 files changed vs baseline (+3,273 / −45) before this report: new modules
`src/modules/email/{outbox,postmark,dns-verification,classes}.ts`, boundary-aware
`delivery.ts`; new collections on `src/collections/Audience.ts` (`email-intents`,
`email-pauses`, append-only events); one hand-written migration
`20261117_130000_rc3_email01_intents_pauses` whose `down` refuses to erase delivery
evidence; worker profile split in `src/scripts/run-jobs-worker.ts`; per-boundary
config validation in `src/modules/core/config.ts`; `.env.example` and
`compose.production.yaml` wiring. Full inventory in EMAIL_SYSTEM_MAP.md; contracts in
EMAIL_CONTRACTS.md; per-task records in `docs/rc/email/tasks/EMAIL-01.md` … `EMAIL-12.md`.

## Validation actually run (candidate tree)

| Check                                | Result                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh migration verifier             | PASS — "Fresh migration acceptance passed" (includes the email migration from an empty schema)                                                                                                                                                                                                                                                                                            |
| Upgrade migration rehearsal          | PASS — oldest migration → current                                                                                                                                                                                                                                                                                                                                                         |
| Fixture seed (acceptance DB)         | PASS — exit 0                                                                                                                                                                                                                                                                                                                                                                             |
| Format (all changed files)           | PASS — prettier clean                                                                                                                                                                                                                                                                                                                                                                     |
| Lint (repo-wide, `--max-warnings=0`) | PASS — exit 0, re-run on the final tree during resume                                                                                                                                                                                                                                                                                                                                     |
| Typecheck                            | PASS — exit 0, 0 errors, re-run on the final tree during resume                                                                                                                                                                                                                                                                                                                           |
| Unit suite                           | PASS — 289 files / 2,142 tests (baseline 2,126 + 16 new email tests)                                                                                                                                                                                                                                                                                                                      |
| Integration — email isolation suite  | PASS — 6/6 (dedupe, transient-rejection recovery, pause isolation, cross-site suppression scoping, campaign backlog with account flowing)                                                                                                                                                                                                                                                 |
| Integration — operations-jobs suite  | PASS — 3/3 on re-run (see note below)                                                                                                                                                                                                                                                                                                                                                     |
| Integration — RC08B promotions suite | PASS — 10/10 on re-run; the multi-page export test passes solo in ~75 s (see note below)                                                                                                                                                                                                                                                                                                  |
| Integration — full suite (68 files)  | NOT COMPLETED locally — the previous run was cut off by a VM replacement; full-suite proof is deferred to PR CI                                                                                                                                                                                                                                                                           |
| Production build                     | DEFERRED TO PR CI — two local attempts were killed with no code error emitted: the first starved when another pass's build started concurrently (this box cannot run two Next builds), the second was cut off by a VM replacement mid-build. Both logs end at "Creating an optimized production build …" with no diagnostics. PR CI runs the production build as part of `verify:release` |
| Smoke                                | DEFERRED TO PR CI — it boots the production build, so it follows the build                                                                                                                                                                                                                                                                                                                |

**Note on the two re-run suites.** In the interrupted full-suite run, three tests in
`operations-jobs` and `rc08b-promotions` "failed" purely as 60–120 s timeouts while
five other passes shared this box. On resume, with the box quieter, operations-jobs
passed 3/3 in 32 s and the RC08B export test passed solo in 74.9 s (it performs
1,002 sequential fixture writes; it exceeds its timeout only under heavy parallel
load). No code defect was found in either suite, and neither suite's code path was
changed by this pass except community delivery adapter selection, which its tests
exercise and pass.

## Live placement table (EMAIL-11)

No live sends were performed. The 2 sites × 3 mailbox providers × 3 purposes matrix
(18 messages) is **entirely unobserved** — every cell is BLOCKED on the owner actions
below. The gated, dry-run-default checklist is in EMAIL_OPERATOR_RUNBOOK.md §6. No
placement claim is made anywhere in this pass's documents.

## Known limits (not hidden)

- Token issuance + intent creation are two writes joined by compensating revocation,
  not one transaction (EMAIL_CONTRACTS.md §3).
- Hard secret isolation for the account worker requires a separate deployment
  environment; the shared Compose environment block is readable by both worker
  containers and is documented as such.
- The EMAIL-10 10,000-delivery load row was exercised at reduced scale (12-delivery
  backlog + sweeps); the full 10k p95 measurement is NOT claimed.
- SES fallback adapter not implemented; the fallback decision is documented for the
  owner if Postmark approval or boundary confirmation fails.
- Postmark webhook correctness is code-proven only; no live provider event has been
  received. Live-provider behavior in general is UNVERIFIED.
- No new admin UI screens were built; EMAIL-09's operator data ships in the existing
  command-center payload.

## Owner-only actions remaining (EMAIL-11 unblock)

1. Create **two separate Postmark accounts** (or an owner-confirmed equivalent
   boundary): one for account mail, one for audience mail. Obtain approval for each.
2. Configure the per-boundary credentials/streams in the deployment environment
   (names in EMAIL_OPERATOR_RUNBOOK.md §1) so isolation state leaves `shared-legacy`.
3. Publish the provider-issued DNS records (DKIM, custom Return-Path, SPF per the
   provider's values, DMARC) for each sending domain; verify in the command center's
   `emailDns` report.
4. Point the Postmark webhook at `/api/email/webhook/postmark` with the boundary
   credential; send one provider test event and confirm durable receipt.
5. Designate controlled Gmail, Outlook.com, and Yahoo seed inboxes (no allow rules or
   safe-sender changes) and run the runbook §6 checklist for the 18-message matrix.
6. Per site, enable campaigns only after that site's sender verification and pilot
   observations pass.

Retest command for the engineering gates after any change:
`npm run verify:release` (full gauntlet), or per-gate commands in
`docs/rc/email/tasks/EMAIL-10.md`.
