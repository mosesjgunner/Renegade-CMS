import { describe, expect, it } from 'vitest'
import {
  normalizeSemanticSlug,
  resolveCanonicalUrl,
  resolvePublicUrl,
  validatePublicPath,
  validateRouteTemplate,
  validateRouteTemplates,
  validateRouteTemplatesBySite,
  readRouteTemplatesBySite,
  routeTemplatesForSite,
} from '../../src/modules/public/semantic-url'

describe('semantic URL resolver', () => {
  it('resolves supported entity patterns without IDs', () => {
    expect(resolvePublicUrl({ kind: 'article', slug: 'First Post' })).toBe('/articles/first-post')
    expect(
      resolvePublicUrl({ kind: 'politician', jurisdiction: 'New York', slug: 'Jane Doe' }),
    ).toBe('/politicians/new-york/jane-doe')
    expect(
      resolvePublicUrl({ kind: 'organization', jurisdiction: 'Federal', slug: 'Office' }),
    ).toBe('/organizations/federal/office')
    expect(resolvePublicUrl({ kind: 'legislation', jurisdiction: 'US', slug: 'Bill 1' })).toBe(
      '/legislation/us/bill-1',
    )
    expect(resolvePublicUrl({ kind: 'event', slug: 'Annual Forum' })).toBe('/events/annual-forum')
    expect(resolvePublicUrl({ kind: 'timeline', slug: 'Day One' })).toBe('/timelines/day-one')
    expect(
      resolvePublicUrl(
        { kind: 'timeline', eventSlug: 'Annual Forum', slug: 'Day One' },
        { timeline: '/events/{eventSlug}/{slug}' },
      ),
    ).toBe('/events/annual-forum/day-one')
    expect(resolvePublicUrl({ kind: 'topic', slug: 'Local News' })).toBe('/topics/local-news')
    expect(resolvePublicUrl({ kind: 'media', mediaType: 'Video', slug: 'Interview' })).toBe(
      '/media/video/interview',
    )
    expect(resolvePublicUrl({ kind: 'discussion', forumSlug: 'Local News', slug: 'Meeting' })).toBe(
      '/forums/local-news/meeting',
    )
    expect(resolvePublicUrl({ kind: 'collection', slug: 'Highlights' })).toBe(
      '/collections/highlights',
    )
  })

  it('preserves stored canonical paths and validates configurable patterns', () => {
    expect(
      resolvePublicUrl({ kind: 'article', slug: 'renamed', canonicalPath: '/articles/original' }),
    ).toBe('/articles/original')
    expect(resolveCanonicalUrl({ kind: 'article', slug: 'One' }, 'https://example.test')).toBe(
      'https://example.test/articles/one',
    )
    expect(validateRouteTemplate('/stories/{slug}')).toBeNull()
    expect(validateRouteTemplates({})).toBeNull()
    expect(
      validateRouteTemplates({ article: '/content/{slug}', event: '/content/{slug}' }),
    ).toContain('same path')
    expect(validateRouteTemplates({ article: '/stories/{jurisdiction}/{slug}' })).toContain(
      'not supported',
    )
    expect(validateRouteTemplate('/api/{slug}')).toContain('reserved')
    expect(validateRouteTemplates({ video: '/clips/{slug}' })).toContain('fixed renderer path')
    expect(validateRouteTemplate('/stories/{unknown}/{slug}')).toContain('Unsupported')
    expect(() => validatePublicPath('/articles/%2e%2e')).toThrow()
    expect(() => resolvePublicUrl({ kind: 'event', slug: 'page' })).toThrow('reserved')
    expect(() => resolvePublicUrl({ kind: 'politician', slug: 'Jane' })).toThrow('jurisdiction')
  })

  it('applies site templates over installation defaults', () => {
    const templates = routeTemplatesForSite(
      'site-b',
      { article: '/articles/{slug}' },
      { 'site-a': { article: '/news/{slug}' }, 'site-b': { article: '/stories/{slug}' } },
    )
    expect(resolvePublicUrl({ kind: 'article', slug: 'Hello' }, templates)).toBe('/stories/hello')
    expect(
      resolvePublicUrl(
        { kind: 'article', slug: 'Hello' },
        routeTemplatesForSite(
          'site-a',
          { article: '/articles/{slug}' },
          {
            'site-a': { article: '/news/{slug}' },
          },
        ),
      ),
    ).toBe('/news/hello')
  })

  it('validates site overrides against the merged installation defaults', () => {
    const defaults = { article: '/stories/{slug}' }
    const bySite = { 'site-a': { event: '/stories/{slug}' } }
    expect(validateRouteTemplatesBySite(bySite, defaults)).toContain('same path')
    expect(readRouteTemplatesBySite(bySite, defaults)).toEqual({})
  })

  it('normalizes Unicode, repeated separators and unsafe characters', () => {
    expect(normalizeSemanticSlug('  Café — One___Two!  ')).toBe('cafe-one-two')
  })
})
