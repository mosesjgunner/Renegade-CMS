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
    const payload = await getPayload({ config })
    let siteId = body.siteId
    let listId = body.listId

    if (!siteId || !listId) {
      const lists = await payload.find({
        collection: 'audience-lists',
        where: { status: { equals: 'active' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (lists.docs[0]) {
        if (!listId) listId = String(lists.docs[0].id)
        if (!siteId) {
          const s = lists.docs[0].site
          siteId = typeof s === 'object' && s && 'id' in s ? String(s.id) : String(s)
        }
      } else {
        const sites = await payload.find({
          collection: 'sites',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (sites.docs[0] && !siteId) siteId = String(sites.docs[0].id)
      }
    }

    const result = await requestNewsletterSubscription(payload, {
      siteId: siteId ?? '',
      listId: listId ?? '',
      email: body.email ?? '',
      locale: body.locale ?? 'en',
      consentWording:
        body.consentWording || 'I consent to receive newsletter updates from this publication.',
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
