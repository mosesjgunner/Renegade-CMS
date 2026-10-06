import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), get: vi.fn(), settings: vi.fn() }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({ find: mocks.find, collections: { events: {} } }),
}))
vi.mock('next/headers', () => ({ headers: async () => ({ get: mocks.get }) }))
vi.mock('@/modules/core/site-settings', () => ({ resolveSiteSettings: mocks.settings }))
import { currentPublicSiteId, findPublicEvent, findPublicEvents } from '@/modules/events/public'

const event = {
  id: 'event',
  site: 'site-a',
  title: 'Public event',
  slug: 'public',
  canonicalPath: '/events/public',
  startsAt: '2026-11-01T15:00:00Z',
  timeZone: 'UTC',
  status: 'published',
  visibility: 'public',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockReturnValue('a.test')
  mocks.settings.mockResolvedValue({
    canonicalOrigin: 'https://a.test',
    canonicalOriginsBySite: { 'site-a': 'https://a.test', 'site-b': 'https://b.test' },
  })
})
it('binds the event query to the host site and excludes foreign, draft, private and protected bytes', async () => {
  mocks.find.mockResolvedValue({
    docs: [
      event,
      { ...event, site: 'site-b' },
      { ...event, status: 'draft' },
      { ...event, visibility: 'private' },
      { ...event, requiredEntitlement: { resource: 'members', capability: 'read' } },
    ],
    hasNextPage: false,
  })
  const result = await findPublicEvents({
    from: new Date('2026-11-01'),
    to: new Date('2026-11-02'),
    publicFeed: true,
  })
  expect(result.occurrences).toHaveLength(1)
  expect(mocks.find).toHaveBeenCalledWith(
    expect.objectContaining({ where: { site: { equals: 'site-a' } } }),
  )
})
it.each([
  { status: 'draft' },
  { visibility: 'private' },
  { site: 'site-b' },
  { status: 'cancelled' },
  { requiredEntitlement: { resource: 'members', capability: 'read' } },
])('denies unsafe single event ICS lookup %j', async (changes) => {
  mocks.find.mockResolvedValue({ docs: [{ ...event, ...changes }] })
  expect(await findPublicEvent('public', true)).toBeNull()
})
it('fails closed for an unknown host on a multi-site install', async () => {
  mocks.get.mockReturnValue('unknown.test')
  mocks.find.mockResolvedValue({ docs: [{ id: 'site-a' }, { id: 'site-b' }] })
  expect(await currentPublicSiteId()).toBe('')
})
it('paginates canonical records rather than truncating at a thousand', async () => {
  mocks.find
    .mockResolvedValueOnce({ docs: [event], hasNextPage: true })
    .mockResolvedValueOnce({ docs: [{ ...event, id: 'next' }], hasNextPage: false })
  const result = await findPublicEvents({
    from: new Date('2026-11-01'),
    to: new Date('2026-11-02'),
    publicFeed: true,
  })
  expect(result.total).toBe(2)
  expect(mocks.find.mock.calls[1][0].page).toBe(2)
})
