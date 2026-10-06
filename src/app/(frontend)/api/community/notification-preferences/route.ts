import { verifiedCommunityEmail } from '@/modules/community/external-notifications'
import { verifyCsrf } from '@/modules/identity/member-identity'
import { publicSiteForHost, samePublicOrigin } from '@/modules/public/site-scope'
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
  if (!(await samePublicOrigin(payload, request)))
    return Response.json({ error: 'Origin access denied.' }, { status: 403 })
  if (siteId !== (await publicSiteForHost(payload, request.headers.get('host'))))
    return Response.json({ error: 'Site access denied.' }, { status: 403 })
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
  if (!verifyCsrf(request.headers))
    return Response.json({ error: 'CSRF verification required.' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = String(body.siteId ?? 'default')
  const payload = await getPayload({ config })
  if (!(await samePublicOrigin(payload, request)))
    return Response.json({ error: 'Origin access denied.' }, { status: 403 })
  if (siteId !== (await publicSiteForHost(payload, request.headers.get('host'))))
    return Response.json({ error: 'Site access denied.' }, { status: 403 })
  const actor = await resolveCommunityActor(payload, request.headers, siteId)
  if (!actor.memberId) return Response.json({ error: 'Authentication required' }, { status: 401 })
  if (
    !channels.includes(body.channel as NotificationChannel) ||
    !frequencies.includes(body.frequency as NotificationFrequency)
  )
    return Response.json({ error: 'Invalid notification preference' }, { status: 400 })
  if (
    body.channel === 'sms' ||
    (body.channel === 'in_app' && !['immediate', 'off'].includes(String(body.frequency)))
  )
    return Response.json(
      { error: 'SMS community delivery is unavailable; in-app supports immediate or off.' },
      { status: 410 },
    )
  const deliveryAddress =
    body.channel === 'email' && body.frequency !== 'off'
      ? await verifiedCommunityEmail(payload, actor.memberId, body.email)
      : null
  if (body.channel === 'email' && body.frequency !== 'off' && !deliveryAddress)
    return Response.json(
      { error: 'Use an email address already verified by signing in with a magic link.' },
      { status: 422 },
    )
  await setMemberNotificationPreference(payload, {
    siteId,
    memberId: actor.memberId,
    channel: body.channel as NotificationChannel,
    frequency: body.frequency as NotificationFrequency,
    rules:
      body.channel === 'email'
        ? {
            deliveryAddress,
            deliveryConsentRevision: 'rc08b-email-v1',
            deliveryEnabledAt: new Date().toISOString(),
            consentText:
              'Email me generic community updates at the selected frequency. I can turn this off at any time.',
          }
        : {},
  })
  return Response.json({ success: true })
}
