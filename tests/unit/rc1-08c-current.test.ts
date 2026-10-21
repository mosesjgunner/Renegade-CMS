/* eslint-disable @typescript-eslint/no-explicit-any -- detached persistence contract double */
import { createHash } from 'node:crypto'
import { generateVariantIdempotencyKey } from '../../src/modules/social/models'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { socialHash, campaignState, type SocialVariant } from '../../src/modules/social/contracts'
import { executeSocialQueueItem } from '../../src/modules/social/tasks'
import { BlueskyAdapter } from '../../src/modules/social/adapters/bluesky'
import { MastodonAdapter } from '../../src/modules/social/adapters/mastodon'
import {
  assertSocialEndpoint,
  socialProviderMode,
  socialRetryAfter,
} from '../../src/modules/social/dispatch-boundary'

const provider = vi.hoisted(() => ({
  publish: vi.fn(),
  reconcile: vi.fn(),
  mode: 'live',
  capabilities: {
    postTypes: ['text'],
    textLimit: 300,
    media: { images: false, video: false, audio: false },
  },
}))
vi.mock('../../src/modules/social/provider-runtime', () => ({
  socialProviderFor: () => provider,
  credentialsForSocialAccount: () => ({ service: 'http://127.0.0.1:3132' }),
}))
vi.mock('../../src/modules/media/workflow', () => ({
  assertMediaIdsPublishable: vi.fn().mockResolvedValue(undefined),
}))

function store() {
  const tables: Record<string, any[]> = {
    'social-drafts': [{ id: 'draft', site: 'site-a', status: 'scheduled' }],
    'social-accounts': [
      {
        id: 'account',
        site: 'site-a',
        credentialHealth: 'healthy',
        capabilityState: 'available',
        connectionReference: 'configured',
      },
    ],
    'social-network-variants': [],
    'social-queue-items': [],
    'social-publish-attempts': [],
    'external-posts': [],
  }
  const matches = (row: any, where: any): boolean =>
    !where ||
    Object.entries(where).every(([field, expression]: any) =>
      field === 'and'
        ? expression.every((part: any) => matches(row, part))
        : field === 'or'
          ? expression.some((part: any) => matches(row, part))
          : 'equals' in expression
            ? row[field] === expression.equals
            : true,
    )
  const payload: any = {
    findByID: vi.fn(async ({ collection, id }: any) => {
      const row = tables[collection].find((item) => item.id === id)
      if (!row) throw new Error(`Missing ${collection}/${id}`)
      return structuredClone(row)
    }),
    find: vi.fn(async ({ collection, where }: any) => ({
      docs: structuredClone(tables[collection].filter((row) => matches(row, where))),
    })),
    create: vi.fn(async ({ collection, data }: any) => {
      const row = { id: `${collection}-${tables[collection].length}`, ...structuredClone(data) }
      tables[collection].push(row)
      return structuredClone(row)
    }),
    update: vi.fn(async ({ collection, id, data }: any) => {
      const row = tables[collection].find((item) => item.id === id)
      if (!row) throw new Error('Missing update target')
      Object.assign(row, structuredClone(data))
      return structuredClone(row)
    }),
    jobs: { queue: vi.fn(async () => ({ id: 'durable-job' })) },
  }
  const add = (suffix = 'a') => {
    const variant = {
      id: `variant-${suffix}`,
      draft: 'draft',
      account: 'account',
      network: 'bluesky',
      text: `Approved ${suffix}`,
      attachments: [],
      status: 'scheduled',
      linkUrl: undefined,
    }
    const hash = socialHash({
      network: 'bluesky',
      text: variant.text,
      attachments: [],
      linkUrl: undefined,
    })
    tables['social-network-variants'].push({ ...variant, approvalHash: hash })
    const row = {
      id: `queue-${suffix}`,
      variant: variant.id,
      account: 'account',
      status: 'scheduled',
      attemptCount: 0,
      scheduledFor: new Date(Date.now() - 1000).toISOString(),
      idempotencyKey: `scheduled:draft:draft:${variant.id}:${hash}`,
    }
    tables['social-queue-items'].push(row)
    return row as any
  }
  return { payload, tables, add }
}
const run = (payload: any, queue: any, mode: any = 'dispatch') =>
  executeSocialQueueItem(payload, { queueItemId: queue.id, workerId: 'test-worker', mode })
const published = {
  status: 'published',
  remoteId: 'provider-confirmed',
  remoteUrl: 'http://127.0.0.1:3132/post/confirmed',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3132')
  provider.publish.mockResolvedValue(published)
  provider.reconcile.mockResolvedValue(published)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('08C canonical outbox worker', () => {
  it('keeps browser-generated idempotency keys byte-identical to prior SHA-256 keys, including Unicode', () => {
    for (const variantId of ['variant', 'Unicode-??-?']) {
      const expected = createHash('sha256')
        .update(`${variantId}:immediate:account`)
        .digest('hex')
        .slice(0, 16)
      expect(generateVariantIdempotencyKey(variantId, undefined, 'account')).toBe(
        `social:dispatch:${expected}`,
      )
    }
  })
  it('publishes through the provider and persists one attempt, receipt and parent status; redispatch sends nothing', async () => {
    const { payload, tables, add } = store(),
      queue = add()
    expect((await run(payload, queue)).output.status).toBe('published')
    expect(queue.status).toBe('published')
    expect(tables['social-publish-attempts'][0]).toMatchObject({
      status: 'published',
      attemptNumber: 1,
    })
    expect(tables['external-posts']).toHaveLength(1)
    expect(tables['social-drafts'][0].status).toBe('published')
    await run(payload, queue)
    expect(provider.publish).toHaveBeenCalledTimes(1)
    expect(tables['external-posts']).toHaveLength(1)
  })
  it('enforces schedule, provider backoff and bounded retry in the service, including durable next jobs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    const { payload, tables, add } = store(),
      queue = add()
    queue.scheduledFor = new Date(Date.now() + 10000).toISOString()
    expect((await run(payload, queue)).output).toMatchObject({ skipped: true, reason: 'not-due' })
    vi.advanceTimersByTime(11000)
    provider.publish.mockResolvedValue({
      status: 'failed',
      error: {
        kind: 'rate-limit',
        message: 'Slow down',
        retryAfter: new Date(Date.now() + 10000).toISOString(),
        remoteOutcome: 'known-failed',
      },
    })
    await run(payload, queue)
    expect(payload.jobs.queue).toHaveBeenCalledWith(
      expect.objectContaining({ queue: 'operations', waitUntil: new Date(Date.now() + 10000) }),
    )
    await run(payload, queue, 'retry')
    expect(provider.publish).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(11000)
    await run(payload, queue, 'retry')
    vi.advanceTimersByTime(11000)
    await run(payload, queue, 'retry')
    vi.advanceTimersByTime(11000)
    await run(payload, queue, 'retry')
    expect(provider.publish).toHaveBeenCalledTimes(3)
    expect(queue.attemptCount).toBe(3)
    expect(queue.nextAttemptAt).toBeNull()
    expect(tables['social-publish-attempts']).toHaveLength(3)
  })
  it('retains partial success and retries only the failed destination', async () => {
    vi.useFakeTimers()
    const { payload, tables, add } = store(),
      first = add('one'),
      second = add('two')
    await run(payload, first)
    provider.publish.mockResolvedValueOnce({
      status: 'failed',
      error: { kind: 'transient', message: 'Unavailable', remoteOutcome: 'known-failed' },
    })
    await run(payload, second)
    expect(tables['social-drafts'][0].status).toBe('partially-published')
    vi.advanceTimersByTime(2000)
    await run(payload, first, 'retry')
    await run(payload, second, 'retry')
    expect(first.attemptCount).toBe(1)
    expect(second.attemptCount).toBe(2)
    expect(provider.publish).toHaveBeenCalledTimes(3)
    expect(tables['social-drafts'][0].status).toBe('published')
  })
  it('quarantines an uncertain send and reconciles it without replay or incrementing send attempts', async () => {
    const { payload, tables, add } = store(),
      queue = add()
    provider.publish.mockResolvedValueOnce({
      status: 'unknown',
      error: { kind: 'remote-unknown', message: 'Lost response', remoteOutcome: 'unknown' },
    })
    await run(payload, queue)
    expect(queue.status).toBe('unknown')
    expect(tables['social-publish-attempts'][0].status).toBe('unknown')
    await run(payload, queue, 'retry')
    expect(provider.publish).toHaveBeenCalledTimes(1)
    await run(payload, queue, 'reconcile')
    expect(queue.status).toBe('published')
    expect(queue.attemptCount).toBe(1)
    expect(provider.publish).toHaveBeenCalledTimes(1)
    expect(provider.reconcile).toHaveBeenCalledTimes(1)
    expect(tables['external-posts']).toHaveLength(1)
  })
  it('keeps active leases and cancelled work untouched, even for the same worker identity', async () => {
    const { payload, add } = store(),
      queue = add()
    queue.status = 'publishing'
    queue.leaseOwner = 'test-worker'
    queue.leaseUntil = new Date(Date.now() + 60000).toISOString()
    await run(payload, queue)
    queue.status = 'cancelled'
    await run(payload, queue)
    expect(provider.publish).not.toHaveBeenCalled()
    expect(provider.reconcile).not.toHaveBeenCalled()
  })
  it('recovers an expired publishing lease by read-only reconciliation', async () => {
    const { payload, add } = store(),
      queue = add()
    Object.assign(queue, {
      status: 'publishing',
      attemptCount: 1,
      leaseUntil: new Date(Date.now() - 1).toISOString(),
    })
    await run(payload, queue)
    expect(provider.reconcile).toHaveBeenCalledTimes(1)
    expect(provider.publish).not.toHaveBeenCalled()
    expect(queue.status).toBe('published')
  })
  it('rejects foreign account substitution and edited approval snapshots before provider access', async () => {
    const { payload, tables, add } = store(),
      queue = add()
    tables['social-accounts'][0].site = 'foreign'
    await expect(run(payload, queue)).rejects.toThrow('authorization')
    tables['social-accounts'][0].site = 'site-a'
    tables['social-network-variants'][0].text = 'Unapproved edit'
    await expect(run(payload, queue)).rejects.toThrow('authorization')
    expect(provider.publish).not.toHaveBeenCalled()
    expect(tables['social-publish-attempts']).toHaveLength(0)
  })
  it('disconnects safely without contacting the provider and never auto retries a terminal failure', async () => {
    const { payload, tables, add } = store(),
      queue = add()
    tables['social-accounts'][0].credentialHealth = 'revoked'
    await run(payload, queue)
    await run(payload, queue, 'retry')
    expect(queue.status).toBe('failed')
    expect(queue.deadLetterReason.kind).toBe('reconnect-required')
    expect(provider.publish).not.toHaveBeenCalled()
    expect(queue.attemptCount).toBe(1)
  })
  it('presents unknown outcome ahead of partial success', () => {
    expect(campaignState(['unknown', 'published'])).toBe('unknown')
    expect(campaignState(['cancelled', 'cancelled'])).toBe('cancelled')
  })
})

describe('08C real adapter uncertainty boundaries', () => {
  const variant: SocialVariant = {
    id: 'variant',
    network: 'bluesky',
    accountId: 'account',
    text: 'Approved text',
    status: 'scheduled',
    idempotencyKey: 'approved-key',
    attachments: [],
  }
  const context = {
    accountId: 'account',
    network: 'bluesky' as const,
    credentials: {
      service: 'http://127.0.0.1:3132',
      identifier: 'operator',
      appPassword: 'local-only',
    },
  }
  it('honors Retry-After seconds, HTTP dates and absolute reset epochs without inventing an invalid deadline', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    expect(socialRetryAfter('15', now)).toBe('2026-10-20T12:00:15.000Z')
    expect(socialRetryAfter('Tue, 20 Oct 2026 12:01:00 GMT', now)).toBe('2026-10-20T12:01:00.000Z')
    expect(socialRetryAfter(String((now + 60000) / 1000), now)).toBe('2026-10-20T12:01:00.000Z')
    expect(socialRetryAfter('invalid', now)).toBeUndefined()
  })
  it('classifies only exact configured sandbox origins and preserves remote production mode', () => {
    vi.stubEnv('SOCIAL_REMOTE_SANDBOX_ORIGINS', 'https://sandbox.example.test')
    expect(socialProviderMode('http://127.0.0.1:3132')).toBe('local-harness')
    expect(socialProviderMode('https://sandbox.example.test/post')).toBe('remote-sandbox')
    expect(socialProviderMode('https://sandbox.example.test.evil.invalid/post')).toBe('live')
    expect(socialProviderMode('https://bsky.social')).toBe('live')
  })
  it('requires explicit local adapter origins and blocks misleading local-looking remote hosts', () => {
    expect(() => assertSocialEndpoint('http://127.0.0.1:3133/post')).toThrow(
      'explicitly configured',
    )
    expect(() => assertSocialEndpoint('http://localhost.evil.invalid/post')).toThrow('HTTPS')
  })
  it('does not send after a failed lookup and refuses to claim mismatched existing content as success', async () => {
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ did: 'did:plc:operator', handle: 'operator', accessJwt: 'local' }),
        ),
      )
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    const result = await new BlueskyAdapter().publish(variant, context)
    expect(result.status).toBe('failed')
    expect(mock).toHaveBeenCalledTimes(2)
    mock
      .mockReset()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ did: 'did:plc:operator', handle: 'operator', accessJwt: 'local' }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ uri: 'at://foreign/post/123', value: { text: 'Different' } }),
        ),
      )
    expect((await new BlueskyAdapter().publish(variant, context)).status).toBe('failed')
    expect(mock).toHaveBeenCalledTimes(2)
    mock.mockRestore()
  })
  it('treats an unconfigured local origin as a known terminal refusal, not an uncertain send', async () => {
    const mock = vi.spyOn(globalThis, 'fetch')
    const result = await new MastodonAdapter().publish(
      { ...variant, network: 'mastodon' },
      {
        accountId: 'account',
        network: 'mastodon',
        credentials: { instanceUrl: 'http://127.0.0.1:3133', token: 'local-only' },
      },
    )
    expect(result.status).toBe('failed')
    if (result.status !== 'published')
      expect(result.error).toMatchObject({ kind: 'validation', remoteOutcome: 'known-failed' })
    expect(mock).not.toHaveBeenCalled()
    mock.mockRestore()
  })
  it('marks a lost Mastodon response unknown and requires reconciliation', async () => {
    const mock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('connection closed after send'))
    const result = await new MastodonAdapter().publish(
      { ...variant, network: 'mastodon' },
      {
        accountId: 'account',
        network: 'mastodon',
        credentials: { instanceUrl: 'http://127.0.0.1:3132', token: 'local-only' },
      },
    )
    expect(result.status).toBe('unknown')
    if (result.status !== 'published') expect(result.error.remoteOutcome).toBe('unknown')
    expect(mock).toHaveBeenCalledTimes(1)
    mock.mockRestore()
  })
})
