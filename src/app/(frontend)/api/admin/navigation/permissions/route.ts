import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { canAccessAdminRole } from '@/modules/admin/access-policy'
import { getAdminSiteIDs } from '@/modules/admin/site-access'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !canAccessAdminRole(auth.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const siteIds = getAdminSiteIDs(auth.user)
  const sites = await payload.find({
    collection: 'sites',
    ...(auth.user.role === 'staff' ? { where: { id: { in: siteIds } } } : {}),
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json(
    {
      role: String(auth.user.role),
      sites: sites.docs.map((site) => ({
        id: String(site.id),
        name: String(site.name ?? site.id),
      })),
    },
    {
      headers: { 'Cache-Control': 'private, no-store' },
    },
  )
}
