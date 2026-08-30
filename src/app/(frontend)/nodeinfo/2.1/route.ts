import { loadConfig } from '@/modules/core/config'
export function GET() {
  const app = loadConfig()
  if (!app.networking.enabled) return Response.json({ error: 'Not found.' }, { status: 404 })
  return Response.json(
    {
      version: '2.1',
      software: { name: 'renegade-cms', version: app.version },
      protocols: ['activitypub'],
      services: { inbound: [], outbound: [] },
      openRegistrations: false,
      usage: { users: { total: 0, activeHalfyear: 0, activeMonth: 0 }, localPosts: 0 },
      metadata: { federation: 'opt-in-publication-actors' },
    },
    {
      headers: {
        'content-type':
          'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"',
      },
    },
  )
}
