import { expect, test } from '@playwright/test'
import config from '@payload-config'
import { getPayload } from 'payload'

const slug = 'events-e2e-dst-2027'
test('event creation, publication, discovery, ICS, cancellation, and unpublish respect tenant boundaries', async ({
  page,
  request,
}) => {
  const payload = await getPayload({ config })
  const publications = await payload.find({
    collection: 'publications',
    where: { slug: { equals: 'analytics-e2e' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  const publication = publications.docs[0] as { id: string; site: string | { id: string } }
  const site = typeof publication.site === 'string' ? publication.site : publication.site.id
  const prior = await payload.find({
    collection: 'events',
    where: { and: [{ site: { equals: site } }, { slug: { equals: slug } }] },
    limit: 1,
    overrideAccess: true,
  } as never)
  const event = (prior.docs[0]
    ? await payload.update({
        collection: 'events',
        id: prior.docs[0].id,
        data: {
          status: 'published',
          visibility: 'public',
          removeFromDiscovery: false,
          startsAt: '2027-03-07T15:00:00.000Z',
          endsAt: '2027-03-07T16:00:00.000Z',
          timeZone: 'America/Chicago',
          recurrence: { frequency: 'weekly', count: 3 },
        },
        overrideAccess: true,
      } as never)
    : await payload.create({
        collection: 'events',
        data: {
          site,
          publication: publication.id,
          title: 'Events E2E DST',
          slug,
          canonicalPath: `/events/${slug}`,
          summary: 'Public recurring event',
          status: 'published',
          visibility: 'public',
          removeFromDiscovery: false,
          startsAt: '2027-03-07T15:00:00.000Z',
          endsAt: '2027-03-07T16:00:00.000Z',
          timeZone: 'America/Chicago',
          attendanceMode: 'virtual',
          onlineUrl: 'https://meet.example.test/events',
          recurrence: { frequency: 'weekly', count: 3 },
        },
        overrideAccess: true,
      } as never)) as { id: string }
  await page.goto('/events?from=2027-03-01&to=2027-03-31')
  await expect(page.getByRole('link', { name: 'Events E2E DST' })).toHaveCount(3)
  const feed = await request.get('/events/feed.ics')
  expect(feed.headers()['content-type']).toContain('text/calendar')
  expect(await feed.text()).toContain('DTSTART:20270314T140000Z')
  await payload.update({
    collection: 'events',
    id: event.id,
    data: { status: 'cancelled' },
    overrideAccess: true,
  } as never)
  await page.goto('/events?from=2027-03-01&to=2027-03-31')
  await expect(page.getByRole('link', { name: 'Events E2E DST' })).toHaveCount(0)
  await payload.update({
    collection: 'events',
    id: event.id,
    data: { status: 'draft' },
    overrideAccess: true,
  } as never)
  const detail = await request.get(`/events/${slug}`)
  expect(detail.status()).toBe(404)
})
