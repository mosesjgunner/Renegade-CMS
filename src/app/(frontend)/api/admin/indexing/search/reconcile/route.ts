import config from '@payload-config'
import { getPayload } from 'payload'
import { reconcileSearchProjection, searchHealth } from '@/modules/public/search-projection'
import { canManageAdminSite } from '@/modules/admin/site-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  const siteId = new URL(request.url).searchParams.get('site') || undefined
  if (user.role === 'staff' && !siteId)
    return Response.json({ error: 'Choose an assigned site.' }, { status: 400 })
  if (siteId && !canManageAdminSite(user, siteId))
    return Response.json({ error: 'Site access denied.' }, { status: 403 })
  const result = await reconcileSearchProjection(payload, siteId)
  return Response.json(
    { result, health: await searchHealth(payload) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
