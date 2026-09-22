# AUD-05 email delivery operations

Renegade owns campaign approval, recipient eligibility, consent, suppression, the approved render hash, and delivery evidence. An email provider is only a transport and must not be treated as the source of campaign truth.

## Local verification

Set `EMAIL_MODE=development`. The `development-capture` transport retains the exact MIME-equivalent envelope in the local mail sink and deduplicates by the stable delivery idempotency key. It is suitable for tests and local operator journeys only; it does not claim DNS authentication or inbox placement.

## SMTP preflight

Set `EMAIL_MODE=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, and, when required, both `SMTP_USERNAME` and `SMTP_PASSWORD`. SMTP TLS certificates are always validated. Operations diagnostics calls connection verification; sender readiness reports transport connectivity and explicitly leaves SPF/DKIM/DMARC as `not-observed` because those require domain-side evidence.

Do not configure real-provider credentials in test defaults and do not send external test mail automatically. Neo, SES, Resend, and Renegade Mail remain credential-required adapter candidates; an unconfigured adapter is not a publication blocker.

## Recovery

`accepted` means a transport accepted the message, not that an inbox received it. `delivered` is only set from verified provider evidence. `unknown` means the transport timed out after an indeterminate attempt: reconcile the same provider/idempotency key before manual retry, and never fail over automatically. Retry only `retryable` transient failures; invalid recipients, authentication failures, and hard bounces are permanent. Operators may cancel queued deliveries, inspect sanitized event evidence, correct credentials, and requeue only after reviewing the outcome.

Provider webhooks must use the exact raw-body HMAC secret, carry a provider event ID when available, and are deduplicated in `email_delivery_events`. Only sanitized normalized event fields are persisted. Bounce, complaint, unsubscribe, and provider suppression update canonical suppression; an unsubscribe immediately wins over queued sends.

Marketing sends include absolute List-Unsubscribe and one-click headers where a recipient token can be issued. Tracking is intentionally absent by default: delivery does not depend on opens/clicks or provider pixels.
