import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import { rebuildNotificationCounters } from '@/modules/community/notification-stream'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const payload = await getPayload({ config })
  const url = new URL(request.url)
  const siteId = url.searchParams.get('siteId') ?? request.headers.get('x-site-id') ?? undefined
  const actor = await resolveCommunityActor(payload, request.headers, siteId ?? 'default')

  // Ops utility requires staff privileges or valid ops authorization token
  const opsSecret = process.env.OPS_TOKEN || process.env.PAYLOAD_SECRET
  const authHeader = request.headers.get('authorization')
  const isAuthorizedOps =
    (actor.isStaff && actor.memberId) || (opsSecret && authHeader === `Bearer ${opsSecret}`)

  if (!isAuthorizedOps) {
    return Response.json(
      { error: { code: 'FORBIDDEN', message: 'Staff or operations privileges required.' } },
      { status: 403 },
    )
  }

  const result = await rebuildNotificationCounters(payload, siteId)
  return Response.json(
    { ok: true, data: result },
    { headers: { 'cache-control': 'private, no-store', 'x-renegade-api-version': 'v1' } },
  )
}
