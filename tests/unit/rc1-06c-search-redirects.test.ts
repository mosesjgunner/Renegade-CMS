import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { validateRedirectRuleInput } from '../../src/modules/public/redirect-manager'
import { rebuildSearchProjection } from '../../src/modules/public/search-projection'

vi.mock('../../src/modules/public/discovery', () => ({
  resolveDiscoveryDocument: vi.fn(async () => ({
    indexability: { indexable: false },
    search: {},
    redirect: {},
  })),
  discoveryToSearchDocument: vi.fn(),
}))

describe('06C search rebuild completeness and failure', () => {
  it('visits every page beyond 1000 and only registered collections, then sweeps', async () => {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({ rows: [] }))
    const find = vi.fn(async ({ page }: { page: number }) => ({
      docs: Array.from({ length: page < 6 ? 200 : 1 }, (_, i) => ({
        id: `${page}-${i}`,
        site: 'site',
      })),
      hasNextPage: page < 6,
    }))
    const payload = {
      collections: { content: {} },
      find,
      db: { pool: { query } },
    } as unknown as Payload
    expect(await rebuildSearchProjection(payload, 'site')).toMatchObject({ processed: 1001 })
    expect(find).toHaveBeenCalledTimes(6)
    expect(query.mock.calls.at(-1)?.[0]).toContain('NOT ((collection')
    expect(query.mock.calls.at(-1)?.[1]?.[0]).toHaveLength(1001)
  })
  it('propagates source read failure without sweeping the previous index', async () => {
    const query = vi.fn()
    const payload = {
      collections: { content: {} },
      find: vi.fn().mockRejectedValue(new Error('database unavailable')),
      db: { pool: { query } },
    } as unknown as Payload
    await expect(rebuildSearchProjection(payload, 'site')).rejects.toThrow('database unavailable')
    expect(query).not.toHaveBeenCalled()
  })
})

describe('06C redirect graph safety', () => {
  it.each([
    [
      { fromPath: '/a', toPath: '/b' },
      { fromPath: '/b', toPath: '/c' },
    ],
    [
      { fromPath: '/b', toPath: '/c' },
      { fromPath: '/a', toPath: '/b' },
    ],
    [
      { fromPath: '/a', toPath: '/b' },
      { fromPath: '/b', toPath: '/a' },
    ],
    [
      { fromPath: '/a', toPath: '/b', match: 'prefix' },
      { fromPath: '/c', toPath: '/a/child' },
    ],
  ])('rejects outgoing/incoming chains, loops and prefix chains', (existing, candidate) => {
    expect(validateRedirectRuleInput(candidate, [existing]).valid).toBe(false)
  })
  it('ignores disabled rules and excludes the rule being edited', () => {
    expect(
      validateRedirectRuleInput({ fromPath: '/a', toPath: '/b' }, [
        { fromPath: '/b', toPath: '/a', enabled: false },
      ]).valid,
    ).toBe(true)
    expect(
      validateRedirectRuleInput({ id: 'one', fromPath: '/a', toPath: '/b' }, [
        { id: 'one', fromPath: '/b', toPath: '/a' },
      ]).valid,
    ).toBe(true)
  })
  it.each(['//evil.test', '/%2f%2fevil', '/%0d%0aheader', '/%2e%2e/private', '/a\\b'])(
    'rejects unsafe destination %s',
    (toPath) => {
      expect(validateRedirectRuleInput({ fromPath: '/old', toPath }).valid).toBe(false)
    },
  )
})
