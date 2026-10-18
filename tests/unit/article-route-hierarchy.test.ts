import { describe, expect, it, vi } from 'vitest'
const canonical = vi.hoisted(() => ({
  page: vi.fn(async (_args: { params: Promise<{ path: string[] }> }) => 'rendered'),
  metadata: vi.fn(async (_args: { params: Promise<{ path: string[] }> }) => ({ title: 'scoped' })),
}))
vi.mock('@/app/(frontend)/[...path]/page', () => ({
  default: canonical.page,
  generateMetadata: canonical.metadata,
}))
import ArticlePage, { generateMetadata } from '@/app/(frontend)/articles/[slug]/page'

describe('ordinary article URL uses canonical public hierarchy resolver', () => {
  it('delegates page rendering and metadata to the same canonical site and entitlement path', async () => {
    const args = { params: Promise.resolve({ slug: 'field-guide' }) }
    expect(await ArticlePage(args)).toBe('rendered')
    expect(await generateMetadata(args)).toEqual({ title: 'scoped' })
    expect(await canonical.page.mock.calls[0][0].params).toEqual({
      path: ['articles', 'field-guide'],
    })
    expect(await canonical.metadata.mock.calls[0][0].params).toEqual({
      path: ['articles', 'field-guide'],
    })
  })
})
