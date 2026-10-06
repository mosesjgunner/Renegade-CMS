import { describe, expect, it, vi } from 'vitest'
import { allowConfiguredSelfAudit } from '@/modules/public/local-audit-origin'
import { runRenderedAudit } from '@/modules/public/discovery-audit'

describe('RC-02 local rendered audit boundary', () => {
  it('allows only the exact server-configured origin, including private production deployments', () => {
    expect(allowConfiguredSelfAudit('http://localhost:3128', 'http://localhost:3128')).toBe(true)
    for (const [origin, app] of [
      ['http://localhost:9999', 'http://localhost:3128'],
      ['http://169.254.169.254', 'http://localhost:3128'],
      ['https://other.test', 'http://localhost:3128'],
    ])
      expect(allowConfiguredSelfAudit(origin, app)).toBe(false)
    expect(allowConfiguredSelfAudit('https://dispatch.test', 'https://dispatch.test')).toBe(true)
  })
  it('fetches local pages but retains the same-origin and manual-redirect boundaries', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('<title>Local reporting</title><h1>Dispatch</h1>'),
    )
    const result = await runRenderedAudit({
      origin: 'http://localhost:3128',
      paths: ['/', 'http://localhost:9999/private'],
      allowPrivate: allowConfiguredSelfAudit('http://localhost:3128', 'http://localhost:3128'),
      resolve: async () => [{ address: '127.0.0.1' }],
      fetcher: fetcher as typeof fetch,
    })
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toHaveLength(2)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })
})
