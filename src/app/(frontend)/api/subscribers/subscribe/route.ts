import config from '@payload-config'
import { getPayload } from 'payload'
import { requestNewsletterSubscription } from '@/modules/audience/service'
import { takeAudiencePublicRequest } from '@/modules/audience/public-rate-limit'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!takeAudiencePublicRequest(ip, 'subscribe'))
    return Response.json({ error: 'Please try again shortly.' }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as Record<string, string>
  try {
    const result = await requestNewsletterSubscription(await getPayload({ config }), {
      siteId: body.siteId ?? '',
      listId: body.listId ?? '',
      email: body.email ?? '',
      locale: body.locale ?? 'en',
      consentWording: body.consentWording ?? '',
      source: 'public-subscribe',
    })
    return Response.json({ status: result.status }, { status: 202 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Subscription unavailable.' },
      { status: 400 },
    )
  }
}
