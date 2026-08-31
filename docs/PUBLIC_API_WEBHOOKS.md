# Public API and outbound webhooks (v1)

The canonical product integration surface is REST at `/api/v1`; Payload's `/api` and GraphQL endpoints are administration infrastructure and are not a supported product API.

Authenticate machine clients with `Authorization: Bearer rgn_….…`. Clients are tenant-bound to a site and may additionally be bound to a publication or space. Required scopes are `content.read`, `content.draft.read`, `content.draft.write`, and `webhooks.manage`. API clients are provisioned by an operator: the clear credential is displayed once, while only its SHA-256 digest is retained.

`GET /api/v1/content` requires `content.read`; it returns stable public fields only. By default it returns published/updated records. `content.draft.read` permits selecting other lifecycle states, but editorial documents, audit fields, permissions, private sources, secrets, and admin-only records are never serialized. Use `page` (one-based, default 1), `limit` (1–100), `status`, and `sort=title` (otherwise newest update first). The response contains `data` and `pagination`.

`POST /api/v1/content` requires `content.draft.write` and `Idempotency-Key`. Required JSON fields are `title`, canonical `slug`, and absolute `canonical_path`; optional fields are `content_type`, `summary`, `excerpt`, and `status`. Validation uses a 422 `{error:{code,message,fields}}` response. A repeated key returns the saved contract response with `Idempotency-Replayed: true`. The write records a `content.created` public execution event after persistence.

All responses carry `X-Renegade-API-Version: v1`, are uncacheable, and use stable snake_case JSON. Clients may send `X-Renegade-API-Version: v1` or an Accept value containing `v1`; unsupported versions receive 406. Version sunsets will return 410 after their documented date. Machine API requests are limited to 120/min per client for reads and 30/min for writes at the deployment edge; callers should honor 429 and `Retry-After`.

## Webhooks

`POST /api/v1/webhooks` requires `webhooks.manage` and accepts `events`, HTTPS `target`, and a pre-provisioned `secret_ref`. The application resolves `WEBHOOK_SECRET_<NORMALIZED_SECRET_REF>` only at verify/delivery time; it never persists or returns clear secrets. Registration sends a signed `webhook.endpoint.verify` request and requires a 2xx result. Rotating a secret means provisioning a new secret reference, updating the subscription, and retaining the old value at the receiver through the rollout window.

`PATCH /api/v1/webhooks/{id}` with a new `secret_ref` verifies the endpoint with the replacement secret before activating it, records `rotated_at`, and resets the failure counter.

Subscribed public outbox events produce an at-least-once delivery. Payloads are JSON envelopes with `id`, `type`, `occurred_at`, `api_version` (`2026-08-31`), and privacy-safe `data`. Requests include `X-Renegade-Event`, `X-Renegade-Delivery`, `X-Renegade-Attempt`, and `X-Renegade-Signature: t=<unix>,v1=<hex>`, where the signature is HMAC-SHA256 of `<timestamp>.<raw body>`. Verify against the untouched raw request bytes in constant time, reject timestamps older/newer than five minutes, and deduplicate on `X-Renegade-Delivery` (or the envelope `id`).

Non-2xx responses retry after 30s, 60s, 120s, 240s (capped at an hour). Five consecutive failures disable the subscription and leave the delivery in `dead-letter`; response/error logs are redacted and capped. `GET /api/v1/webhooks/deliveries` shows history without secrets. `POST /api/v1/webhooks/{deliveryId}/redeliver` creates a new delivery with the same event and a new delivery id.
