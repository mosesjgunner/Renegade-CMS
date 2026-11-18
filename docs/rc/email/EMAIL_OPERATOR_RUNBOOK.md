# RC3-EMAIL-01 — Operator Runbook

## 1. Configuration

Email is configured per **provider boundary**. The account boundary carries
sign-in, invitation, and operational mail; the audience boundary carries
newsletter confirmations and campaigns. Each boundary can use its own
Postmark server token, From identity, quota, and webhook secret.

Legacy mode (no boundary config): everything uses the global
`EMAIL_MODE`/`EMAIL_FROM`/SMTP settings and the command center reports both
boundaries as **shared-legacy (degraded)** — functional, but NOT isolated.

Isolated mode, per boundary (account shown; audience mirrors it):

```
EMAIL_ACCOUNT_PROVIDER=postmark
EMAIL_ACCOUNT_FROM=Renegade Security <security@accounts.example.com>
EMAIL_ACCOUNT_POSTMARK_SERVER_TOKEN=<account server token>
EMAIL_ACCOUNT_POSTMARK_TRANSACTIONAL_STREAM=outbound
EMAIL_ACCOUNT_POSTMARK_WEBHOOK_SECRET=<webhook basic-auth password>
EMAIL_ACCOUNT_DKIM_SELECTOR=<selector issued by Postmark>
EMAIL_ACCOUNT_RETURN_PATH_HOST=bounce.accounts.example.com
```

Partial Postmark configuration is a startup error by design — the app will
not silently fall back to shared mail.

Workers: the default worker runs both outbox sweeps. For hard isolation run
the dedicated account worker as well:

```
docker compose --profile email-account up -d email-account-worker
```

(`WORKER_PROFILE=account` runs only the account sweep; `audience` runs
everything except the account sweep.) For hard _secret_ isolation, run the
account worker as a separate deployment whose environment contains only the
account variables — containers sharing the Compose environment block can
still read both variable sets.

## 2. Sender DNS setup (per sending domain)

1. In Postmark, add the sender domain on the correct **account** (account
   domains on the account-mail account, audience domains on the audience
   account). Copy the exact DKIM selector/record and Return-Path CNAME the
   provider issues — never invent values.
2. Publish: DKIM TXT at `<selector>._domainkey.<domain>`; Return-Path CNAME
   at the bounce host to `pm.mtasv.net.` (do NOT add a TXT beside the
   CNAME); DMARC at `_dmarc.<org-domain>` starting at `p=none` with a
   reporting address (never weaken an existing stricter policy).
3. Set `EMAIL_<BOUNDARY>_DKIM_SELECTOR` and `EMAIL_<BOUNDARY>_RETURN_PATH_HOST`,
   restart, and open the audience command center: the SPF/DKIM/DMARC lights
   now show live DNS results with the observed records and the exact missing
   item named.
4. Send a seed message to a controlled inbox and inspect the raw headers:
   SPF pass, DKIM pass with `d=` equal to the sending domain, DMARC pass
   with alignment. A provider "verified" badge alone is not sufficient.

## 3. Webhooks

Point each Postmark server's webhooks at
`https://<your-host>/api/email/webhook/postmark` with HTTP Basic credentials
whose password is that boundary's `EMAIL_<BOUNDARY>_POSTMARK_WEBHOOK_SECRET`.
Delivery, bounce, spam-complaint, and subscription-change events are applied
durably before acknowledgement; replays are deduplicated. A hard bounce the
provider marks inactive suppresses the address for that site across all
traffic classes.

## 4. "Where did this message stop?" — triage

1. **Account/operational mail:** find the row in `email-intents` (admin →
   Audience → Email Intents) by recipient or idempotency key. Read the four
   state dimensions independently: `submission` (did we hand it to the
   provider?), `receiving` (what did the provider report back?), `placement`
   (unobserved until a seed/observation says otherwise — "accepted" never
   means "inboxed"), `actionState`. The `events` log shows every attempt,
   pause hold, and provider event in order; `lastError` carries the safe,
   redacted failure category.
2. **Audience mail:** the delivery row in `email-deliveries` plus
   `email-delivery-events`; `outcome.code = dispatch-paused` means a pause
   is holding it (check `email-pauses` for the matching active scope).
3. **Held mail:** lift the pause (set `active = false`); the next sweep
   re-evaluates and sends. Pauses never delete queued mail.
4. **Unknown submissions:** do not resend manually. The dispatcher
   reconciles against the provider where supported; a row that stays
   `unknown` needs provider-side lookup by MessageID before any reissue.
5. **Expired intents:** the action (sign-in link) died before dispatch.
   Have the user request a fresh link; resends are rate-limited by the
   identity flows themselves.

## 5. Pauses and incidents

Create an `email-pauses` row to stop new submissions: scope `campaign`
(one message), `site-class` (one class on one site), `site`,
`provider-boundary`, or `global-class`. Dispatchers re-read pauses
immediately before every submission, including retries and recovery sweeps;
a message already accepted by the provider may still arrive — that is the
documented in-flight boundary.

- Campaign incident (complaints, bad list): pause that campaign, then the
  site's `audience` class if needed. Account mail is a different boundary
  and keeps flowing — verify with a test sign-in.
- Audience credentials revoked / quota exhausted: account mail is
  unaffected when boundaries are isolated. Fix the audience account; queued
  audience mail resumes from the outbox.
- DNS drift: the command center lights degrade with the exact record named.
  Affected sends keep retrying within their budgets; fix DNS, then confirm
  the lights return to verified before resuming campaigns.

## 6. Live placement proof (EMAIL-11) — gated checklist

Defaults to dry-run; sends only to explicitly designated controlled
addresses. **Owner-only prerequisites:** (1) Postmark approves the account
model — separate approved accounts for account mail and audience mail;
(2) sender DNS published per §2; (3) controlled personal Gmail, Outlook.com,
and Yahoo seed inboxes with ordinary filtering (no allow rules).

Matrix per site: 2 sites × 3 mailbox providers × 3 purposes (account,
newsletter confirmation, small campaign) = 18 observed messages, plus the
staff invitation. For each: record candidate SHA, UTC trigger/enqueue/
submit/observed timestamps, intent + provider IDs, initial folder/tab,
15-minute and 24-hour follow-ups, raw `Authentication-Results`, and the
completed action result. Account and confirmation seeds must land in an
inbox folder with a working action within five minutes; campaigns must
reach an inbox folder (Promotions tab acceptable) by 15 minutes. Retain raw
`.eml` files access-controlled and outside public git.

## 7. Rollback

Roll code back freely: the migration is intentionally irreversible (the
outbox is delivery evidence). To stop all mail, set `EMAIL_MODE=disabled`
and restart; queued intents/deliveries persist and resume when mail is
re-enabled. Never restore a database snapshot that would erase suppressions
or accepted provider IDs.
