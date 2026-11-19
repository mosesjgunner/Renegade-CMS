import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { inspectRenderedHtml, runRenderedAudit } from '../../src/modules/public/discovery-audit'

const PUBLIC_RESOLVE = async () => [{ address: '93.184.216.34' }]
const CLEAN_HTML =
  '<title>A sufficiently unique title</title><meta name="description" content="A deliberately long enough rendered description for this page to satisfy the check."><link rel="canonical" href="/a"><h1>A</h1>'

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
    expect(result.scope).toMatchObject({ eligible: 1, examined: 1, state: 'complete' })
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
  it('bounds crawling to the audit origin and refuses cross-origin links', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          '<title>A sufficiently unique title</title><meta name="description" content="A deliberately long enough rendered description for this page to satisfy the check."><link rel="canonical" href="/a"><h1>A</h1><a href="https://evil.test/no">bad</a>',
          { status: 200 },
        ),
    ) as unknown as typeof fetch
    const result = await runRenderedAudit({
      origin: 'https://example.test',
      paths: ['/a'],
      fetcher,
      resolve: PUBLIC_RESOLVE,
    })
    // The page itself is fetched once; its cross-origin link is never fetched.
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].url).toBe('https://example.test/a')
  })
  it('re-bases a hostile absolute-URL input onto the audit origin instead of crawling off-site', async () => {
    // DEBT-14 contract: inputs are never silently dropped, and a foreign
    // absolute URL contributes only its path + query — every fetch stays
    // on the audit origin while the document keeps its input identity.
    const fetcher = vi.fn(
      async () => new Response(CLEAN_HTML, { status: 200 }),
    ) as unknown as typeof fetch
    const result = await runRenderedAudit({
      origin: 'https://example.test',
      paths: ['/a', 'https://evil.test/no'],
      fetcher,
      resolve: PUBLIC_RESOLVE,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const call of (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls)
      expect(new URL(String(call[0])).origin).toBe('https://example.test')
    expect(result.scope).toMatchObject({ eligible: 2, examined: 2, state: 'complete' })
    expect(result.pages.map((page) => page.url)).toContain('https://evil.test/no')
  })
  it('reports an empty scope when every fetch fails instead of a clean audit', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const result = await runRenderedAudit({
      origin: 'https://example.test',
      paths: ['/a', '/b'],
      fetcher,
      resolve: PUBLIC_RESOLVE,
    })
    expect(result.scope).toMatchObject({
      eligible: 2,
      examined: 0,
      failed: 2,
      state: 'empty',
      complete: false,
    })
    expect(result.pages.every((page) => page.status === 0)).toBe(true)
    expect(result.issues.map((item) => item.ruleId)).toContain('DISC-05-FETCH-SAFETY')
  })
  it('accounts for paths beyond the page cap as skipped, never silently dropped', async () => {
    const fetcher = vi.fn(
      async () => new Response(CLEAN_HTML, { status: 200 }),
    ) as unknown as typeof fetch
    const result = await runRenderedAudit({
      origin: 'https://example.test',
      paths: ['/a', '/b'],
      maxPages: 1,
      fetcher,
      resolve: PUBLIC_RESOLVE,
    })
    expect(result.scope.eligible).toBe(2)
    expect(result.scope.examined).toBe(1)
    expect(result.scope.state).toBe('partial')
    expect(result.scope.complete).toBe(false)
    expect(result.scope.skipped).toEqual([
      { url: 'https://example.test/b', reason: expect.stringContaining('maxPages') },
    ])
  })
  it('fetches split-origin audits from the fetch base while judging pages by their canonical URLs', async () => {
    const fetched: string[] = []
    const fetcher = vi.fn(async (url: unknown) => {
      const target = String(url)
      fetched.push(target)
      const canonical = target.endsWith('/b')
        ? 'https://site.example/other'
        : 'https://site.example/a'
      return new Response(
        `<title>A sufficiently unique title</title><meta name="description" content="A deliberately long enough rendered description for this page to satisfy the check."><link rel="canonical" href="${canonical}"><h1>A</h1>`,
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const result = await runRenderedAudit({
      origin: 'https://site.example',
      fetchBase: 'http://127.0.0.1:39073',
      siteHost: 'site.example',
      paths: ['https://site.example/a', 'https://site.example/b'],
      fetcher,
      allowPrivate: true,
      resolve: async () => [{ address: '127.0.0.1' }],
    })
    expect(fetched).toEqual(['http://127.0.0.1:39073/a', 'http://127.0.0.1:39073/b'])
    expect(result.scope).toMatchObject({ eligible: 2, examined: 2, state: 'complete' })
    expect(result.pages.map((page) => page.url)).toEqual([
      'https://site.example/a',
      'https://site.example/b',
    ])
    const conflicts = result.issues.filter((item) => item.ruleId === 'DISC-05-CANONICAL-CONFLICT')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].url).toBe('https://site.example/b')
    // The comparison runs against the document's canonical URL, never the
    // internal fetch URL.
    expect(conflicts[0].evidence).toContain('https://site.example/b')
    expect(conflicts[0].evidence).not.toContain('127.0.0.1')
  })
  it('presents the canonical Host header when fetching a split origin over real HTTP', async () => {
    const seen: Array<{ host: string | undefined; url: string | undefined }> = []
    const server = createServer((req, res) => {
      seen.push({ host: req.headers.host, url: req.url })
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        '<title>A sufficiently unique title</title><meta name="description" content="A deliberately long enough rendered description for this page to satisfy the check."><link rel="canonical" href="https://site.example/a"><h1>A</h1>',
      )
    })
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
    const port = (server.address() as AddressInfo).port
    try {
      const result = await runRenderedAudit({
        origin: 'https://site.example',
        fetchBase: `http://127.0.0.1:${port}`,
        siteHost: 'site.example',
        paths: ['/a'],
        allowPrivate: true,
        resolve: async () => [{ address: '127.0.0.1' }],
      })
      expect(seen).toEqual([{ host: 'site.example', url: '/a' }])
      expect(result.scope).toMatchObject({ examined: 1, state: 'complete' })
      expect(result.issues.filter((item) => item.ruleId === 'DISC-05-CANONICAL-CONFLICT')).toEqual(
        [],
      )
      expect(result.pages[0].url).toBe('https://site.example/a')
    } finally {
      server.close()
    }
  })
})
