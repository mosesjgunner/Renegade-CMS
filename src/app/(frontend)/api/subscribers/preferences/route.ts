import config from '@payload-config'
import { getPayload } from 'payload'
import { verifyAudienceToken } from '@/modules/audience/contracts'
import { updateAudiencePreferences } from '@/modules/audience/service'
import { takeAudiencePublicRequest } from '@/modules/audience/public-rate-limit'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!takeAudiencePublicRequest(ip, 'preferences'))
    return Response.json({ error: 'Please try again shortly.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as {
    token?: string
    audienceList?: string
    preferences?: Record<string, boolean | string | number>
  }
  const value = verifyAudienceToken(body.token ?? '', process.env.PAYLOAD_SECRET ?? '')
  const [siteId, email] = value?.split('|') ?? []
  if (!siteId || !email)
    return Response.json({ error: 'Invalid preference link.' }, { status: 400 })
  try {
    await updateAudiencePreferences(await getPayload({ config }), {
      siteId,
      email,
      audienceList: body.audienceList,
      preferences: body.preferences ?? {},
    })
    return Response.json({ status: 'updated' })
  } catch {
    return Response.json({ error: 'Preferences could not be updated.' }, { status: 400 })
  }
}
