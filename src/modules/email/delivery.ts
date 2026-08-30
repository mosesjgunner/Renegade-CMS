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
}

export type EmailDeliveryFailure = {
  kind: 'retryable' | 'permanent'
  code:
    | 'email_disabled'
    | 'authentication_failed'
    | 'tls_failed'
    | 'timeout'
    | 'temporary_provider_error'
    | 'permanent_recipient_error'
    | 'provider_error'
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

export interface EmailDeliveryAdapter {
  readonly id: string
  readonly capabilities: readonly ('transactional' | 'operational' | 'marketing')[]
  send(request: EmailDeliveryRequest): Promise<EmailDeliveryResult>
  health(): Promise<EmailDeliveryHealth>
}

type SmtpTransport = Pick<Transporter, 'sendMail' | 'verify'>
type SmtpDependencies = { createTransport?: (options: object) => SmtpTransport }

export const developmentCaptureEmailAdapter: EmailDeliveryAdapter = {
  id: 'development-capture',
  capabilities: ['transactional', 'operational', 'marketing'],
  async send(request) {
    return {
      ok: true,
      provider: 'development-capture',
      providerMessageId: `dev:${Buffer.from(request.idempotencyKey).toString('base64url')}`,
    }
  },
  async health() {
    return { provider: 'development-capture', status: 'healthy' }
  },
}

export const disabledEmailAdapter: EmailDeliveryAdapter = {
  id: 'disabled',
  capabilities: [],
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
    async send(request) {
      try {
        const response = await transport.sendMail({
          from: request.from,
          to: request.to,
          subject: request.subject,
          text: request.text,
          html: request.html,
          headers: { 'X-Renegade-Idempotency-Key': request.idempotencyKey },
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
    return failure('retryable', 'timeout', 'SMTP delivery timed out.')
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
