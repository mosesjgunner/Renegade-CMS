import { describe, expect, it } from 'vitest'
import { crossCheckDiscoveryOutputs } from '../../src/modules/public/discovery-cross-checks'
import type { RenderedPage } from '../../src/modules/public/discovery-audit'

describe('DISC-05 Sitemap, Feed & Robots Cross-Checks', () => {
  it('detects unreachable, noindex, and canonical mismatches in sitemap and feed', () => {
    const pages: RenderedPage[] = [
      {
        url: 'https://example.test/page-a',
        status: 404,
        finalUrl: 'https://example.test/page-a',
        title: null,
        description: null,
        canonical: null,
        robots: null,
        headings: [],
        links: [],
        issues: [],
        text: '',
      },
      {
        url: 'https://example.test/page-b',
        status: 200,
        finalUrl: 'https://example.test/page-b',
        title: 'B',
        description: null,
        canonical: 'https://example.test/page-b',
        robots: 'noindex, follow',
        headings: [],
        links: [],
        issues: [],
        text: '',
      },
      {
        url: 'https://example.test/page-c',
        status: 200,
        finalUrl: 'https://example.test/page-c',
        title: 'C',
        description: null,
        canonical: 'https://example.test/other-c',
        robots: null,
        headings: [],
        links: [],
        issues: [],
        text: '',
      },
    ]

    const result = crossCheckDiscoveryOutputs({
      origin: 'https://example.test',
      pages,
      sitemapEntries: [
        { url: 'https://example.test/page-a' },
        { url: 'https://example.test/page-b' },
        { url: 'https://example.test/page-c' },
      ],
      feedItems: [{ url: 'https://example.test/page-a' }, { url: 'https://example.test/page-c' }],
      robotsTxt: 'User-agent: *\nDisallow: /admin\nSitemap: https://example.test/sitemap.xml',
    })

    const ruleIds = result.issues.map((i) => i.ruleId)
    expect(ruleIds).toContain('DISC-05-SITEMAP-UNREACHABLE')
    expect(ruleIds).toContain('DISC-05-SITEMAP-NOINDEX')
    expect(ruleIds).toContain('DISC-05-SITEMAP-CANONICAL-MISMATCH')
    expect(ruleIds).toContain('DISC-05-FEED-UNREACHABLE')
    expect(ruleIds).toContain('DISC-05-FEED-CANONICAL-MISMATCH')
    expect(result.hasRobotsSitemapLink).toBe(true)
  })

  it('detects robots.txt disallow contradictions and missing sitemap link', () => {
    const result = crossCheckDiscoveryOutputs({
      origin: 'https://example.test',
      pages: [],
      sitemapEntries: [{ url: 'https://example.test/admin/dashboard' }],
      feedItems: [],
      robotsTxt: 'User-agent: *\nDisallow: /admin',
    })

    const ruleIds = result.issues.map((i) => i.ruleId)
    expect(ruleIds).toContain('DISC-05-ROBOTS-CONTRADICTION')
    expect(ruleIds).toContain('DISC-05-ROBOTS-SITEMAP-MISSING')
  })
})
