import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveCommunityActor } from '@/modules/community/service'
import {
  getMemberNotificationPreference,
  setMemberNotificationPreference,
  type NotificationChannel,
  type NotificationFrequency,
} from '@/modules/community/notification-delivery'

const channels: NotificationChannel[] = ['in_app', 'email', 'sms']
const frequencies: NotificationFrequency[] = ['immediate', 'daily_digest', 'weekly_digest', 'off']

export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get('siteId') ?? 'default'
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId) return Response.json({ error: 'Authentication required' }, { status: 401 })
  const preferences = Object.fromEntries(
    await Promise.all(
      channels.map(async (channel) => [
        channel,
        await getMemberNotificationPreference(payload, siteId, actor.memberId!, channel),
      ]),
    ),
  )
  return Response.json({ preferences }, { headers: { 'cache-control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? 'default')
  const payload = await getPayload({ config })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (
    !channels.includes(body.channel as NotificationChannel) ||
    !frequencies.includes(body.frequency as NotificationFrequency)
  )
    return Response.json({ error: 'Invalid notification preference' }, { status: 400 })
  await setMemberNotificationPreference(payload, {
    siteId,
    memberId: actor.memberId,
    channel: body.channel as NotificationChannel,
    frequency: body.frequency as NotificationFrequency,
  })
  return Response.json({ success: true })
}
