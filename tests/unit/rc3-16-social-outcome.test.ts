import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProviderCapabilityTruth,
  socialProviderFor,
} from '../../src/modules/social/provider-runtime'
import { executeVariantDelivery } from '../../src/modules/social/queue'
import {
  createCanonicalSocialPost,
  createSocialDeliveryRecord,
} from '../../src/modules/social/models'
import { isDeliveryReady } from '../../src/modules/social/worker'

describe('RC3-16 durable Bluesky outcome', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does not let a requested mode promote a manual or unavailable provider', () => {
    expect(getProviderCapabilityTruth('x', 'live').mode).toBe('manual-handoff')
    expect(getProviderCapabilityTruth('activitypub', 'live').mode).toBe('unavailable')
  })

  it('quarantines an exception after an in-memory worker invokes publish', async () => {
    const post = createCanonicalSocialPost({
      id: 'p',
      siteId: 's',
      publicationId: 'pub',
      title: 'Title',
      baseCopy: 'Copy',
      authorId: 'owner',
      targetAccounts: [{ accountId: 'a', network: 'bluesky' }],
    })
    const variant = post.variants[0]
    const delivery = createSocialDeliveryRecord(variant)
    const adapter = {
      ...socialProviderFor('bluesky'),
      publish: vi.fn(async () => {
        throw new Error('lost response')
      }),
    }
    const result = await executeVariantDelivery(
      post,
      variant,
      delivery,
      adapter,
      { accountId: 'a', accountHandle: 'fixture', network: 'bluesky', credentials: {} },
      undefined,
      { workerId: 'rc316' },
    )
    expect(result.status).toBe('unknown')
    expect(delivery.status).toBe('unknown')
    expect(isDeliveryReady(post, delivery)).toBe(false)
  })

  it('labels a local fixture receipt from the configured endpoint', async () => {
    vi.stubEnv('SOCIAL_LOCAL_ADAPTER_ORIGINS', 'http://127.0.0.1:3130')
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('createSession'))
        return Response.json({ accessJwt: 'fixture', did: 'did:plc:fixture' })
      if (String(url).includes('getRecord'))
        return Response.json({ error: 'RecordNotFound' }, { status: 404 })
      const body = JSON.parse(String(init?.body))
      return Response.json({ uri: `at://did:plc:fixture/app.bsky.feed.post/${body.rkey}` })
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await socialProviderFor('bluesky').publish?.(
      {
        id: 'variant',
        network: 'bluesky',
        accountId: 'account',
        text: 'approved',
        attachments: [],
        status: 'approved',
        idempotencyKey: 'fixture-key',
      },
      {
        accountId: 'account',
        credentials: {
          identifier: 'fixture',
          appPassword: 'fixture',
          service: 'http://127.0.0.1:3130',
        },
      },
    )
    expect(result).toMatchObject({
      status: 'published',
      receipt: {
        rawResponse: { providerMode: 'local-harness' },
        remoteUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:3130\/posts\//),
      },
    })
  })

  it.each(['lost response', 'server error'])('quarantines %s after submission', async (failure) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ accessJwt: 'fixture', did: 'did:plc:fixture' }))
      .mockResolvedValueOnce(Response.json({ error: 'RecordNotFound' }, { status: 400 }))
    if (failure === 'lost response') fetcher.mockRejectedValueOnce(new Error('connection lost'))
    else fetcher.mockResolvedValueOnce(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetcher)
    const result = await socialProviderFor('bluesky').publish?.(
      {
        id: 'variant',
        network: 'bluesky',
        accountId: 'account',
        text: 'approved',
        attachments: [],
        status: 'approved',
        idempotencyKey: 'fixture-key',
      },
      { accountId: 'account', credentials: { identifier: 'fixture', appPassword: 'fixture' } },
    )
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      status: 'unknown',
      error: { kind: 'remote-unknown', remoteOutcome: 'unknown' },
    })
  })
})
