import { describe, expect, it } from 'vitest'
import { publicRelatedContent } from '@/modules/editorial/related-content'

describe('RC-02 public related reporting', () => {
  it('renders published same-site links while excluding drafts, private and restricted targets', () => {
    const record = {
      id: 'a',
      title: 'Related article',
      canonicalPath: '/articles/related',
      site: { id: 'site-a' },
      status: 'published',
    }
    expect(
      publicRelatedContent(
        [
          record,
          { ...record, status: 'draft' },
          { ...record, visibility: 'private' },
          { ...record, site: 'site-b' },
          { ...record, removeFromDiscovery: true },
          { ...record, requiredEntitlement: { resource: 'members' } },
          { ...record, canonicalPath: '//other.test/path' },
          'unpopulated-id',
        ],
        'site-a',
      ),
    ).toEqual([{ id: 'a', title: 'Related article', href: '/articles/related' }])
  })
})
