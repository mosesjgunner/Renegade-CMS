# RC3-EMAIL-01 — Email System Map

**Candidate baseline:** `main` @ `6c291cfacdf25155e180de85530e49c4227195e3` (PR #96 merge, 2026-11-17)
**Branch:** `rc3-email-01` · **Runtime:** Node v24.22.1, Next 16 / Payload 3.90, PostgreSQL
**Method:** executable code inspected at the baseline above. Sol's research report
(`production-email-report-sol-2026-11-17.md`, inspected at `f88ad5d`) was used as
leads only; every claim below was re-verified at `6c291cf`.

## Sol findings — reproduction check at 6c291cf

| Sol finding (at f88ad5d)                              | At 6c291cf     | Evidence                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global SMTP routing, one adapter for everything       | **Reproduces** | `selectEmailDeliveryAdapter()` in `src/modules/email/delivery.ts` returns one adapter (disabled / development-capture / smtp) for all categories                                                                                                                                       |
| Inline member sends ignore adapter results            | **Reproduces** | `src/app/(frontend)/api/member-auth/magic-link/request/route.ts` and `.../link/email/route.ts` `await adapter.send(...)` and discard the result; no durable record; a failed send still tells the user a link "will arrive"                                                            |
| No Payload email adapter configured                   | **Reproduces** | `src/payload.config.ts` registers no `email` adapter; Payload's own mail paths are unused by product flows                                                                                                                                                                             |
| Staff invitation returns a URL, sends no email        | **Reproduces** | `src/app/(frontend)/api/admin/staff/invite/route.ts` + `src/modules/operations/staff-enrollment.ts` build an enrollment URL from `APP_URL`; no send                                                                                                                                    |
| Shared audience dispatch/recovery                     | **Reproduces** | One task `audience-email-delivery` (`src/modules/audience/tasks.ts`) sends transactional + marketing through the same adapter/From; `recoverEmailOutbox()` is one unfiltered sweep over all `email-deliveries`, run by the single operations worker (`src/scripts/run-jobs-worker.ts`) |
| Stock Compose omits SMTP settings                     | **Reproduces** | `compose.production.yaml` passes only `EMAIL_MODE`; `.env.example` documents the single global SMTP set                                                                                                                                                                                |
| Incomplete provider feedback integration              | **Reproduces** | `/api/email/webhook` accepts only Renegade's own normalized events signed with a global `x-audience-signature` secret; no native provider webhook exists                                                                                                                               |
| SPF/DKIM/DMARC dashboard lights always "not verified" | **Reproduces** | `src/app/(frontend)/api/admin/audience/command-center/route.ts` hardcodes `spfVerified/dkimVerified/dmarcVerified: false`; no DNS lookup exists anywhere in the repo                                                                                                                   |

## What already works and is kept

- **Adapter contract** (`src/modules/email/delivery.ts`): `EmailDeliveryAdapter`
  with capabilities, health, sender readiness, optional reconcile; careful SMTP
  error normalization (timeouts classified `unknown`, never blindly retried);
  a deterministic development-capture sink with outcome simulation.
- **Audience outbox** (`email-deliveries` collection): durable rows with unique
  idempotency keys, leases, attempt budgets (4/cycle), unknown-outcome
  quarantine + reconciliation, send-time eligibility recheck
  (`canDeliverToSubscriber`), suppression ledger (`suppressions`,
  site + emailHash scoped), durable event ledger (`email-delivery-events`),
  RFC 8058 one-click headers on marketing sends.
- **Identity tokens**: magic-link tokens are stored hashed (`identity-tokens`),
  single-use, 15-minute TTL, 60-second reissue throttle, generic
  enumeration-resistant responses.

## Caller matrix (who sends what, at baseline)

| Caller                                         | Purpose / class                                   | Path at baseline                                                            | Recipient source           | Durable?               | Result used?       |
| ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------- | ---------------------- | ------------------ |
| `api/member-auth/magic-link/request`           | Member sign-in — `account`                        | Inline `adapter.send`                                                       | User-supplied email        | **No**                 | **No — discarded** |
| `api/member-auth/link/email`                   | Email linking confirm — `account`                 | Inline `adapter.send`                                                       | Authenticated member input | **No**                 | **No — discarded** |
| `api/admin/staff/invite`                       | Staff invitation — `account`                      | **No email sent** (URL shown to operator)                                   | Operator input             | n/a                    | n/a                |
| `modules/audience/service.ts` subscribe flow   | Newsletter confirmation — `audience_confirmation` | `email-messages` + `email-deliveries` + `audience-email-delivery` task      | Public signup              | Yes                    | Yes                |
| `modules/audience` campaigns/newsletters       | Campaigns, digests — `audience`                   | Same audience outbox/task                                                   | Subscriber snapshot        | Yes                    | Yes                |
| `modules/community/external-notifications.ts`  | Community notifications — `operational`           | Own task, inline `adapter.send`                                             | Member notification prefs  | Partial (task retries) | Yes                |
| `modules/telecom/tasks.ts`                     | Telecom email fallback — `operational`            | Inline `adapter.send` in task                                               | Telecom delivery record    | Partial                | Yes                |
| `api/admin/commerce/receipts/[orderId]/resend` | Receipt resend — `operational`                    | Creates an `email-deliveries` row                                           | Order record               | Yes                    | Yes                |
| Contact-form notifications                     | `operational`                                     | Form intake task (`audience/form-tasks.ts`) notifies via audience machinery | Form definition            | Yes                    | Yes                |

Sender identity at baseline: one global `EMAIL_FROM` for every row above.
Action links at baseline: built from global `APP_URL`, not the site's canonical
origin. Queues: one `operations` queue, one worker profile set
(default / commerce-only / media-heavy) — no account/audience split.

## Gap list (drives EMAIL-02…10)

1. Account mail has **no durable intent**: token issuance and send are two
   uncoordinated writes; send failures are silent and unrecoverable.
2. **No class isolation**: one adapter, one credential set, one From, one
   worker sweep. A campaign flood, audience quota exhaustion, or revoked
   audience credentials take account mail down with them.
3. **No production provider adapter**: SMTP only; no Postmark HTTP API, no
   stream selection, no provider message-ID correlation for account mail, no
   native provider webhooks.
4. **No real DNS verification** behind the dashboard authentication lights.
5. **No pause controls** evaluated at dispatch for class/site/campaign scopes.
6. **Suppression semantics incomplete for account mail**: a confirmed invalid
   mailbox does not stop account attempts; bounce classification in the
   normalized webhook collapses subtypes.
7. Staff invitations never reach the invitee by email.
8. Deployment wiring: Compose passes only `EMAIL_MODE`; no per-boundary
   secrets reach web/worker containers.
