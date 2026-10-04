import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Payload } from 'payload'
import PublishingLinks from '../../src/modules/admin/PublishingLinks'
import AudienceCommandCenter from '../../src/modules/admin/AudienceCommandCenter'

const auth = vi.hoisted(() => vi.fn())
const find = vi.hoisted(() => vi.fn())
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ auth, find }) }))

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
  it('reports audience unavailability without invented delivery or provider success', () => {
    const html = renderToStaticMarkup(<AudienceCommandCenter />)
    expect(html).toContain('Audience reporting is unavailable')
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
    'reports an explicit unavailable boundary for %s',
    async (role) => {
      auth.mockResolvedValue({ user: { role } })
      find.mockClear()
      const { GET } = await import(
        '../../src/app/(frontend)/api/admin/audience/command-center/route'
      )
      const response = await GET(new Request('http://localhost/api/admin/audience/command-center'))
      expect(response.status).toBe(503)
      expect(await response.json()).toHaveProperty('error')
      expect(find).not.toHaveBeenCalled()
    },
  )
})
