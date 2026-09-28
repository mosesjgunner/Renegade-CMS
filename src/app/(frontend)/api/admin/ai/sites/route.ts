import config from '@payload-config'
import { getPayload } from 'payload'
import { NextResponse } from 'next/server'
import { getAdminSiteIDs } from '@/modules/admin/site-access'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  if (!auth.user || !['owner', 'administrator', 'staff'].includes(String(auth.user.role)))
    return NextResponse.json({ error: 'Editor access required.' }, { status: 403 })
  const ids = getAdminSiteIDs(auth.user)
  const sites = await payload.find({
    collection: 'sites',
    ...(auth.user.role === 'staff' ? { where: { id: { in: ids } } } : {}),
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return NextResponse.json({
    canConfigure: ['owner', 'administrator'].includes(String(auth.user.role)),
    sites: sites.docs.map((site) => ({ id: site.id, name: site.name })),
  })
}
