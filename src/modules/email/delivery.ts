import nodemailer, { type Transporter } from 'nodemailer'

import type { AppConfig } from '../core/config'
import { configuredSecretValues, redact } from '../core/logging'

export type EmailDeliveryRequest = {
  from: string
  to: string
  subject: string
  text: string
  html?: string
  idempotencyKey: string
  category?: 'transactional' | 'operational' | 'marketing'
  replyTo?: string
  messageId?: string
  headers?: Record<string, string>
}

export type EmailDeliveryFailure = {
  kind: 'retryable' | 'permanent' | 'unknown'
  code:
    | 'email_disabled'
    | 'authentication_failed'
    | 'tls_failed'
    | 'timeout'
    | 'temporary_provider_error'
    | 'permanent_recipient_error'
    | 'provider_error'
    | 'unknown_outcome'
  message: string
}

export type EmailDeliveryResult =
  | { ok: true; providerMessageId?: string; provider: string }
  | { ok: false; provider: string; failure: EmailDeliveryFailure }

export type EmailDeliveryHealth = {
  provider: string
  status: 'healthy' | 'disabled' | 'degraded'
  error?: EmailDeliveryFailure
}

/** AUD-05/v1 is deliberately operational, not a provider data model. */
export type EmailProviderCapabilities = {
  version: 1
  connectionVerification: boolean
  senderReadiness: boolean
  batchSend: boolean
  singleSend: boolean
  providerIdempotency: boolean
  webhookEvents: boolean
  reconciliation: boolean
  rateLimits: { known: boolean; perSecond?: number }
}
export type SenderReadiness = {
  provider: string
  status: 'ready' | 'unconfigured' | 'degraded'
  from?: string
  replyTo?: string
  domainAuthentication: 'not-observed' | 'transport-verified' | 'unknown'
  reason?: string
}

/**
 * A deterministic provider for local journeys.  Unlike a no-op development
 * adapter it retains the exact rendered envelope so a worker/browser test can
 * inspect what a recipient would receive.  It is process-local by design and
 * is never selected outside `email.mode=development`.
 */
export type LocalMailSinkReceipt = {
  providerMessageId: string
  idempotencyKey: string
  from: string
  to: string
  subject: string
  text: string
  html?: string
  category?: EmailDeliveryRequest['category']
  links: string[]
  headers: Record<string, string>
  receivedAt: string
}
const localMailSink = new Map<string, LocalMailSinkReceipt>()
type LocalMailSinkSimulation = 'accept' | 'bounce' | 'complaint' | 'delay'
const localMailSinkSimulations = new Map<string, LocalMailSinkSimulation>()
const linksIn = (value: string) =>
  [...value.matchAll(/https?:\/\/[^\s"'<>()]+/g)].map((match) => match[0])
export function localMailSinkReceipts() {
  return [...localMailSink.values()]
}
export function resetLocalMailSink() {
  localMailSink.clear()
  localMailSinkSimulations.clear()
}
/** Test-only/local-worker control; production adapters never read this state. */
export function simulateLocalMailSinkOutcome(
  idempotencyKey: string,
  outcome: LocalMailSinkSimulation,
) {
  localMailSinkSimulations.set(idempotencyKey, outcome)
}

export interface EmailDeliveryAdapter {
  readonly id: string
  readonly capabilities: readonly ('transactional' | 'operational' | 'marketing')[]
  readonly contract: EmailProviderCapabilities
  send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult>
  health(): Promise<EmailDeliveryHealth>
  verifyConnection(): Promise<EmailDeliveryHealth>
  senderReadiness(input?: { from?: string; replyTo?: string }): Promise<SenderReadiness>
  reconcile?(input: {
    idempotencyKey: string
    providerMessageId?: string
  }): Promise<EmailDeliveryResult | null>
}

type SmtpTransport = Pick<Transporter, 'sendMail' | 'verify'>
type SmtpDependencies = { createTransport?: (options: object) => SmtpTransport }

export const developmentCaptureEmailAdapter: EmailDeliveryAdapter = {
  id: 'development-capture',
  capabilities: ['transactional', 'operational', 'marketing'],
  contract: {
    version: 1,
    connectionVerification: true,
    senderReadiness: true,
    batchSend: false,
    singleSend: true,
    providerIdempotency: true,
    webhookEvents: true,
    reconciliation: true,
    rateLimits: { known: false },
  },
  async send(request) {
    const providerMessageId = `local:${Buffer.from(request.idempotencyKey).toString('base64url')}`
    if (!localMailSink.has(request.idempotencyKey)) {
      localMailSink.set(request.idempotencyKey, {
        providerMessageId,
        idempotencyKey: request.idempotencyKey,
        from: request.from,
        to: request.to,
        subject: request.subject,
        text: request.text,
        html: request.html,
        category: request.category,
        links: linksIn(`${request.text}\n${request.html ?? ''}`),
        headers: {
          'X-Renegade-Idempotency-Key': request.idempotencyKey,
          ...(request.headers ?? {}),
        },
        receivedAt: new Date().toISOString(),
      })
    }
    const simulated = localMailSinkSimulations.get(request.idempotencyKey) ?? 'accept'
    if (simulated === 'delay')
      return {
        ok: false,
        provider: 'development-capture',
        failure: {
          kind: 'retryable',
          code: 'temporary_provider_error',
          message: 'Local sink delay.',
        },
      }
    if (simulated === 'bounce' || simulated === 'complaint')
      return {
        ok: false,
        provider: 'development-capture',
        failure: {
          kind: 'permanent',
          code: 'permanent_recipient_error',
          message: `Local sink simulated ${simulated}.`,
        },
      }
    return {
      ok: true,
      provider: 'development-capture',
      providerMessageId,
    }
  },
  async health() {
    return { provider: 'development-capture', status: 'healthy' }
  },
  async verifyConnection() {
    return { provider: 'development-capture', status: 'healthy' }
  },
  async senderReadiness(input = {}) {
    return {
      provider: 'development-capture',
      status: input.from ? 'ready' : 'unconfigured',
      from: input.from,
      replyTo: input.replyTo,
      domainAuthentication: 'not-observed',
    }
  },
  async reconcile({ idempotencyKey }) {
    const receipt = localMailSink.get(idempotencyKey)
    return receipt
      ? { ok: true, provider: 'development-capture', providerMessageId: receipt.providerMessageId }
      : null
  },
}

export const disabledEmailAdapter: EmailDeliveryAdapter = {
  id: 'disabled',
  capabilities: [],
  contract: {
    version: 1,
    connectionVerification: false,
    senderReadiness: false,
    batchSend: false,
    singleSend: false,
    providerIdempotency: false,
    webhookEvents: false,
    reconciliation: false,
    rateLimits: { known: false },
  },
  async send() {
    return {
      ok: false,
      provider: 'disabled',
      failure: {
        kind: 'permanent',
        code: 'email_disabled',
        message: 'Email delivery is disabled.',
      },
    }
  },
  async health() {
    return { provider: 'disabled', status: 'disabled' }
  },
  async verifyConnection() {
    return { provider: 'disabled', status: 'disabled' }
  },
  async senderReadiness() {
    return {
      provider: 'disabled',
      status: 'unconfigured',
      domainAuthentication: 'unknown',
      reason: 'Email delivery is disabled.',
    }
  },
}

export function createSmtpEmailAdapter(
  email: AppConfig['email'],
  dependencies: SmtpDependencies = {},
): EmailDeliveryAdapter {
  if (email.mode !== 'smtp' || !email.host || !email.port || !email.from)
    throw new Error('SMTP email adapter requires validated SMTP configuration.')
  const createTransport =
    dependencies.createTransport ?? ((options) => nodemailer.createTransport(options))
  const transport = createTransport({
    host: email.host,
    port: email.port,
    secure: email.secure,
    auth: email.username ? { user: email.username, pass: email.password } : undefined,
    connectionTimeout: email.connectionTimeoutMs,
    socketTimeout: email.sendTimeoutMs,
    greetingTimeout: email.connectionTimeoutMs,
    tls: { rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
  })
  return {
    id: 'smtp',
    capabilities: ['transactional', 'operational', 'marketing'],
    contract: {
      version: 1,
      connectionVerification: true,
      senderReadiness: true,
      batchSend: false,
      singleSend: true,
      providerIdempotency: false,
      webhookEvents: false,
      reconciliation: false,
      rateLimits: { known: false },
    },
    async send(request) {
      try {
        const response = await transport.sendMail({
          from: request.from,
          to: request.to,
          subject: request.subject,
          text: request.text,
          html: request.html,
          replyTo: request.replyTo,
          messageId: request.messageId,
          headers: {
            'X-Renegade-Idempotency-Key': request.idempotencyKey,
            ...(request.headers ?? {}),
          },
        })
        return { ok: true, provider: 'smtp', providerMessageId: response.messageId }
      } catch (error) {
        return { ok: false, provider: 'smtp', failure: normalizeEmailError(error) }
      }
    },
    async health() {
      try {
        await transport.verify()
        return { provider: 'smtp', status: 'healthy' }
      } catch (error) {
        return { provider: 'smtp', status: 'degraded', error: normalizeEmailError(error) }
      }
    },
    async verifyConnection() {
      try {
        await transport.verify()
        return { provider: 'smtp', status: 'healthy' }
      } catch (error) {
        return { provider: 'smtp', status: 'degraded', error: normalizeEmailError(error) }
      }
    },
    async senderReadiness(input = {}) {
      const health = await this.verifyConnection()
      return {
        provider: 'smtp',
        status:
          health.status === 'healthy' && !!(input.from ?? email.from)
            ? 'ready'
            : health.status === 'healthy'
              ? 'unconfigured'
              : 'degraded',
        from: input.from ?? email.from,
        replyTo: input.replyTo,
        domainAuthentication: 'not-observed',
        ...(health.error ? { reason: health.error.message } : {}),
      }
    },
  }
}

export function selectEmailDeliveryAdapter(config: AppConfig): EmailDeliveryAdapter {
  if (config.email.mode === 'development') return developmentCaptureEmailAdapter
  if (config.email.mode === 'disabled') return disabledEmailAdapter
  return createSmtpEmailAdapter(config.email)
}

export function normalizeEmailError(error: unknown): EmailDeliveryFailure {
  const value = error as { code?: string; responseCode?: number; message?: string }
  const code = String(value?.code ?? '').toUpperCase()
  const responseCode = Number(value?.responseCode ?? 0)
  if (['EAUTH', 'EENVELOPE'].includes(code) || [534, 535].includes(responseCode))
    return failure('permanent', 'authentication_failed', 'SMTP authentication failed.')
  if (
    ['ETLS', 'ESOCKET', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(
      code,
    ) ||
    /certificate|tls/i.test(String(value?.message))
  )
    return failure('permanent', 'tls_failed', 'SMTP TLS validation failed.')
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code))
    return failure(
      'unknown',
      'unknown_outcome',
      'SMTP delivery timed out; reconcile before any retry.',
    )
  if ([550, 551, 552, 553, 554].includes(responseCode))
    return failure(
      'permanent',
      'permanent_recipient_error',
      'SMTP rejected the recipient or message.',
    )
  if (
    (responseCode >= 400 && responseCode < 500) ||
    ['ECONNECTION', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)
  )
    return failure(
      'retryable',
      'temporary_provider_error',
      'SMTP service is temporarily unavailable.',
    )
  return failure('retryable', 'provider_error', safeMessage(value?.message))
}

function failure(
  kind: EmailDeliveryFailure['kind'],
  code: EmailDeliveryFailure['code'],
  message: string,
): EmailDeliveryFailure {
  return { kind, code, message: safeMessage(message) }
}

function safeMessage(message: unknown): string {
  const result = redact(String(message || 'Email provider error.'), configuredSecretValues())
  return typeof result === 'string' ? result.slice(0, 300) : 'Email provider error.'
}
