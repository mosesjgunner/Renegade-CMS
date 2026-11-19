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
  it('fetches local pages with manual redirects, re-basing foreign inputs onto the audit origin', async () => {
    // Contract change (DEBT-14): inputs are no longer silently filtered
    // by origin. A foreign absolute URL contributes only its path and is
    // fetched from the audit origin itself — the crawl never leaves it,
    // and the input is accounted for in the audit scope.
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
    expect(result.pages).toHaveLength(2)
    expect(result.pages[0].status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const call of fetcher.mock.calls)
      expect(String(call[0])).toMatch(/^http:\/\/localhost:3128\//)
    expect(fetcher.mock.calls[0]).toHaveLength(2)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
    expect(result.scope).toMatchObject({ eligible: 2, examined: 2, state: 'complete' })
  })
})
