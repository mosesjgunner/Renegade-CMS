import { trackPublicModification } from '@/modules/public/public-modified'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  archivePageNumber,
  paginateArchive,
  ArchivePagination,
} from '@/modules/public/archive-pagination'
import { conditionalXml } from '@/modules/public/crawler'

describe('06B discovery freshness and accessible pagination', () => {
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '9007199254740992'])(
    'rejects invalid page %s',
    (raw) => expect(archivePageNumber(raw)).toBeNull(),
  )
  it('counts only the projected public records and rejects pages beyond the archive', () => {
    const visible = Array.from({ length: 13 }, (_, i) => i)
    expect(paginateArchive(visible, 1)).toMatchObject({
      totalPages: 2,
      hasNextPage: true,
      valid: true,
    })
    expect(paginateArchive(visible, 2).docs).toEqual([12])
    expect(paginateArchive(visible, 3).valid).toBe(false)
    expect(paginateArchive([], 1).valid).toBe(true)
  })
  it('provides named navigation, current page and genuine previous/next links', () => {
    const html = renderToStaticMarkup(
      <ArchivePagination path="/tags/news" page={2} totalPages={3} />,
    )
    expect(html).toContain('aria-label="Archive pagination"')
    expect(html).toContain('rel="prev" href="/tags/news?page=1"')
    expect(html).toContain('rel="next" href="/tags/news?page=3"')
    expect(html).toContain('aria-current="page"')
  })
  it('requires revalidation and invalidates stale validators on removal', () => {
    const initial = conditionalXml(
      new Request('https://example.test/sitemap.xml'),
      '<urlset>one</urlset>',
    )
    expect(initial.headers.get('cache-control')).toBe('public, no-cache, must-revalidate')
    const request = new Request('https://example.test/sitemap.xml', {
      headers: { 'if-none-match': initial.headers.get('etag')! },
    })
    expect(conditionalXml(request, '<urlset>one</urlset>').status).toBe(304)
    expect(conditionalXml(request, '<urlset/>').status).toBe(200)
  })
})

describe('06B public modification persistence', () => {
  const original = {
    status: 'published',
    visibility: 'public',
    title: 'Public title',
    body: { text: 'old' },
    publicModifiedAt: '2026-01-01T00:00:00Z',
  }
  const apply = (data: Record<string, unknown>) =>
    trackPublicModification({ data, originalDoc: original } as Parameters<
      typeof trackPublicModification
    >[0]) as Record<string, unknown>
  it('preserves the public date on unpublished body edits and rejects a supplied timestamp', () => {
    expect(
      apply({ status: 'updated', body: { text: 'secret' }, publicModifiedAt: '2999-01-01' })
        .publicModifiedAt,
    ).toBe(original.publicModifiedAt)
  })
  it('advances for live metadata and canonical slug changes', () => {
    expect(String(apply({ title: 'Changed' }).publicModifiedAt) > original.publicModifiedAt).toBe(
      true,
    )
    expect(String(apply({ slug: 'new-path' }).publicModifiedAt) > original.publicModifiedAt).toBe(
      true,
    )
  })
  it('does not invent a new date for a no-op or unpublication', () => {
    expect(apply({ title: original.title }).publicModifiedAt).toBe(original.publicModifiedAt)
    expect(apply({ status: 'draft' }).publicModifiedAt).toBe(original.publicModifiedAt)
  })
})
