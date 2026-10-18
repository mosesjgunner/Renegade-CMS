import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Dashboard from '@/modules/admin/PublisherDashboard'
import PublishingCenter from '@/modules/admin/PublishingCenter'

vi.mock('@/modules/admin/ScheduleContentAction', () => ({ default: () => null }))

describe('Publishing admin view access enforcement', () => {
  it.each(['dashboard', 'posts', 'pages'])(
    '%s excludes foreign records using access-checked reads',
    async (view) => {
      const queries: Record<string, unknown>[] = []
      const req = {
        url: `http://localhost/admin/${view}`,
        user: { id: 'site-a-staff', role: 'staff' },
        payload: {
          find: vi.fn(async (options: Record<string, unknown>) => {
            queries.push(options)
            // Payload local API bypasses authorization unless overrideAccess is false.
            const docs =
              options.overrideAccess === false
                ? [{ id: 'a', title: 'Allowed Site A draft', status: 'draft' }]
                : [
                    { id: 'a', title: 'Allowed Site A draft' },
                    { id: 'b', title: 'Private Site B draft' },
                  ]
            return { docs, totalDocs: docs.length, totalPages: 1, page: 1 }
          }),
        },
      }
      const props = { initPageResult: { req }, params: { segments: [view] } } as never
      const element = view === 'dashboard' ? await Dashboard(props) : await PublishingCenter(props)
      const html = renderToStaticMarkup(element)
      expect(html).toContain('Allowed Site A draft')
      expect(html).not.toContain('Private Site B draft')
      expect(queries.length).toBeGreaterThan(0)
      for (const query of queries) {
        expect(query.req).toBe(req)
        expect(query.overrideAccess).toBe(false)
      }
    },
  )
})
