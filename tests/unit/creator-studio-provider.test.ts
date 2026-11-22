import { describe, expect, it } from 'vitest'
import { createSyntheticProvider } from '../fixtures/creator-studio-provider'

describe('CRE-00 synthetic provider contract', () => {
  const request = {
    siteId: 'site-a',
    actorId: 'creator-a',
    operation: 'deliver',
    key: 'attempt-1',
    requestHash: 'hash-a',
  }

  it('returns the same result for a retry, rejects changed content, and scopes keys by tenant', async () => {
    const provider = createSyntheticProvider()
    const first = await provider.deliver(request)
    expect(await provider.deliver(request)).toEqual(first)
    await expect(provider.deliver({ ...request, requestHash: 'hash-b' })).rejects.toThrow(
      'idempotency conflict',
    )
    expect(await provider.deliver({ ...request, siteId: 'site-b' })).not.toEqual(first)
  })

  it('exposes a deterministic failure without a successful delivery', async () => {
    await expect(createSyntheticProvider(true).deliver(request)).rejects.toThrow(
      'synthetic provider unavailable',
    )
  })
})
