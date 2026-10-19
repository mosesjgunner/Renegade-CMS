import { resolveRedirectSite } from '@/modules/operations/redirect-site'
import config from '@payload-config'
import { getPayload } from 'payload'
import { reconcileSearchProjection, searchHealth } from '@/modules/public/search-projection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  const siteId = await resolveRedirectSite(
    payload,
    user,
    request,
    new URL(request.url).searchParams.get('site') || undefined,
  )
  if (!siteId) return Response.json({ error: 'Staff site access required.' }, { status: 403 })
  try {
    const result = await reconcileSearchProjection(payload, siteId)
    return Response.json(
      { result, health: (await searchHealth(payload)).filter((row) => row.site_id === siteId) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'Search rebuild unavailable. Retry after restoring the connection.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}
