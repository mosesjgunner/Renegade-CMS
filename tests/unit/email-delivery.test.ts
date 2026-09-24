import { describe, expect, it, vi } from 'vitest'

import {
  createSmtpEmailAdapter,
  developmentCaptureEmailAdapter,
  disabledEmailAdapter,
  localMailSinkReceipts,
  normalizeEmailError,
  resetLocalMailSink,
  selectEmailDeliveryAdapter,
} from '../../src/modules/email/delivery'

const smtp = (overrides: Record<string, unknown> = {}) =>
  ({
    mode: 'smtp',
    from: 'Renegade <mail@example.test>',
    host: 'smtp.example.test',
    port: 465,
    secure: true,
    connectionTimeoutMs: 1000,
    sendTimeoutMs: 2000,
    ...overrides,
  }) as never
const request = {
  from: 'Renegade <mail@example.test>',
  to: 'reader@example.test',
  subject: 'Test',
  text: 'Hello',
  idempotencyKey: 'delivery-1',
}

describe('email delivery adapters', () => {
  it('captures development mail and makes disabled mode an explicit non-retryable outcome', async () => {
    resetLocalMailSink()
    await expect(
      developmentCaptureEmailAdapter.send({
        ...request,
        text: 'Read https://example.test/confirm',
      }),
    ).resolves.toMatchObject({
      ok: true,
      provider: 'development-capture',
    })
    await expect(disabledEmailAdapter.send(request)).resolves.toMatchObject({
      ok: false,
      failure: { kind: 'permanent', code: 'email_disabled' },
    })
    expect(selectEmailDeliveryAdapter({ email: { mode: 'development' } } as never).id).toBe(
      'development-capture',
    )
    await developmentCaptureEmailAdapter.send({
      ...request,
      text: 'replay must not replace receipt',
    })
    expect(localMailSinkReceipts()).toEqual([
      expect.objectContaining({
        to: request.to,
        headers: { 'X-Renegade-Idempotency-Key': request.idempotencyKey },
        links: ['https://example.test/confirm'],
      }),
    ])
  })

  it('selects SMTP with TLS validation, optional authentication, and bounded transport timeouts', async () => {
    const createTransport = vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'smtp-1' }),
      verify: vi.fn().mockResolvedValue(undefined),
    }))
    const adapter = createSmtpEmailAdapter(smtp({ username: 'user', password: 'secret' }), {
      createTransport,
    })
    await expect(adapter.send(request)).resolves.toMatchObject({
      ok: true,
      providerMessageId: 'smtp-1',
    })
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        secure: true,
        connectionTimeout: 1000,
        socketTimeout: 2000,
        tls: { rejectUnauthorized: true },
        auth: { user: 'user', pass: 'secret' },
      }),
    )
  })

  it('normalizes authentication, TLS, timeout, temporary, permanent recipient, and redacted provider failures', () => {
    expect(normalizeEmailError({ code: 'EAUTH' })).toMatchObject({
      kind: 'permanent',
      code: 'authentication_failed',
    })
    expect(normalizeEmailError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' })).toMatchObject({
      kind: 'permanent',
      code: 'tls_failed',
    })
    expect(normalizeEmailError({ code: 'ETIMEDOUT' })).toMatchObject({
      kind: 'unknown',
      code: 'unknown_outcome',
    })
    expect(normalizeEmailError({ responseCode: 421 })).toMatchObject({
      kind: 'retryable',
      code: 'temporary_provider_error',
    })
    expect(normalizeEmailError({ responseCode: 550 })).toMatchObject({
      kind: 'permanent',
      code: 'permanent_recipient_error',
    })
    expect(normalizeEmailError({ message: 'password=top-secret broke' })).not.toMatchObject({
      message: expect.stringContaining('top-secret'),
    })
  })

  it('reports SMTP health without throwing on an outage', async () => {
    const adapter = createSmtpEmailAdapter(smtp(), {
      createTransport: () => ({
        sendMail: vi.fn(),
        verify: vi.fn().mockRejectedValue({ code: 'ECONNREFUSED' }),
      }),
    })
    await expect(adapter.health()).resolves.toMatchObject({
      provider: 'smtp',
      status: 'degraded',
      error: { kind: 'retryable' },
    })
  })

  it('declares provider-neutral v1 capabilities and does not pretend SMTP can reconcile unknown sends', async () => {
    const local = developmentCaptureEmailAdapter
    expect(local.contract).toMatchObject({
      version: 1,
      providerIdempotency: true,
      reconciliation: true,
    })
    await local.send(request)
    await expect(
      local.reconcile?.({ idempotencyKey: request.idempotencyKey }),
    ).resolves.toMatchObject({ ok: true })
    const smtpAdapter = createSmtpEmailAdapter(smtp(), {
      createTransport: () => ({ sendMail: vi.fn(), verify: vi.fn() }),
    })
    expect(smtpAdapter.contract).toMatchObject({
      providerIdempotency: false,
      reconciliation: false,
    })
    await expect(smtpAdapter.senderReadiness()).resolves.toMatchObject({
      domainAuthentication: 'not-observed',
    })
  })
})
