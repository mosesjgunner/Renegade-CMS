import { expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { PresentationDocument } from '@/modules/presentation/contracts'
import { hydratePublicQueries } from '@/modules/presentation/public-queries'

it('renders scoped published query results without mutating the canonical snapshot or exposing private rows', async () => {
  const publicRow = { id: 'article', site: 'site', status: 'published', title: 'Public reporting', canonicalPath: '/articles/reporting' }
  const find = vi.fn(async () => ({ docs: [publicRow,
    { ...publicRow, status: 'draft' }, { ...publicRow, site: 'other' },
    { ...publicRow, visibility: 'private' }, { ...publicRow, requiredEntitlement: 'members' },
    { ...publicRow, canonicalPath: '//other.test/private' },
  ] }))
  const payload = { find, collections: { content: {} } } as unknown as Payload
  const document: PresentationDocument = { version: 1, siteId: 'site', theme: { id: 'neutral-starter', version: '1.0.0' },
    template: { id: 'layout', version: '1.0.0' }, surface: 'layout',
    slots: { main: [{ id: 'list', component: 'publisher.article-list', componentVersion: 1, props: { query: { limit: 999 } } }] },
  }
  const original = structuredClone(document)
  const hydrated = await hydratePublicQueries(payload, document)
  expect(document).toEqual(original)
  expect(hydrated.slots.main?.[0].props.queryResults).toEqual([{ id: 'article', title: 'Public reporting', href: '/articles/reporting' }])
  expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'content', limit: 96,
    where: expect.objectContaining({ and: [{ site: { equals: 'site' } }, { status: { in: ['published', 'updated', 'scheduled'] } }] }),
  }))
})
