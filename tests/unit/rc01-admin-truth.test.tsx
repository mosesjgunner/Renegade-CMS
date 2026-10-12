import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'
import PublishingLinks from '../../src/modules/admin/PublishingLinks'
import AudienceCommandCenter from '../../src/modules/admin/AudienceCommandCenter'

const auth = vi.hoisted(() => vi.fn())
const find = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())
const query = vi.hoisted(() => vi.fn())
const grant = vi.hoisted(() => vi.fn())
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: async () => ({
    auth,
    find,
    count,
    collections: {
      subscribers: {},
      'email-messages': {},
      'email-deliveries': {},
      'audience-experiments': {},
    },
    db: { pool: { query } },
  }),
}))
vi.mock('../../src/modules/operations/operator-grants', () => ({
  resolveOperatorGrantContext: grant,
}))

describe('RC-01 truthful admin boundaries', () => {
  it('does not advertise optional workspaces in a floor runtime', () => {
    const html = renderToStaticMarkup(<PublishingLinks payload={{ collections: {} } as Payload} />)
    for (const href of [
      '/admin/collections/podcast-shows',
      '/admin/social',
      '/admin/email-composer',
      '/admin/telemetry',
      '/admin/catalog',
    ]) {
      expect(html).not.toContain(`href="${href}"`)
    }
    expect(html).toContain('href="/admin/posts"')
    expect(html).toContain('href="/admin/navigation"')
  })
  it('offers the precise registered workspace in an enabled runtime', () => {
    const html = renderToStaticMarkup(
      <PublishingLinks
        payload={
          { collections: { 'podcast-shows': {}, products: {}, 'content-releases': {} } } as Payload
        }
      />,
    )
    expect(html).toContain('href="/admin/collections/podcast-shows"')
    expect(html).toContain('href="/admin/catalog"')
    expect(html).toContain('href="/admin/releases"')
    expect(html).not.toContain('href="/admin/globals/site-settings"')
  })
  it('shows pending intake data without invented delivery or provider success', () => {
    const html = renderToStaticMarkup(<AudienceCommandCenter />)
    expect(html).toContain('Audience intake')
    expect(html).toContain('Loading saved intake state.')
    expect(html).toContain(
      'General-purpose audience automations and telecom operator dispatch remain unavailable.',
    )
    expect(html).not.toContain('14250')
    expect(html).not.toContain('SMTP (Direct-to-MX TLS)')
  })
  it.each([null, { role: 'member' }])(
    'denies unauthorized reporting before operational reads',
    async (user) => {
      auth.mockResolvedValue({ user })
      find.mockClear()
      const { GET } = await import(
        '../../src/app/(frontend)/api/admin/audience/command-center/route'
      )
      const response = await GET(new Request('http://localhost/api/admin/audience/command-center'))
      expect(response.status).toBe(403)
      expect(find).not.toHaveBeenCalled()
    },
  )
  it.each(['owner', 'administrator', 'staff'])(
    'rejects incomplete %s identities before operational reads',
    async (role) => {
      auth.mockResolvedValue({ user: { role } })
      find.mockClear()
      const { GET } = await import(
        '../../src/app/(frontend)/api/admin/audience/command-center/route'
      )
      const response = await GET(new Request('http://localhost/api/admin/audience/command-center'))
      expect(response.status).toBe(403)
      expect(await response.json()).toHaveProperty('error')
      expect(find).not.toHaveBeenCalled()
    },
  )
  it('returns persisted counts and messages scoped to the authorized site', async () => {
    auth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    grant.mockResolvedValue({
      authorized: true,
      isGlobalOwner: false,
      authorizedSiteIds: ['site-1'],
    })
    count.mockResolvedValue({ totalDocs: 3 })
    find.mockImplementation(async ({ collection }) => ({
      docs:
        collection === 'email-messages'
          ? [{ id: 'message-1', subject: 'Actual saved subject', status: 'draft' }]
          : [],
    }))
    query.mockResolvedValue({ rows: [{ status: 'failed', count: 2 }] })
    const { GET } = await import('../../src/app/(frontend)/api/admin/audience/command-center/route')
    const response = await GET(
      new Request('http://localhost/api/admin/audience/command-center?siteId=site-1'),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      siteId: 'site-1',
      subscribers: 3,
      messages: [{ id: 'message-1', subject: 'Actual saved subject', status: 'draft' }],
      emailOutcomes: [{ status: 'failed', count: 2 }],
      experiments: [],
    })
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { site: { equals: 'site-1' } } }),
    )
    expect(query).toHaveBeenCalledWith(expect.stringContaining('m.site_id=$1'), ['site-1'])
  })
  it('denies a different site before reading its audience records', async () => {
    auth.mockResolvedValue({ user: { id: 'staff-1', role: 'staff' } })
    grant.mockResolvedValue({
      authorized: true,
      isGlobalOwner: false,
      authorizedSiteIds: ['site-1'],
    })
    find.mockClear()
    count.mockClear()
    query.mockClear()
    const { GET } = await import('../../src/app/(frontend)/api/admin/audience/command-center/route')
    expect(
      (await GET(new Request('http://localhost/api/admin/audience/command-center?siteId=site-2')))
        .status,
    ).toBe(403)
    expect(find).not.toHaveBeenCalled()
    expect(count).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
  it('reports read failures without substituting invented or zero totals', async () => {
    auth.mockResolvedValue({ user: { id: 'owner-1', role: 'owner' } })
    grant.mockResolvedValue({ authorized: true, isGlobalOwner: true, authorizedSiteIds: [] })
    count.mockRejectedValueOnce(new Error('database unavailable'))
    const { GET } = await import('../../src/app/(frontend)/api/admin/audience/command-center/route')
    const response = await GET(
      new Request('http://localhost/api/admin/audience/command-center?siteId=site-1'),
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Saved audience reporting could not be loaded.',
    })
  })
})
