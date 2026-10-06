import { describe, expect, it, vi } from 'vitest'
import { inspectRenderedHtml, runRenderedAudit } from '../../src/modules/public/discovery-audit'

describe('DISC-05 rendered audit', () => {
  it('checks uncrawled navigation links over HTTP and excludes resource hints and fragment duplicates', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          '<title>Dispatch public page</title><h1 id="intro">Dispatch</h1><link rel="stylesheet" href="/style.css"><a href="#intro">Intro</a><a href="/search">Search</a><a href="/missing">Missing</a>',
          { status: String(url).endsWith('/missing') ? 404 : 200 },
        ),
    )
    const result = await runRenderedAudit({
      origin: 'https://example.test',
      paths: ['/'],
      fetcher,
      resolve: async () => [{ address: '93.184.216.34' }],
    })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(result.graph.map((link) => link.status)).toEqual([200, 200, 404])
    expect(
      result.issues.filter((item) => item.ruleId === 'DISC-05-INTERNAL-LINK-UNREACHABLE'),
    ).toEqual([expect.objectContaining({ evidence: expect.stringContaining('/missing') })])
  })
  it('uses rendered output for deterministic repairable findings', () => {
    const page = inspectRenderedHtml(
      'https://example.test/a',
      200,
      'https://example.test/a',
      '<html><head><title>same</title><meta name="robots" content="noindex"><link rel="canonical" href="/a"><script type="application/ld+json">{bad}</script></head><body><h1>One</h1><h1>Two</h1><img src="/x.png"></body></html>',
    )
    expect(page.issues.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining([
        'DISC-05-TITLE-BOUNDS',
        'DISC-05-INDEXABILITY-CONTRADICTION',
        'DISC-05-SCHEMA-INVALID',
        'DISC-05-HEADING-HIERARCHY',
        'DISC-05-MEDIA-ALT-MISSING',
      ]),
    )
    expect(page.issues.every((item) => item.ruleVersion === '1.0.0' && item.repairTarget)).toBe(
      true,
    )
  })
  it('bounds same-origin crawling and refuses cross-origin links', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          '<title>A sufficiently unique title</title><meta name="description" content="A deliberately long enough rendered description for this page to satisfy the check."><link rel="canonical" href="/a"><h1>A</h1><a href="https://evil.test/no">bad</a>',
          { status: 200 },
        ),
    ) as unknown as typeof fetch
    const resolve = async () => [{ address: '93.184.216.34' }]
    const result = await runRenderedAudit({
      origin: 'https://example.test',
      paths: ['/a', 'https://evil.test/no'],
      fetcher,
      resolve,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].url).toBe('https://example.test/a')
  })
})
