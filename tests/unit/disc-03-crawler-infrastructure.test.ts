import { describe, expect, it, vi } from 'vitest'
import {
  crawlerEntries,
  renderSitemap,
  renderSitemapIndex,
  sitemapPage,
  sitemapPageCount,
  crawlerScale,
} from '../../src/modules/public/crawler'
import {
  ManualWebmasterAdapter,
  WebmasterProviderError,
  indexingChangesFor,
  indexingKey,
  submitIndexingChange,
  submitSitemapUrl,
  type IndexingChange,
  type WebmasterAdapter,
} from '../../src/modules/public/indexing'

const change: IndexingChange = {
  siteId: 'site-1',
  url: '/article',
  action: 'upsert',
  reason: 'publication',
  version: '7',
}
const doc = (
  url: string,
  indexable = true,
  modifiedAt = '2026-09-15T12:00:00.000Z',
  media?: Record<string, unknown>,
) =>
  ({
    canonicalUrl: url,
    contentType: 'article',
    indexability: { indexable },
    title: { value: 'Test Title', source: 'content_derived' },
    description: { value: 'Test description', source: 'content_derived' },
    dates: { modifiedAt, publishedAt: null },
    socialImage: { url: null, variantUrl: null },
    media: media || {},
  }) as unknown as Parameters<typeof crawlerEntries>[0][0]

describe('DISC-03 crawler infrastructure', () => {
  it('deduplicates, excludes, sorts, partitions and emits accurate lastmod deterministically', () => {
    const entries = crawlerEntries([
      doc('https://example.test/z'),
      doc('https://example.test/a'),
      doc('https://example.test/draft', false),
      doc('https://example.test/a'),
    ])
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://example.test/a',
      'https://example.test/z',
    ])
    expect(entries[0]?.lastmod).toBe('2026-09-15T12:00:00.000Z')
    expect(sitemapPageCount(2001, 1000)).toBe(3)
    expect(sitemapPage([...entries, ...entries], 1, 2)).toHaveLength(2)
    expect(renderSitemap(entries)).toContain('<lastmod>2026-09-15T12:00:00.000Z</lastmod>')
    expect(renderSitemapIndex('https://example.test', entries, 1)).toContain('/sitemaps/2.xml')
  })

  it('keeps manual handoff honest and idempotency keys stable', async () => {
    const manual = new ManualWebmasterAdapter()
    expect(await manual.submit(change)).toMatchObject({ state: 'manual' })
    expect(await manual.submitSitemap('https://example.test/sitemap.xml')).toMatchObject({
      state: 'manual',
    })
    expect(indexingKey(change)).toBe(indexingKey({ ...change }))
  })

  it('emits a remove and upsert with canonical absolute URLs for a slug change', () => {
    expect(
      indexingChangesFor(
        { site: 'site-1', status: 'published', canonicalPath: '/articles/new', updatedAt: '8' },
        { site: 'site-1', status: 'published', canonicalPath: '/articles/old' },
        'https://example.test',
      ),
    ).toEqual([
      expect.objectContaining({ action: 'remove', url: 'https://example.test/articles/old' }),
      expect.objectContaining({ action: 'upsert', url: 'https://example.test/articles/new' }),
    ])
  })

  it('emits remove indexing change on unpublication or noindex change', () => {
    // Unpublication
    expect(
      indexingChangesFor(
        { site: 'site-1', status: 'draft', canonicalPath: '/articles/test' },
        { site: 'site-1', status: 'published', canonicalPath: '/articles/test' },
        'https://example.test',
      ),
    ).toEqual([
      expect.objectContaining({
        action: 'remove',
        reason: 'unpublication',
        url: 'https://example.test/articles/test',
      }),
    ])

    // Noindex toggle
    expect(
      indexingChangesFor(
        { site: 'site-1', status: 'published', canonicalPath: '/articles/test', seoNoIndex: true },
        { site: 'site-1', status: 'published', canonicalPath: '/articles/test', seoNoIndex: false },
        'https://example.test',
      ),
    ).toEqual([
      expect.objectContaining({
        action: 'remove',
        reason: 'noindex',
        url: 'https://example.test/articles/test',
      }),
    ])
  })

  it('omits invalid timestamps and empty image sitemap extensions', () => {
    const entries = crawlerEntries([doc('https://example.test/bad-date', true, 'not-a-date')])
    expect(entries.map(({ url }) => url)).toEqual(['https://example.test/bad-date'])
    expect(entries[0]?.lastmod).toBeUndefined()
    expect(renderSitemap(crawlerEntries([doc('https://example.test/a')]))).not.toContain(
      'xmlns:image',
    )
  })

  it('emits standards-specific video sitemap extension only when required facts exist', () => {
    // Complete video facts
    const validVideoDoc = doc(
      'https://example.test/videos/sample',
      true,
      '2026-09-15T12:00:00.000Z',
      {
        video: {
          url: 'https://example.test/video-media/asset-1/baseline.mp4',
          posterUrl: 'https://example.test/video-media/asset-1/poster.jpg',
        },
      },
    )
    const entries = crawlerEntries([validVideoDoc])
    expect(entries[0]?.video).toBeDefined()
    expect(entries[0]?.video?.contentLoc).toBe(
      'https://example.test/video-media/asset-1/baseline.mp4',
    )
    expect(entries[0]?.video?.thumbnailLoc).toBe(
      'https://example.test/video-media/asset-1/poster.jpg',
    )

    const xml = renderSitemap(entries)
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"')
    expect(xml).toContain('<video:video>')
    expect(xml).toContain(
      '<video:thumbnail_loc>https://example.test/video-media/asset-1/poster.jpg</video:thumbnail_loc>',
    )
    expect(xml).toContain('<video:title>Test Title</video:title>')
    expect(xml).toContain('<video:description>Test description</video:description>')
    expect(xml).toContain(
      '<video:content_loc>https://example.test/video-media/asset-1/baseline.mp4</video:content_loc>',
    )

    // Incomplete video facts (missing poster or external) - must not emit broken video tags
    const incompleteVideoDoc = doc(
      'https://example.test/videos/incomplete',
      true,
      '2026-09-15T12:00:00.000Z',
      {
        video: {
          url: 'https://example.test/video-media/asset-2/baseline.mp4',
          posterUrl: '', // missing
        },
      },
    )
    const incompleteEntries = crawlerEntries([incompleteVideoDoc])
    expect(incompleteEntries[0]?.video).toBeUndefined()
    expect(renderSitemap(incompleteEntries)).not.toContain('xmlns:video')
  })

  it.each([
    ['rate limit', new WebmasterProviderError('limited', 'rate_limit', 5000), true],
    ['authentication', new WebmasterProviderError('bad credential', 'authentication'), false],
    ['remote failure', new WebmasterProviderError('remote failed', 'remote'), true],
  ])('reports %s without throwing into publication', async (_label, failure, retryable) => {
    const adapter: WebmasterAdapter = {
      id: 'test',
      health: vi.fn(),
      ingestStatus: vi.fn(),
      submit: vi.fn().mockRejectedValue(failure),
    }
    await expect(submitIndexingChange(adapter, change)).resolves.toMatchObject({
      state: 'failed',
      retryable,
    })
  })

  it('bounds remote delay without blocking publication indefinitely', async () => {
    const adapter: WebmasterAdapter = {
      id: 'slow',
      health: vi.fn(),
      ingestStatus: vi.fn(),
      submit: () => new Promise(() => {}),
    }
    await expect(submitIndexingChange(adapter, change, 5)).resolves.toMatchObject({
      state: 'failed',
      retryable: true,
    })
  })

  it('tests submitSitemapUrl provider-neutral contract', async () => {
    const manual = new ManualWebmasterAdapter()
    await expect(submitSitemapUrl(manual, 'https://example.test/sitemap.xml')).resolves.toEqual({
      state: 'manual',
      detail: expect.stringContaining('sitemap not submitted'),
    })

    const failingAdapter: WebmasterAdapter = {
      id: 'failing',
      health: vi.fn(),
      ingestStatus: vi.fn(),
      submit: vi.fn(),
      submitSitemap: vi
        .fn()
        .mockRejectedValue(new WebmasterProviderError('auth', 'authentication')),
    }
    await expect(
      submitSitemapUrl(failingAdapter, 'https://example.test/sitemap.xml'),
    ).resolves.toMatchObject({
      state: 'failed',
      retryable: false,
    })
  })

  it('reports explicit measured scale trigger for asynchronous generation', () => {
    const small = crawlerScale(500)
    expect(small.generation).toBe('request-streamed')
    expect(small.partitions).toBe(1)

    const boundary = crawlerScale(25_000)
    expect(boundary.generation).toBe('asynchronous-recommended')
    expect(boundary.partitions).toBe(25)
    expect(boundary.asyncTriggerUrls).toBe(25_000)
  })
})
