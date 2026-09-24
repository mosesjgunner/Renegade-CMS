import config from '@payload-config'
import { getPayload } from 'payload'
import { reconcileSearchProjection, searchHealth } from '@/modules/public/search-projection'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user || !['owner', 'administrator', 'staff'].includes(String(user.role)))
    return Response.json({ error: 'Staff access required.' }, { status: 403 })
  const siteId = new URL(request.url).searchParams.get('site') || undefined
  const result = await reconcileSearchProjection(payload, siteId)
  return Response.json(
    { result, health: await searchHealth(payload) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
