import config from '@payload-config'
import { getPayload } from 'payload'
import { readCommunityUnsubscribeToken } from '@/modules/community/external-notifications'
import { setMemberNotificationPreference } from '@/modules/community/notification-delivery'
import { publicSiteForHost } from '@/modules/public/site-scope'

const headers = { 'cache-control': 'private, no-store' }
async function scope(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const claims = readCommunityUnsubscribeToken(token)
  const payload = await getPayload({ config })
  return claims && claims.site === (await publicSiteForHost(payload, request.headers.get('host')))
    ? { claims, payload, token }
    : null
}
export async function GET(request: Request) {
  const context = await scope(request)
  if (!context)
    return Response.json({ error: 'Invalid unsubscribe link.' }, { status: 403, headers })
  return new Response(
    '<!doctype html><html lang="en"><title>Community email preferences</title><main><h1>Turn off community email</h1><p>Your member inbox remains available.</p><form method="post"><button type="submit">Turn off community email</button></form></main></html>',
    { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } },
  )
}
export async function POST(request: Request) {
  const context = await scope(request)
  if (!context)
    return Response.json({ error: 'Invalid unsubscribe link.' }, { status: 403, headers })
  await setMemberNotificationPreference(context.payload, {
    siteId: context.claims.site,
    memberId: context.claims.member,
    channel: 'email',
    frequency: 'off',
  })
  return Response.json({ success: true, message: 'Community email is off.' }, { headers })
}
