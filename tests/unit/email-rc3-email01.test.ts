import { describe, expect, it } from 'vitest'

import { ConfigurationError, loadConfig } from '../../src/modules/core/config'
import {
  EMAIL_PURPOSES,
  PURPOSE_TO_CLASS,
  boundaryForClass,
  classForPurpose,
} from '../../src/modules/email/classes'
import {
  boundaryIsolationState,
  selectEmailAdapterForBoundary,
} from '../../src/modules/email/delivery'
import { createPostmarkEmailAdapter } from '../../src/modules/email/postmark'
import { verifySenderDns, type DnsResolver } from '../../src/modules/email/dns-verification'

const baseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://renegade:renegade@localhost:5432/renegade',
  PAYLOAD_SECRET: 'unit-test-secret-with-at-least-32-characters',
  APP_URL: 'http://localhost:3000',
}

describe('RC3-EMAIL-01 purpose-to-class policy', () => {
  it('assigns every purpose exactly one class and protects account purposes', () => {
    for (const purpose of EMAIL_PURPOSES) {
      expect(PURPOSE_TO_CLASS[purpose]).toBe(classForPurpose(purpose))
    }
    expect(classForPurpose('member-sign-in')).toBe('account')
    expect(classForPurpose('staff-invitation')).toBe('account')
    expect(classForPurpose('order-receipt')).toBe('operational')
    expect(classForPurpose('newsletter-confirmation')).toBe('audience_confirmation')
    expect(classForPurpose('campaign')).toBe('audience')
  })

  it('rejects unknown purposes instead of defaulting them into a class', () => {
    expect(() => classForPurpose('upgrade-me-to-account')).toThrow(/Unknown email purpose/)
  })

  it('routes operational mail to the account boundary, never the audience boundary', () => {
    expect(boundaryForClass('operational')).toBe('account')
    expect(boundaryForClass('account')).toBe('account')
    expect(boundaryForClass('audience_confirmation')).toBe('audience')
    expect(boundaryForClass('audience')).toBe('audience')
  })

  it('freezes the policy object against runtime mutation', () => {
    expect(Object.isFrozen(PURPOSE_TO_CLASS)).toBe(true)
  })
})

describe('RC3-EMAIL-01 boundary configuration', () => {
  it('parses a fully configured Postmark account boundary as isolated', () => {
    const config = loadConfig({
      ...baseEnv,
      EMAIL_MODE: 'smtp',
      EMAIL_FROM: 'Renegade <mail@example.test>',
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      EMAIL_ACCOUNT_PROVIDER: 'postmark',
      EMAIL_ACCOUNT_FROM: 'Renegade Security <security@accounts.example.test>',
      EMAIL_ACCOUNT_POSTMARK_SERVER_TOKEN: 'account-token',
    })
    expect(config.email.boundaries.account.provider).toBe('postmark')
    expect(config.email.boundaries.account.postmark?.transactionalStream).toBe('outbound')
    expect(boundaryIsolationState('account', config)).toBe('isolated')
    expect(boundaryIsolationState('audience', config)).toBe('shared-legacy')
    expect(selectEmailAdapterForBoundary('account', config).id).toBe('postmark-account')
    expect(selectEmailAdapterForBoundary('audience', config).id).toBe('smtp')
  })

  it('fails startup on partial Postmark configuration instead of silently sharing mail', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        EMAIL_ACCOUNT_PROVIDER: 'postmark',
        EMAIL_ACCOUNT_FROM: 'Renegade Security <security@accounts.example.test>',
      }),
    ).toThrow(ConfigurationError)
  })

  it('defaults both boundaries to inherit with the legacy global route', () => {
    const config = loadConfig(baseEnv)
    expect(config.email.boundaries.account.provider).toBe('inherit')
    expect(boundaryIsolationState('account', config)).toBe('disabled')
  })
})

type FetchCall = { url: string; body: Record<string, unknown>; headers: Record<string, string> }

function postmarkAdapter(
  responder: (call: FetchCall) => { status: number; payload: unknown; retryAfter?: string },
) {
  const calls: FetchCall[] = []
  const adapter = createPostmarkEmailAdapter(
    'account',
    {
      serverToken: 'test-token',
      transactionalStream: 'outbound',
      broadcastStream: 'broadcast',
      timeoutMs: 1000,
    },
    {
      fetch: async (url, init) => {
        const call = {
          url,
          body: JSON.parse(init.body) as Record<string, unknown>,
          headers: init.headers,
        }
        calls.push(call)
        const result = responder(call)
        return {
          status: result.status,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'retry-after' ? (result.retryAfter ?? null) : null,
          },
          json: async () => result.payload,
          text: async () => JSON.stringify(result.payload),
        }
      },
    },
  )
  return { adapter, calls }
}

const sendRequest = {
  from: 'Renegade Security <security@accounts.example.test>',
  to: 'member@example.test',
  subject: 'Sign in',
  text: 'Your link',
  idempotencyKey: 'intent-123',
  category: 'transactional' as const,
}

describe('RC3-EMAIL-01 Postmark adapter', () => {
  it('sends on the transactional stream with correlation metadata and returns the MessageID', async () => {
    const { adapter, calls } = postmarkAdapter(() => ({
      status: 200,
      payload: { ErrorCode: 0, MessageID: 'pm-abc', To: 'member@example.test' },
    }))
    const result = await adapter.send(sendRequest)
    expect(result).toMatchObject({
      ok: true,
      provider: 'postmark-account',
      providerMessageId: 'pm-abc',
    })
    expect(calls[0].body.MessageStream).toBe('outbound')
    expect(calls[0].body.Metadata).toEqual({ renegade_idempotency_key: 'intent-123' })
    expect(calls[0].headers['X-Postmark-Server-Token']).toBe('test-token')
    // Postmark metadata is correlation only; the contract must not claim
    // provider-enforced idempotency.
    expect(adapter.contract.providerIdempotency).toBe(false)
  })

  it('uses the broadcast stream for marketing on the audience boundary', async () => {
    const bodies: Record<string, unknown>[] = []
    const audienceAdapter = createPostmarkEmailAdapter(
      'audience',
      {
        serverToken: 'audience-token',
        transactionalStream: 'outbound',
        broadcastStream: 'broadcast',
        timeoutMs: 1000,
      },
      {
        fetch: async (_url, init) => {
          bodies.push(JSON.parse(init.body) as Record<string, unknown>)
          return {
            status: 200,
            headers: { get: () => null },
            json: async () => ({ ErrorCode: 0, MessageID: 'pm-def' }),
            text: async () => '{}',
          }
        },
      },
    )
    const result = await audienceAdapter.send({ ...sendRequest, category: 'marketing' })
    expect(result).toMatchObject({ ok: true, provider: 'postmark-audience' })
    expect(bodies[0].MessageStream).toBe('broadcast')
  })

  it('classifies rate limits as retryable and surfaces Retry-After', async () => {
    const { adapter } = postmarkAdapter(() => ({
      status: 429,
      payload: { ErrorCode: 0, Message: 'Rate limit' },
      retryAfter: '7',
    }))
    const result = await adapter.send(sendRequest)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.kind).toBe('retryable')
      expect(result.failure.retryAfterMs).toBe(7000)
    }
  })

  it('classifies inactive recipients as permanent and server errors as unknown', async () => {
    const inactive = postmarkAdapter(() => ({
      status: 422,
      payload: { ErrorCode: 406, Message: 'Inactive recipient' },
    }))
    const inactiveResult = await inactive.adapter.send(sendRequest)
    expect(inactiveResult.ok).toBe(false)
    if (!inactiveResult.ok) expect(inactiveResult.failure.kind).toBe('permanent')

    const serverError = postmarkAdapter(() => ({ status: 500, payload: { ErrorCode: 0 } }))
    const serverResult = await serverError.adapter.send(sendRequest)
    expect(serverResult.ok).toBe(false)
    if (!serverResult.ok) expect(serverResult.failure.kind).toBe('unknown')
  })

  it('treats a fetch timeout as an unknown outcome, never a safe retry', async () => {
    const adapter = createPostmarkEmailAdapter(
      'account',
      {
        serverToken: 't',
        transactionalStream: 'outbound',
        broadcastStream: 'broadcast',
        timeoutMs: 5,
      },
      {
        fetch: async () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        },
      },
    )
    const result = await adapter.send(sendRequest)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.kind).toBe('unknown')
      expect(result.failure.code).toBe('unknown_outcome')
    }
  })
})

function resolver(
  records: Record<string, string[]>,
  cnames: Record<string, string[]> = {},
): DnsResolver {
  return {
    resolveTxt: async (host) => (records[host] ?? []).map((value) => [value]),
    resolveCname: async (host) => cnames[host] ?? [],
  }
}

describe('RC3-EMAIL-01 DNS verification', () => {
  const good = resolver(
    {
      'bounce.news.example.test': ['v=spf1 include:spf.mtasv.net ~all'],
      'pm._domainkey.news.example.test': ['v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ'],
      '_dmarc.example.test': ['v=DMARC1; p=none; rua=mailto:dmarc@example.test'],
    },
    { 'bounce.news.example.test': ['pm.mtasv.net'] },
  )

  it('verifies SPF, DKIM, DMARC and Return-Path from observed records', async () => {
    const report = await verifySenderDns(
      {
        from: 'Renegade News <news@news.example.test>',
        dkimSelector: 'pm',
        returnPathHost: 'bounce.news.example.test',
      },
      good,
    )
    expect(report.spf.status).toBe('verified')
    expect(report.dkim.status).toBe('verified')
    expect(report.dmarc.status).toBe('verified')
    expect(report.dmarc.aligned).toBe(true)
    expect(report.returnPath.status).toBe('verified')
  })

  it('names the exact missing records instead of returning a bare false', async () => {
    const report = await verifySenderDns(
      {
        from: 'Renegade News <news@news.example.test>',
        dkimSelector: 'pm',
        returnPathHost: 'bounce.news.example.test',
      },
      resolver({}),
    )
    expect(report.spf.status).toBe('failed')
    expect(report.spf.detail).toContain('bounce.news.example.test')
    expect(report.dkim.status).toBe('failed')
    expect(report.dkim.detail).toContain('pm._domainkey.news.example.test')
    expect(report.dmarc.status).toBe('failed')
    expect(report.dmarc.detail).toContain('_dmarc.example.test')
    expect(report.returnPath.status).toBe('failed')
  })

  it('fails a domain with two competing SPF policies', async () => {
    const report = await verifySenderDns(
      { from: 'a@example.test', returnPathHost: 'example.test' },
      resolver({
        'example.test': ['v=spf1 include:a.example ~all', 'v=spf1 include:b.example ~all'],
      }),
    )
    expect(report.spf.status).toBe('failed')
    expect(report.spf.detail).toContain('exactly one')
  })

  it('reports DKIM as unobserved when no selector is configured', async () => {
    const report = await verifySenderDns({ from: 'a@example.test' }, resolver({}))
    expect(report.dkim.status).toBe('unobserved')
  })
})
