import config from '@payload-config'
import { getPayload } from 'payload'
import { authorizeAudienceAccess, recordAudienceChoices } from '@/modules/audience/service'
import { takeAudiencePublicRequest } from '@/modules/audience/public-rate-limit'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!takeAudiencePublicRequest(ip, 'preferences'))
    return Response.json({ error: 'Please try again shortly.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as {
    token?: string
    choices?: { channel: 'email' | 'sms'; purpose: string; granted: boolean }[]
  }
  const payload = await getPayload({ config })
  const claims = await authorizeAudienceAccess(payload, body.token ?? '', 'preferences')
  if (!claims) return Response.json({ error: 'Invalid preference link.' }, { status: 400 })
  try {
    await recordAudienceChoices(payload, {
      siteId: claims.siteId,
      subscriberId: claims.subscriberId,
      choices: body.choices ?? [],
      source: 'public-preference-center',
      ipDigest: ip,
    })
    return Response.json({ status: 'updated' })
  } catch {
    return Response.json({ error: 'Preferences could not be updated.' }, { status: 400 })
  }
}
