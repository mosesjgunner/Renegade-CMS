/**
 * RC3-EMAIL-01 / EMAIL-03: Postmark single-message HTTP adapter.
 *
 * Implements the existing EmailDeliveryAdapter contract. One adapter instance
 * serves ONE provider boundary (account or audience) with that boundary's own
 * server token — credentials never cross boundaries. MessageStream is chosen
 * per traffic class. Metadata carries the intent/delivery idempotency key for
 * correlation only; Postmark does not enforce send idempotency, and this
 * adapter never claims it does.
 */
import { configuredSecretValues, redact } from '../core/logging'
import type { EmailBoundary } from './classes'
import type { EmailDeliveryAdapter, EmailDeliveryFailure, EmailDeliveryRequest } from './delivery'

export type PostmarkBoundaryConfig = {
  serverToken: string
  /** Stream for account/operational/audience_confirmation sends. */
  transactionalStream: string
  /** Stream for audience (marketing) sends. */
  broadcastStream: string
  timeoutMs: number
}

type FetchLike = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    body: string
    signal?: AbortSignal
  },
) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
  text(): Promise<string>
}>

const POSTMARK_API = 'https://api.postmarkapp.com/email'

export function createPostmarkEmailAdapter(
  boundary: EmailBoundary,
  config: PostmarkBoundaryConfig,
  dependencies: { fetch?: FetchLike } = {},
): EmailDeliveryAdapter {
  const providerId = boundary === 'account' ? 'postmark-account' : 'postmark-audience'
  const doFetch: FetchLike =
    dependencies.fetch ?? ((url, init) => fetch(url, init) as ReturnType<FetchLike>)

  async function call(body: Record<string, unknown>): Promise<{
    status: number
    payload: Record<string, unknown>
    retryAfterMs?: number
  }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      const response = await doFetch(POSTMARK_API, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': config.serverToken,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
      const retryAfter = response.headers.get('retry-after')
      const retrySeconds = retryAfter ? Number(retryAfter) : NaN
      return {
        status: response.status,
        payload,
        ...(Number.isFinite(retrySeconds)
          ? { retryAfterMs: Math.max(0, retrySeconds * 1000) }
          : {}),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    id: providerId,
    capabilities:
      boundary === 'account' ? ['transactional', 'operational'] : ['transactional', 'marketing'],
    contract: {
      version: 1,
      connectionVerification: false,
      senderReadiness: true,
      batchSend: false,
      singleSend: true,
      // Postmark metadata is correlation, not provider-enforced idempotency.
      providerIdempotency: false,
      webhookEvents: true,
      reconciliation: false,
      rateLimits: { known: false },
    },
    async send(request: EmailDeliveryRequest) {
      const stream =
        request.category === 'marketing' ? config.broadcastStream : config.transactionalStream
      try {
        const { status, payload, retryAfterMs } = await call({
          From: request.from,
          To: request.to,
          Subject: request.subject,
          TextBody: request.text,
          ...(request.html ? { HtmlBody: request.html } : {}),
          ...(request.replyTo ? { ReplyTo: request.replyTo } : {}),
          MessageStream: stream,
          Metadata: { renegade_idempotency_key: request.idempotencyKey },
          Headers: Object.entries(request.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
          TrackOpens: false,
          TrackLinks: 'None',
        })
        if (status === 200 && Number(payload.ErrorCode ?? -1) === 0 && payload.MessageID) {
          return { ok: true, provider: providerId, providerMessageId: String(payload.MessageID) }
        }
        return {
          ok: false,
          provider: providerId,
          failure: normalizePostmarkFailure(status, payload, retryAfterMs),
        }
      } catch (error) {
        // A timeout/abort can mean the provider accepted the message; never
        // classify it as a safe retry.
        return { ok: false, provider: providerId, failure: normalizeTransportError(error) }
      }
    },
    async health() {
      // No unauthenticated health endpoint exists; health is proven by sends
      // and webhook receipt. Report configuration presence only.
      return { provider: providerId, status: config.serverToken ? 'healthy' : 'disabled' }
    },
    async verifyConnection() {
      return this.health()
    },
    async senderReadiness(input = {}) {
      return {
        provider: providerId,
        status: input.from ? 'ready' : 'unconfigured',
        from: input.from,
        replyTo: input.replyTo,
        domainAuthentication: 'not-observed',
      }
    },
  }
}

function normalizePostmarkFailure(
  status: number,
  payload: Record<string, unknown>,
  retryAfterMs?: number,
): EmailDeliveryFailure {
  const errorCode = Number(payload.ErrorCode ?? 0)
  const message = safeMessage(payload.Message)
  // Postmark error codes: https://postmarkapp.com/developer/api/overview#error-codes
  if (errorCode === 406)
    return failure('permanent', 'permanent_recipient_error', 'Recipient is inactive/suppressed.')
  if (errorCode === 300)
    return failure('permanent', 'permanent_recipient_error', 'Invalid recipient address.')
  if (errorCode === 400 || errorCode === 401 || errorCode === 421)
    return failure('permanent', 'authentication_failed', 'Postmark rejected the server token.')
  if (status === 429)
    return {
      ...failure('retryable', 'temporary_provider_error', 'Postmark rate limit.'),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    }
  if (status >= 500)
    return failure('unknown', 'unknown_outcome', 'Postmark server error; acceptance is unknown.')
  if (status >= 400)
    return failure('permanent', 'provider_error', message || 'Postmark rejected the message.')
  return failure('unknown', 'unknown_outcome', message || 'Unexpected Postmark response.')
}

function normalizeTransportError(error: unknown): EmailDeliveryFailure {
  const name = (error as { name?: string })?.name
  if (name === 'AbortError' || name === 'TimeoutError')
    return failure(
      'unknown',
      'unknown_outcome',
      'Postmark request timed out; reconcile before any retry.',
    )
  return failure('unknown', 'unknown_outcome', safeMessage((error as Error)?.message))
}

function failure(
  kind: EmailDeliveryFailure['kind'],
  code: EmailDeliveryFailure['code'],
  message: string,
): EmailDeliveryFailure {
  return { kind, code, message: safeMessage(message) }
}

function safeMessage(message: unknown): string {
  const result = redact(String(message || 'Postmark provider error.'), configuredSecretValues())
  return typeof result === 'string' ? result.slice(0, 300) : 'Postmark provider error.'
}
