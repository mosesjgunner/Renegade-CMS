import { describe, expect, it } from 'vitest'

import { bookNavigation } from '../../src/modules/media/contracts'
import {
  canIgnore,
  externalLinkFinding,
  qualityDedupeKey,
  scanLocal,
} from '../../src/modules/quality/contracts'

describe('long-form and Quality Center contracts', () => {
  it('orders released chapters deterministically for previous/next navigation', () => {
    const chapters = [
      { id: 'two', displayOrder: 20 },
      { id: 'one', displayOrder: 10 },
      { id: 'later', displayOrder: 30, releaseAt: '2099-01-01T00:00:00.000Z' },
    ]
    expect(bookNavigation(chapters, 'one', new Date('2026-01-01')).next?.id).toBe('two')
  })

  it('finds deterministic local broken-link, metadata, alt-text, and accessibility failures', () => {
    const findings = scanLocal({
      targetId: 'document-a',
      title: 'Title',
      description: '',
      canonicalUrl: 'not-an-url',
      headings: [2, 4],
      images: [{ id: 'hero' }],
      internalLinks: [{ href: '/stale-draft', exists: true, visible: false }],
      translationStatus: 'stale',
    })
    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining([
        'canonical-valid',
        'metadata-description',
        'heading-hierarchy',
        'media-alt-text',
        'internal-link',
        'translation-current',
      ]),
    )
    expect(
      qualityDedupeKey({ siteId: 'tenant-a', rule: 'media-alt-text', targetId: 'document-a' }),
    ).not.toBe(
      qualityDedupeKey({ siteId: 'tenant-b', rule: 'media-alt-text', targetId: 'document-a' }),
    )
  })

  it('keeps provider-disabled checks advisory and permits only non-blocking owner false positives', () => {
    expect(externalLinkFinding('https://example.test', null)).toMatchObject({ uncertain: true })
    expect(canIgnore({ actorRole: 'owner', severity: 'warning' })).toBe(true)
    expect(canIgnore({ actorRole: 'owner', severity: 'publication_blocking' })).toBe(false)
  })
})
