import { loadConfig } from '@/modules/core/config'
export function GET() {
  const app = loadConfig()
  if (!app.networking.enabled) return Response.json({ error: 'Not found.' }, { status: 404 })
  return Response.json({
    links: [
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
        href: `${app.appUrl}/nodeinfo/2.1`,
      },
    ],
  })
}
